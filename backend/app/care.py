"""Care Circle: roles, explicit permissions and what each caretaker may see.

Pure functions on one account's state. Every check runs inside the same transaction
as the change it guards, so a revoked or reduced grant takes effect immediately.
"""

import time
from uuid import uuid4

from fastapi import HTTPException

from app.domain import SCHEMA
from app.hub_store import initial_state
from app.onboarding import ensure_setup

PERMISSIONS = {
    "view_activity": "See shared rides, orders and appointments",
    "manage_reminders": "Add and change reminders and appointments",
    "edit_profile": "Help edit saved addresses",
    "approve": "Approve or decline requests sent for approval",
    "view_summaries": "Read conversation summaries",
    "receive_alerts": "Receive safety alerts",
    "manage_circle": "Invite and remove other caretakers",
    "view_medication": "See saved medicine details",
    "view_transcripts": "Read full conversation transcripts",
    "view_payments": "See simulated payment status",
    "manage_contacts": "Change emergency contacts",
}
# Never implied by a role; the older adult must switch each one on.
SENSITIVE = {"view_medication", "view_transcripts", "view_payments", "manage_contacts"}
ROLES = {
    "viewer": ["view_activity"],
    "assistant": ["view_activity", "manage_reminders", "edit_profile"],
    "approver": ["view_activity", "approve"],
    "administrator": ["view_activity", "manage_circle"],
}
ROLE_NAMES = {
    "viewer": "Viewer",
    "assistant": "Assistant",
    "approver": "Approver",
    "administrator": "Administrator",
}


def ensure(state):
    """Fill in missing fields. Demo data saved by an older version is cleared, not guessed at."""
    if state.get("schema") != SCHEMA:
        # Anonymous 24-hour demo sessions only: starting again is safer than a half-migration.
        state.clear()
        state.update(initial_state())
    ensure_setup(state)
    state.setdefault("care_circle", [])
    state.setdefault("events", [])
    state.setdefault("appointments", [])
    state.setdefault("reminders", [])
    state.setdefault("contacts", [])
    state.setdefault("conversations", [])
    state.setdefault("misses", [])
    state.setdefault("demo", {"fail_next": False})
    state["profile"].setdefault(
        "sharing", {"ride": True, "food": True, "medicine": True, "appointments": True}
    )
    return state


def permissions_for(role, extras):
    return sorted(set(ROLES[role]) | set(extras))


def new_grant(name, relationship, role, extras, created_by):
    return {
        "id": uuid4().hex[:12],
        "name": name,
        "relationship": relationship,
        "role": role,
        "permissions": permissions_for(role, extras),
        "status": "invited",
        "invite": None,
        "created_at": time.time(),
        "created_by": created_by,
        "joined_at": None,
        "revoked_at": None,
    }


def active_grant(state, grant_id):
    return next(
        (g for g in state["care_circle"] if g["id"] == grant_id and g["status"] == "active"),
        None,
    )


def actor_name(who):
    grant = who.get("grant_record")
    return grant["name"] if grant else "owner"


def can(who, permission):
    return who["role"] == "owner" or permission in who["grant_record"]["permissions"]


def need(who, permission):
    if not can(who, permission):
        raise HTTPException(403, f"Not shared with you: {PERMISSIONS[permission].lower()}.")


def add_event(
    state,
    kind,
    title,
    detail="",
    *,
    permission="view_activity",
    ref=None,
    severity="info",
    certainty="confirmed",
    actor="saathi",
    topic=None,
):
    event = {
        "id": uuid4().hex[:12],
        "at": time.time(),
        "kind": kind,
        "title": title,
        "detail": detail,
        "permission": permission,
        "ref": ref,
        "topic": topic,
        "severity": severity,
        "certainty": certainty,
        "actor": actor,
        "status": "open" if severity == "attention" else "info",
    }
    state["events"].insert(0, event)
    del state["events"][200:]
    return event


def _activity(state, ref):
    # A conversation points at the request; events and appointments point at the booking.
    if not ref:
        return None
    return next((a for a in state["activity"] if ref in (a["id"], a.get("request_id"))), None)


def _shared(state, ref):
    item = _activity(state, ref)
    sharing = state["profile"].get("sharing", {})
    return item is None or (item.get("shared", True) and sharing.get(item["service"], True))


def visible_events(state, perms):
    plans_shared = state["profile"].get("sharing", {}).get("appointments", True)
    return [
        event
        for event in state["events"]
        if event["permission"] in perms
        and (event["ref"] is None or _shared(state, event["ref"]))
        and (event.get("topic") != "appointments" or plans_shared or "manage_reminders" in perms)
    ]


def reminder_view(reminder, now=None):
    now = time.time() if now is None else now
    if reminder.get("done_at"):
        status = "done"
    elif reminder["due_at"] < now:
        status = "missed"
    else:
        status = "upcoming"
    return {**reminder, "status": status}


BOOKING_LINES = {
    "CONFIRMED_SIMULATED": "Booked {name} with the {app} (simulated).",
    "COMPLETED_SIMULATED": "{name} with the {app} completed (simulated).",
    "AWAITING_APPROVAL": "Sent {name} for approval. Nothing is booked yet.",
    "FAILED": "Booking {name} failed. Nothing was booked or charged.",
    "CANCELLED_SIMULATED": "Cancelled {name}.",
    "DECLINED": "{name} was declined in the Care Circle. Nothing was booked.",
}
PHARMACY_HIDDEN = "Pharmacy order (details not shared)"


def summarise(conv, state, perms=None):
    """Confirmed lines come only from stored records; anything else is a suggestion."""
    owner = perms is None
    item = _activity(state, conv.get("request_id"))
    hide_medicine = (
        conv.get("service") == "medicine" and not owner and "view_medication" not in perms
    )
    if conv.get("safety") == "suspected_scam":
        text = "A message looked like a possible scam. Saathi did nothing and warned about it."
    elif conv.get("safety") == "help":
        text = "Asked the Care Circle for help."
    elif conv.get("service") == "ride":
        text = f"Asked for a ride to {conv.get('destination') or 'a place'}."
    elif conv.get("service") == "food":
        text = "Asked for a meal."
    elif conv.get("service") == "medicine":
        text = "Asked for pharmacy items."
    else:
        text = "Asked Saathi for help."
    confirmed = []
    if item:
        name = "the pharmacy order" if hide_medicine else item["title"]
        line = BOOKING_LINES[item["booking_status"]]
        confirmed.append(line.format(name=name, app=item["provider_label"]))
    elif conv.get("options"):
        shown = conv["options"]
        text += f" {shown} quote{'s were' if shown > 1 else ' was'} shown; nothing was booked."
    elif conv.get("workflow_state") in {"CANCELLED", "EXPIRED", "FAILED"}:
        text += " The conversation ended without a booking."
    elif not conv.get("safety"):
        text += " Saathi asked for more details; nothing was booked."
    suggestions = []
    status = item["booking_status"] if item else None
    if item and item.get("appointment_id") and status == "CONFIRMED_SIMULATED":
        suggestions.append("Ask whether someone could go along to the appointment.")
    if status == "FAILED":
        suggestions.append("Try again, or offer help from the Care Circle.")
    if conv.get("safety") == "suspected_scam":
        suggestions.append("Check in before anyone replies to that message.")
    ai = conv.get("ai_summary")
    if ai and not hide_medicine:
        return {
            "by": "gemini",
            "text": ai["text"],
            "confirmed": confirmed,
            "suggestions": ai["suggestions"],
        }
    return {"by": "rules", "text": text, "confirmed": confirmed, "suggestions": suggestions}


def conversation_visible(conv, state, perms):
    if "view_summaries" not in perms:
        return False
    if conv.get("safety"):
        return "receive_alerts" in perms
    item = _activity(state, conv.get("request_id"))
    return item is not None and _shared(state, item["id"])


def conversation_view(conv, state, perms=None):
    item = _activity(state, conv.get("request_id"))
    view = {
        key: conv.get(key)
        for key in ("id", "channel", "at", "service", "request_id", "safety", "seeded")
    }
    view["status"] = item["booking_status"] if item else "no_booking"
    view["summary"] = summarise(conv, state, perms)
    if conv["channel"] == "phone":
        now = time.time()
        end = conv.get("ended_at")
        expires = conv.get("expires_at", now)
        view.update(
            workflow_state=conv.get("workflow_state", "NEW"),
            call_status="EXPIRED" if not end and expires <= now else conv.get("call_status"),
            ended_at=end or (expires if expires <= now else None),
            duration_seconds=max(0, int((end or min(now, expires)) - conv["at"])),
            transcript_retained=bool(
                conv.get("transcript_retained", False)
                and conv.get("transcript_expires_at", now + 1) > now
            ),
            booking_id=item["id"] if item else None,
        )
    if perms is None:
        view["transcript"] = (
            []
            if conv.get("transcript_expires_at", time.time() + 1) <= time.time()
            else conv["transcript"]
        )
    return view


CIRCLE_FIELDS = (
    "id",
    "request_id",
    "service",
    "service_type",
    "channel",
    "booking_status",
    "provider_type",
    "provider_label",
    "provider_booking_id",
    "app_name",
    "option_name",
    "amount_minor",
    "currency",
    "pickup_eta_min",
    "duration_min",
    "delivery_min",
    "notice",
    "simulated",
    "appointment_id",
    "approval_reason",
    "decision",
    "questions",
    "failure",
    "shared",
    "created_at",
    "updated_at",
)


def activity_for_circle(item, perms):
    """What a caretaker may see of one booking: never addresses, and payment only if shared."""
    view = {key: item.get(key) for key in CIRCLE_FIELDS}
    details = item.get("details", {})
    if item["service_type"] == "PHARMACY" and "view_medication" not in perms:
        view.update(title=PHARMACY_HIDDEN, details={}, line_items=[])
    else:
        view["title"] = item["title"]
        view["line_items"] = item.get("line_items", [])
        if item["service_type"] == "RIDE":
            view["details"] = {
                "pickup": {"label": details["pickup"]["label"]},
                "destination": {"label": details["destination"]["label"]},
                "distance_km": details.get("distance_km"),
            }
        else:
            view["details"] = {key: details[key] for key in ("kitchen", "items") if key in details}
    if "view_payments" in perms:
        view["payment"] = item.get("payment")
    return view


def circle_view(state, grant, *, storage, catalogue):
    """The whole dashboard payload for one caretaker, built only from what they may see."""
    perms = set(grant["permissions"])
    profile = state["profile"]
    sharing = profile.get("sharing", {})
    activity = []
    if "view_activity" in perms:
        activity = [
            activity_for_circle(item, perms)
            for item in state["activity"]
            if item.get("shared", True) and sharing.get(item["service"], True)
        ]
    approvals = []
    if "approve" in perms:
        approvals = [
            activity_for_circle(item, perms | {"view_medication"})
            for item in state["activity"]
            if item["booking_status"] == "AWAITING_APPROVAL"
        ]
    see_plans = "view_activity" in perms and sharing.get("appointments", True)
    see_reminders = see_plans or "manage_reminders" in perms
    reminders = [
        reminder_view(r)
        for r in state["reminders"]
        if see_reminders and (r["kind"] != "medicine" or "view_medication" in perms)
    ]
    circle = [
        {key: g[key] for key in ("id", "name", "relationship", "role", "status", "permissions")}
        for g in state["care_circle"]
        if g["status"] != "revoked" and ("manage_circle" in perms or g["id"] == grant["id"])
    ]
    return {
        "role": "caregiver",
        "grant": {key: grant[key] for key in ("id", "name", "relationship", "role", "permissions")},
        "owner": {"name": profile["name"], "language": profile["language"]},
        "profile": {
            "name": profile["name"],
            "language": profile["language"],
            "large_text": False,
            "high_contrast": False,
            "home": profile["home"] if "edit_profile" in perms else "",
            "medicines": profile["medicines"] if "view_medication" in perms else [],
            "approval_limit": profile["approval_limit"] if "approve" in perms else None,
        },
        "activity": activity,
        "approvals": approvals,
        "appointments": state["appointments"] if see_plans or "manage_reminders" in perms else [],
        "reminders": reminders,
        "contacts": state["contacts"] if "manage_contacts" in perms else [],
        "events": visible_events(state, perms),
        "conversations": [
            conversation_view(conv, state, perms)
            for conv in state["conversations"]
            if conversation_visible(conv, state, perms)
        ],
        "circle": circle,
        "permissions": PERMISSIONS,
        "storage": storage,
        "catalogue": catalogue,
        "providers": "simulated",
    }
