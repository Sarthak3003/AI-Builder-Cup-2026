"""Onboarding, saved places and demo service connections for one account.

Pure functions on the account state. Every route calls them inside the account transaction,
so a step is saved completely or not at all, and the server checks each step's requirements.
"""

import time
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.domain import (
    ONBOARDING_STEPS,
    OPTIONAL_STEPS,
    PAYMENT_METHODS,
    PROVIDER_TYPE,
    SERVICE_TYPES,
    PaymentMethod,
    ServiceType,
)
from app.providers import APPS, DEMO_PROVIDERS, enabled_apps, service_catalogue

MAX_PLACES = 8
STEP_TITLES = {
    "welcome": "Welcome",
    "accessibility": "Comfort and accessibility",
    "places": "Saved places",
    "care_circle": "Care Circle",
    "services": "Demo services",
    "payment": "Payment (simulated)",
    "review": "Review and finish",
}
CHANNELS = {"app": "Tapping in the app", "voice": "Speaking", "message": "Typing messages"}
CAPABILITY_LABELS = {
    "quote_rides": "Get sample ride fares",
    "book_rides": "Make simulated ride bookings",
    "cancel_rides": "Cancel simulated rides",
    "quote_orders": "Get sample prices",
    "place_orders": "Place simulated orders",
    "cancel_orders": "Cancel simulated orders",
}
DESCRIPTIONS = {
    "RIDE": "Simulated rides: the provider's own Demo Ride, plus example options under familiar "
    "names (Uber, Ola, Rapido). Saathi is not connected to those companies.",
    "FOOD": "Simulated meals: the provider's own Saathi Demo Kitchen, plus fictional kitchens "
    "listed under familiar app names (Uber Eats, Swiggy, Zomato) as examples only.",
    "PHARMACY": "Simulated orders of sample non-prescription items. No prescriptions and no "
    "medical advice.",
}
SIMULATED_NOTICE = "Simulated provider — no real order or dispatch."
OWN_OPTIONS = {"RIDE": "demo-ride", "FOOD": "demo-kitchen", "PHARMACY": "demo-pharmacy"}


def connection_record(service_type: ServiceType) -> dict:
    provider = DEMO_PROVIDERS[service_type]
    return {
        "service_type": service_type,
        "provider_type": PROVIDER_TYPE[service_type],
        "provider_label": provider.label,
        "connection_mode": "SIMULATED",
        "status": "SETUP_REQUIRED",
        "granted_capabilities": [],
        "consent_at": None,
        "updated_at": None,
    }


def new_setup() -> dict:
    return {
        "onboarding": {
            "steps": {step: None for step in ONBOARDING_STEPS},
            "started_at": None,
            "completed": False,
            "completed_at": None,
        },
        "places": [],
        "connections": {t: connection_record(t) for t in SERVICE_TYPES},
        "quotes": [],
        "approvals": [],
        "provider_ledger": {},
    }


PROFILE_DEFAULTS = {
    "channel": "app",
    "read_aloud": False,
    "offer_help": True,
    "payment_method": None,
    "show_options": True,
}


def ensure_setup(state: dict) -> dict:
    """Add any missing setup fields; a new or older account starts with setup to do."""
    for key, value in new_setup().items():
        state.setdefault(key, value)
    profile = state["profile"]
    if "show_ride_options" in profile:
        profile.setdefault("show_options", profile.pop("show_ride_options"))
    for key, value in PROFILE_DEFAULTS.items():
        profile.setdefault(key, value)
    return state


# --- Validation --------------------------------------------------------------------------


class ProfilePatch(BaseModel):
    """Steps 1, 2 and 6, and the approval rule from step 4. Unknown fields are refused."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    step: Literal["welcome", "accessibility", "care_circle", "payment"] | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    language: Literal["en-IN", "hi-IN"] | None = None
    large_text: bool | None = None
    high_contrast: bool | None = None
    simple: bool | None = None
    channel: Literal["app", "voice", "message"] | None = None
    read_aloud: bool | None = None
    offer_help: bool | None = None
    show_options: bool | None = Field(default=None, strict=True)
    caregiver_enabled: bool | None = None
    approval_limit: int | None = Field(default=None, ge=0, le=10000)
    payment_method: PaymentMethod | None = None


class PlaceIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str | None = Field(default=None, max_length=40)
    label: str = Field(min_length=1, max_length=40)
    address: str = Field(min_length=3, max_length=150)
    notes: str = Field(default="", max_length=200)
    is_default_pickup: bool = False


class StepIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skip: bool = False


class FinishIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: Literal[True]


class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent: Literal[True]


class ServiceOptionIn(ConsentIn):
    option_id: str = Field(min_length=1, max_length=40)
    enabled: bool = Field(strict=True)


class GrantIn(BaseModel):
    """Onboarding offers the two plainest kinds of access; Family offers the rest."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    relationship: str = Field(default="", max_length=40)
    can_approve: bool = False


# --- Progress ----------------------------------------------------------------------------


def _missing(state: dict, step: str) -> str:
    """Why a step cannot be marked done yet, in plain words; empty when it can."""
    profile = state["profile"]
    if step == "welcome" and not profile.get("name", "").strip():
        return "Tell Saathi your name first."
    if step == "places":
        if not state["places"]:
            return "Add at least one place, such as your home."
        if sum(place["is_default_pickup"] for place in state["places"]) != 1:
            return "Choose one place as your usual pickup."
    if step == "payment" and profile.get("payment_method") not in PAYMENT_METHODS:
        return "Choose how simulated payments should work."
    return ""


def progress(state: dict) -> dict:
    flow = state["onboarding"]
    steps = [
        {
            "id": step,
            "title": STEP_TITLES[step],
            "status": (flow["steps"][step] or {}).get("status"),
        }
        for step in ONBOARDING_STEPS
    ]
    current = next((s["id"] for s in steps if s["status"] is None), "review")
    return {
        "steps": steps,
        "current": "review" if flow["completed"] else current,
        "completed": flow["completed"],
        "completed_at": flow["completed_at"],
        "started_at": flow["started_at"],
    }


def mark(state: dict, step: str, skip: bool = False, now: float | None = None) -> dict:
    if step not in ONBOARDING_STEPS or step == "review":
        raise HTTPException(404, "That setup step does not exist.")
    if skip and step not in OPTIONAL_STEPS:
        raise HTTPException(422, "This step is needed. Please fill it in.")
    if not skip and (reason := _missing(state, step)):
        raise HTTPException(422, reason)
    now = time.time() if now is None else now
    flow = state["onboarding"]
    flow["started_at"] = flow["started_at"] or now
    flow["steps"][step] = {"status": "skipped" if skip else "done", "at": now}
    return progress(state)


def finish(state: dict, now: float | None = None) -> dict:
    flow = state["onboarding"]
    open_steps = [
        STEP_TITLES[step]
        for step in ONBOARDING_STEPS
        if step != "review" and (flow["steps"][step] is None or _missing_after(state, step))
    ]
    if open_steps:
        raise HTTPException(409, "Finish these steps first: " + ", ".join(open_steps) + ".")
    now = time.time() if now is None else now
    flow["steps"]["review"] = {"status": "done", "at": now}
    flow.update(completed=True, completed_at=flow["completed_at"] or now)
    return progress(state)


def _missing_after(state: dict, step: str) -> str:
    # A done step can become incomplete again, for example if its only place was deleted.
    record = state["onboarding"]["steps"][step]
    if record and record["status"] == "skipped":
        return ""
    return _missing(state, step)


def review(state: dict) -> dict:
    """The finish screen's summary, rebuilt from saved answers every time it is read."""
    profile = state["profile"]
    pickup = default_pickup(state)
    comfort = [
        label
        for key, label in (
            ("large_text", "Larger text"),
            ("high_contrast", "High contrast"),
            ("simple", "Simple language and fewer choices"),
            ("read_aloud", "Read prices and confirmations aloud"),
            ("offer_help", "Offer Care Circle help when something goes wrong"),
        )
        if profile.get(key)
    ]
    return {
        "name": profile.get("name", ""),
        "language": profile.get("language", "en-IN"),
        "channel": CHANNELS.get(profile.get("channel", "app"), ""),
        "comfort": comfort,
        "show_options": profile.get("show_options") is not False,
        "places": [place["label"] for place in state["places"]],
        "pickup": pickup["label"] if pickup else None,
        "services": [
            {"service_type": t, "provider_label": c["provider_label"], "status": c["status"]}
            for t, c in state["connections"].items()
        ],
        "payment": PAYMENT_METHODS.get(profile.get("payment_method") or ""),
        "care_circle": [
            {"name": g["name"], "role": g["role"], "permissions": g["permissions"]}
            for g in state.get("care_circle", [])
            if g["status"] != "revoked"
        ],
        "approval_rule": (
            f"An approver must agree to bookings above ₹{profile['approval_limit']} "
            "and to every pharmacy order."
            if profile.get("caregiver_enabled")
            else ""
        ),
        "missing": [
            STEP_TITLES[step]
            for step in ONBOARDING_STEPS
            if step != "review"
            and (state["onboarding"]["steps"][step] is None or _missing_after(state, step))
        ],
    }


def onboarding_view(state: dict) -> dict:
    return {
        **progress(state),
        "places": state["places"],
        "connections": state["connections"],
        "payment_methods": PAYMENT_METHODS,
        "review": review(state),
    }


def services_view(state: dict, enabled_apps: list[str]) -> list[dict]:
    catalogue = service_catalogue(enabled_apps)
    for service_type, key in [("RIDE", "options"), ("FOOD", "kitchens")]:
        for option in catalogue[service_type][key]:
            if option["id"] == OWN_OPTIONS[service_type]:
                option["enabled"] = own_option_enabled(state, service_type)
    return [
        {
            **state["connections"][service_type],
            "description": DESCRIPTIONS[service_type],
            "notice": SIMULATED_NOTICE,
            "capabilities": [
                {"id": c, "label": CAPABILITY_LABELS[c]}
                for c in DEMO_PROVIDERS[service_type].capabilities
            ],
            "catalogue": catalogue[service_type],
        }
        for service_type in SERVICE_TYPES
    ]


# --- Saved places ------------------------------------------------------------------------


def default_pickup(state: dict) -> dict | None:
    return next((p for p in state["places"] if p["is_default_pickup"]), None)


def sync_home(state: dict) -> None:
    # Older screens and caretaker views read the usual pickup from the profile.
    pickup = default_pickup(state)
    state["profile"]["home"] = pickup["address"] if pickup else ""


def save_place(state: dict, body: PlaceIn, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    places = state["places"]
    if any(p["label"].lower() == body.label.lower() and p["id"] != body.id for p in places):
        raise HTTPException(409, f"You already have a place called {body.label}.")
    if body.id:
        place = next((p for p in places if p["id"] == body.id), None)
        if not place:
            raise HTTPException(404, "That place is no longer saved.")
    else:
        if len(places) >= MAX_PLACES:
            raise HTTPException(409, f"Keep up to {MAX_PLACES} saved places.")
        place = {"id": uuid4().hex[:12], "created_at": now}
        places.append(place)
    first = len(places) == 1
    place.update(
        label=body.label,
        address=body.address,
        notes=body.notes,
        is_default_pickup=body.is_default_pickup or first,
        updated_at=now,
    )
    if place["is_default_pickup"]:
        for other in places:
            other["is_default_pickup"] = other is place
    elif not default_pickup(state):
        place["is_default_pickup"] = True
    sync_home(state)
    return place


def delete_place(state: dict, place_id: str) -> None:
    place = next((p for p in state["places"] if p["id"] == place_id), None)
    if not place:
        raise HTTPException(404, "That place is no longer saved.")
    state["places"].remove(place)
    if place["is_default_pickup"] and state["places"]:
        state["places"][0]["is_default_pickup"] = True
    sync_home(state)


def set_home_address(state: dict, address: str, now: float | None = None) -> None:
    """A caretaker with edit_profile may fix the usual pickup's address, nothing else."""
    pickup = default_pickup(state)
    if pickup:
        pickup.update(address=address, updated_at=time.time() if now is None else now)
    else:
        save_place(state, PlaceIn(label="Home", address=address, is_default_pickup=True), now)
    sync_home(state)


# --- Demo service connections ------------------------------------------------------------


def connected(state: dict, service_type: str) -> bool:
    return state["connections"][service_type]["status"] == "CONNECTED"


def own_option_enabled(state: dict, service_type: str) -> bool:
    return state["connections"][service_type].get("own_option_enabled", True)


def select_service_option(state: dict, service_type: ServiceType, body: ServiceOptionIn) -> None:
    app_ids = {app.id for app in APPS if app.service_type == service_type}
    own_id = OWN_OPTIONS[service_type]
    if body.option_id not in app_ids | {own_id}:
        raise HTTPException(422, "Choose a listed service option.")
    connection = state["connections"][service_type]
    selected = enabled_apps(state["profile"])
    # A disconnected category starts with only the option explicitly switched on.
    if not connected(state, service_type):
        selected = [app for app in selected if app not in app_ids]
        connection["own_option_enabled"] = False
    if body.option_id == own_id:
        connection["own_option_enabled"] = body.enabled
    elif body.enabled and body.option_id not in selected:
        selected.append(body.option_id)
    elif not body.enabled:
        selected = [app for app in selected if app != body.option_id]
    state["profile"]["enabled_providers"] = selected
    if own_option_enabled(state, service_type) or app_ids.intersection(selected):
        connect(state, service_type)
    else:
        disconnect(state, service_type)


def connect(state: dict, service_type: ServiceType, now: float | None = None) -> dict:
    record = state["connections"][service_type]
    app_ids = {app.id for app in APPS if app.service_type == service_type}
    if not own_option_enabled(state, service_type) and not app_ids.intersection(
        enabled_apps(state["profile"])
    ):
        record["own_option_enabled"] = True
    if record["status"] != "CONNECTED":
        now = time.time() if now is None else now
        record.update(
            status="CONNECTED",
            granted_capabilities=list(DEMO_PROVIDERS[service_type].capabilities),
            consent_at=now,
            updated_at=now,
        )
    return record


def disconnect(state: dict, service_type: ServiceType, now: float | None = None) -> dict:
    record = state["connections"][service_type]
    if record["status"] == "CONNECTED":
        record.update(
            status="DISCONNECTED",
            granted_capabilities=[],
            updated_at=time.time() if now is None else now,
        )
    return record


def reset_connection(state: dict, service_type: ServiceType) -> dict:
    state["connections"][service_type] = connection_record(service_type)
    return state["connections"][service_type]
