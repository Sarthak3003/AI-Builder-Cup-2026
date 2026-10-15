"""Care Circle: roles, explicit permissions and what each caretaker may see.

Pure functions on one account's state. Every check runs inside the same transaction
as the change it guards, so a revoked or reduced grant takes effect immediately.
"""

import time
from uuid import uuid4

from fastapi import HTTPException

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

BOOKING_STATUSES = {
    "awaiting_approval",
    "simulated_confirmed",
    "completed",
    "failed",
    "cancelled",
    "rejected",
}
NOT_CHARGED = "not_charged_simulated"
PENDING = "pending_simulated"
PAID = "succeeded_simulated"


def ensure(state):
    """Fill in Care Circle fields for accounts created before they existed."""
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
    for item in state["activity"]:
        item.setdefault("shared", True)
        item.setdefault("payment", payment(item["option"]["price"], NOT_CHARGED))
        item.setdefault("decision", None)
        item.setdefault("questions", [])
        item.setdefault("approval_reason", "")
        item.setdefault("failure", "")
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


def payment(amount, status):
    return {"method": "pay_on_completion", "status": status, "amount": amount, "simulated": True}


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
):
    event = {
        "id": uuid4().hex[:12],
        "at": time.time(),
        "kind": kind,
        "title": title,
        "detail": detail,
        "permission": permission,
        "ref": ref,
        "severity": severity,
        "certainty": certainty,
        "actor": actor,
        "status": "open" if severity == "attention" else "info",
    }
    state["events"].insert(0, event)
    del state["events"][200:]
    return event


def _shared(state, ref):
    item = next((a for a in state["activity"] if a["id"] == ref), None)
    return item is None or item.get("shared", True)


def visible_events(state, perms):
    return [
        event
        for event in state["events"]
        if event["permission"] in perms and (event["ref"] is None or _shared(state, event["ref"]))
    ]


def activity_for_circle(item, perms):
    """What a caretaker may see of one booking."""
    option = item["option"]
    medicine_hidden = item["service"] == "medicine" and "view_medication" not in perms
    view = {
        key: item.get(key)
        for key in (
            "id",
            "service",
            "channel",
            "status",
            "created_at",
            "reference",
            "simulated",
            "appointment_id",
            "approval_reason",
            "decision",
            "questions",
        )
    }
    view["option"] = {
        "id": option["id"],
        "name": "Medicine request (details not shared)" if medicine_hidden else option["name"],
        "price": option["price"],
        "detail": "" if medicine_hidden else option.get("detail", ""),
        "provider": option.get("provider"),
        "provider_name": option.get("provider_name"),
        "eta_min": option.get("eta_min"),
        "simulated": True,
    }
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
            if item["status"] == "awaiting_approval"
        ]
    see_plans = "view_activity" in perms and sharing.get("appointments", True)
    see_reminders = see_plans or "manage_reminders" in perms
    reminders = [
        r
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
        "circle": circle,
        "permissions": PERMISSIONS,
        "storage": storage,
        "catalogue": catalogue,
        "providers": "simulated",
    }
