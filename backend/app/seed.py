"""A repeatable demo account: Meera, her appointments, reminders and Care Circle.

All addresses, phone numbers and medicines are clearly fake samples. Times are set relative
to now (India time) so the demo always has a check-up tomorrow morning.
"""

import time
from datetime import UTC, datetime, timedelta
from datetime import time as clock

from app.bookings import ConfirmIn, QuoteIn, complete, confirm_quote, create_quotes
from app.care import add_event, new_grant
from app.domain import ONBOARDING_STEPS, SERVICE_TYPES
from app.onboarding import PlaceIn, connect, save_place
from app.providers import APP_IDS, ItemRequest

IST = timedelta(hours=5, minutes=30)
# Clearly fake addresses. The onboarding screen offers the same ones as quick samples.
SAMPLE_PLACES = (
    {
        "label": "Home",
        "address": "12 Sample Lane, Demo Nagar (sample address)",
        "notes": "Gate 2, ground floor",
    },
    {
        "label": "Doctor",
        "address": "Sunrise Clinic, 4 Example Road (sample address)",
        "notes": "Dr Mehta",
    },
    {
        "label": "Eye care",
        "address": "Demo Eye Care, 9 Sample Street (sample address)",
        "notes": "",
    },
)


def seed_setup(state: dict, now: float) -> None:
    """Meera has finished onboarding: places, every demo service and a simulated wallet."""
    for index, place in enumerate(SAMPLE_PLACES):
        save_place(state, PlaceIn(**place, is_default_pickup=index == 0), now)
    for service_type in SERVICE_TYPES:
        connect(state, service_type, now)
    state["profile"]["payment_method"] = "DEMO_WALLET"
    state["onboarding"].update(
        steps={step: {"status": "done", "at": now} for step in ONBOARDING_STEPS},
        started_at=now,
        completed=True,
        completed_at=now,
    )


def ist(days: int, hour: int, minute: int, now: float) -> float:
    local_today = (datetime.fromtimestamp(now, UTC) + IST).date()
    moment = datetime.combine(local_today + timedelta(days=days), clock(hour, minute))
    return (moment - IST).replace(tzinfo=UTC).timestamp()


def seed(state: dict, now: float | None = None) -> list[dict]:
    """Fill an emptied account with the scripted demo. Returns the two pending invites."""
    now = time.time() if now is None else now
    state["profile"].update(
        name="Meera",
        home="12 Sample Lane, Demo Nagar (sample address)",
        medicines=["BP tablet (sample)", "Vitamin D (sample)"],
        caregiver_enabled=False,
        caregiver_name="Asha",
    )
    seed_setup(state, now)
    state["appointments"] = [
        {
            "id": "appt-mehta",
            "title": "Check-up with Dr Mehta",
            "with_whom": "Dr Mehta",
            "place": "Sunrise Clinic, 4 Example Road (sample address)",
            "starts_at": ist(1, 10, 30, now),
            "notes": "Bring the last blood test report.",
            "ride_request_id": None,
            "created_by": "owner",
            "created_at": now,
        },
        {
            "id": "appt-eyes",
            "title": "Eye check-up",
            "with_whom": "Demo Eye Care",
            "place": "Demo Eye Care, 9 Sample Street (sample address)",
            "starts_at": ist(6, 16, 0, now),
            "notes": "",
            "ride_request_id": None,
            "created_by": "Asha",
            "created_at": now,
        },
    ]
    state["reminders"] = [
        {
            "id": "rem-refill",
            "title": "Reorder BP tablet (sample)",
            "kind": "medicine",
            "due_at": ist(2, 9, 0, now),
            "notes": "",
            "done_at": None,
            "created_by": "owner",
            "created_at": now,
        },
        {
            "id": "rem-call",
            "title": "Call the clinic to confirm tomorrow's time",
            "kind": "appointment",
            "due_at": now - 2 * 3600,
            "notes": "",
            "done_at": None,
            "created_by": "Asha",
            "created_at": now,
        },
        {
            "id": "rem-walk",
            "title": "Evening walk",
            "kind": "other",
            "due_at": now - 26 * 3600,
            "notes": "",
            "done_at": now - 25 * 3600,
            "created_by": "owner",
            "created_at": now,
        },
    ]
    state["contacts"] = [
        {
            "id": "contact-asha",
            "name": "Asha",
            "relationship": "Daughter",
            "phone": "+91 90000 00001 (sample)",
            "primary": True,
            "added_by": "owner",
        },
        {
            "id": "contact-ravi",
            "name": "Ravi",
            "relationship": "Son",
            "phone": "+91 90000 00002 (sample)",
            "primary": False,
            "added_by": "owner",
        },
    ]

    # Bookings go through the same quote and confirmation code as the app, so they match it.
    every_app = list(APP_IDS)
    two_days_ago = now - 2 * 86400
    meal_request = QuoteIn(
        service_type="FOOD",
        channel="voice",
        option_id="swiggy",
        items=[ItemRequest(item_id="khichdi")],
    )
    meal_quote = create_quotes(state, meal_request, every_app, now=two_days_ago)["quotes"][0]
    yes = ConfirmIn(idempotency_key="seed-meal-0001", confirmed=True)
    meal, _ = confirm_quote(state, meal_quote["id"], yes, every_app, now=two_days_ago)
    complete(state, meal["id"], now=two_days_ago + 3000)
    # From here on, Meera asks an approver about bookings above Rs 100 and every pharmacy order.
    state["profile"].update(caregiver_enabled=True, approval_limit=100)
    asha = new_grant(
        "Asha",
        "Daughter",
        "approver",
        ["view_summaries", "receive_alerts", "view_medication", "manage_reminders"],
        "owner",
    )
    ravi = new_grant("Ravi", "Son", "viewer", [], "owner")
    state["care_circle"] = [asha, ravi]
    items = [ItemRequest(item_id="ors"), ItemRequest(item_id="calcium")]
    refill_request = QuoteIn(service_type="PHARMACY", channel="voice", items=items)
    refill_quote = create_quotes(state, refill_request, every_app, now=now - 1800)["quotes"][0]
    yes = ConfirmIn(idempotency_key="seed-pharmacy-0001", confirmed=True)
    refill, _ = confirm_quote(state, refill_quote["id"], yes, every_app, now=now - 1800)

    conversation = {"options": 0, "safety": None, "destination": "", "medicine": "", "seeded": True}
    state["conversations"] = [
        {
            **conversation,
            "id": "conv-scam",
            "request_id": None,
            "channel": "message",
            "at": now - 3600,
            "service": None,
            "safety": "suspected_scam",
            "transcript": [
                {
                    "role": "user",
                    "text": "I got this: 'Your bank KYC is blocked. Share the OTP to unblock.'",
                },
                {
                    "role": "assistant",
                    "text": "This sounds like it could be a scam. Never share an OTP, PIN or bank "
                    "details, and check with someone you trust. Saathi did not do anything.",
                },
            ],
        },
        {
            **conversation,
            "id": "conv-pharmacy",
            "request_id": refill["request_id"],
            "channel": "voice",
            "at": now - 1800,
            "service": "medicine",
            "options": 1,
            "transcript": [
                {"role": "user", "text": "Please order ORS sachets and calcium tablets."},
                {"role": "assistant", "text": "Sample pharmacy items"},
            ],
        },
        {
            **conversation,
            "id": "conv-meal",
            "request_id": meal["request_id"],
            "channel": "voice",
            "at": two_days_ago,
            "service": "food",
            "options": 3,
            "transcript": [
                {"role": "user", "text": "I'm hungry, something light please."},
                {"role": "assistant", "text": "Meals that suit you"},
            ],
        },
    ]
    add_event(
        state,
        "suspected_scam",
        "Possible scam message",
        "Meera shared a message that looks like a common scam. Saathi did nothing. "
        "This is a suspicion from word matching, not a confirmed scam.",
        permission="receive_alerts",
        severity="attention",
        certainty="suspected",
    )
    return [asha, ravi]
