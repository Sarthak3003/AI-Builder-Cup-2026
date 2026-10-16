"""Shared conversation state machine; channel adapters own authentication and transport."""

import copy
import hashlib
import json
import re
import time
from enum import StrEnum
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import assistant
from app.bookings import (
    ConfirmIn,
    QuoteIn,
    confirm_quote,
    create_quotes,
    expire_approvals,
    match_place,
)
from app.care import ensure
from app.domain import rupees
from app.hub_store import initial_state
from app.intent import EMERGENCY, EMERGENCY_WORDS, SCAM, looks_like_scam, understand
from app.onboarding import connect, default_pickup
from app.providers import PlaceRef, enabled_apps
from app.workflows import MEDICAL_DIET, MEDICAL_DIET_WORDS, quote_for_draft, record, remember

Channel = Literal["app", "voice", "message", "phone", "simulator", "whatsapp"]
MAX_TURNS = 80


class ConversationState(StrEnum):
    NEW = "NEW"
    COLLECTING_DETAILS = "COLLECTING_DETAILS"
    SEARCHING = "SEARCHING"
    PRESENTING_OPTIONS = "PRESENTING_OPTIONS"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    AWAITING_EXTERNAL_APPROVAL = "AWAITING_EXTERNAL_APPROVAL"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"


TERMINAL = {"COMPLETED", "CANCELLED", "FAILED", "EXPIRED"}
TRANSITIONS = {
    "NEW": {"COLLECTING_DETAILS", "SEARCHING", "CANCELLED", "EXPIRED"},
    "COLLECTING_DETAILS": {"SEARCHING", "CANCELLED", "FAILED", "EXPIRED"},
    "SEARCHING": {
        "PRESENTING_OPTIONS",
        "AWAITING_CONFIRMATION",
        "COLLECTING_DETAILS",
        "FAILED",
        "EXPIRED",
    },
    "PRESENTING_OPTIONS": {"AWAITING_CONFIRMATION", "COLLECTING_DETAILS", "CANCELLED", "EXPIRED"},
    "AWAITING_CONFIRMATION": {"EXECUTING", "COLLECTING_DETAILS", "CANCELLED", "EXPIRED"},
    "EXECUTING": {"COMPLETED", "AWAITING_EXTERNAL_APPROVAL", "FAILED"},
    "AWAITING_EXTERNAL_APPROVAL": {"COMPLETED", "FAILED", "CANCELLED", "EXPIRED"},
}
YES = {"yes", "yes confirm", "yes please", "confirm", "confirm it", "yes book it", "हाँ", "हां"}
NO = {"no", "cancel", "cancel it", "stop", "never mind", "नहीं", "रद्द करो"}
REPEAT = {"repeat", "say again", "pardon", "फिर से", "दोहराएं"}
EMPTY_FOOD = {"food", "dinner", "lunch", "breakfast", "order food", "order dinner", "खाना"}


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    event_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    message: str = Field(default="", max_length=1000)
    kind: Literal["speech", "keypad", "silence", "disconnect", "end"] = "speech"
    revision: int | None = Field(default=None, ge=0)


def new_session(channel: Channel, *, paired=True, retain_transcript=False, language="en-IN"):
    now = time.time()
    return {
        "id": uuid4().hex,
        "channel": channel,
        "state": "NEW",
        "revision": 0,
        "created_at": now,
        "expires_at": now + 900,
        "ended_at": None,
        "paired": paired,
        "retain_transcript": retain_transcript,
        "language": language,
        "service": None,
        "waiting_for": None,
        "draft": {},
        "pickup": None,
        "quote_ids": [],
        "pending": None,
        "booking_id": None,
        "request_id": None,
        "last_reply": "How can Saathi help? All bookings are simulated.",
        "events": [],
        "seen": {},
        "silences": 0,
    }


def transition(session: dict, target: str) -> None:
    current = session["state"]
    if current == target:
        return
    if target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"Invalid conversation transition: {current} -> {target}")
    session["state"] = target


def private_text(text: str) -> str:
    if looks_like_scam(text) or re.search(r"\b\d[\d -]{5,}\d\b", text):
        return "[Sensitive input omitted]"
    return text


def _say(session, english, hindi):
    return hindi if session["language"] == "hi-IN" else english


def _invalidate(state, session):
    for quote in state["quotes"]:
        if quote["status"] == "ACTIVE" and (
            quote["id"] in session["quote_ids"] or quote["request_id"] == session["request_id"]
        ):
            quote["status"] = "EXPIRED"
    session.update(quote_ids=[], pending=None)


def _fingerprint(quote):
    fields = ("id", "service_type", "details", "amount_minor", "payment_method", "expires_at")
    data = json.dumps({k: quote[k] for k in fields}, sort_keys=True).encode()
    return hashlib.sha256(data).hexdigest()


def _question(session, field, english, hindi):
    transition(session, "COLLECTING_DETAILS")
    session["waiting_for"] = field
    return _say(session, english, hindi)


def _present(session, quote):
    transition(session, "AWAITING_CONFIRMATION")
    session["pending"] = {
        "id": uuid4().hex,
        "quote_id": quote["id"],
        "summary": quote["title"],
        "amount_minor": quote["amount_minor"],
        "expires_at": quote["expires_at"],
        "fingerprint": _fingerprint(quote),
    }
    cost = rupees(quote["amount_minor"])
    return _say(
        session,
        f"{quote['title']} costs {cost}, including fees. This is a demo; no real service or "
        "charge occurs. Shall I confirm? Say yes, confirm, or no.",
        f"{quote['title']} का कुल मूल्य {cost} है। यह केवल डेमो है, कोई पैसा नहीं लगेगा। "
        "क्या पुष्टि करूँ? हाँ या नहीं कहें।",
    )


def booking_reply(booking):
    status = booking["booking_status"]
    if status == "AWAITING_APPROVAL":
        return "Sent to your Care Circle for approval. Nothing is booked or charged yet."
    if status == "FAILED":
        return "The demo provider could not confirm this booking. Nothing was booked or charged."
    if status in {"CANCELLED_SIMULATED", "DECLINED"}:
        return "This request was cancelled or declined. No new booking was made."
    return (
        f"Your demo booking is confirmed: {booking['provider_booking_id']}. No money was charged."
    )


class ConversationEngine:
    def interpret(self, message: str, profile: dict, *, use_ai=True, timeout=None):
        if use_ai and assistant.configured():
            try:
                kwargs = {"timeout": timeout} if timeout is not None else {}
                return assistant.draft_request(message, profile, **kwargs), "", "gemini"
            except HTTPException:
                pass
        draft, question = understand(message, profile)
        return draft, question, "keywords"

    def prepare(self, state, session, turn: Turn):
        text = " ".join(turn.message.lower().strip(" .!?।").replace(",", " ").split())
        if (
            turn.kind != "speech"
            or session["state"] not in {"NEW", "COLLECTING_DETAILS"}
            or session["waiting_for"] in {"pickup", "destination"}
            or text in YES | NO | REPEAT
            or private_text(turn.message) != turn.message
            or any(word in text for word in EMERGENCY_WORDS)
        ):
            return None
        message = turn.message
        if session["waiting_for"] == "meal":
            inferred, _ = understand(message, state["profile"])
            if not inferred or inferred.service != "ride":
                message = "order food " + message
        return self.interpret(message, state["profile"], timeout=4)[0]

    def app_request(self, state, conv_id, message, channel, draft, question, by, appointment=None):
        if looks_like_scam(message):
            draft, question = None, SCAM
        elif any(word in message.lower() for word in EMERGENCY_WORDS):
            draft, question = None, EMERGENCY
        service = draft.service if draft else None
        destination = appointment["place"] if appointment else (draft.destination if draft else "")
        made, reply = None, (draft.clarification if draft else question)
        if draft and not draft.clarification:
            try:
                made = quote_for_draft(state, draft, message, channel, appointment)
            except HTTPException as refusal:
                if refusal.status_code not in {404, 409, 422}:
                    raise
                reply = refusal.detail
        quotes = made["quotes"] if made else []
        summary = "More details needed"
        if quotes:
            summary = (
                f"Rides to {appointment['place']} for {appointment['title']}"
                if appointment
                else f"Rides to {quotes[0]['details']['destination']['label']}"
                if service == "ride"
                else "Meals that suit you"
                if service == "food"
                else "Sample pharmacy items"
            )
        remember(
            state,
            str(conv_id),
            channel,
            message or "(nothing heard)",
            reply or summary,
            service=service,
            request_id=made["request_id"] if made else None,
            destination=destination if service == "ride" else "",
            options=len(quotes),
            safety="suspected_scam" if reply == SCAM else None,
        )
        record(state, "quoted" if quotes else "asked_back", str(conv_id))
        return {
            "id": str(conv_id),
            "service": service,
            "channel": channel,
            "status": "quoted" if quotes else "needs_details",
            "summary": summary,
            "clarification": "" if quotes else reply,
            "request_id": made["request_id"] if made else None,
            "quotes": quotes,
            "appointment_id": appointment["id"] if appointment else None,
            "input": {"message": message, "destination": destination},
            "understood_by": by,
            "transcript": message,
        }

    def process(self, state: dict, session: dict, turn: Turn, *, draft=None, now=None):
        """Advance atomically using rules or a precomputed draft; never call AI here."""
        now = time.time() if now is None else now
        ensure(state)
        expire_approvals(state, now=now)
        if turn.event_id in session["seen"]:
            return copy.deepcopy(session["seen"][turn.event_id])
        if turn.revision is not None and turn.revision != session["revision"]:
            raise HTTPException(409, "That turn is out of date. Repeat the current question.")
        if session["expires_at"] <= now and session["state"] not in TERMINAL:
            _invalidate(state, session)
            transition(session, "EXPIRED")
        message = turn.message.strip()
        reply = self._advance(state, session, turn, draft, now)
        session["revision"] += 1
        session["last_at"] = now
        session["last_reply"] = reply
        if session["state"] in TERMINAL:
            session["ended_at"] = session["ended_at"] or now
        for role, text in (("user", message), ("assistant", reply)):
            session["events"].append(
                {
                    "id": f"{turn.event_id}-{role}",
                    "session_id": session["id"],
                    "channel": session["channel"],
                    "at": now,
                    "role": role,
                    "text": private_text(text)
                    if session["retain_transcript"]
                    else "[Not retained]",
                    "intent": session["service"],
                    "state": session["state"],
                    "request_id": session["request_id"],
                }
            )
        del session["events"][:-MAX_TURNS]
        result = self.view(session)
        session["seen"][turn.event_id] = copy.deepcopy(result)
        while len(session["seen"]) > MAX_TURNS:
            session["seen"].pop(next(iter(session["seen"])))
        self._history(state, session)
        return result

    def _advance(self, state, session, turn, draft, now):
        text = " ".join(turn.message.lower().strip(" .!?।").replace(",", " ").split())
        current = session["state"]
        if current == "EXPIRED":
            return "This conversation expired. Start a new conversation; nothing new was booked."
        if current in TERMINAL:
            return session["last_reply"]
        if turn.kind in {"end", "disconnect"} or text in NO:
            _invalidate(state, session)
            transition(session, "CANCELLED")
            return "The conversation has ended. No further booking will be made."
        if turn.kind == "silence" or not text:
            session["silences"] += 1
            if session["silences"] >= 3:
                _invalidate(state, session)
                transition(session, "CANCELLED")
                return "I could not hear you. Please try again when you are ready. Goodbye."
            return "I did not hear that. " + session["last_reply"]
        session["silences"] = 0
        if text in REPEAT:
            return session["last_reply"]
        if any(word in text for word in EMERGENCY_WORDS) or looks_like_scam(text):
            _invalidate(state, session)
            transition(session, "CANCELLED")
            return EMERGENCY if any(word in text for word in EMERGENCY_WORDS) else SCAM
        if current == "AWAITING_EXTERNAL_APPROVAL":
            booking = next(b for b in state["activity"] if b["id"] == session["booking_id"])
            if booking["booking_status"] != "AWAITING_APPROVAL":
                target = "FAILED" if booking["booking_status"] == "FAILED" else "COMPLETED"
                transition(session, target)
            return booking_reply(booking)

        correction = re.search(
            r"(?:change|instead|actually|नहीं).*?(?:to|destination|जाना)\s+(.+)",
            turn.message,
            re.IGNORECASE,
        )
        if correction and session["service"] == "ride":
            _invalidate(state, session)
            transition(session, "COLLECTING_DETAILS")
            session["draft"]["destination"] = correction[1].strip(" .!?।")[:150]
            session["waiting_for"] = None
            if not session["pickup"]:
                return _question(
                    session, "pickup", "Where should I pick you up?", "आपको कहाँ से लेना है?"
                )
            return self._search(state, session, turn.message)
        inferred, _ = understand(turn.message, state["profile"])
        if session["waiting_for"] == "meal" and not (inferred and inferred.service == "ride"):
            # Parse meal details before considering a service change. Catalogue words such
            # as "calcium" can otherwise turn a dietary preference into a medicine request.
            inferred, _ = understand("order food " + turn.message, state["profile"])
            if inferred and inferred.service != "food":
                inferred = None
        given = draft or inferred
        if any(word in turn.message.lower() for word in MEDICAL_DIET_WORDS) and (
            session["service"] == "food"
            or (inferred and inferred.service == "food")
            or (draft and draft.service == "food")
        ):
            _invalidate(state, session)
            transition(session, "CANCELLED")
            return MEDICAL_DIET
        if given and given.service != session["service"]:
            _invalidate(state, session)
            transition(session, "COLLECTING_DETAILS")
            session.update(service=given.service, draft={}, waiting_for=None, pickup=None)
        current = session["state"]

        if current == "AWAITING_CONFIRMATION":
            if text not in YES and not (turn.kind == "keypad" and text == "1"):
                return "Please say yes, confirm, or no. You can also change your request."
            if not session["paired"]:
                return "Guest mode cannot book. Pair with your Saathi app to continue."
            pending = session["pending"]
            quoted = next((q for q in state["quotes"] if q["id"] == pending["quote_id"]), None)
            if (
                not quoted
                or quoted["expires_at"] <= now
                or _fingerprint(quoted) != pending["fingerprint"]
            ):
                _invalidate(state, session)
                transition(session, "EXPIRED")
                return (
                    "That quote expired or changed. Please start a new request for a fresh price."
                )
            transition(session, "EXECUTING")
            try:
                booking, created = confirm_quote(
                    state,
                    quoted["id"],
                    ConfirmIn(
                        idempotency_key=f"turn-{session['id']}-{pending['id']}",
                        confirmed=True,
                    ),
                    enabled_apps(state["profile"]),
                    now=now,
                )
            except HTTPException:
                _invalidate(state, session)
                transition(session, "FAILED")
                return "This demo booking could not be confirmed. Check your app before retrying."
            session["booking_id"] = booking["id"]
            target = (
                "AWAITING_EXTERNAL_APPROVAL"
                if booking["booking_status"] == "AWAITING_APPROVAL"
                else "FAILED"
                if booking["booking_status"] == "FAILED"
                else "COMPLETED"
            )
            transition(session, target)
            if created:
                record(state, "conversation_confirmed", booking["id"], session["channel"])
            return booking_reply(booking)
        if current == "PRESENTING_OPTIONS":
            ids = session["quote_ids"]
            numbers = {"one": 1, "two": 2, "three": 3, "एक": 1, "दो": 2, "तीन": 3}
            selected = numbers.get(text, int(text) if text.isdigit() else 0)
            if not 1 <= selected <= len(ids):
                return "Please say the option number, or say cancel. " + session["last_reply"]
            quote = next(q for q in state["quotes"] if q["id"] == ids[selected - 1])
            return _present(session, quote)
        if session["service"] == "medicine":
            return _question(
                session,
                "intent",
                "Medicine ordering is not available in this conversation. "
                "Do you need a ride or a meal?",
                "फोन पर दवा मंगाना उपलब्ध नहीं है। क्या आपको सवारी या भोजन चाहिए?",
            )
        if session["waiting_for"] == "pickup":
            saved = match_place(state, re.sub(r"^(?:from|at)\s+", "", text))
            if saved:
                session["pickup"] = PlaceRef(
                    label=saved["label"], address=saved["address"], place_id=saved["id"]
                ).model_dump()
            elif text in {"home", "my home", "from home", "from my home", "घर", "घर से"}:
                home = default_pickup(state) if session["paired"] else None
                if not home:
                    return "I do not have a saved home address. What is the pickup address?"
                session["pickup"] = PlaceRef(
                    label=home["label"], address=home["address"]
                ).model_dump()
            elif len(text) >= 5 and text not in {"don't know", "not sure", "yes"}:
                session["pickup"] = PlaceRef(
                    label="Pickup", address=turn.message[:150]
                ).model_dump()
            else:
                return "What is the pickup address? Say the street and a landmark."
            session["waiting_for"] = None
        elif session["waiting_for"] == "destination" and not given:
            if text in {"yes", "there", "that place", "not sure", "don't know"} or len(text) < 3:
                return "Please say the destination name or address."
            saved = match_place(state, text)
            if text in {"my doctor", "my office", "my work"} and not saved:
                return "That place is not saved. What is its name or address?"
            session["draft"]["destination"] = turn.message[:150]
            session["waiting_for"] = None
        elif session["waiting_for"] == "meal":
            if not given:
                return _question(
                    session,
                    "meal",
                    "What would you like to eat? Say a meal or preferences, such as vegetarian.",
                    "आप क्या खाना चाहेंगे? भोजन या अपनी पसंद बताएं।",
                )
            session["waiting_for"] = None
        if given:
            session["service"] = given.service
            session["draft"].update(
                {
                    k: v
                    for k, v in given.model_dump(exclude_none=True).items()
                    if k != "clarification" and v != ""
                }
            )
        if not session["service"]:
            return _question(
                session, "intent", "Do you need a ride or a meal?", "सवारी या भोजन चाहिए?"
            )
        if session["service"] == "ride":
            if not session["pickup"]:
                return _question(
                    session, "pickup", "Where should I pick you up?", "आपको कहाँ से लेना है?"
                )
            if not session["draft"].get("destination"):
                return _question(
                    session, "destination", "Where would you like to go?", "आपको कहाँ जाना है?"
                )
        if session["service"] == "food" and text in EMPTY_FOOD:
            return _question(session, "meal", "What would you like to eat?", "आप क्या खाना चाहेंगे?")
        return self._search(state, session, turn.message)

    def _search(self, state, session, message):
        transition(session, "SEARCHING")
        source = state
        if not session["paired"]:
            source = ensure(initial_state())
            for kind in ("RIDE", "FOOD"):
                connect(source, kind)
        try:
            if session["service"] == "ride":
                made = create_quotes(
                    source,
                    QuoteIn(
                        service_type="RIDE",
                        channel=session["channel"],
                        pickup=PlaceRef.model_validate(session["pickup"]),
                        destination_text=session["draft"]["destination"],
                    ),
                    enabled_apps(source["profile"]),
                )
            else:
                draft = assistant.Draft.model_validate({**session["draft"], "service": "food"})
                made = quote_for_draft(source, draft, message, session["channel"], None)
        except HTTPException as refusal:
            transition(session, "COLLECTING_DETAILS")
            return str(refusal.detail)
        quotes = sorted(made["quotes"], key=lambda q: (q["amount_minor"], q["option_id"]))[:3]
        session.update(request_id=made["request_id"], quote_ids=[q["id"] for q in quotes])
        if not session["paired"]:
            transition(session, "COLLECTING_DETAILS")
            return (
                f"A demo estimate is {rupees(quotes[0]['amount_minor'])}. Guest mode cannot book. "
                "Pair with your Saathi app to use saved places and make a demo booking."
            )
        if session["service"] == "ride":
            return _present(session, quotes[0])
        transition(session, "PRESENTING_OPTIONS")
        options = " ".join(
            f"{n}. {q['title']}, {rupees(q['amount_minor'])}." for n, q in enumerate(quotes, 1)
        )
        return f"Demo meals: {options} Which option would you like? Say its number."

    def _history(self, state, session):
        if not session["paired"]:
            return
        conv = next((c for c in state["conversations"] if c["id"] == session["id"]), None)
        if conv is None:
            conv = {"id": session["id"], "at": session["created_at"], "safety": None}
            state["conversations"].insert(0, conv)
        conv.update(
            channel=session["channel"],
            service=session["service"],
            request_id=session["request_id"],
            destination=session["draft"].get("destination", ""),
            options=len(session["quote_ids"]),
            workflow_state=session["state"],
            transcript=[{"role": e["role"], "text": e["text"]} for e in session["events"]],
            transcript_retained=session["retain_transcript"],
            ended_at=session["ended_at"],
            updated_at=session.get("last_at", session["created_at"]),
        )
        del state["conversations"][100:]

    def view(self, session):
        pending = session.get("pending")
        return {
            "session_id": session["id"],
            "channel": session["channel"],
            "state": session["state"],
            "revision": session["revision"],
            "reply": session["last_reply"],
            "service": session["service"],
            "paired": session["paired"],
            "language": session["language"],
            "booking_id": session["booking_id"],
            "request_id": session["request_id"],
            "pending_action": {k: v for k, v in pending.items() if k != "fingerprint"}
            if pending
            else None,
        }
