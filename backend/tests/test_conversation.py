"""The same deterministic conversation workflow runs for app and phone-like channels."""

import copy
import time
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import assistant
from app.care import ensure
from app.config import Settings
from app.conversation import MAX_TURNS, ConversationEngine, Turn, new_session, transition
from app.hub_store import initial_state
from app.intent import EMERGENCY, SCAM
from app.main import create_app
from app.seed import seed_setup
from app.workflows import MEDICAL_DIET, MEDICAL_DIET_WORDS, quote_for_draft


@pytest.fixture
def account():
    value = ensure(initial_state())
    seed_setup(value, time.time())
    value["profile"]["caregiver_enabled"] = False
    value["profile"]["show_options"] = False
    return value


def say(account, session, message="", **kwargs):
    return ConversationEngine().process(
        account, session, Turn(event_id=uuid4().hex, message=message, **kwargs)
    )


@pytest.fixture
def no_gemini(monkeypatch):
    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")

    def forbidden(*args, **kwargs):
        pytest.fail("Conversation state changes must not call Gemini inside a transaction.")

    monkeypatch.setattr(assistant, "_generate", forbidden)


@pytest.mark.parametrize("channel", ["app", "phone", "simulator", "whatsapp"])
def test_complete_multiturn_ride_never_uses_app_auto_booking(account, channel, no_gemini):
    session = new_session(channel, retain_transcript=True)
    assert "pick you up" in say(account, session, "Book a cab")["reply"]
    assert "go?" in say(account, session, "Home")["reply"]
    result = say(account, session, "Railway station")
    assert result["state"] == "AWAITING_CONFIRMATION"
    assert "including fees" in result["reply"] and "demo" in result["reply"]
    assert account["activity"] == []
    done = say(account, session, "Yes, confirm")
    assert done["state"] == "COMPLETED" and "DEMO-RIDE-1042" in done["reply"]
    assert account["activity"][0]["channel"] == channel
    assert say(account, session, "yes")["booking_id"] == done["booking_id"]
    assert len(account["activity"]) == 1


@pytest.mark.parametrize("channel", ["app", "phone", "simulator", "whatsapp"])
def test_food_collects_preferences_selection_then_confirmation(account, channel, no_gemini):
    session = new_session(channel)
    assert "eat?" in say(account, session, "Order dinner")["reply"]
    result = say(account, session, "vegetarian and mild under 150")
    assert result["state"] == "PRESENTING_OPTIONS"
    assert result["service"] == "food"
    assert session["draft"]["vegetarian"] is True and session["draft"]["mild"] is True
    assert session["draft"]["budget"] == 150
    assert not account["activity"]
    assert say(account, session, "one")["state"] == "AWAITING_CONFIRMATION"
    assert not account["activity"]
    assert say(account, session, "confirm")["state"] == "COMPLETED"
    assert account["activity"][0]["provider_booking_id"] == "DEMO-FOOD-1042"
    assert account["activity"][0]["channel"] == channel


def test_initial_food_intent_and_precomputed_draft_use_updated_state(account, no_gemini):
    engine = ConversationEngine()
    for message, draft in (
        ("Order vegetarian food under 150", None),
        ("Something vegetarian and mild under 150", assistant.Draft(service="food", budget=150)),
    ):
        session = new_session("phone")
        result = engine.process(
            account, session, Turn(event_id=uuid4().hex, message=message), draft=draft
        )
        assert result["state"] == "PRESENTING_OPTIONS"
        assert result["service"] == "food"
        assert not account["activity"]


def test_ambiguous_meal_preferences_do_not_switch_to_medicine(account):
    session = new_session("phone")
    say(account, session, "Order dinner")
    result = say(account, session, "calcium rich vegetarian and mild under 150")
    assert result["state"] == "COLLECTING_DETAILS"
    assert result["service"] == "food" and session["waiting_for"] == "meal"
    assert not account["quotes"] and not account["activity"]
    assert say(account, session, "vegetarian and mild under 150")["state"] == "PRESENTING_OPTIONS"


def test_meal_preferences_allow_an_explicit_change_to_a_ride(account):
    session = new_session("phone")
    say(account, session, "Order dinner")
    result = say(account, session, "Instead book a cab to Bank")
    assert result["service"] == "ride" and session["waiting_for"] == "pickup"
    assert not account["quotes"]
    result = say(account, session, "Home")
    assert result["state"] == "AWAITING_CONFIRMATION" and "Bank" in result["reply"]
    assert not account["activity"]


@pytest.mark.parametrize("paired", [True, False])
@pytest.mark.parametrize("follow_up", [True, False])
@pytest.mark.parametrize("condition", ["a peanut ALLERGY", "diabetes", "एलर्जी"])
def test_phone_food_medical_diet_blocks_quotes(account, paired, follow_up, condition):
    assert any(word in condition.lower() for word in MEDICAL_DIET_WORDS)
    session = new_session("phone", paired=paired)
    if follow_up:
        say(account, session, "Order dinner")
        message = f"Vegetarian and mild under 150. I have {condition}"
    else:
        message = f"Order dinner. I have {condition}"
    result = say(account, session, message)
    assert result["state"] == "CANCELLED" and result["reply"] == MEDICAL_DIET
    assert result["pending_action"] is None
    assert not account["quotes"] and not account["activity"]
    assert say(account, session, "yes")["reply"] == MEDICAL_DIET
    assert not account["quotes"] and not account["activity"]


@pytest.mark.parametrize("confirming", [True, False])
@pytest.mark.parametrize("condition", ["a peanut allergy", "DIABETES", "एलर्जी"])
def test_medical_diet_invalidates_all_meal_options_and_pending_action(
    account, confirming, condition
):
    session = new_session("phone")
    say(account, session, "Order vegetarian food under 150")
    if confirming:
        say(account, session, "one")
    quotes = [q for q in account["quotes"] if q["request_id"] == session["request_id"]]
    assert len(quotes) > len(session["quote_ids"])
    quote_ids = {q["id"] for q in account["quotes"]}
    result = say(account, session, f"I have {condition}")
    assert result["state"] == "CANCELLED" and result["reply"] == MEDICAL_DIET
    assert result["pending_action"] is None and session["quote_ids"] == []
    assert all(q["status"] == "EXPIRED" for q in quotes)
    assert {q["id"] for q in account["quotes"]} == quote_ids
    assert not account["activity"]
    say(account, session, "confirm")
    assert not account["activity"]


def test_medical_diet_checks_actual_message_even_with_precomputed_draft(account, no_gemini):
    session = new_session("phone")
    result = ConversationEngine().process(
        account,
        session,
        Turn(event_id=uuid4().hex, message="I have diabetes"),
        draft=assistant.Draft(service="food", vegetarian=True, mild=True, budget=150),
    )
    assert result["reply"] == MEDICAL_DIET
    assert not account["quotes"] and not account["activity"]


def test_food_search_passes_actual_preferences_to_shared_workflow(account, monkeypatch):
    message = "vegetarian and mild under 150"
    received = []

    def checked(state, draft, actual_message, channel, appointment):
        received.append(actual_message)
        return quote_for_draft(state, draft, actual_message, channel, appointment)

    monkeypatch.setattr("app.conversation.quote_for_draft", checked)
    session = new_session("phone")
    say(account, session, "Order dinner")
    assert say(account, session, message)["state"] == "PRESENTING_OPTIONS"
    assert received == [message]


def test_unknown_pickup_ambiguity_correction_and_intent_change(account):
    session = new_session("phone")
    say(account, session, "Book me a cab")
    assert "pickup address" in say(account, session, "yes")["reply"]
    say(account, session, "Home")
    assert "destination" in say(account, session, "there")["reply"]
    say(account, session, "Doctor")
    old = session["pending"]["id"]
    assert "Bank" in say(account, session, "Actually change to Bank")["reply"]
    assert session["pending"]["id"] != old
    assert session["draft"]["destination"] == "Bank"
    assert say(account, session, "Instead order dinner")["state"] == "PRESENTING_OPTIONS"
    assert say(account, session, "cancel")["state"] == "CANCELLED"
    assert account["activity"] == []


def test_correction_before_pickup_keeps_collecting_required_details(account):
    session = new_session("phone")
    say(account, session, "Book a cab to Doctor")
    assert "pick you up" in say(account, session, "Actually change to Bank")["reply"]
    assert not account["quotes"] and session["draft"]["destination"] == "Bank"
    result = say(account, session, "Home")
    assert result["state"] == "AWAITING_CONFIRMATION" and "Bank" in result["reply"]


@pytest.mark.parametrize("message", ["okay", "maybe", "yes but not yet", "1"])
def test_booking_needs_explicit_confirmation_not_an_acknowledgement(account, message):
    session = new_session("phone")
    say(account, session, "Book a cab to Bank")
    say(account, session, "Home")
    pending = copy.deepcopy(session["pending"])
    assert say(account, session, message)["state"] == "AWAITING_CONFIRMATION"
    assert session["pending"] == pending and not account["activity"]
    assert say(account, session, "1", kind="keypad")["state"] == "COMPLETED"
    assert len(account["activity"]) == 1


def test_silence_disconnect_repeat_and_replayed_callbacks(account):
    session = new_session("phone")
    turn = Turn(event_id=uuid4().hex, message="Book a cab")
    engine = ConversationEngine()
    first = engine.process(account, session, turn)
    assert engine.process(account, session, turn) == first
    assert session["revision"] == 1
    assert say(account, session, "repeat")["reply"] == first["reply"]
    assert say(account, session, kind="disconnect")["state"] == "CANCELLED"
    blank = new_session("phone")
    for _ in range(3):
        say(account, blank, kind="silence")
    assert blank["state"] == "CANCELLED"


def test_replayed_turn_precedes_revision_check_but_new_stale_turn_is_rejected(account):
    engine = ConversationEngine()
    session = new_session("phone")
    turn = Turn(event_id=uuid4().hex, message="Book a cab", revision=0)
    first = engine.process(account, session, turn)
    assert engine.process(account, session, turn) == first
    before = copy.deepcopy((account, session))
    with pytest.raises(HTTPException) as refused:
        say(account, session, "Home", revision=0)
    assert refused.value.status_code == 409
    assert (account, session) == before


@pytest.mark.parametrize("retain_transcript", [True, False])
def test_session_events_transcript_and_replays_are_bounded_at_80(account, retain_transcript):
    assert MAX_TURNS == 80
    engine = ConversationEngine()
    session = new_session("phone", retain_transcript=retain_transcript)
    turns, results = [], []
    total = MAX_TURNS + 5
    for index in range(total):
        turn = Turn(event_id=f"event-{index:04d}", message="repeat")
        turns.append(turn)
        results.append(engine.process(account, session, turn))
    assert session["revision"] == total
    assert len(session["events"]) == len(session["seen"]) == MAX_TURNS
    first_retained = total - MAX_TURNS // 2
    assert session["events"][0]["id"] == f"event-{first_retained:04d}-user"
    assert session["events"][-1]["id"] == f"event-{total - 1:04d}-assistant"
    conversation = next(c for c in account["conversations"] if c["id"] == session["id"])
    assert conversation["transcript"] == [
        {"role": event["role"], "text": event["text"]} for event in session["events"]
    ]
    assert len(conversation["transcript"]) == MAX_TURNS
    if not retain_transcript:
        assert all(event["text"] == "[Not retained]" for event in session["events"])
    assert turns[0].event_id not in session["seen"]
    first_cached = total - MAX_TURNS
    before = copy.deepcopy((account, session))
    assert engine.process(account, session, turns[first_cached]) == results[first_cached]
    assert (account, session) == before


def test_expiry_changed_quote_and_transition_validation(account):
    session = new_session("phone")
    with pytest.raises(ValueError):
        transition(session, "EXECUTING")
    say(account, session, "Book a cab to Doctor")
    say(account, session, "Home")
    pending = session["pending"]
    quote = next(q for q in account["quotes"] if q["id"] == pending["quote_id"])
    quote["amount_minor"] = 1
    assert say(account, session, "yes")["state"] == "EXPIRED"
    assert not account["activity"]


def test_guest_has_no_private_memory_payment_or_booking():
    guest = ensure(initial_state())
    session = new_session("phone", paired=False)
    say(guest, session, "Book a cab")
    assert "do not have a saved home" in say(guest, session, "Home")["reply"]
    say(guest, session, "12 Fictional Street")
    result = say(guest, session, "Railway station")
    assert "Guest mode cannot book" in result["reply"]
    assert not guest["activity"] and not guest["conversations"]


def test_gemini_failure_falls_back_to_shared_rules(monkeypatch):
    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")

    def unavailable(*args):
        raise HTTPException(502, "Unavailable")

    monkeypatch.setattr(assistant, "draft_request", unavailable)
    draft, _, by = ConversationEngine().interpret("Book a cab to Bank", {})
    assert draft.destination == "Bank" and by == "keywords"


@pytest.mark.parametrize(
    ("message", "service", "summary", "destination"),
    [
        ("Book a cab to Bank", "ride", "Rides to Bank", "Bank"),
        ("Order vegetarian food under 150", "food", "Meals that suit you", ""),
        ("Order ORS sachets", "medicine", "Sample pharmacy items", ""),
    ],
)
def test_app_request_quote_contract_stays_unchanged(
    account, no_gemini, message, service, summary, destination
):
    engine = ConversationEngine()
    draft, question, by = engine.interpret(message, account["profile"], use_ai=False)
    conv_id = uuid4()
    result = engine.app_request(account, conv_id, message, "app", draft, question, by)
    assert result["quotes"]
    assert result == {
        "id": str(conv_id),
        "service": service,
        "channel": "app",
        "status": "quoted",
        "summary": summary,
        "clarification": "",
        "request_id": result["quotes"][0]["request_id"],
        "quotes": result["quotes"],
        "appointment_id": None,
        "input": {"message": message, "destination": destination},
        "understood_by": "keywords",
        "transcript": message,
    }
    assert not account["activity"]
    assert account["conversations"][0]["transcript"] == [
        {"role": "user", "text": message},
        {"role": "assistant", "text": summary},
    ]
    assert account["audit"][-1]["event"] == "quoted"


@pytest.mark.parametrize(
    ("message", "clarification"),
    [
        ("Order food, I have a peanut allergy", MEDICAL_DIET),
        ("Order food, I have diabetes", MEDICAL_DIET),
        ("I have chest pain", EMERGENCY),
        ("Share my OTP to order food", SCAM),
    ],
)
def test_app_request_refusal_contract_stays_unchanged(account, no_gemini, message, clarification):
    conv_id = uuid4()
    result = ConversationEngine().app_request(
        account, conv_id, message, "voice", assistant.Draft(service="food"), "", "gemini"
    )
    assert result == {
        "id": str(conv_id),
        "service": None if clarification in {SCAM, EMERGENCY} else "food",
        "channel": "voice",
        "status": "needs_details",
        "summary": "More details needed",
        "clarification": clarification,
        "request_id": None,
        "quotes": [],
        "appointment_id": None,
        "input": {"message": message, "destination": ""},
        "understood_by": "gemini",
        "transcript": message,
    }
    assert not account["quotes"] and not account["activity"]
    assert account["audit"][-1]["event"] == "asked_back"


def test_app_request_keeps_saved_appointment_destination(account, no_gemini):
    appointment = {"id": "appointment-1", "place": "Clinic One", "title": "Check-up"}
    account["appointments"].append(appointment)
    result = ConversationEngine().app_request(
        account,
        uuid4(),
        "Take me to my appointment",
        "app",
        assistant.Draft(service="ride", destination="Bank"),
        "",
        "appointment",
        appointment,
    )
    assert result["status"] == "quoted"
    assert result["summary"] == "Rides to Clinic One for Check-up"
    assert result["input"]["destination"] == "Clinic One"
    assert result["appointment_id"] == appointment["id"]
    assert all(q["appointment_id"] == appointment["id"] for q in result["quotes"])
    assert not account["activity"]


def test_shared_app_session_is_isolated_and_accepts_multiple_turns(
    tmp_path, monkeypatch, no_gemini
):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "conversation.db"))
    app = create_app(Settings(environment="test"))
    with TestClient(app) as owner, TestClient(app) as other:
        owner.post("/api/hub/session")
        other.post("/api/hub/session")
        session = owner.post("/api/hub/conversation-sessions").json()
        path = f"/api/hub/conversation-sessions/{session['session_id']}/turns"
        turn = {"event_id": uuid4().hex, "message": "Book a cab"}
        assert owner.post(path, json=turn).json()["state"] == "COLLECTING_DETAILS"
        assert other.post(path, json=turn).status_code == 404
        response = owner.post(
            path,
            json={"event_id": uuid4().hex, "message": "12 Fictional Street", "revision": 1},
        )
        assert response.status_code == 200
        assert response.json()["revision"] == 2 and "go?" in response.json()["reply"]
