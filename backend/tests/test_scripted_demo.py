"""Phase 6: the confirmed demo reset, and the plan's scripted hackathon demo run through the API."""

from uuid import uuid4

import pytest
from booking_helpers import DOCTOR, HOME, book, confirm, ok, ready, state
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

FRESH = {"scenario": "fresh", "confirm": True}
MEERA = {"scenario": "meera", "confirm": True}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "script.db"))
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        ok(api.post("/api/hub/session"))
        yield api


def reset(api, body):
    return api.post("/api/hub/demo/reset", json=body)


def test_reset_needs_explicit_confirmation_and_a_known_scenario(owner):
    ready(owner)
    for body in (
        {},
        {"scenario": "meera"},
        {"scenario": "meera", "confirm": False},
        {"scenario": "everything", "confirm": True},
        {**FRESH, "keep": "nothing"},
    ):
        assert reset(owner, body).status_code == 422
    assert [place["label"] for place in state(owner)["places"]] == ["Home", "Doctor"]


def test_only_the_owner_can_reset(app, owner):
    code = ok(owner.post("/api/hub/care-circle", json={"name": "Ravi", "role": "viewer"}))["code"]
    with TestClient(app) as ravi:
        ok(ravi.post("/api/hub/caregiver/join", json={"code": code}))
        assert reset(ravi, FRESH).status_code == 403
    assert [g["name"] for g in state(owner)["care_circle"]] == ["Ravi"]


def test_a_fresh_reset_starts_setup_again_and_restarts_demo_references(owner):
    ready(owner)
    assert book(owner)["provider_booking_id"] == "DEMO-RIDE-1042"
    assert book(owner)["provider_booking_id"] == "DEMO-RIDE-1043"
    fresh = ok(reset(owner, FRESH))
    assert (fresh["scenario"], fresh["invites"]) == ("fresh", [])
    blank = fresh["state"]
    assert blank["onboarding"]["started_at"] is None and not blank["onboarding"]["completed"]
    assert blank["places"] == [] and blank["activity"] == [] and blank["care_circle"] == []
    assert {s["status"] for s in blank["services"]} == {"SETUP_REQUIRED"}
    assert blank["profile"]["payment_method"] is None
    # The reset marks this browser as a demo browser, so the presenter can switch people later.
    assert blank["demo_people"] == [{"id": "owner", "name": "Friend", "role": "Older adult"}]
    ready(owner)
    assert book(owner)["provider_booking_id"] == "DEMO-RIDE-1042"


def test_the_meera_scenario_is_the_same_every_time(owner):
    first = ok(reset(owner, MEERA))
    second = ok(reset(owner, MEERA))
    assert [i["name"] for i in second["invites"]] == ["Asha", "Ravi"]
    assert first["invites"][0]["code"] != second["invites"][0]["code"]

    def shape(result):
        return [
            (b["title"], b["booking_status"], b.get("provider_booking_id"))
            for b in result["state"]["activity"]
        ]

    assert shape(first) == shape(second)
    assert second["state"]["onboarding"]["completed"] is True


def test_the_scripted_hackathon_demo(owner):
    # 0. Start from a fresh profile.
    ok(reset(owner, FRESH))

    # 1. Set up as Meera: usual pickup, a Doctor place, Demo Ride Provider, demo wallet, viewer.
    patch = lambda body: ok(owner.patch("/api/hub/onboarding/profile", json=body))  # noqa: E731
    step = lambda name: ok(owner.post(f"/api/hub/onboarding/steps/{name}", json={}))  # noqa: E731
    patch({"step": "welcome", "name": "Meera", "language": "en-IN"})
    patch({"step": "accessibility", "large_text": True, "read_aloud": True})
    ok(owner.post("/api/hub/onboarding/locations", json={**HOME, "is_default_pickup": True}))
    places = ok(owner.post("/api/hub/onboarding/locations", json=DOCTOR))["places"]
    step("places")
    invited = ok(
        owner.post(
            "/api/hub/onboarding/caretaker-grants",
            json={"name": "Ravi", "relationship": "Son", "can_approve": False},
        )
    )
    assert invited["grant"]["role"] == "viewer"
    step("care_circle")
    ok(owner.post("/api/hub/services/RIDE/connect-demo", json={"consent": True}))
    step("services")
    patch({"step": "payment", "payment_method": "DEMO_WALLET"})
    review = ok(owner.get("/api/hub/onboarding"))["review"]
    assert (review["name"], review["pickup"], review["payment"]) == (
        "Meera",
        "Home",
        "Demo wallet (simulated)",
    )
    assert review["care_circle"][0]["role"] == "viewer" and review["missing"] == []
    finished = ok(owner.post("/api/hub/onboarding/finish", json={"confirmed": True}))
    assert finished["onboarding"]["completed"] is True

    # 2. Ask for a ride to the doctor: server fares, an expiry and the demo warning.
    doctor = next(place["id"] for place in places if place["label"] == "Doctor")
    offered = ok(
        owner.post("/api/hub/quotes", json={"service_type": "RIDE", "destination_place_id": doctor})
    )["quotes"]
    assert [(q["title"], q["amount_minor"]) for q in offered] == [
        ("Rapido Auto to Doctor", 8300),
        ("Ola Mini to Doctor", 12500),
        ("Uber Go to Doctor", 13500),
    ]
    chosen = offered[0]
    assert chosen["notice"] == "Demo ride — no real driver will arrive."
    assert chosen["expires_at"] > chosen["created_at"]

    # 3. Confirm, twice as a double tap would: one booking, simulated payment, no money moved.
    key = str(uuid4())
    ride = ok(confirm(owner, chosen, key))
    assert ok(confirm(owner, chosen, key))["id"] == ride["id"]
    assert (ride["provider_booking_id"], ride["booking_status"], ride["payment"]["status"]) == (
        "DEMO-RIDE-1042",
        "CONFIRMED_SIMULATED",
        "SUCCEEDED_SIMULATED",
    )
    events = ok(owner.get("/api/hub/activities"))
    paid = next(e for e in events if e["kind"] == "payment" and e["ref"] == ride["id"])
    assert paid["detail"] == "No money was charged."
    assert len(state(owner)["activity"]) == 1

    # 4. The same event in Ravi's Care Circle view, without addresses or payment.
    booked = next(e for e in events if e["kind"] == "booked" and e["ref"] == ride["id"])
    switch = lambda to: ok(owner.post("/api/hub/demo/switch", json={"to": to}))  # noqa: E731
    as_ravi = switch(invited["grant"]["id"])
    assert (as_ravi["role"], as_ravi["grant"]["name"]) == ("caregiver", "Ravi")
    shared = ok(owner.get("/api/hub/care-circle/activities"))
    assert booked in shared["events"] and paid not in shared["events"]
    assert shared["bookings"][0]["details"]["destination"] == {"label": "Doctor"}
    assert "payment" not in shared["bookings"][0]
    assert "Sample Lane" not in str(shared) and "Example Road" not in str(shared)

    # 5. Ravi tries what a view-only caretaker may not do; the server refuses each one.
    refused = [
        owner.post(f"/api/hub/bookings/{ride['id']}/cancel"),
        owner.post(f"/api/hub/bookings/{ride['id']}/decision", json={"action": "approve"}),
        owner.patch("/api/hub/onboarding/profile", json={"payment_method": "PAY_ON_COMPLETION"}),
        owner.post("/api/hub/quotes", json={"service_type": "RIDE", "destination_text": "Bank"}),
    ]
    assert [r.status_code for r in refused] == [403, 403, 403, 403]
    assert refused[0].json()["detail"] == "Only the account owner can perform this action."

    # 6. Back as Meera, force a failure: nothing is booked and nothing is charged.
    switch("owner")
    assert ok(owner.post("/api/hub/demo/fail-next"))["fail_next"] is True
    retry = ok(
        owner.post("/api/hub/quotes", json={"service_type": "RIDE", "destination_place_id": doctor})
    )["quotes"][0]
    failed = ok(confirm(owner, retry))
    assert (failed["booking_status"], failed["payment"]["status"]) == (
        "FAILED",
        "NOT_CHARGED_SIMULATED",
    )
    assert "provider_booking_id" not in failed or not failed["provider_booking_id"]
    activity = {b["id"]: b for b in state(owner)["activity"]}
    assert activity[ride["id"]]["booking_status"] == "CONFIRMED_SIMULATED"
    assert activity[failed["id"]]["payment"]["status"] == "NOT_CHARGED_SIMULATED"
    # The switch is used up: the next booking succeeds with the next demo reference.
    again = ok(
        owner.post("/api/hub/quotes", json={"service_type": "RIDE", "destination_place_id": doctor})
    )["quotes"][0]
    assert ok(confirm(owner, again))["provider_booking_id"] == "DEMO-RIDE-1043"
