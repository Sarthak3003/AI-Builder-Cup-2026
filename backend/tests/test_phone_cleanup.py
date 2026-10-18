import time

import pytest
from booking_helpers import ok, state
from test_twilio import Call, session_documents
from test_twilio import app as app
from test_twilio import owner as owner

from app.phone_cleanup import cleanup


def test_cleanup_is_explicit_and_preserves_booking_history(owner):
    call = Call(owner)
    code = call.pair(owner, retain=True)
    store, ids = session_documents()
    call.say("Book a cab to Doctor")
    call.say("Home")
    call.digits("1")
    session_key = "phoneSessions/" + ids[0]
    now = time.time() + 86401
    planned = cleanup(store, now=now)
    assert planned["dry_run"] and planned["eligible"] >= 5 and planned["deleted"] == 0
    assert store.read_document(session_key) is not None
    removed = cleanup(store, apply=True, now=now)
    assert removed["deleted"] == planned["eligible"]
    assert store.read_document(session_key) is None
    assert cleanup(store, apply=True, now=now)["deleted"] == 0
    after = state(owner)
    assert len(after["activity"]) == 1
    assert after["conversations"][0]["transcript"] == []
    assert after["conversations"][0]["summary"]["confirmed"]
    assert code not in str(after)


def test_cleanup_ignores_active_unrelated_and_future_data(owner):
    call = Call(owner)
    call.pair(owner)
    store, ids = session_documents()
    assert cleanup(store, apply=True)["deleted"] == 0
    assert store.read_document("phoneSessions/" + ids[0]) is not None
    assert state(owner)["profile"]["name"] == "Meera"
    with pytest.raises(ValueError):
        cleanup(store, limit=10000)


def test_expired_transcripts_are_not_served_before_cleanup(owner):
    call = Call(owner)
    call.pair(owner, retain=True)
    call.say("Book a cab")
    store, ids = session_documents()
    call_record = store.read_document("phoneSessions/" + ids[0])
    store.change(
        call_record["owner"],
        lambda value: value["conversations"][0].update(transcript_expires_at=1),
    )
    view = ok(owner.get("/api/hub/snapshot"))["conversations"][0]
    assert view["transcript"] == [] and not view["transcript_retained"]
    assert owner.get(f"/api/hub/conversations/{ids[0]}/transcript").status_code == 410
