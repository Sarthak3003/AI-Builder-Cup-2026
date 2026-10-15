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

from app.domain import QUOTE_TTL_SECONDS, SERVICE_KEY, ServiceType
from app.onboarding import connected, default_pickup
from app.providers import (
    APP_NAMES,
    MAX_LINES,
    RIDE_OPTIONS,
    ItemRequest,
    PlaceRef,
    ProviderError,
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


def create_quotes(state: dict, body: QuoteIn, enabled_apps: list[str], now=None) -> dict:
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
            if option and option.app_id not in enabled_apps:
                raise HTTPException(409, f"{APP_NAMES[option.app_id]} is switched off in Services.")
            options = [body.option_id]
        else:
            options = ride_option_ids(enabled_apps)
        if not options:
            raise HTTPException(409, "Switch on at least one ride option in Services.")
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

    request_id = uuid4().hex
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
    quotes.sort(key=lambda quote: (quote["amount_minor"], quote["option_id"]))
    state["quotes"].extend(quotes)
    _prune(state)
    return {"request_id": request_id, "service_type": service_type, "quotes": quotes}


def active_quotes(state: dict, now=None) -> list[dict]:
    expire_quotes(state, time.time() if now is None else now)
    return [quote for quote in state["quotes"] if quote["status"] == "ACTIVE"]
