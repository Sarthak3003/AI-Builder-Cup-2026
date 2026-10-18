"""Shared account workflows, independent of routes and channel transport."""

import time

from fastapi import HTTPException

from app.bookings import QuoteIn, create_quotes, lets_saathi_book, offer_order, pick_offer
from app.care import add_event
from app.intent import EMERGENCY
from app.onboarding import OWN_OPTIONS, own_option_enabled
from app.providers import MAX_LINES, ItemRequest, enabled_apps, match_products, suggest_meals

PHARMACY_ONLY = (
    "The demo pharmacy only has sample non-prescription items, such as ORS sachets, a crepe "
    "bandage or a thermometer. It cannot order prescription medicines."
)
MEDICAL_DIET = "Demo meals cannot verify medical diets or allergens."
MEDICAL_DIET_WORDS = ("allerg", "diabet", "एलर्जी")


def record(state, event, request_id="", actor="owner"):
    state["audit"].append(
        {"event": event, "request_id": request_id, "actor": actor, "at": time.time()}
    )
    state["audit"] = state["audit"][-200:]


def remember(
    state,
    conv_id,
    channel,
    said,
    reply,
    *,
    service=None,
    request_id=None,
    destination="",
    medicine="",
    options=0,
    safety=None,
):
    """One interaction: shared history, a conversation record and any safety signal."""
    now = time.time()
    state["messages"].extend(
        [
            {"role": "user", "text": said, "channel": channel},
            {"role": "assistant", "text": reply, "channel": channel},
        ]
    )
    state["messages"] = state["messages"][-100:]
    state["conversations"].insert(
        0,
        {
            "id": conv_id,
            "request_id": request_id,
            "channel": channel,
            "at": now,
            "service": service,
            "destination": destination,
            "medicine": medicine,
            "options": options,
            "safety": safety,
            "transcript": [
                {"role": "user", "text": said},
                {"role": "assistant", "text": reply},
            ],
        },
    )
    del state["conversations"][100:]
    name = state["profile"]["name"]
    if safety == "suspected_scam":
        add_event(
            state,
            "suspected_scam",
            "Possible scam message",
            f"{name} shared a message that looks like a common scam. Saathi did nothing. "
            "This is a suspicion from word matching, not a confirmed scam.",
            permission="receive_alerts",
            severity="attention",
            certainty="suspected",
        )
    elif reply == EMERGENCY:
        add_event(
            state,
            "emergency_mentioned",
            f"{name} mentioned an emergency",
            "Saathi cannot respond to emergencies and told them to contact emergency "
            "services or a trusted person.",
            permission="receive_alerts",
            severity="attention",
        )
    if options or safety:
        state["misses"] = []
        return
    state["misses"] = [stamp for stamp in state["misses"] if now - stamp < 600] + [now]
    if len(state["misses"]) >= 3:
        state["misses"] = []
        add_event(
            state,
            "repeated_trouble",
            "Saathi had trouble with several requests",
            f"{name}'s last three requests in ten minutes needed more details. "
            "Saathi has not assumed anything else.",
            permission="receive_alerts",
            severity="attention",
        )


def ai_profile(state):
    attempts = state.get("ai_attempts", [])
    attempts = [stamp for stamp in attempts if time.time() - stamp < 60]
    if len(attempts) >= 5:
        raise HTTPException(429, "Please wait a minute before another AI request.")
    attempts.append(time.time())
    state["ai_attempts"] = attempts
    return dict(state["profile"])


def next_appointment(state):
    now = time.time()
    upcoming = [a for a in state["appointments"] if now - 3600 < a["starts_at"] < now + 14 * 86400]
    return min(upcoming, key=lambda a: a["starts_at"], default=None)


def quote_for_draft(state, draft, message, channel, appointment):
    """Turn an understood request into quotes. A quote is never a booking."""
    if draft.service == "ride":
        body = QuoteIn(
            service_type="RIDE",
            channel=channel,
            appointment_id=appointment["id"] if appointment else None,
            destination_text="" if appointment else draft.destination,
        )
        return create_quotes(state, body, enabled_apps(state["profile"]))
    if draft.service == "food":
        if any(word in message.lower() for word in MEDICAL_DIET_WORDS):
            raise HTTPException(422, MEDICAL_DIET)
        profile = state["profile"]
        vegetarian = profile["vegetarian"] if draft.vegetarian is None else draft.vegetarian
        mild = profile["mild"] if draft.mild is None else draft.mild
        budget = profile["budget"] if draft.budget is None else draft.budget
        picks = suggest_meals(enabled_apps(state["profile"]), vegetarian, mild, budget * 100)
        if not own_option_enabled(state, "FOOD"):
            picks = [pick for pick in picks if pick[0] != OWN_OPTIONS["FOOD"]]
        if not picks:
            raise HTTPException(
                409, f"No demo meals fit within ₹{budget}. Try a larger budget or the menus."
            )
        group, quotes = None, []
        for kitchen, dish in picks:
            body = QuoteIn(
                service_type="FOOD",
                channel=channel,
                option_id=kitchen,
                items=[ItemRequest(item_id=dish)],
            )
            made = create_quotes(state, body, enabled_apps(state["profile"]), group=group)
            group = made["request_id"]
            quotes += made["quotes"]
        quotes.sort(key=offer_order)
        if lets_saathi_book(state):
            pick_offer(quotes)
        return {"request_id": group, "service_type": "FOOD", "quotes": quotes}
    products = match_products(f"{message} {draft.medicine}")
    if not products:
        raise HTTPException(409, PHARMACY_ONLY)
    body = QuoteIn(
        service_type="PHARMACY",
        channel=channel,
        items=[ItemRequest(item_id=product) for product in products[:MAX_LINES]],
    )
    return create_quotes(state, body, enabled_apps(state["profile"]))
