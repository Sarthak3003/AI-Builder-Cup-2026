"""Care Circle permissions, enforced by the API rather than by hiding buttons."""

import time

import pytest
from booking_helpers import book, ok, ready, require_approval, state
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "care.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        ready(api)
        yield api


def invite(owner, name, role="viewer", extras=()):
    result = owner.post(
        "/api/hub/care-circle", json={"name": name, "role": role, "extras": list(extras)}
    )
    assert result.status_code == 200, result.text
    return result.json()


def join(app, owner, name, role="viewer", extras=()):
    code = invite(owner, name, role, extras)["code"]
    helper = TestClient(app)
    assert helper.post("/api/hub/caregiver/join", json={"code": code}).status_code == 200
    return helper


def test_viewer_sees_only_what_is_shared_and_never_private_fields(app, owner):
    ride = book(owner, destination_text="Doctor")
    hidden = book(owner, "food")
    shared = ok(owner.put(f"/api/hub/bookings/{hidden['id']}/sharing", json={"shared": False}))
    assert shared["shared"] is False
    viewer = join(app, owner, "Ravi")
    seen = state(viewer)
    assert seen["role"] == "caregiver"
    assert [item["id"] for item in seen["activity"]] == [ride["id"]]
    item = seen["activity"][0]
    assert "payment" not in item and "idempotency_key" not in item and "quote_id" not in item
    assert item["details"]["destination"] == {"label": "Doctor"}
    assert item["details"]["pickup"] == {"label": "Home"}
    assert "Sample Lane" not in str(seen) and "Example Road" not in str(seen)
    for private in ("messages", "audit", "requests", "care_circle", "contacts", "places"):
        assert not seen.get(private)
    assert seen["profile"]["medicines"] == [] and seen["profile"]["home"] == ""
    profile = state(owner)["profile"]
    profile["sharing"]["ride"] = False
    owner.put("/api/hub/profile", json=profile)
    assert state(viewer)["activity"] == []


def test_viewer_cannot_act_through_the_api(app, owner):
    require_approval(owner)
    pending = book(owner, option="uber-go")
    assert pending["booking_status"] == "AWAITING_APPROVAL"
    viewer = join(app, owner, "Ravi")
    base = f"/api/hub/bookings/{pending['id']}"
    assert viewer.post(f"{base}/decision", json={"action": "approve"}).status_code == 403
    assert viewer.post(f"{base}/cancel").status_code == 403
    assert viewer.get(base).status_code == 403
    assert viewer.get("/api/hub/bookings").status_code == 403
    assert viewer.put("/api/hub/profile", json={"name": "x"}).status_code in {403, 422}
    profile = state(owner)["profile"]
    assert viewer.put("/api/hub/profile", json=profile).status_code == 403
    assert viewer.post("/api/hub/care-circle", json={"name": "Eve"}).status_code == 403
    assert viewer.post("/api/hub/demo/fail-next").status_code == 403
    assert state(owner)["activity"][0]["booking_status"] == "AWAITING_APPROVAL"


def test_delegated_approval_books_once_and_keeps_payment_separate(app, owner):
    require_approval(owner)
    pending = book(owner, option="uber-go")
    assert pending["payment"]["status"] == "NOT_CHARGED_SIMULATED"
    assert pending["provider_booking_id"] is None
    asha = join(app, owner, "Asha", "approver")
    meena = join(app, owner, "Meena", "approver")
    assert [a["id"] for a in state(asha)["approvals"]] == [pending["id"]]
    decision = f"/api/hub/bookings/{pending['id']}/decision"
    approved = ok(asha.post(decision, json={"action": "approve"}))
    assert approved["booking_status"] == "CONFIRMED_SIMULATED"
    assert "payment" not in approved and "idempotency_key" not in approved
    assert ok(asha.post(decision, json={"action": "approve"}))["id"] == pending["id"]
    second = meena.post(decision, json={"action": "approve"})
    assert second.status_code == 409 and "Asha" in second.json()["detail"]
    assert meena.post(decision, json={"action": "reject"}).status_code == 409
    mine = state(owner)["activity"][0]
    assert mine["booking_status"] == "CONFIRMED_SIMULATED"
    assert mine["provider_booking_id"] == "DEMO-RIDE-1042"
    assert mine["payment"]["status"] == "SUCCEEDED_SIMULATED"
    assert mine["decision"]["name"] == "Asha"
    alert = [e for e in state(owner)["events"] if e["kind"] == "approval_needed"][0]
    assert (alert["status"], alert["resolved_by"]) == ("resolved", "Asha")
    audit = state(owner)["audit"]
    assert [a["actor"] for a in audit if a["event"] == "caregiver_approve"] == ["Asha"]


def test_a_declined_request_is_never_booked_or_charged(app, owner):
    require_approval(owner)
    pending = book(owner, option="uber-go")
    asha = join(app, owner, "Asha", "approver")
    declined = ok(
        asha.post(
            f"/api/hub/bookings/{pending['id']}/decision",
            json={"action": "reject", "note": "Let me drive you."},
        )
    )
    assert declined["booking_status"] == "DECLINED"
    mine = state(owner)["activity"][0]
    assert (mine["provider_booking_id"], mine["payment"]["status"]) == (
        None,
        "NOT_CHARGED_SIMULATED",
    )


def test_approver_can_ask_a_question_without_deciding(app, owner):
    require_approval(owner)
    pending = book(owner, option="uber-go")
    asha = join(app, owner, "Asha", "approver")
    asked = ok(
        asha.post(
            f"/api/hub/bookings/{pending['id']}/decision",
            json={"action": "ask", "note": "Is this for the clinic visit?"},
        )
    )
    assert asked["booking_status"] == "AWAITING_APPROVAL"
    mine = state(owner)
    assert mine["activity"][0]["questions"][0]["text"] == "Is this for the clinic visit?"
    assert any(e["kind"] == "question" for e in mine["events"])


def test_revoked_caretaker_loses_access_immediately(app, owner):
    asha = join(app, owner, "Asha", "approver")
    grant = state(asha)["grant"]["id"]
    assert owner.delete(f"/api/hub/care-circle/{grant}").status_code == 200
    assert asha.get("/api/hub/state").status_code == 403
    require_approval(owner)
    pending = book(owner, option="uber-go")
    decision = f"/api/hub/bookings/{pending['id']}/decision"
    assert asha.post(decision, json={"action": "approve"}).status_code == 403
    assert asha.get("/api/hub/activities").status_code == 403
    assert asha.get("/api/hub/care-circle/activities").status_code == 403


def test_reducing_permissions_applies_to_the_next_request(app, owner):
    require_approval(owner)
    pending = book(owner, option="uber-go")
    asha = join(app, owner, "Asha", "approver")
    grant = state(asha)["grant"]["id"]
    owner.put(f"/api/hub/care-circle/{grant}", json={"role": "viewer", "extras": []})
    decision = f"/api/hub/bookings/{pending['id']}/decision"
    assert asha.post(decision, json={"action": "approve"}).status_code == 403
    assert state(asha)["approvals"] == []


def test_failed_booking_is_failed_not_completed_and_not_charged(app, owner):
    assert ok(owner.post("/api/hub/demo/fail-next")) == {"fail_next": True}
    failed = book(owner)
    assert (failed["booking_status"], failed["payment"]["status"]) == (
        "FAILED",
        "NOT_CHARGED_SIMULATED",
    )
    assert failed["provider_booking_id"] is None
    assert "Nothing was booked or charged" in failed["failure"]
    assert owner.post(f"/api/hub/bookings/{failed['id']}/complete").status_code == 409
    assert owner.post(f"/api/hub/bookings/{failed['id']}/payment/complete").status_code == 409
    assert len(state(owner)["activity"]) == 1
    retried = book(owner)
    assert retried["booking_status"] == "CONFIRMED_SIMULATED"
    assert retried["provider_booking_id"] == "DEMO-RIDE-1042"
    watcher = join(app, owner, "Asha", "viewer", ["receive_alerts"])
    viewer = join(app, owner, "Ravi")
    assert "booking_failed" in [e["kind"] for e in state(watcher)["events"]]
    assert "booking_failed" not in [e["kind"] for e in state(viewer)["events"]]
    statuses = [item["booking_status"] for item in state(viewer)["activity"]]
    assert "FAILED" in statuses and "COMPLETED_SIMULATED" not in statuses


def test_notifications_follow_permissions_and_sharing(app, owner):
    secret = book(owner, "food")
    owner.put(f"/api/hub/bookings/{secret['id']}/sharing", json={"shared": False})
    viewer = join(app, owner, "Ravi")
    events = state(viewer)["events"]
    assert secret["id"] not in {e["ref"] for e in events}
    assert all(e["permission"] == "view_activity" for e in events)


def test_pharmacy_details_and_payments_need_their_own_permissions(app, owner):
    book(owner, "medicine")
    plain = state(join(app, owner, "Ravi"))
    item = plain["activity"][0]
    assert item["title"] == "Pharmacy order (details not shared)"
    assert item["details"] == {} and item["line_items"] == []
    assert "ORS" not in str(plain)
    allowed = state(join(app, owner, "Asha", "viewer", ["view_medication", "view_payments"]))
    item = allowed["activity"][0]
    assert item["title"].startswith("ORS sachets")
    assert item["payment"]["simulated"] is True
    assert item["payment"]["status"] == "SUCCEEDED_SIMULATED"


def test_administrator_limits(app, owner):
    admin = join(app, owner, "Kiran", "administrator")
    assert admin.post("/api/hub/care-circle", json={"name": "Neighbour"}).status_code == 200
    for body in (
        {"name": "X", "role": "approver"},
        {"name": "X", "role": "administrator"},
        {"name": "X", "extras": ["view_transcripts"]},
        {"name": "X", "extras": ["approve"]},
    ):
        assert admin.post("/api/hub/care-circle", json=body).status_code == 403
    approver = invite(owner, "Asha", "approver")["grant"]["id"]
    assert admin.delete(f"/api/hub/care-circle/{approver}").status_code == 403
    circle = admin.get("/api/hub/state").json()["circle"]
    assert {person["name"] for person in circle} >= {"Kiran", "Neighbour", "Asha"}
    assert admin.put(f"/api/hub/care-circle/{approver}", json={"role": "viewer"}).status_code == 403


def test_invitations_are_one_use_expire_and_die_with_revocation(app, owner, monkeypatch):
    first = invite(owner, "Asha")
    with TestClient(app) as one, TestClient(app) as two:
        assert one.post("/api/hub/caregiver/join", json={"code": first["code"]}).status_code == 200
        assert two.post("/api/hub/caregiver/join", json={"code": first["code"]}).status_code == 403
    second = invite(owner, "Ravi")
    owner.delete(f"/api/hub/care-circle/{second['grant']['id']}")
    with TestClient(app) as late:
        assert late.post("/api/hub/caregiver/join", json={"code": second["code"]}).status_code in {
            403
        }
    third = invite(owner, "Old code")
    real = time.time
    monkeypatch.setattr("app.hub.time.time", lambda: real() + 2 * 86400)
    with TestClient(app) as slow:
        assert slow.post("/api/hub/caregiver/join", json={"code": third["code"]}).status_code == 401


def test_unknown_permissions_and_roles_are_rejected(owner):
    for body in (
        {"name": "X", "role": "owner"},
        {"name": "X", "extras": ["everything"]},
        {"name": "X", "extras": ["approve", "approve"]},
        {"name": ""},
    ):
        assert owner.post("/api/hub/care-circle", json=body).status_code == 422


def test_reset_removes_everyone(app, owner):
    asha = join(app, owner, "Asha", "approver")
    owner.delete("/api/hub/data")
    assert asha.get("/api/hub/state").status_code == 403


def test_an_expired_or_broken_cookie_starts_a_fresh_demo(app, owner):
    with TestClient(app) as visitor:
        visitor.cookies.set("__session", "not-a-real-session", path="/api/hub")
        assert visitor.get("/api/hub/state").status_code == 401
        fresh = visitor.post("/api/hub/session")
        assert fresh.status_code == 200 and fresh.json()["role"] == "owner"
        assert visitor.get("/api/hub/state").status_code == 200
