"""Phase 4: explicit confirmation, one booking per retry key, approvals and simulated payments."""

import time

import pytest
from booking_helpers import book, confirm, ok, quotes, ready, require_approval, state
from fastapi.testclient import TestClient

from app.config import Settings
from app.hub_store import HubStore
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "bookings.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        ready(api)
        yield api


def approver(app, owner):
    code = ok(
        owner.post(
            "/api/hub/onboarding/caretaker-grants", json={"name": "Asha", "can_approve": True}
        )
    )["code"]
    asha = TestClient(app)
    ok(asha.post("/api/hub/caregiver/join", json={"code": code}))
    return asha


def test_confirming_a_quote_makes_one_simulated_booking_with_a_separate_payment(owner):
    offered = quotes(owner, destination_text="Doctor")
    chosen = offered[0]
    booking = ok(confirm(owner, chosen))
    assert booking["id"] != chosen["id"] and booking["quote_id"] == chosen["id"]
    assert booking["provider_booking_id"] == "DEMO-RIDE-1042"
    assert booking["booking_status"] == "CONFIRMED_SIMULATED"
    assert booking["payment"] == {
        "method": "DEMO_WALLET",
        "status": "SUCCEEDED_SIMULATED",
        "amount_minor": chosen["amount_minor"],
        "currency": "INR",
        "simulated": True,
        "updated_at": booking["payment"]["updated_at"],
        "refund": None,
    }
    assert booking["amount_minor"] == chosen["amount_minor"] == 9400
    assert (booking["option_name"], booking["app_name"]) == ("Demo Ride", None)
    assert booking["notice"] == "Demo ride — no real driver will arrive."
    after = state(owner)
    assert after["quotes"] == [], "every quote from this request is used up or expired"
    events = [e["title"] for e in after["events"]]
    assert "Paid from the demo wallet (simulated)" in events
    assert ok(owner.get(f"/api/hub/bookings/{booking['id']}")) == booking
    assert ok(owner.get("/api/hub/bookings")) == [booking]
    second = book(owner, "food")
    assert second["provider_booking_id"] == "DEMO-FOOD-1042"
    assert book(owner)["provider_booking_id"] == "DEMO-RIDE-1043"


def test_a_used_quote_or_a_disconnected_service_cannot_be_confirmed(owner):
    offered = quotes(owner)
    ok(confirm(owner, offered[0]))
    used = confirm(owner, offered[0])
    assert used.status_code == 409 and "already used" in used.json()["detail"]
    sibling = confirm(owner, offered[1])
    assert sibling.status_code == 409 and "expired" in sibling.json()["detail"]
    later = quotes(owner)[0]
    ok(owner.post("/api/hub/services/RIDE/disconnect"))
    refused = confirm(owner, later)
    assert (
        refused.status_code == 409 and "Connect the Demo Ride Provider" in refused.json()["detail"]
    )
    assert len(state(owner)["activity"]) == 1


def test_pay_on_completion_stays_pending_until_the_demo_control_marks_it(owner):
    ok(owner.patch("/api/hub/onboarding/profile", json={"payment_method": "PAY_ON_COMPLETION"}))
    booking = book(owner)
    assert (booking["booking_status"], booking["payment"]["status"]) == (
        "CONFIRMED_SIMULATED",
        "PENDING_SIMULATED",
    )
    done = ok(owner.post(f"/api/hub/bookings/{booking['id']}/complete"))
    assert (done["booking_status"], done["payment"]["status"]) == (
        "COMPLETED_SIMULATED",
        "PENDING_SIMULATED",
    )
    paid = ok(owner.post(f"/api/hub/bookings/{booking['id']}/payment/complete"))
    assert (paid["booking_status"], paid["payment"]["status"]) == (
        "COMPLETED_SIMULATED",
        "SUCCEEDED_SIMULATED",
    )
    again = ok(owner.post(f"/api/hub/bookings/{booking['id']}/payment/complete"))
    assert again["payment"] == paid["payment"]
    titles = [e["title"] for e in state(owner)["events"]]
    assert titles.count("Simulated payment marked complete") == 1


def test_cancelling_keeps_booking_and_payment_facts_separate(owner):
    wallet = book(owner)
    cancelled = ok(owner.post(f"/api/hub/bookings/{wallet['id']}/cancel"))
    assert cancelled["booking_status"] == "CANCELLED_SIMULATED"
    assert cancelled["payment"]["status"] == "SUCCEEDED_SIMULATED"
    assert cancelled["payment"]["refund"]["status"] == "REFUNDED_SIMULATED"
    assert owner.post(f"/api/hub/bookings/{wallet['id']}/complete").status_code == 409
    ok(owner.patch("/api/hub/onboarding/profile", json={"payment_method": "PAY_ON_COMPLETION"}))
    pending = book(owner)
    dropped = ok(owner.post(f"/api/hub/bookings/{pending['id']}/cancel"))
    assert (dropped["payment"]["status"], dropped["payment"]["refund"]) == (
        "NOT_CHARGED_SIMULATED",
        None,
    )
    finished = book(owner)
    ok(owner.post(f"/api/hub/bookings/{finished['id']}/complete"))
    assert owner.post(f"/api/hub/bookings/{finished['id']}/cancel").status_code == 409


def test_a_forced_failure_records_no_booking_reference_and_no_payment(owner):
    ok(owner.post("/api/hub/demo/fail-next"))
    failed = book(owner)
    assert failed["booking_status"] == "FAILED"
    assert failed["payment"]["status"] == "NOT_CHARGED_SIMULATED"
    assert failed["provider_booking_id"] is None
    assert owner.post(f"/api/hub/bookings/{failed['id']}/cancel").status_code == 409
    assert book(owner)["provider_booking_id"] == "DEMO-RIDE-1042"
    titles = [e["title"] for e in state(owner)["events"]]
    assert not any("Paid" in title for title in titles[1:])


def test_nothing_is_booked_until_an_approver_says_yes(app, owner):
    require_approval(owner)
    asha = approver(app, owner)
    ok(owner.post("/api/hub/demo/fail-next"))
    pending = book(owner, option="uber-go")
    assert (pending["booking_status"], pending["provider_booking_id"]) == (
        "AWAITING_APPROVAL",
        None,
    )
    failed = ok(
        asha.post(f"/api/hub/bookings/{pending['id']}/decision", json={"action": "approve"})
    )
    assert failed["booking_status"] == "FAILED", "the armed failure waited for the real attempt"
    retry = book(owner, option="uber-go")
    approved = ok(
        asha.post(f"/api/hub/bookings/{retry['id']}/decision", json={"action": "approve"})
    )
    assert approved["booking_status"] == "CONFIRMED_SIMULATED"
    mine = next(b for b in state(owner)["activity"] if b["id"] == retry["id"])
    assert mine["provider_booking_id"] == "DEMO-RIDE-1042"
    assert mine["payment"]["status"] == "SUCCEEDED_SIMULATED"


def test_an_unanswered_approval_lapses_without_booking(app, owner, monkeypatch):
    require_approval(owner)
    asha = approver(app, owner)
    pending = book(owner, option="uber-go")
    later = time.time() + 25 * 3600

    class Tomorrow:
        # Only the booking rules move forward; the session cookie keeps real time.
        @staticmethod
        def time():
            return later

    monkeypatch.setattr("app.bookings.time", Tomorrow)
    lapsed = state(owner)["activity"][0]
    assert lapsed["booking_status"] == "CANCELLED_SIMULATED"
    assert lapsed["payment"]["status"] == "NOT_CHARGED_SIMULATED"
    assert "expired" in lapsed["failure"]
    refused = asha.post(f"/api/hub/bookings/{pending['id']}/decision", json={"action": "approve"})
    assert refused.status_code == 409


def test_the_owner_cancelling_a_pending_request_withdraws_the_approval(app, owner):
    require_approval(owner)
    asha = approver(app, owner)
    pending = book(owner, option="uber-go")
    ok(owner.post(f"/api/hub/bookings/{pending['id']}/cancel"))
    assert state(asha)["approvals"] == []
    late = asha.post(f"/api/hub/bookings/{pending['id']}/decision", json={"action": "approve"})
    assert late.status_code == 409


def production(tmp_path, monkeypatch):
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.delenv("SAATHI_DEMO_CONTROLS", raising=False)
    monkeypatch.setenv("SAATHI_SESSION_SECRET", "test-secret-" * 4)
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "prod.db"))
    local = HubStore(Settings(environment="test", firestore_mode="disabled"))
    monkeypatch.setattr("app.hub.HubStore", lambda config: local)
    return create_app(
        Settings(environment="production", firestore_mode="cloud", firestore_project="demo")
    )


def test_demo_payment_and_completion_controls_are_off_in_production(tmp_path, monkeypatch):
    with TestClient(production(tmp_path, monkeypatch), base_url="https://api.example") as api:
        api.post("/api/hub/session")
        ready(api)
        booking = book(api)
        assert booking["booking_status"] == "CONFIRMED_SIMULATED"
        assert api.post(f"/api/hub/bookings/{booking['id']}/complete").status_code == 404
        assert api.post(f"/api/hub/bookings/{booking['id']}/payment/complete").status_code == 404
        assert api.post("/api/hub/demo/fail-next").status_code == 404
