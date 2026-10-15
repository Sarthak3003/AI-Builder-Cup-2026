"""Phase 2: onboarding is saved step by step, checked on the server and resumable."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

HOME = {"label": "Home", "address": "12 Sample Lane, Demo Nagar (sample address)"}
DOCTOR = {"label": "Doctor", "address": "Sunrise Clinic, 4 Example Road (sample address)"}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "onboarding.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        yield api


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def flow(api):
    return ok(api.get("/api/hub/onboarding"))


def welcome(api, name="Meera"):
    return ok(api.patch("/api/hub/onboarding/profile", json={"step": "welcome", "name": name}))


def through_places(api):
    welcome(api)
    ok(api.patch("/api/hub/onboarding/profile", json={"step": "accessibility", "large_text": True}))
    ok(api.post("/api/hub/onboarding/locations", json=HOME))
    ok(api.post("/api/hub/onboarding/locations", json=DOCTOR))
    return ok(api.post("/api/hub/onboarding/steps/places", json={}))


def everything(api):
    through_places(api)
    return after_places(api)


def after_places(api):
    ok(api.post("/api/hub/onboarding/caretaker-grants", json={"name": "Ravi"}))
    ok(api.patch("/api/hub/onboarding/profile", json={"step": "care_circle"}))
    ok(api.post("/api/hub/services/RIDE/connect-demo", json={"consent": True}))
    ok(api.post("/api/hub/onboarding/steps/services", json={}))
    return ok(
        api.patch(
            "/api/hub/onboarding/profile", json={"step": "payment", "payment_method": "DEMO_WALLET"}
        )
    )


def test_a_new_session_starts_at_the_welcome_step(owner):
    progress = flow(owner)
    assert progress["current"] == "welcome" and progress["completed"] is False
    assert [step["id"] for step in progress["steps"]] == [
        "welcome",
        "accessibility",
        "places",
        "care_circle",
        "services",
        "payment",
        "review",
    ]
    assert ok(owner.get("/api/hub/state"))["onboarding"]["current"] == "welcome"


def test_progress_survives_a_refresh_and_a_server_restart_and_resumes(app, owner):
    welcome(owner)
    ok(owner.patch("/api/hub/onboarding/profile", json={"step": "accessibility", "simple": True}))
    cookie = owner.cookies.get("__session")
    with TestClient(create_app(Settings(environment="test"))) as restarted:
        restarted.cookies.set("__session", cookie)
        progress = flow(restarted)
        assert progress["current"] == "places"
        assert progress["started_at"] is not None
        profile = ok(restarted.get("/api/hub/state"))["profile"]
        assert (profile["name"], profile["simple"]) == ("Meera", True)


def test_each_step_is_validated_on_the_server(owner):
    bad = [
        {"step": "welcome", "name": "   "},
        {"language": "fr-FR"},
        {"payment_method": "CARD"},
        {"channel": "fax"},
        {"card_number": "4111111111111111"},
        {"upi_pin": "1234"},
        {"step": "review"},
    ]
    for body in bad:
        assert owner.patch("/api/hub/onboarding/profile", json=body).status_code == 422, body
    refused = owner.post("/api/hub/onboarding/steps/places", json={})
    assert refused.status_code == 422 and "at least one place" in refused.json()["detail"]
    assert owner.post("/api/hub/onboarding/steps/places", json={"skip": True}).status_code == 422
    payment = owner.patch("/api/hub/onboarding/profile", json={"step": "payment"})
    assert payment.status_code == 422 and "simulated payments" in payment.json()["detail"]
    for place in ({"label": "Home"}, {"label": "", "address": "x"}, {**HOME, "pin": "1"}):
        assert owner.post("/api/hub/onboarding/locations", json=place).status_code == 422
    assert owner.post("/api/hub/onboarding/steps/unknown", json={}).status_code == 404
    assert flow(owner)["current"] == "welcome"


def test_places_need_one_usual_pickup_and_labels_are_unique(owner):
    ok(owner.post("/api/hub/onboarding/locations", json=HOME))
    clinic = ok(owner.post("/api/hub/onboarding/locations", json=DOCTOR))
    places = {p["label"]: p for p in clinic["places"]}
    assert places["Home"]["is_default_pickup"] and not places["Doctor"]["is_default_pickup"]
    assert clinic["profile"]["home"] == HOME["address"]
    duplicate = owner.post("/api/hub/onboarding/locations", json={**DOCTOR, "label": "doctor"})
    assert duplicate.status_code == 409
    moved = ok(
        owner.post(
            "/api/hub/onboarding/locations",
            json={**DOCTOR, "id": places["Doctor"]["id"], "is_default_pickup": True},
        )
    )
    assert [p["label"] for p in moved["places"] if p["is_default_pickup"]] == ["Doctor"]
    removed = ok(owner.delete(f"/api/hub/onboarding/locations/{places['Doctor']['id']}"))
    assert [p["is_default_pickup"] for p in removed["places"]] == [True]


def test_optional_steps_can_be_skipped_and_required_ones_cannot(owner):
    through_places(owner)
    assert flow(owner)["current"] == "care_circle"
    ok(owner.post("/api/hub/onboarding/steps/care_circle", json={"skip": True}))
    ok(owner.post("/api/hub/onboarding/steps/services", json={"skip": True}))
    progress = flow(owner)
    assert progress["current"] == "payment"
    assert {s["id"]: s["status"] for s in progress["steps"]}["services"] == "skipped"
    services = {s["service_type"]: s for s in ok(owner.get("/api/hub/services"))}
    assert services["RIDE"]["status"] == "SETUP_REQUIRED"


def test_finishing_needs_explicit_confirmation_and_every_required_step(owner):
    through_places(owner)
    early = owner.post("/api/hub/onboarding/finish", json={"confirmed": True})
    assert early.status_code == 409 and "Payment" in early.json()["detail"]
    after_places(owner)
    assert owner.post("/api/hub/onboarding/finish", json={}).status_code == 422
    assert owner.post("/api/hub/onboarding/finish", json={"confirmed": False}).status_code == 422
    done = ok(owner.post("/api/hub/onboarding/finish", json={"confirmed": True}))
    assert done["onboarding"]["completed"] is True
    review = done["onboarding"]["review"]
    assert review["name"] == "Meera" and review["pickup"] == "Home"
    assert review["places"] == ["Home", "Doctor"]
    assert review["payment"] == "Demo wallet (simulated)"
    assert review["care_circle"] == [
        {"name": "Ravi", "role": "viewer", "permissions": ["view_activity"]}
    ]
    assert {s["service_type"]: s["status"] for s in review["services"]}["RIDE"] == "CONNECTED"
    assert review["missing"] == []


def test_going_back_to_edit_keeps_later_answers_and_updates_the_review(owner):
    everything(owner)
    ok(owner.post("/api/hub/onboarding/finish", json={"confirmed": True}))
    edited = welcome(owner, "Meera Devi")
    assert edited["onboarding"]["review"]["name"] == "Meera Devi"
    assert edited["profile"]["payment_method"] == "DEMO_WALLET"
    assert [p["label"] for p in edited["places"]] == ["Home", "Doctor"]
    assert edited["onboarding"]["completed"] is True
    for place in edited["places"]:
        latest = ok(owner.delete(f"/api/hub/onboarding/locations/{place['id']}"))
    assert latest["onboarding"]["review"]["missing"] == ["Saved places"]


def test_onboarding_grants_are_view_only_or_view_and_approve(app, owner):
    viewer = ok(owner.post("/api/hub/onboarding/caretaker-grants", json={"name": "Ravi"}))
    approver = ok(
        owner.post(
            "/api/hub/onboarding/caretaker-grants",
            json={"name": "Asha", "relationship": "Daughter", "can_approve": True},
        )
    )
    assert viewer["grant"]["permissions"] == ["view_activity"]
    assert approver["grant"]["permissions"] == ["approve", "view_activity"]
    assert "invite" not in viewer["grant"]
    extra = {"name": "Eve", "permissions": ["view_payments"]}
    assert owner.post("/api/hub/onboarding/caretaker-grants", json=extra).status_code == 422
    with TestClient(app) as ravi:
        joined = ok(ravi.post("/api/hub/caregiver/join", json={"code": viewer["code"]}))
        assert joined["grant"]["permissions"] == ["view_activity"]
        for method, path, body in [
            ("get", "/api/hub/onboarding", None),
            ("patch", "/api/hub/onboarding/profile", {"payment_method": "PAY_ON_COMPLETION"}),
            ("post", "/api/hub/onboarding/locations", HOME),
            ("post", "/api/hub/onboarding/caretaker-grants", {"name": "Eve"}),
            ("post", "/api/hub/onboarding/finish", {"confirmed": True}),
            ("get", "/api/hub/services", None),
            ("post", "/api/hub/services/RIDE/connect-demo", {"consent": True}),
            ("post", "/api/hub/services/RIDE/disconnect", None),
        ]:
            kwargs = {"json": body} if body is not None else {}
            assert getattr(ravi, method)(path, **kwargs).status_code == 403, path
    assert ok(owner.get("/api/hub/state"))["profile"]["payment_method"] is None


def test_demo_connections_need_consent_and_record_capabilities(owner):
    listed = ok(owner.get("/api/hub/services"))
    assert [s["provider_label"] for s in listed] == [
        "Demo Ride Provider",
        "Demo Food Provider",
        "Demo Pharmacy Provider",
    ]
    for service in listed:
        assert service["connection_mode"] == "SIMULATED"
        assert service["notice"] == "Simulated provider — no real order or dispatch."
        assert service["status"] == "SETUP_REQUIRED" and service["consent_at"] is None
    assert owner.post("/api/hub/services/RIDE/connect-demo", json={}).status_code == 422
    assert owner.post(
        "/api/hub/services/TAXI/connect-demo", json={"consent": True}
    ).status_code == (422)
    state = ok(owner.post("/api/hub/services/FOOD/connect-demo", json={"consent": True}))
    food = next(s for s in state["services"] if s["service_type"] == "FOOD")
    assert food["status"] == "CONNECTED" and food["consent_at"]
    assert food["granted_capabilities"] == ["quote_orders", "place_orders", "cancel_orders"]
    assert [k["name"] for k in food["catalogue"]["kitchens"]][0] == "Demo Tiffin Kitchen"
    state = ok(owner.post("/api/hub/services/FOOD/disconnect"))
    food = next(s for s in state["services"] if s["service_type"] == "FOOD")
    assert (food["status"], food["granted_capabilities"]) == ("DISCONNECTED", [])
    state = ok(owner.post("/api/hub/services/FOOD/reset"))
    food = next(s for s in state["services"] if s["service_type"] == "FOOD")
    assert (food["status"], food["consent_at"]) == ("SETUP_REQUIRED", None)


def test_a_caretaker_with_edit_profile_moves_the_usual_pickup_place(app, owner):
    through_places(owner)
    code = ok(
        owner.post("/api/hub/care-circle", json={"name": "Asha", "role": "assistant", "extras": []})
    )["code"]
    with TestClient(app) as asha:
        ok(asha.post("/api/hub/caregiver/join", json={"code": code}))
        ok(asha.put("/api/hub/profile/home", json={"home": "14 Sample Lane (sample address)"}))
    places = ok(owner.get("/api/hub/state"))["places"]
    pickup = next(p for p in places if p["is_default_pickup"])
    assert (pickup["label"], pickup["address"]) == ("Home", "14 Sample Lane (sample address)")
