"""Phone activity stays private and polling never writes to Firestore or SQLite."""

from unittest.mock import patch

from booking_helpers import ok, state
from fastapi.testclient import TestClient
from test_twilio import Call
from test_twilio import app as app
from test_twilio import owner as owner

from app.config import Settings
from app.hub_store import HubStore


def test_call_history_follows_caretaker_decision_after_hangup(owner):
    profile = state(owner)["profile"]
    profile.update(caregiver_enabled=True, approval_limit=1)
    ok(owner.put("/api/hub/profile", json=profile))
    invite = ok(owner.post("/api/hub/care-circle", json={"name": "Asha", "role": "approver"}))
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Doctor")
    call.say("Home")
    call.digits("1")
    before = ok(owner.get("/api/hub/snapshot"))
    assert before["conversations"][0]["workflow_state"] == "AWAITING_EXTERNAL_APPROVAL"
    with TestClient(owner.app) as asha:
        ok(asha.post("/api/hub/caregiver/join", json={"code": invite["code"]}))
        item = before["activity"][0]
        ok(asha.post(f"/api/hub/bookings/{item['id']}/decision", json={"action": "approve"}))
    after = ok(owner.get("/api/hub/snapshot"))["conversations"][0]
    assert after["workflow_state"] == "COMPLETED"
    assert after["call_status"] == "ENDED" and after["status"] == "CONFIRMED_SIMULATED"


def test_call_history_refresh_metadata_and_read_only_polling(owner):
    call = Call(owner)
    call.pair(owner, retain=True)
    call.say("Book a cab to Doctor")
    call.say("Home")
    call.digits("1")
    with patch.object(HubStore, "atomic", side_effect=AssertionError("Polling tried to write")):
        snapshot = ok(owner.get("/api/hub/snapshot"))
        sessions = ok(owner.get("/api/hub/phone/sessions"))
    assert len(sessions) == 1
    conv = next(c for c in snapshot["conversations"] if c["channel"] == "phone")
    assert conv["booking_id"] == snapshot["activity"][0]["id"]
    assert conv["call_status"] == "ENDED" and conv["workflow_state"] == "COMPLETED"
    assert conv["ended_at"] and conv["duration_seconds"] >= 0
    assert any(line["text"] == "Home" for line in conv["transcript"])
    assert "DEMO-RIDE" not in str(conv["summary"]["text"])
    assert "Booked" in conv["summary"]["confirmed"][0]
    assert ok(owner.get("/api/hub/snapshot"))["conversations"] == snapshot["conversations"]


def test_phone_revocation_blocks_next_signed_turn_and_unused_codes(owner):
    call = Call(owner)
    call.pair(owner)
    code = ok(owner.post("/api/hub/phone/pairing-codes", json={}))["code"]
    ok(owner.post("/api/hub/phone/revoke"))
    call.say("Book a cab")
    assert call.xml.find("Hangup") is not None
    another = Call(owner)
    another.digits(code)
    assert "invalid or expired" in another.text
    assert not state(owner)["activity"]


def test_caretaker_summary_transcript_and_call_access_follow_permissions(owner):
    call = Call(owner)
    call.pair(owner, retain=True)
    call.say("Book a cab to Doctor")
    call.say("Home")
    call.digits("1")
    conv = state(owner)["conversations"][0]
    with TestClient(owner.app) as viewer:
        invite = ok(owner.post("/api/hub/care-circle", json={"name": "Ravi", "role": "viewer"}))
        ok(viewer.post("/api/hub/caregiver/join", json={"code": invite["code"]}))
        assert ok(viewer.get("/api/hub/snapshot"))["conversations"] == []
        assert viewer.get("/api/hub/phone/sessions").status_code == 403
        assert viewer.post("/api/hub/phone/revoke").status_code == 403
        assert viewer.get(f"/api/hub/conversations/{conv['id']}/transcript").status_code == 403


def test_snapshot_isolation_after_account_delete(owner):
    call = Call(owner)
    call.pair(owner, retain=True)
    call.say("Book a cab to Doctor")
    store = HubStore(Settings(environment="test"))
    sid = store.read_document("phoneLimits/calls")["active"]
    session = next(iter(sid))
    ok(owner.delete("/api/hub/data"))
    assert ok(owner.get("/api/hub/snapshot"))["conversations"] == []
    assert owner.get(f"/api/hub/phone/sessions/{session}").status_code in {403, 404}
    call.say("Home")
    assert call.xml.find("Hangup") is not None
