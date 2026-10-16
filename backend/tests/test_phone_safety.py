"""Confirmation binding, callback ordering and privacy regressions for real voice routes."""

import json

import pytest
from booking_helpers import ok, state
from fastapi.testclient import TestClient
from test_conversation import account as account
from test_conversation import say
from test_twilio import PREFIX, Call, post, session_documents
from test_twilio import app as app
from test_twilio import owner as owner

from app.conversation import new_session
from app.hub_store import HubStore


@pytest.mark.parametrize("field", ["title", "provider_type", "option_id", "amount_minor"])
def test_confirmation_binds_every_offer_identity_field(account, field):
    session = new_session("phone")
    say(account, session, "Book a cab to Doctor")
    say(account, session, "Home")
    quote = next(q for q in account["quotes"] if q["id"] == session["pending"]["quote_id"])
    quote[field] = 1 if field == "amount_minor" else "changed"
    result = say(account, session, "yes confirm it")
    assert result["state"] == "EXPIRED" and not account["activity"]


def test_pickup_and_food_corrections_invalidate_old_pending_actions(account):
    session = new_session("phone")
    say(account, session, "Book a cab to Doctor")
    say(account, session, "Home")
    old = session["pending"]["quote_id"]
    result = say(account, session, "Change pickup to Station")
    assert "new pickup" in result["reply"] and result["pending_action"] is None
    say(account, session, "12 Demo Road")
    assert session["draft"]["destination"] == "Doctor"
    assert session["pickup"]["address"] == "12 Demo Road"
    assert next(q for q in account["quotes"] if q["id"] == old)["status"] == "EXPIRED"

    meal = new_session("phone")
    say(account, meal, "Order vegetarian dinner under 200")
    say(account, meal, "one")
    old = meal["pending"]["quote_id"]
    result = say(account, meal, "Actually make it mild under 120")
    assert result["state"] == "PRESENTING_OPTIONS" and meal["pending"] is None
    assert next(q for q in account["quotes"] if q["id"] == old)["status"] == "EXPIRED"
    assert not account["activity"]


def test_pruned_meal_choice_expires_instead_of_crashing(account):
    session = new_session("phone")
    say(account, session, "Order dinner under 200")
    account["quotes"] = []
    assert say(account, session, "one")["state"] == "EXPIRED"


def test_sensitive_numbers_never_become_saved_pickup_or_transcript(account):
    session = new_session("phone", retain_transcript=True)
    say(account, session, "Book a cab to Bank")
    sensitive = "4111 1111 1111 1111"
    result = say(account, session, sensitive)
    assert "do not share" in result["reply"]
    assert sensitive not in json.dumps(session)
    assert session["pickup"] is None


def test_out_of_order_and_replayed_steps_never_skip_a_question(owner):
    call = Call(owner)
    call.pair(owner)
    next_url = call.action
    call.send(PREFIX + "/gather?step=10", Digits="1")
    assert call.action == next_url and not state(owner)["activity"]
    call.say("Book a cab to Bank")
    pickup_url = call.action
    call.say("Home")
    confirmation_url = call.action
    call.send(pickup_url, Digits="1")
    assert call.action == confirmation_url
    assert not state(owner)["activity"]
    call.digits("1")
    assert len(state(owner)["activity"]) == 1


def test_successful_food_call_and_status_duplicates_preserve_one_receipt(owner):
    call = Call(owner)
    call.pair(owner, retain=True)
    call.say("Order dinner")
    call.say("vegetarian and mild under 150")
    call.digits("1")
    confirm_url = call.action
    call.say("yes confirm it")
    assert "DEMO-FOOD-1042" in call.text and call.xml.find("Hangup") is not None
    for _ in range(2):
        ended = post(owner, PREFIX + "/status", {**call.fields, "CallStatus": "completed"})
        assert ended.status_code == 204
        call.send(confirm_url, SpeechResult="Yes, confirm it")
    assert len(state(owner)["activity"]) == 1
    assert state(owner)["activity"][0]["service"] == "food"


@pytest.mark.parametrize("confidence", ["nan", "inf", "-1", "2", "invalid"])
def test_invalid_confidence_never_authorises_a_booking(owner, confidence):
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Bank")
    call.say("Home")
    call.send(call.action, SpeechResult="yes", Confidence=confidence)
    assert "did not hear" in call.text and not state(owner)["activity"]


def test_hindi_keypad_and_spoken_confirmation(owner):
    profile = state(owner)["profile"]
    ok(owner.put("/api/hub/profile", json={**profile, "language": "hi-IN"}))
    call = Call(owner)
    call.pair(owner)
    call.say("मुझे Bank जाना है")
    assert "कहाँ से" in call.text
    call.say("घर")
    assert "क्या पुष्टि" in call.text
    call.say("हाँ पुष्टि करें")
    assert call.xml.find("Hangup") is not None
    assert "DEMO-RIDE-1042" in call.text and "कोई पैसा नहीं" in call.text


def test_snapshot_and_transcript_cross_user_and_caretaker_privacy(owner):
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Bank")
    call.say("Home")
    call.digits("1")
    conv = state(owner)["conversations"][0]
    assert all(line["text"] == "[Not retained]" for line in conv["transcript"])
    with TestClient(owner.app) as other:
        ok(other.post("/api/hub/session"))
        assert other.get(f"/api/hub/conversations/{conv['id']}/transcript").status_code == 404
        assert ok(other.get("/api/hub/snapshot"))["activity"] == []


def test_separate_events_are_redacted_and_bound_to_session(owner):
    call = Call(owner)
    call.pair(owner)
    store, ids = session_documents()
    call.say("Book a cab")
    record = store.read_document(f"phoneEvents/{ids[0]}_twilio-step-1")
    assert record["session_id"] == ids[0]
    assert len(record["events"]) == 2
    assert all(event["text"] == "[Not retained]" for event in record["events"])


def test_infrastructure_failure_never_claims_no_booking_and_logs_no_message(
    owner, monkeypatch, caplog
):
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Bank")
    call.say("Home")
    original = HubStore.atomic

    def unavailable(*args, **kwargs):
        raise RuntimeError("secret transcript that must not be logged")

    monkeypatch.setattr(HubStore, "atomic", unavailable)
    call.digits("1")
    assert "Check Activity" in call.text and "Nothing was booked" not in call.text
    assert "secret transcript" not in caplog.text
    monkeypatch.setattr(HubStore, "atomic", original)


def test_unknown_call_status_cannot_end_a_call(owner):
    call = Call(owner)
    before = call.action
    response = post(owner, PREFIX + "/status", {**call.fields, "CallStatus": "unexpected"})
    assert response.status_code == 204
    call.send(PREFIX + "/incoming")
    assert call.action == before


def test_phone_grants_cannot_be_forged_via_body_fields(owner):
    call = Call(owner)
    call.send(call.action, Digits="0", user_id="Meera", owner="someone", role="owner")
    assert "Guest mode" in call.text
    store, ids = session_documents()
    assert store.read_document("phoneSessions/" + ids[0])["owner"] is None
