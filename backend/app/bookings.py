"""Quotes, explicit confirmation, bookings and simulated payments for one account.

Pure functions on the account state, called inside the account transaction. The server prices
every quote, checks ownership, expiry, connection and approval, and moves every status. The
client only ever names a quote and an idempotency key; it never sends prices or statuses.
"""

import re
import time
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.care import add_event
from app.domain import (
    APPROVAL_TTL_SECONDS,
    QUOTE_TTL_SECONDS,
    SERVICE_KEY,
    ServiceType,
    rupees,
)
from app.onboarding import connected, default_pickup
from app.providers import (
    APP_NAMES,
    MAX_LINES,
    RIDE_OPTIONS,
    CreateBookingRequest,
    ItemRequest,
    PlaceRef,
    ProviderError,
    ProviderQuote,
    QuoteRequest,
    provider_for,
    ride_option_ids,
)

MAX_QUOTES = 60


class QuoteIn(BaseModel):
    """A service request. Rides without an option get a quote from every switched-on option."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    service_type: ServiceType
    channel: Literal["app", "message", "voice"] = "app"
    pickup_place_id: str | None = Field(default=None, max_length=40)
    destination_place_id: str | None = Field(default=None, max_length=40)
    destination_text: str = Field(default="", max_length=150)
    appointment_id: str | None = Field(default=None, max_length=40)
    option_id: str | None = Field(default=None, max_length=40)
    items: list[ItemRequest] = Field(default_factory=list, max_length=MAX_LINES)
    # Lets a retried 'book the best ride for me' request return the same booking.
    idempotency_key: str | None = Field(
        default=None, min_length=8, max_length=80, pattern=r"^[A-Za-z0-9-]+$"
    )


def _place(state: dict, place_id: str) -> dict:
    place = next((p for p in state["places"] if p["id"] == place_id), None)
    if not place:
        raise HTTPException(404, "That saved place is no longer there.")
    return place


def _ref(place: dict) -> PlaceRef:
    return PlaceRef(label=place["label"][:60], address=place["address"], place_id=place["id"])


def match_place(state: dict, text: str) -> dict | None:
    """'my doctor' or 'the doctor' finds the saved place called Doctor."""
    wanted = re.sub(r"^(?:my|the)\s+", "", " ".join(text.lower().split()))
    return next((p for p in state["places"] if p["label"].lower() == wanted), None)


def _ride_places(state: dict, body: QuoteIn) -> tuple[PlaceRef, PlaceRef, str | None]:
    if body.pickup_place_id:
        pickup = _place(state, body.pickup_place_id)
    else:
        pickup = default_pickup(state)
        if not pickup:
            raise HTTPException(409, "Add your home or usual pickup in setup first.")
    appointment = None
    if body.appointment_id:
        appointment = next(
            (a for a in state.get("appointments", []) if a["id"] == body.appointment_id), None
        )
        if not appointment:
            raise HTTPException(404, "That appointment is no longer saved.")
    if body.destination_place_id:
        destination = _ref(_place(state, body.destination_place_id))
    elif appointment:
        destination = PlaceRef(label=appointment["title"][:60], address=appointment["place"])
    elif body.destination_text:
        saved = match_place(state, body.destination_text)
        text = body.destination_text
        destination = _ref(saved) if saved else PlaceRef(label=text[:60], address=text)
    else:
        raise HTTPException(422, "Choose where you would like to go.")
    return _ref(pickup), destination, appointment["id"] if appointment else None


def approval_reason(state: dict, service_type: str, amount_minor: int) -> str:
    """The owner's own rule: who must agree before a booking is made."""
    profile = state["profile"]
    if not profile.get("caregiver_enabled"):
        return ""
    if service_type == "PHARMACY":
        return "Pharmacy orders need approval."
    if amount_minor > profile["approval_limit"] * 100:
        return f"Above the ₹{profile['approval_limit']} approval limit."
    return ""


def expire_quotes(state: dict, now: float) -> None:
    for quote in state["quotes"]:
        if quote["status"] == "ACTIVE" and quote["expires_at"] <= now:
            quote["status"] = "EXPIRED"


def offer_order(quote: dict) -> tuple:
    # The demo provider's own option first, then familiar-name examples, cheapest first.
    return (quote["app_id"] is not None, quote["amount_minor"], quote["option_id"])


WAIT_MINOR_PER_MIN = 500


def pick_ride(quotes: list[dict]) -> dict:
    """Saathi's own rule, not AI: the lowest price plus ₹5 for each minute until pickup."""
    best = min(
        quotes,
        key=lambda q: (
            q["amount_minor"] + WAIT_MINOR_PER_MIN * q["pickup_eta_min"],
            q["option_id"],
        ),
    )
    cheapest = best["amount_minor"] == min(q["amount_minor"] for q in quotes)
    quickest = best["pickup_eta_min"] == min(q["pickup_eta_min"] for q in quotes)
    why = (
        "Lowest price and shortest wait"
        if cheapest and quickest
        else "Lowest price"
        if cheapest
        else "Shortest wait"
        if quickest
        else "Best balance of price and wait"
    )
    price = rupees(best["amount_minor"])
    reason = f"{why}: {price}, about {best['pickup_eta_min']} min away."
    best["recommended"] = {"reason": reason, "by": "rules"}
    return best


def _prune(state: dict) -> None:
    # Keep every active quote; drop the oldest used or expired ones beyond the limit.
    spare = len(state["quotes"]) - MAX_QUOTES
    kept = []
    for quote in state["quotes"]:
        if spare > 0 and quote["status"] != "ACTIVE":
            spare -= 1
            continue
        kept.append(quote)
    state["quotes"] = kept


def create_quotes(
    state: dict, body: QuoteIn, enabled_apps: list[str], now=None, group: str | None = None
) -> dict:
    now = time.time() if now is None else now
    expire_quotes(state, now)
    service_type = body.service_type
    provider = provider_for(service_type, state["provider_ledger"])
    if not connected(state, service_type):
        raise HTTPException(409, f"Connect the {provider.label} first, in Services.")
    appointment_id = None
    if service_type == "RIDE":
        pickup, destination, appointment_id = _ride_places(state, body)
        if body.option_id:
            option = next((o for o in RIDE_OPTIONS if o.id == body.option_id), None)
            if option and option.app_id and option.app_id not in enabled_apps:
                raise HTTPException(409, f"{APP_NAMES[option.app_id]} is switched off in Services.")
            options = [body.option_id]
        else:
            options = ride_option_ids(enabled_apps)
        requests = [
            QuoteRequest(
                service_type="RIDE", option_id=option, pickup=pickup, destination=destination
            )
            for option in options
        ]
    elif service_type == "FOOD":
        if not body.option_id:
            raise HTTPException(422, "Choose a kitchen first.")
        if body.option_id in APP_NAMES and body.option_id not in enabled_apps:
            raise HTTPException(409, f"{APP_NAMES[body.option_id]} is switched off in Services.")
        requests = [QuoteRequest(service_type="FOOD", option_id=body.option_id, items=body.items)]
    else:
        requests = [QuoteRequest(service_type="PHARMACY", items=body.items)]

    request_id = group or uuid4().hex
    method = state["profile"].get("payment_method") or "PAY_ON_COMPLETION"
    quotes = []
    for request in requests:
        try:
            offer = provider.get_quote(request)
        except ProviderError as error:
            raise HTTPException(422, error.message) from None
        reason = approval_reason(state, service_type, offer.amount_minor)
        quotes.append(
            {
                "id": uuid4().hex,
                "request_id": request_id,
                "service": SERVICE_KEY[service_type],
                **offer.model_dump(),
                "payment_method": method,
                "approval": {"required": bool(reason), "reason": reason},
                "channel": body.channel,
                "appointment_id": appointment_id,
                "status": "ACTIVE",
                "created_at": now,
                "expires_at": now + QUOTE_TTL_SECONDS,
                "consumed_at": None,
                "booking_id": None,
            }
        )
    quotes.sort(key=offer_order)
    if service_type == "RIDE" and len(quotes) > 1:
        if state["profile"].get("show_ride_options") is False:
            pick_ride(quotes)
    state["quotes"].extend(quotes)
    _prune(state)
    return {"request_id": request_id, "service_type": service_type, "quotes": quotes}


def active_quotes(state: dict, now=None) -> list[dict]:
    expire_quotes(state, time.time() if now is None else now)
    return [quote for quote in state["quotes"] if quote["status"] == "ACTIVE"]


# --- Confirmation, approval and simulated payment -----------------------------------------


class ConfirmIn(BaseModel):
    """Only a quote id (in the path), a retry key and an explicit yes. Never a price."""

    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9-]+$")
    confirmed: Literal[True]


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal["approve", "reject", "ask"]
    note: str = Field(default="", max_length=300)


OFFER_FIELDS = tuple(ProviderQuote.model_fields)
LIVE = {"AWAITING_APPROVAL", "CONFIRMED_SIMULATED"}


def _offer(record: dict) -> ProviderQuote:
    return ProviderQuote.model_validate({key: record[key] for key in OFFER_FIELDS})


def event_label(booking: dict) -> str:
    # Item names stay out of the shared timeline for pharmacy orders.
    return "a pharmacy order" if booking["service_type"] == "PHARMACY" else booking["title"]


def find_booking(state: dict, booking_id: str) -> dict:
    booking = next((b for b in state["activity"] if b["id"] == booking_id), None)
    if not booking:
        raise HTTPException(404, "Booking not found.")
    return booking


def _approval(state: dict, booking: dict) -> dict | None:
    return next((a for a in state["approvals"] if a["id"] == booking.get("approval_id")), None)


def _pay(booking: dict, status: str, now: float) -> None:
    booking["payment"].update(status=status, updated_at=now)


def _execute(state: dict, booking: dict, now: float) -> None:
    """Ask the demo provider to book. A refusal is recorded as a failure, never as success."""
    demo = state.setdefault("demo", {})
    # The demo failure switch is used up by the next real attempt to book, and only by that.
    simulate_failure = bool(demo.get("fail_next"))
    demo["fail_next"] = False
    provider = provider_for(booking["service_type"], state["provider_ledger"])
    request = CreateBookingRequest(
        quote=_offer(booking),
        idempotency_key=booking["idempotency_key"],
        simulate_failure=simulate_failure,
    )
    try:
        result = provider.create_booking(request)
    except ProviderError as error:
        booking.update(
            booking_status="FAILED",
            failure=f"{error.message} Nothing was booked or charged.",
            updated_at=now,
        )
        _pay(booking, "NOT_CHARGED_SIMULATED", now)
        add_event(
            state,
            "booking_failed",
            f"Booking failed: {event_label(booking)}",
            "Simulated failure. Nothing was booked or charged.",
            permission="receive_alerts",
            ref=booking["id"],
            severity="attention",
        )
        return
    booking.update(
        booking_status="CONFIRMED_SIMULATED",
        provider_booking_id=result.provider_booking_id,
        trip=result.trip.model_dump() if result.trip else None,
        updated_at=now,
    )
    wallet = booking["payment"]["method"] == "DEMO_WALLET"
    _pay(booking, "SUCCEEDED_SIMULATED" if wallet else "PENDING_SIMULATED", now)
    add_event(
        state,
        "booked",
        f"Booked (simulated): {event_label(booking)}",
        f"{booking['provider_label']} · {result.provider_booking_id}. {booking['notice']}",
        ref=booking["id"],
    )
    add_event(
        state,
        "payment",
        "Paid from the demo wallet (simulated)" if wallet else "Pay on completion (simulated)",
        "No money was charged." if wallet else "Nothing charged yet. No real money will move.",
        permission="view_payments",
        ref=booking["id"],
    )


def _appointment_event(state: dict, booking: dict) -> None:
    linked = next(
        (a for a in state.get("appointments", []) if a["id"] == booking.get("appointment_id")),
        None,
    )
    if not linked or booking["booking_status"] == "FAILED":
        return
    linked["ride_request_id"] = booking["id"]
    waiting = booking["booking_status"] == "AWAITING_APPROVAL"
    add_event(
        state,
        "appointment_ride",
        f"Ride for {linked['title']} is waiting for approval"
        if waiting
        else f"Ride arranged for {linked['title']}",
        f"{booking['title']}. Simulated: no real driver will come.",
        ref=booking["id"],
        topic="appointments",
    )


def confirm_quote(
    state: dict, quote_id: str, body: ConfirmIn, enabled_apps: list[str], now=None
) -> tuple[dict, bool]:
    """Make at most one booking per idempotency key. Returns the booking and whether it is new."""
    now = time.time() if now is None else now
    key = body.idempotency_key
    earlier = next((b for b in state["activity"] if b.get("idempotency_key") == key), None)
    if earlier:
        if earlier["quote_id"] != quote_id:
            raise HTTPException(409, "This confirmation was already used for another booking.")
        return earlier, False
    quote = next((q for q in state["quotes"] if q["id"] == quote_id), None)
    if not quote:
        raise HTTPException(404, "Quote not found. Please get a new quote.")
    expire_quotes(state, now)
    if quote["status"] == "CONSUMED":
        raise HTTPException(409, "This quote was already used. See Activity for the booking.")
    if quote["status"] == "EXPIRED":
        raise HTTPException(409, "This quote has expired. Please get a new quote.")
    if not connected(state, quote["service_type"]):
        raise HTTPException(409, f"Connect the {quote['provider_label']} first, in Services.")
    if quote["app_id"] and quote["app_id"] not in enabled_apps:
        raise HTTPException(409, f"{quote['app_name']} is switched off in Services.")

    reason = approval_reason(state, quote["service_type"], quote["amount_minor"])
    booking = {
        "id": uuid4().hex,
        "quote_id": quote["id"],
        "request_id": quote["request_id"],
        "idempotency_key": key,
        **{field: quote[field] for field in OFFER_FIELDS},
        "service": quote["service"],
        "provider_booking_id": None,
        "booking_status": "AWAITING_APPROVAL" if reason else "CONFIRMED_SIMULATED",
        "payment": {
            "method": quote["payment_method"],
            "status": "NOT_CHARGED_SIMULATED",
            "amount_minor": quote["amount_minor"],
            "currency": quote["currency"],
            "simulated": True,
            "updated_at": now,
            "refund": None,
        },
        "channel": quote["channel"],
        "shared": state["profile"].get("sharing", {}).get(quote["service"], True),
        "approval_id": None,
        "approval_reason": reason,
        "appointment_id": quote["appointment_id"],
        "decision": None,
        "questions": [],
        "failure": "",
        "created_at": now,
        "updated_at": now,
    }
    quote.update(status="CONSUMED", consumed_at=now, booking_id=booking["id"])
    for other in state["quotes"]:
        # The other options from the same request can no longer be booked.
        if other["request_id"] == quote["request_id"] and other["status"] == "ACTIVE":
            other["status"] = "EXPIRED"
    state["activity"].insert(0, booking)
    if reason:
        approval = {
            "id": uuid4().hex[:12],
            "booking_id": booking["id"],
            "quote_id": quote["id"],
            "action_type": "CONFIRM_BOOKING",
            "summary": booking["title"],
            "amount_minor": booking["amount_minor"],
            "currency": booking["currency"],
            "reason": reason,
            "status": "PENDING",
            "requested_at": now,
            "expires_at": now + APPROVAL_TTL_SECONDS,
            "decided_at": None,
            "decided_by": None,
            "decided_by_name": None,
            "note": "",
        }
        state["approvals"].append(approval)
        booking["approval_id"] = approval["id"]
        approvers = [
            g
            for g in state.get("care_circle", [])
            if g["status"] != "revoked" and "approve" in g["permissions"]
        ]
        add_event(
            state,
            "approval_needed",
            f"Approval needed: {event_label(booking)}",
            reason if approvers else f"{reason} No one in the Care Circle can approve yet.",
            permission="approve",
            ref=booking["id"],
            severity="attention",
        )
    else:
        _execute(state, booking, now)
    _appointment_event(state, booking)
    return booking, True


def _close_approval_alerts(state: dict, booking_id: str, by: str, now: float) -> None:
    for event in state["events"]:
        if event["ref"] == booking_id and event["kind"] == "approval_needed":
            if event["status"] == "open":
                event.update(status="resolved", resolved_by=by, resolved_at=now)


def expire_approvals(state: dict, now=None) -> None:
    """An approval nobody gave in time lapses: the booking is not made and nothing is charged."""
    now = time.time() if now is None else now
    for approval in state["approvals"]:
        if approval["status"] != "PENDING" or approval["expires_at"] > now:
            continue
        approval.update(status="EXPIRED", decided_at=now)
        booking = next((b for b in state["activity"] if b["id"] == approval["booking_id"]), None)
        if not booking or booking["booking_status"] != "AWAITING_APPROVAL":
            continue
        booking.update(
            booking_status="CANCELLED_SIMULATED",
            failure="The approval request expired. Nothing was booked or charged.",
            updated_at=now,
        )
        _close_approval_alerts(state, booking["id"], "expired", now)
        add_event(
            state,
            "approval_expired",
            f"Approval request expired: {event_label(booking)}",
            "Nothing was booked or charged.",
            ref=booking["id"],
        )


def decide(
    state: dict, booking_id: str, body: DecisionIn, grant: dict, now=None
) -> tuple[dict, bool]:
    """An approver's decision. Approving books through the provider; declining charges nothing.

    Returns the booking and whether anything changed: repeating the same decision is a no-op.
    """
    now = time.time() if now is None else now
    booking = find_booking(state, booking_id)
    approval = _approval(state, booking)
    if body.action == "ask":
        if booking["booking_status"] != "AWAITING_APPROVAL":
            raise HTTPException(409, "This request is no longer waiting for approval.")
        question = body.note or "Could you tell me a little more about this request?"
        booking["questions"].append({"by": grant["name"], "text": question, "at": now})
        add_event(
            state,
            "question",
            f"{grant['name']} asked about {event_label(booking)}",
            question,
            permission="approve",
            ref=booking_id,
            severity="attention",
            actor=grant["name"],
        )
        return booking, True
    earlier = booking.get("decision")
    if earlier:
        if earlier["by"] == grant["id"] and earlier["action"] == body.action:
            return booking, False
        done = "approved" if earlier["action"] == "approve" else "declined"
        raise HTTPException(409, f"Already {done} by {earlier['name']}.")
    if booking["booking_status"] != "AWAITING_APPROVAL" or not approval:
        raise HTTPException(409, "This request is no longer waiting for approval.")
    if approval["status"] != "PENDING" or approval["expires_at"] <= now:
        raise HTTPException(409, "This approval request has expired. Nothing was booked.")
    approved = body.action == "approve"
    approval.update(
        status="APPROVED" if approved else "REJECTED",
        decided_at=now,
        decided_by=grant["id"],
        decided_by_name=grant["name"],
        note=body.note,
    )
    booking["decision"] = {
        "action": body.action,
        "by": grant["id"],
        "name": grant["name"],
        "note": body.note,
        "at": now,
    }
    _close_approval_alerts(state, booking_id, grant["name"], now)
    add_event(
        state,
        "approved" if approved else "declined",
        f"{grant['name']} {'approved' if approved else 'declined'} {event_label(booking)}",
        "Sent to the demo provider." if approved else body.note,
        ref=booking_id,
        actor=grant["name"],
    )
    if approved:
        _execute(state, booking, now)
    else:
        booking.update(booking_status="DECLINED", updated_at=now)
    linked = next(
        (a for a in state.get("appointments", []) if a["id"] == booking.get("appointment_id")),
        None,
    )
    if linked:
        booked = booking["booking_status"] == "CONFIRMED_SIMULATED"
        if not booked:
            linked["ride_request_id"] = None
        add_event(
            state,
            "appointment_ride",
            f"Ride arranged for {linked['title']}"
            if booked
            else f"No ride booked for {linked['title']}",
            "Simulated: no real driver will come." if booked else "Nothing was booked.",
            ref=booking_id,
            topic="appointments",
            severity="info" if booked else "attention",
        )
    return booking, True


def cancel(state: dict, booking_id: str, now=None) -> dict:
    now = time.time() if now is None else now
    booking = find_booking(state, booking_id)
    status = booking["booking_status"]
    if status == "CANCELLED_SIMULATED":
        return booking
    if status not in LIVE:
        raise HTTPException(409, "This booking can no longer be cancelled.")
    if status == "CONFIRMED_SIMULATED":
        provider = provider_for(booking["service_type"], state["provider_ledger"])
        try:
            provider.cancel_booking(booking["provider_booking_id"])
        except ProviderError as error:
            raise HTTPException(409, error.message) from None
    approval = _approval(state, booking)
    if approval and approval["status"] == "PENDING":
        approval.update(status="CANCELLED", decided_at=now)
    _close_approval_alerts(state, booking_id, "owner", now)
    booking.update(booking_status="CANCELLED_SIMULATED", updated_at=now)
    payment = booking["payment"]
    if payment["status"] == "SUCCEEDED_SIMULATED":
        # Booking and payment stay separate facts: the payment happened, then a refund.
        payment["refund"] = {"status": "REFUNDED_SIMULATED", "at": now}
        add_event(
            state,
            "payment",
            "Simulated refund recorded",
            "No real money moved either way.",
            permission="view_payments",
            ref=booking_id,
        )
    elif payment["status"] == "PENDING_SIMULATED":
        _pay(booking, "NOT_CHARGED_SIMULATED", now)
    linked = next(
        (a for a in state.get("appointments", []) if a["id"] == booking.get("appointment_id")),
        None,
    )
    if linked:
        linked["ride_request_id"] = None
    add_event(
        state,
        "ride_cancelled" if linked else "cancelled",
        f"Ride for {linked['title']} was cancelled"
        if linked
        else f"Cancelled: {event_label(booking)}",
        "Cancelled by the owner (simulated).",
        ref=booking_id,
        severity="attention" if linked else "info",
        actor="owner",
    )
    return booking


def complete(state: dict, booking_id: str, now=None) -> dict:
    """Demo control: the simulated trip or delivery has finished. Payment is not touched."""
    now = time.time() if now is None else now
    booking = find_booking(state, booking_id)
    if booking["booking_status"] == "COMPLETED_SIMULATED":
        return booking
    if booking["booking_status"] != "CONFIRMED_SIMULATED":
        raise HTTPException(409, "Only a confirmed booking can be completed.")
    provider = provider_for(booking["service_type"], state["provider_ledger"])
    try:
        provider.complete_booking(booking["provider_booking_id"])
    except ProviderError as error:
        raise HTTPException(409, error.message) from None
    booking.update(booking_status="COMPLETED_SIMULATED", updated_at=now)
    add_event(
        state,
        "completed",
        f"Completed (simulated): {event_label(booking)}",
        "The demo provider marked it finished.",
        ref=booking_id,
    )
    return booking


def settle(state: dict, booking_id: str, now=None) -> dict:
    """Demo control: a pay-on-completion payment is marked paid. No real money moves."""
    now = time.time() if now is None else now
    booking = find_booking(state, booking_id)
    payment = booking["payment"]
    if payment["status"] == "SUCCEEDED_SIMULATED":
        return booking
    if payment["status"] != "PENDING_SIMULATED" or booking["booking_status"] not in {
        "CONFIRMED_SIMULATED",
        "COMPLETED_SIMULATED",
    }:
        raise HTTPException(409, "Only a pending simulated payment can be marked complete.")
    _pay(booking, "SUCCEEDED_SIMULATED", now)
    add_event(
        state,
        "payment",
        "Simulated payment marked complete",
        "No real money moved.",
        permission="view_payments",
        ref=booking_id,
    )
    return booking
