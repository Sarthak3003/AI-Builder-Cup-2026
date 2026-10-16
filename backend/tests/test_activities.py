"""Phase 5: one activity record, seen in full by the owner and only as permitted by caretakers."""

import pytest
from booking_helpers import book, ok, quotes, ready, state
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "activities.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        ready(api)
        yield api


def join(app, owner, name, role="viewer", extras=()):
    code = ok(
        owner.post(
            "/api/hub/care-circle", json={"name": name, "role": role, "extras": list(extras)}
        )
    )["code"]
    caretaker = TestClient(app)
    ok(caretaker.post("/api/hub/caregiver/join", json={"code": code}))
    return caretaker


def circle(caretaker):
    return ok(caretaker.get("/api/hub/care-circle/activities"))


def test_the_owner_and_a_caretaker_see_the_same_persisted_ride_event(app, owner):
    ravi = join(app, owner, "Ravi")
    ride = book(owner, destination_text="Doctor")
    mine = ok(owner.get("/api/hub/activities"))
    booked = next(e for e in mine if e["kind"] == "booked" and e["ref"] == ride["id"])
    assert booked["title"] == "Booked (simulated): Demo Ride to Doctor"
    assert "DEMO-RIDE-1042" in booked["detail"] and "no real driver" in booked["detail"]
    seen = circle(ravi)
    assert booked["id"] in [e["id"] for e in seen["events"]]
    assert ok(ravi.get("/api/hub/activities")) == seen["events"]
    shared = seen["bookings"][0]
    assert shared["id"] == ride["id"] and shared["provider_booking_id"] == "DEMO-RIDE-1042"
    assert shared["booking_status"] == "CONFIRMED_SIMULATED"
    assert shared["details"] == {
        "pickup": {"label": "Home"},
        "destination": {"label": "Doctor"},
        "distance_km": 5.3,
    }
    for private in ("payment", "idempotency_key", "quote_id"):
        assert private not in shared
    assert "Sample Lane" not in str(seen) and "Example Road" not in str(seen)


def test_payment_events_and_payment_status_need_their_own_permission(app, owner):
    ravi = join(app, owner, "Ravi")
    kiran = join(app, owner, "Kiran", "viewer", ["view_payments"])
    book(owner)
    plain = circle(ravi)
    assert not [e for e in plain["events"] if e["kind"] == "payment"]
    assert "payment" not in plain["bookings"][0]
    allowed = circle(kiran)
    assert [e["title"] for e in allowed["events"] if e["kind"] == "payment"] == [
        "Paid from the demo wallet (simulated)"
    ]
    assert allowed["bookings"][0]["payment"]["status"] == "SUCCEEDED_SIMULATED"


def test_alerts_and_approval_requests_follow_their_own_permissions(app, owner):
    ravi = join(app, owner, "Ravi")
    watcher = join(app, owner, "Mina", "viewer", ["receive_alerts"])
    asha = join(app, owner, "Asha", "approver")
    ok(owner.post("/api/hub/demo/fail-next"))
    book(owner)
    profile = state(owner)["profile"]
    profile.update(caregiver_enabled=True, approval_limit=50)
    ok(owner.put("/api/hub/profile", json=profile))
    book(owner, option="uber-go")
    kinds = {
        name: {e["kind"] for e in circle(api)["events"]}
        for name, api in (
            ("ravi", ravi),
            ("watcher", watcher),
            ("asha", asha),
        )
    }
    assert "booking_failed" not in kinds["ravi"] and "approval_needed" not in kinds["ravi"]
    assert "booking_failed" in kinds["watcher"] and "approval_needed" not in kinds["watcher"]
    assert "approval_needed" in kinds["asha"]


def test_unshared_bookings_and_their_events_stay_hidden(app, owner):
    ravi = join(app, owner, "Ravi")
    private = book(owner, "food")
    ok(owner.put(f"/api/hub/bookings/{private['id']}/sharing", json={"shared": False}))
    seen = circle(ravi)
    assert seen["bookings"] == []
    assert private["id"] not in {e["ref"] for e in seen["events"]}
    profile = state(owner)["profile"]
    profile["sharing"]["ride"] = False
    ok(owner.put("/api/hub/profile", json=profile))
    book(owner)
    assert circle(ravi)["bookings"] == []


VIEW_ONLY_REFUSALS = [
    ("post", "/api/hub/bookings/{id}/decision", {"action": "approve"}),
    ("post", "/api/hub/bookings/{id}/cancel", None),
    ("post", "/api/hub/bookings/{id}/complete", None),
    ("post", "/api/hub/bookings/{id}/payment/complete", None),
    ("put", "/api/hub/bookings/{id}/sharing", {"shared": False}),
    ("get", "/api/hub/bookings/{id}", None),
    ("get", "/api/hub/bookings", None),
    ("post", "/api/hub/quotes", {"service_type": "RIDE", "destination_text": "Market"}),
    ("post", "/api/hub/quotes/{quote}/confirm", {"idempotency_key": "x" * 12, "confirmed": True}),
    ("patch", "/api/hub/onboarding/profile", {"payment_method": "PAY_ON_COMPLETION"}),
    ("get", "/api/hub/onboarding", None),
    ("post", "/api/hub/onboarding/locations", {"label": "Office", "address": "1 Sample Road"}),
    ("get", "/api/hub/services", None),
    ("post", "/api/hub/services/RIDE/disconnect", None),
    ("post", "/api/hub/demo/fail-next", None),
    ("delete", "/api/hub/data", None),
]


@pytest.mark.parametrize(("method", "path", "body"), VIEW_ONLY_REFUSALS)
def test_a_view_only_caretaker_is_refused_through_direct_api_calls(app, owner, method, path, body):
    ravi = join(app, owner, "Ravi")
    ride = book(owner)
    spare = quotes(owner)[0]
    target = path.format(id=ride["id"], quote=spare["id"])
    kwargs = {"json": body} if body is not None else {}
    refused = getattr(ravi, method)(target, **kwargs)
    assert refused.status_code == 403, (target, refused.text)
    assert refused.json()["detail"]
    after = state(owner)
    assert after["activity"][0]["booking_status"] == "CONFIRMED_SIMULATED"
    assert after["profile"]["payment_method"] == "DEMO_WALLET"
    assert len(after["activity"]) == 1 and len(after["places"]) == 2


def test_a_revoked_caretaker_is_blocked_on_the_very_next_request(app, owner):
    asha = join(app, owner, "Asha", "approver", ["view_payments"])
    book(owner)
    assert circle(asha)["bookings"]
    grant = state(asha)["grant"]["id"]
    ok(owner.delete(f"/api/hub/care-circle/{grant}"))
    for path in ("/api/hub/state", "/api/hub/activities", "/api/hub/care-circle/activities"):
        blocked = asha.get(path)
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == "Your Care Circle access was removed."


def test_the_caretaker_list_is_only_for_caretakers(owner):
    refused = owner.get("/api/hub/care-circle/activities")
    assert refused.status_code == 403


def test_an_approvers_decision_returns_only_their_own_view(app, owner):
    profile = state(owner)["profile"]
    profile.update(caregiver_enabled=True, approval_limit=50)
    ok(owner.put("/api/hub/profile", json=profile))
    asha = join(app, owner, "Asha", "approver")
    pending = book(owner, option="uber-go", destination_text="Doctor")
    approved = ok(
        asha.post(f"/api/hub/bookings/{pending['id']}/decision", json={"action": "approve"})
    )
    assert approved["booking_status"] == "CONFIRMED_SIMULATED"
    for private in ("payment", "idempotency_key", "quote_id"):
        assert private not in approved
    assert approved["details"]["pickup"] == {"label": "Home"}
