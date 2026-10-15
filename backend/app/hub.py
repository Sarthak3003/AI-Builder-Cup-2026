"""Shared local service workflows. External providers are always simulated."""

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from app.assistant import Draft, draft_request, hear_request, summarise_conversation
from app.assistant import configured as gemini_configured
from app.bookings import (
    ConfirmIn,
    DecisionIn,
    QuoteIn,
    active_quotes,
    cancel,
    complete,
    confirm_quote,
    create_quotes,
    decide,
    expire_approvals,
    find_booking,
    settle,
)
from app.care import (
    PERMISSIONS,
    ROLE_NAMES,
    ROLES,
    SENSITIVE,
    active_grant,
    activity_for_circle,
    actor_name,
    add_event,
    circle_view,
    conversation_view,
    conversation_visible,
    ensure,
    need,
    new_grant,
    permissions_for,
    reminder_view,
    summarise,
    visible_events,
)
from app.config import Settings
from app.domain import PAYMENT_METHODS, PaymentMethod, ServiceType
from app.hub_store import HubStore, initial_state
from app.intent import (
    EMERGENCY,
    EMERGENCY_WORDS,
    SCAM,
    looks_like_scam,
    mentions_appointment,
    understand,
)
from app.onboarding import (
    ConsentIn,
    FinishIn,
    GrantIn,
    PlaceIn,
    ProfilePatch,
    StepIn,
    connect,
    delete_place,
    disconnect,
    finish,
    mark,
    onboarding_view,
    progress,
    reset_connection,
    review,
    save_place,
    services_view,
    set_home_address,
    sync_home,
)
from app.providers import (
    APP_IDS,
    MAX_LINES,
    ItemRequest,
    apps_catalogue,
    enabled_apps,
    match_products,
    suggest_meals,
)
from app.seed import SAMPLE_PLACES, seed

PHARMACY_ONLY = (
    "The demo pharmacy only has sample non-prescription items, such as ORS sachets, a crepe "
    "bandage or a thermometer. It cannot order prescription medicines."
)
MEDICAL_DIET = "Demo meals cannot verify medical diets or allergens."
MEDICAL_DIET_WORDS = ("allerg", "diabet", "एलर्जी")


class Sharing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ride: bool = True
    food: bool = True
    medicine: bool = True
    appointments: bool = True


class Profile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    language: Literal["en-IN", "hi-IN"] = "en-IN"
    large_text: bool = False
    high_contrast: bool = False
    simple: bool = False
    vegetarian: bool = True
    mild: bool = True
    budget: int = Field(default=200, ge=0, le=10000)
    home: str = Field(default="", max_length=150)
    caregiver_name: str = Field(default="", max_length=60)
    approval_limit: int = Field(default=150, ge=0, le=10000)
    caregiver_enabled: bool = False
    medicines: list[str] = Field(default_factory=list, max_length=10)
    enabled_providers: list[str] = Field(
        default_factory=lambda: list(APP_IDS), max_length=len(APP_IDS)
    )
    sharing: Sharing = Field(default_factory=Sharing)
    channel: Literal["app", "voice", "message"] = "app"
    read_aloud: bool = False
    offer_help: bool = True
    payment_method: PaymentMethod | None = None

    @field_validator("enabled_providers")
    @classmethod
    def known_unique_apps(cls, value):
        if len(set(value)) != len(value) or any(item not in APP_IDS for item in value):
            raise ValueError("Choose each listed app at most once.")
        return value


class AppointmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=80)
    with_whom: str = Field(default="", max_length=60)
    place: str = Field(min_length=1, max_length=150)
    starts_at: float = Field(gt=0)
    notes: str = Field(default="", max_length=300)


class ReminderIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=80)
    kind: Literal["medicine", "appointment", "other"] = "other"
    due_at: float = Field(gt=0)
    notes: str = Field(default="", max_length=300)


class ContactIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    relationship: str = Field(default="", max_length=40)
    phone: str = Field(default="", max_length=30)
    primary: bool = False


class HelpIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    kind: Literal["help", "accompany"] = "help"
    note: str = Field(default="", max_length=300)
    appointment_id: str | None = Field(default=None, max_length=40)


class ResolveIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    note: str = Field(default="", max_length=300)


class HomeIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    home: str = Field(min_length=1, max_length=150)


class SwitchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to: str = Field(min_length=1, max_length=40)


class AssistantRequest(BaseModel):
    id: UUID
    message: str = Field(min_length=3, max_length=1000)
    channel: Literal["app", "message", "voice"] = "app"


class VoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    # About 30 seconds of 16 kHz mono WAV, base64-encoded.
    audio: str = Field(min_length=64, max_length=1_400_000)
    mime_type: Literal["audio/wav"] = "audio/wav"


def _known_permissions(value):
    if any(item not in PERMISSIONS for item in value) or len(set(value)) != len(value):
        raise ValueError("Choose each listed permission at most once.")
    return value


Extras = Annotated[
    list[str],
    Field(default_factory=list, max_length=len(PERMISSIONS)),
    AfterValidator(_known_permissions),
]
Role = Literal["viewer", "assistant", "approver", "administrator"]


class GrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    relationship: str = Field(default="", max_length=40)
    role: Role = "viewer"
    extras: Extras


class GrantUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Role
    extras: Extras


class ShareUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shared: bool


class Join(BaseModel):
    code: str = Field(min_length=10, max_length=500)


def record(state, event, request_id="", actor="owner"):
    state["audit"].append(
        {"event": event, "request_id": request_id, "actor": actor, "at": time.time()}
    )
    state["audit"] = state["audit"][-200:]


def hub_router(config: Settings):
    router = APIRouter(prefix="/api/hub")
    store = HubStore(config)
    # Seed, forced failure and simulated completion: on for local/test, opt-in elsewhere.
    demo_controls = (
        config.environment in {"local", "test"} or os.environ.get("SAATHI_DEMO_CONTROLS") == "1"
    )
    configured_key = os.environ.get("SAATHI_SESSION_SECRET")
    if configured_key:
        if len(configured_key) < 32:
            raise ValueError("Session secret must contain at least 32 characters")
        key = configured_key.encode()
    elif config.environment not in {"local", "test"}:
        raise ValueError("Cloud hub requires an explicit session secret")
    else:
        key_path = store.path.parent / "session.key"
        key_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with key_path.open("xb") as file:
                file.write(secrets.token_bytes(32))
        except FileExistsError:
            pass
        key = key_path.read_bytes()

    def sign(data):
        encoded = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
        signature = hmac.new(key, encoded.encode(), hashlib.sha256).hexdigest()
        return f"{encoded}.{signature}"

    def decode(token):
        try:
            encoded, signature = token.split(".")
            expected = hmac.new(key, encoded.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError()
            data = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
            if data["expires"] < time.time():
                raise ValueError()
            return data
        except (ValueError, KeyError, TypeError):
            raise HTTPException(401, "Session expired. Start a new session.") from None

    allowed_origins = set(filter(None, os.environ.get("SAATHI_ALLOWED_ORIGINS", "").split(",")))
    if config.environment in {"local", "test"}:
        # Vite's dev server (5173) and its production-build preview (4173) both proxy /api.
        for port in (5173, 4173):
            allowed_origins.update({f"http://127.0.0.1:{port}", f"http://localhost:{port}"})

    def guard(request: Request):
        if request.method not in {"GET", "HEAD"}:
            origin = request.headers.get("origin")
            if request.headers.get("sec-fetch-site") == "cross-site" or (
                origin
                and urlsplit(origin).netloc != request.headers.get("host")
                and origin not in allowed_origins
            ):
                raise HTTPException(403, "Open Saathi directly to make changes.")

    router.dependencies.append(Depends(guard))

    def identity(saathi_hub: str | None = Cookie(default=None, alias="__session")):
        if not saathi_hub:
            raise HTTPException(401, "Start a demo session first.")
        who = decode(saathi_hub)
        if who.get("role") not in {"owner", "caregiver"} or not who.get("owner"):
            raise HTTPException(401, "Invalid session.")
        return who

    actor = Depends(identity)

    def mutate(who, action, owner_only=False):
        if owner_only and who["role"] != "owner":
            raise HTTPException(403, "Only the account owner can perform this action.")

        def checked(state):
            ensure(state)
            expire_approvals(state)
            if who["role"] == "caregiver":
                grant = active_grant(state, who.get("grant", ""))
                if not grant:
                    raise HTTPException(403, "Your Care Circle access was removed.")
                # Fresh per request: handlers read the grant as it is inside this transaction.
                who["grant_record"] = grant
            return action(state)

        try:
            return store.change(who["owner"], checked)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Could not save your changes. Please retry.") from None

    def people(state, who):
        """Who this demo browser may switch to: only sessions that loaded the demo themselves."""
        if not (demo_controls and who.get("demo")):
            return {}
        everyone = [{"id": "owner", "name": state["profile"]["name"], "role": "Older adult"}]
        everyone += [
            {"id": g["id"], "name": g["name"], "role": ROLE_NAMES[g["role"]]}
            for g in state["care_circle"]
            if g["status"] != "revoked"
        ]
        current = who.get("grant") if who["role"] == "caregiver" else "owner"
        return {"demo_people": everyone, "demo_person": current}

    def apps(state):
        """Familiar app names the owner keeps switched on; each is still a simulated option."""
        return enabled_apps(state["profile"])

    def public(state, who):
        if who["role"] == "caregiver":
            return {
                **circle_view(
                    state, who["grant_record"], storage=store.mode, catalogue=apps_catalogue()
                ),
                **people(state, who),
            }
        profile = {**state["profile"], "enabled_providers": apps(state)}
        return {
            **people(state, who),
            "profile": profile,
            "activity": state["activity"],
            "messages": state["messages"],
            "audit": state["audit"],
            "care_circle": [
                {key: value for key, value in grant.items() if key != "invite"}
                for grant in state["care_circle"]
            ],
            "events": state["events"],
            "appointments": state["appointments"],
            "reminders": [reminder_view(r) for r in state["reminders"]],
            "contacts": state["contacts"],
            "conversations": [conversation_view(c, state) for c in state["conversations"]],
            "onboarding": {**progress(state), "review": review(state)},
            "places": state["places"],
            "services": services_view(state, apps(state)),
            "quotes": active_quotes(state),
            "payment_methods": PAYMENT_METHODS,
            "sample_places": SAMPLE_PLACES,
            "permissions": PERMISSIONS,
            "roles": {role: ROLES[role] for role in ROLES},
            "sensitive": sorted(SENSITIVE),
            "demo_controls": demo_controls,
            "role": who["role"],
            "storage": store.mode,
            "mode": "offline-demo",
            "providers": "simulated",
            "catalogue": apps_catalogue(),
            "gemini": gemini_configured(),
        }

    def cookie(response, who):
        response.set_cookie(
            "__session",
            sign({key: value for key, value in who.items() if key != "grant_record"}),
            httponly=True,
            secure=config.environment not in {"local", "test"},
            samesite="strict",
            max_age=86400,
            path="/api/hub",
        )

    @router.post("/session")
    def start(response: Response, saathi_hub: str | None = Cookie(default=None, alias="__session")):
        who = None
        if saathi_hub:
            try:
                who = identity(saathi_hub)
            except HTTPException:
                # An expired or unreadable anonymous demo cannot be resumed; start a fresh one.
                who = None
        if who is None:
            who = {"owner": uuid4().hex, "role": "owner", "expires": time.time() + 86400}
        result = mutate(who, lambda state: public(state, who))
        cookie(response, who)
        return result

    @router.delete("/session")
    def logout(response: Response):
        response.delete_cookie("__session", path="/api/hub")
        return {"ok": True}

    @router.get("/state")
    def state(who=actor):
        return mutate(who, lambda state: public(state, who))

    @router.put("/profile")
    def profile(body: Profile, who=actor):
        if any(not name.strip() or len(name) > 80 for name in body.medicines):
            raise HTTPException(422, "Use medicine labels of 1 to 80 characters.")

        def save(state):
            state["profile"] = body.model_dump()
            if state["places"]:
                sync_home(state)
            record(state, "profile_updated")
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.put("/profile/home")
    def change_home(body: HomeIn, who=actor):
        """Assistants may fix the pickup address; every other setting stays with the owner."""

        def save(state):
            need(who, "edit_profile")
            set_home_address(state, body.home)
            add_event(
                state,
                "address_changed",
                "Home address updated",
                f"Changed by {actor_name(who)}.",
                permission="edit_profile",
                actor=actor_name(who),
            )
            record(state, "address_changed", "", actor_name(who))
            return public(state, who)

        return mutate(who, save)

    # --- Onboarding: each step is saved as it is finished and checked on the server -------

    @router.get("/onboarding")
    def onboarding(who=actor):
        return mutate(who, onboarding_view, owner_only=True)

    @router.patch("/onboarding/profile")
    def onboarding_profile(body: ProfilePatch, who=actor):
        def save(state):
            state["profile"].update(body.model_dump(exclude_none=True, exclude={"step"}))
            if body.step:
                mark(state, body.step)
            record(state, f"setup_{body.step or 'profile'}_saved")
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.post("/onboarding/locations")
    def onboarding_place(body: PlaceIn, who=actor):
        def save(state):
            place = save_place(state, body)
            record(state, "place_saved", place["id"])
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.delete("/onboarding/locations/{place_id}")
    def onboarding_remove_place(place_id: str, who=actor):
        def save(state):
            delete_place(state, place_id)
            record(state, "place_removed", place_id)
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.post("/onboarding/caretaker-grants")
    def onboarding_grant(body: GrantIn, who=actor):
        """View-only, or view and approve: two explicit, separate kinds of access."""

        def save(state):
            if len([g for g in state["care_circle"] if g["status"] != "revoked"]) >= 6:
                raise HTTPException(409, "A Care Circle can have up to six people.")
            role = "approver" if body.can_approve else "viewer"
            grant = new_grant(body.name, body.relationship, role, [], "owner")
            state["care_circle"].append(grant)
            code = invite_code(who["owner"], grant)
            add_event(
                state,
                "circle_invited",
                f"{body.name} was invited as {ROLE_NAMES[role]}",
                permission="manage_circle",
            )
            record(state, "circle_invited", grant["id"])
            return {"grant": summary(grant), "code": code, "state": public(state, who)}

        return mutate(who, save, owner_only=True)

    @router.post("/onboarding/steps/{step}")
    def onboarding_step(step: str, body: StepIn, who=actor):
        def save(state):
            mark(state, step, body.skip)
            record(state, f"setup_{step}_{'skipped' if body.skip else 'saved'}")
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.post("/onboarding/finish")
    def onboarding_finish(body: FinishIn, who=actor):
        def save(state):
            finish(state)
            record(state, "setup_finished")
            return public(state, who)

        return mutate(who, save, owner_only=True)

    # --- Demo service connections: simulated records, never third-party logins -----------

    @router.get("/services")
    def services(who=actor):
        return mutate(who, lambda state: services_view(state, apps(state)), owner_only=True)

    @router.post("/services/{service_type}/connect-demo")
    def connect_demo(service_type: ServiceType, body: ConsentIn, who=actor):
        def save(state):
            connect(state, service_type)
            record(state, "service_connected", service_type)
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.post("/services/{service_type}/disconnect")
    def disconnect_demo(service_type: ServiceType, who=actor):
        def save(state):
            disconnect(state, service_type)
            record(state, "service_disconnected", service_type)
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.post("/services/{service_type}/reset")
    def reset_demo_service(service_type: ServiceType, who=actor):
        def save(state):
            reset_connection(state, service_type)
            record(state, "service_reset", service_type)
            return public(state, who)

        return mutate(who, save, owner_only=True)

    # --- Quotes: priced by the demo provider on the server; a quote is never a booking ----

    @router.post("/quotes")
    def quote(body: QuoteIn, who=actor):
        def save(state):
            result = create_quotes(state, body, apps(state))
            record(state, "quoted", result["request_id"])
            return result

        return mutate(who, save, owner_only=True)

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

    def quote_for_draft(state, draft, message, channel, appointment):
        """Turn an understood request into quotes. A quote is never a booking."""
        if draft.service == "ride":
            body = QuoteIn(
                service_type="RIDE",
                channel=channel,
                appointment_id=appointment["id"] if appointment else None,
                destination_text="" if appointment else draft.destination,
            )
            return create_quotes(state, body, apps(state))
        if draft.service == "food":
            if any(word in message.lower() for word in MEDICAL_DIET_WORDS):
                raise HTTPException(422, MEDICAL_DIET)
            profile = state["profile"]
            vegetarian = profile["vegetarian"] if draft.vegetarian is None else draft.vegetarian
            mild = profile["mild"] if draft.mild is None else draft.mild
            budget = profile["budget"] if draft.budget is None else draft.budget
            picks = suggest_meals(apps(state), vegetarian, mild, budget * 100)
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
                made = create_quotes(state, body, apps(state), group=group)
                group = made["request_id"]
                quotes += made["quotes"]
            quotes.sort(key=lambda quote: (quote["amount_minor"], quote["option_id"]))
            return {"request_id": group, "service_type": "FOOD", "quotes": quotes}
        products = match_products(f"{message} {draft.medicine}")
        if not products:
            raise HTTPException(409, PHARMACY_ONLY)
        body = QuoteIn(
            service_type="PHARMACY",
            channel=channel,
            items=[ItemRequest(item_id=product) for product in products[:MAX_LINES]],
        )
        return create_quotes(state, body, apps(state))

    def routed(conv_id, message, channel, draft, question, by, who, appointment=None):
        if looks_like_scam(message):
            draft, question = None, SCAM
        elif any(word in message.lower() for word in EMERGENCY_WORDS):
            draft, question = None, EMERGENCY
        service = draft.service if draft else None
        destination = appointment["place"] if appointment else (draft.destination if draft else "")

        def act(state):
            made, reply = None, (draft.clarification if draft else question)
            if draft and not draft.clarification:
                try:
                    made = quote_for_draft(state, draft, message, channel, appointment)
                except HTTPException as refusal:
                    if refusal.status_code not in {404, 409, 422}:
                        raise
                    reply = refusal.detail
            quotes = made["quotes"] if made else []
            if not quotes:
                summary = "More details needed"
            elif appointment:
                summary = f"Rides to {appointment['place']} for {appointment['title']}"
            elif service == "ride":
                summary = f"Rides to {quotes[0]['details']['destination']['label']}"
            elif service == "food":
                summary = "Meals that suit you"
            else:
                summary = "Sample pharmacy items"
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

        return mutate(who, act, owner_only=True)

    def next_appointment(state):
        now = time.time()
        upcoming = [
            a for a in state["appointments"] if now - 3600 < a["starts_at"] < now + 14 * 86400
        ]
        return min(upcoming, key=lambda a: a["starts_at"], default=None)

    @router.post("/ask")
    def ask(body: AssistantRequest, who=actor):
        """One sentence in, quotes to review out. Gemini if configured, else word matching."""
        profile, appointment = mutate(
            who, lambda state: (dict(state["profile"]), next_appointment(state)), owner_only=True
        )
        if appointment and mentions_appointment(body.message) and not looks_like_scam(body.message):
            # Saved appointment details beat guessing a destination from the sentence.
            draft = Draft(service="ride", destination=appointment["place"])
            return routed(
                body.id, body.message, body.channel, draft, "", "appointment", who, appointment
            )
        if gemini_configured():
            profile = mutate(who, ai_profile, owner_only=True)
            try:
                draft = draft_request(body.message, profile)
                return routed(body.id, body.message, body.channel, draft, "", "gemini", who)
            except HTTPException as failure:
                if failure.status_code != 502:
                    raise
        draft, question = understand(body.message, profile)
        return routed(body.id, body.message, body.channel, draft, question, "keywords", who)

    @router.post("/ask/voice")
    def ask_voice(body: VoiceRequest, who=actor):
        """A short WAV recording in; Gemini transcribes and routes it."""
        if not gemini_configured():
            raise HTTPException(503, "Gemini is not configured, so voice uses the browser.")
        try:
            audio = base64.b64decode(body.audio, validate=True)
        except binascii.Error:
            raise HTTPException(422, "Send the recording as base64 WAV audio.") from None
        if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
            raise HTTPException(422, "Send the recording as base64 WAV audio.")
        profile = mutate(who, ai_profile, owner_only=True)
        heard = hear_request(audio, body.mime_type, profile)
        transcript = heard.transcript.strip()
        if not transcript and not heard.clarification:
            heard.clarification = "Sorry, I could not hear that. Please try again."
        return routed(body.id, transcript, "voice", heard, "", "gemini", who)

    # --- Explicit confirmation, bookings and simulated payment ---------------------------

    @router.post("/quotes/{quote_id}/confirm")
    def confirm(quote_id: str, body: ConfirmIn, who=actor):
        """Checks ownership, expiry, connection and approval; one booking per retry key."""

        def save(state):
            booking, created = confirm_quote(state, quote_id, body, apps(state))
            if created:
                failed = booking["booking_status"] == "FAILED"
                record(state, "booking_failed" if failed else "owner_confirmed", booking["id"])
            return booking

        return mutate(who, save, owner_only=True)

    @router.get("/bookings")
    def bookings(who=actor):
        return mutate(who, lambda state: state["activity"], owner_only=True)

    @router.get("/bookings/{booking_id}")
    def booking(booking_id: str, who=actor):
        return mutate(who, lambda state: find_booking(state, booking_id), owner_only=True)

    @router.post("/bookings/{booking_id}/cancel")
    def cancel_booking(booking_id: str, who=actor):
        def save(state):
            booking = cancel(state, booking_id)
            record(state, "owner_cancel", booking_id)
            return booking

        return mutate(who, save, owner_only=True)

    @router.post("/bookings/{booking_id}/decision")
    def decision(booking_id: str, body: DecisionIn, who=actor):
        if who["role"] != "caregiver":
            raise HTTPException(403, "Approvals come from someone in your Care Circle.")

        def save(state):
            need(who, "approve")
            grant = who["grant_record"]
            booking, changed = decide(state, booking_id, body, grant)
            if changed:
                record(state, f"caregiver_{body.action}", booking_id, grant["name"])
            # The approver gets their own view back, never the owner's private fields.
            return activity_for_circle(booking, set(grant["permissions"]) | {"view_medication"})

        return mutate(who, save)

    @router.put("/bookings/{booking_id}/sharing")
    def share(booking_id: str, body: ShareUpdate, who=actor):
        def save(state):
            booking = find_booking(state, booking_id)
            booking["shared"] = body.shared
            record(state, "sharing_changed", booking_id)
            return booking

        return mutate(who, save, owner_only=True)

    @router.post("/bookings/{booking_id}/complete")
    def complete_booking(booking_id: str, who=actor):
        """Demo control: the simulated trip or delivery finished. Payment is unchanged."""
        if not demo_controls:
            raise HTTPException(404, "Not available.")

        def save(state):
            booking = complete(state, booking_id)
            record(state, "demo_completed", booking_id)
            return booking

        return mutate(who, save, owner_only=True)

    @router.post("/bookings/{booking_id}/payment/complete")
    def settle_payment(booking_id: str, who=actor):
        """Demo control: mark a pay-on-completion simulated payment as paid."""
        if not demo_controls:
            raise HTTPException(404, "Not available.")

        def save(state):
            booking = settle(state, booking_id)
            record(state, "demo_payment_completed", booking_id)
            return booking

        return mutate(who, save, owner_only=True)

    # --- One activity timeline: the owner sees all of it, a caretaker only what is shared --

    @router.get("/activities")
    def activities(who=actor):
        def read(state):
            if who["role"] == "owner":
                return state["events"]
            return visible_events(state, set(who["grant_record"]["permissions"]))

        return mutate(who, read)

    @router.get("/care-circle/activities")
    def circle_activities(who=actor):
        if who["role"] != "caregiver":
            raise HTTPException(403, "This list is for people in a Care Circle.")

        def read(state):
            view = circle_view(
                state, who["grant_record"], storage=store.mode, catalogue=apps_catalogue()
            )
            return {"events": view["events"], "bookings": view["activity"]}

        return mutate(who, read)

    def find(collection, item_id, what):
        item = next((entry for entry in collection if entry["id"] == item_id), None)
        if not item:
            raise HTTPException(404, f"That {what} is no longer saved.")
        return item

    def plan_permission(who, kind="appointment"):
        need(who, "manage_reminders")
        if kind == "medicine":
            need(who, "view_medication")

    @router.post("/appointments")
    def add_appointment(body: AppointmentIn, who=actor):
        def save(state):
            plan_permission(who)
            appointment = {
                "id": uuid4().hex[:12],
                **body.model_dump(),
                "ride_request_id": None,
                "created_by": actor_name(who),
                "created_at": time.time(),
            }
            state["appointments"].append(appointment)
            state["appointments"].sort(key=lambda a: a["starts_at"])
            add_event(
                state,
                "appointment_added",
                f"Appointment added: {body.title}",
                f"At {body.place}. Added by {actor_name(who)}.",
                topic="appointments",
                actor=actor_name(who),
            )
            record(state, "appointment_added", appointment["id"], actor_name(who))
            return appointment

        return mutate(who, save)

    @router.put("/appointments/{appointment_id}")
    def edit_appointment(appointment_id: str, body: AppointmentIn, who=actor):
        def save(state):
            plan_permission(who)
            appointment = find(state["appointments"], appointment_id, "appointment")
            appointment.update(body.model_dump())
            state["appointments"].sort(key=lambda a: a["starts_at"])
            add_event(
                state,
                "appointment_changed",
                f"Appointment changed: {body.title}",
                f"Changed by {actor_name(who)}.",
                topic="appointments",
                actor=actor_name(who),
            )
            record(state, "appointment_changed", appointment_id, actor_name(who))
            return appointment

        return mutate(who, save)

    @router.delete("/appointments/{appointment_id}")
    def remove_appointment(appointment_id: str, who=actor):
        def save(state):
            plan_permission(who)
            appointment = find(state["appointments"], appointment_id, "appointment")
            state["appointments"].remove(appointment)
            record(state, "appointment_removed", appointment_id, actor_name(who))
            return {"ok": True}

        return mutate(who, save)

    @router.post("/reminders")
    def add_reminder(body: ReminderIn, who=actor):
        def save(state):
            plan_permission(who, body.kind)
            reminder = {
                "id": uuid4().hex[:12],
                **body.model_dump(),
                "done_at": None,
                "created_by": actor_name(who),
                "created_at": time.time(),
            }
            state["reminders"].append(reminder)
            state["reminders"].sort(key=lambda r: r["due_at"])
            record(state, "reminder_added", reminder["id"], actor_name(who))
            return reminder_view(reminder)

        return mutate(who, save)

    @router.put("/reminders/{reminder_id}")
    def edit_reminder(reminder_id: str, body: ReminderIn, who=actor):
        def save(state):
            reminder = find(state["reminders"], reminder_id, "reminder")
            plan_permission(who, reminder["kind"])
            plan_permission(who, body.kind)
            reminder.update(body.model_dump())
            state["reminders"].sort(key=lambda r: r["due_at"])
            record(state, "reminder_changed", reminder_id, actor_name(who))
            return reminder_view(reminder)

        return mutate(who, save)

    @router.delete("/reminders/{reminder_id}")
    def remove_reminder(reminder_id: str, who=actor):
        def save(state):
            reminder = find(state["reminders"], reminder_id, "reminder")
            plan_permission(who, reminder["kind"])
            state["reminders"].remove(reminder)
            record(state, "reminder_removed", reminder_id, actor_name(who))
            return {"ok": True}

        return mutate(who, save)

    @router.post("/reminders/{reminder_id}/done")
    def reminder_done(reminder_id: str, who=actor):
        """The owner says they have dealt with it. Not proof a medicine was taken."""

        def save(state):
            reminder = find(state["reminders"], reminder_id, "reminder")
            reminder["done_at"] = reminder["done_at"] or time.time()
            record(state, "reminder_done", reminder_id)
            return reminder_view(reminder)

        return mutate(who, save, owner_only=True)

    @router.post("/contacts")
    def add_contact(body: ContactIn, who=actor):
        def save(state):
            need(who, "manage_contacts")
            if len(state["contacts"]) >= 5:
                raise HTTPException(409, "Keep up to five trusted contacts.")
            if body.primary:
                for contact in state["contacts"]:
                    contact["primary"] = False
            contact = {"id": uuid4().hex[:12], **body.model_dump(), "added_by": actor_name(who)}
            state["contacts"].append(contact)
            add_event(
                state,
                "contacts_changed",
                f"Trusted contact added: {body.name}",
                f"Added by {actor_name(who)}.",
                permission="manage_contacts",
                actor=actor_name(who),
            )
            record(state, "contact_added", contact["id"], actor_name(who))
            return contact

        return mutate(who, save)

    @router.delete("/contacts/{contact_id}")
    def remove_contact(contact_id: str, who=actor):
        def save(state):
            need(who, "manage_contacts")
            contact = find(state["contacts"], contact_id, "contact")
            state["contacts"].remove(contact)
            add_event(
                state,
                "contacts_changed",
                f"Trusted contact removed: {contact['name']}",
                f"Removed by {actor_name(who)}.",
                permission="manage_contacts",
                actor=actor_name(who),
            )
            record(state, "contact_removed", contact_id, actor_name(who))
            return {"ok": True}

        return mutate(who, save)

    @router.post("/help")
    def ask_for_help(body: HelpIn, who=actor):
        """The older adult chooses to tell their Care Circle; nothing is assumed or committed."""

        def save(state):
            name = state["profile"]["name"]
            if body.kind == "accompany":
                appointment = find(state["appointments"], body.appointment_id or "", "appointment")
                title = f"{name} asked if someone can come to {appointment['title']}"
                detail = body.note or "No one has agreed yet. Reply to them directly."
            else:
                title = f"{name} asked for help"
                detail = body.note or "Please check in with them."
            event = add_event(
                state,
                "help_requested",
                title,
                detail,
                permission="receive_alerts",
                severity="attention",
                actor=name,
            )
            remember(
                state,
                event["id"],
                "app",
                body.note or title,
                "Your Care Circle was told.",
                safety="help",
            )
            record(state, "help_requested", event["id"])
            return event

        return mutate(who, save, owner_only=True)

    @router.post("/events/{event_id}/resolve")
    def resolve(event_id: str, body: ResolveIn, who=actor):
        def save(state):
            if who["role"] == "owner":
                pool = state["events"]
            else:
                need(who, "receive_alerts")
                pool = visible_events(state, set(who["grant_record"]["permissions"]))
            event = find(pool, event_id, "alert")
            if event["status"] != "open":
                return event
            event.update(
                status="resolved",
                resolved_by=actor_name(who),
                resolved_at=time.time(),
                resolution=body.note,
            )
            record(state, "alert_resolved", event_id, actor_name(who))
            return event

        return mutate(who, save)

    def conversation_for(state, who, conversation_id, permission):
        conv = find(state["conversations"], conversation_id, "conversation")
        if who["role"] != "owner":
            need(who, permission)
            perms = set(who["grant_record"]["permissions"]) | {"view_summaries"}
            if not conversation_visible(conv, state, perms):
                raise HTTPException(404, "That conversation is not shared with you.")
        return conv

    @router.get("/conversations/{conversation_id}/transcript")
    def transcript(conversation_id: str, who=actor):
        def read(state):
            conv = conversation_for(state, who, conversation_id, "view_transcripts")
            record(state, "transcript_viewed", conversation_id, actor_name(who))
            return {"id": conv["id"], "transcript": conv["transcript"]}

        return mutate(who, read)

    @router.post("/conversations/{conversation_id}/summary")
    def ai_summary(conversation_id: str, who=actor):
        """Gemini rewrites the summary; confirmed actions still come only from records."""
        if not gemini_configured():
            raise HTTPException(503, "Gemini is not configured. The automatic summary is shown.")

        def prepare(state):
            conv = conversation_for(state, who, conversation_id, "view_summaries")
            ai_profile(state)
            return conv["transcript"], summarise(conv, state)["confirmed"]

        lines, confirmed = mutate(who, prepare)
        drafted = summarise_conversation(lines, confirmed)

        def store_summary(state):
            conv = find(state["conversations"], conversation_id, "conversation")
            conv["ai_summary"] = {
                "text": drafted.text,
                "suggestions": drafted.suggestions,
                "at": time.time(),
            }
            perms = None if who["role"] == "owner" else set(who["grant_record"]["permissions"])
            return conversation_view(conv, state, perms)

        return mutate(who, store_summary)

    @router.post("/demo/seed")
    def demo_seed(response: Response, who=actor):
        """Demo control: replace this account with Meera's scripted demo and fresh invites."""
        if not demo_controls:
            raise HTTPException(404, "Not available.")
        who["demo"] = True

        def load(state):
            state.clear()
            state.update(ensure(initial_state()))
            grants = seed(state)
            invites = [
                {"name": g["name"], "role": g["role"], "code": invite_code(who["owner"], g)}
                for g in grants
            ]
            record(state, "demo_seeded")
            return {"state": public(state, who), "invites": invites}

        result = mutate(who, load, owner_only=True)
        cookie(response, who)
        return result

    @router.post("/demo/switch")
    def demo_switch(body: SwitchIn, response: Response, who=actor):
        """Demo control: one browser plays each person in the demo it loaded, one at a time."""
        if not demo_controls:
            raise HTTPException(404, "Not available.")
        if not who.get("demo"):
            raise HTTPException(
                403, "Switching people only works in a demo loaded in this browser."
            )
        target = {"owner": who["owner"], "expires": time.time() + 86400, "demo": True}

        def switch(state):
            if body.to == "owner":
                target["role"] = "owner"
            else:
                grant = next((g for g in state["care_circle"] if g["id"] == body.to), None)
                if not grant or grant["status"] == "revoked":
                    raise HTTPException(404, "That person is not in the Care Circle.")
                if grant["status"] == "invited":
                    grant.update(status="active", joined_at=time.time())
                    record(state, "caregiver_linked", grant["id"], grant["name"])
                target.update(role="caregiver", grant=grant["id"], grant_record=grant)
            name = target["grant_record"]["name"] if "grant_record" in target else "owner"
            record(state, "demo_switched", "", name)
            return public(state, target)

        # The demo flag proves this browser loaded the demo, so it may leave a removed person too.
        result = mutate({"owner": who["owner"], "role": "owner"}, switch)
        cookie(response, target)
        return result

    @router.post("/demo/fail-next")
    def fail_next(who=actor):
        """Demo control: the next confirmed booking fails, so the failure path can be shown."""
        if not demo_controls:
            raise HTTPException(404, "Not available.")

        def arm(state):
            state["demo"]["fail_next"] = True
            record(state, "demo_fail_next")
            return {"fail_next": True}

        return mutate(who, arm, owner_only=True)

    def invite_code(owner, grant):
        token = secrets.token_hex(16)
        expires = time.time() + 86400
        grant["invite"] = {"hash": hashlib.sha256(token.encode()).hexdigest(), "expires": expires}
        return sign({"owner": owner, "grant": grant["id"], "token": token, "expires": expires})

    def summary(grant):
        return {key: value for key, value in grant.items() if key != "invite"}

    def may_manage(who, role, extras):
        """Administrators may add viewers and assistants with ordinary permissions only."""
        if who["role"] == "owner":
            return
        need(who, "manage_circle")
        if role not in {"viewer", "assistant"} or set(extras) & (
            SENSITIVE | {"approve", "manage_circle"}
        ):
            raise HTTPException(
                403, "Only the account owner can give approval, admin or sensitive permissions."
            )

    @router.post("/care-circle")
    def add_person(body: GrantRequest, who=actor):
        def save(state):
            may_manage(who, body.role, body.extras)
            live = [g for g in state["care_circle"] if g["status"] != "revoked"]
            if len(live) >= 6:
                raise HTTPException(409, "A Care Circle can have up to six people.")
            grant = new_grant(body.name, body.relationship, body.role, body.extras, actor_name(who))
            state["care_circle"].append(grant)
            code = invite_code(who["owner"], grant)
            add_event(
                state,
                "circle_invited",
                f"{body.name} was invited as {ROLE_NAMES[body.role]}",
                permission="manage_circle",
                actor=actor_name(who),
            )
            record(state, "circle_invited", grant["id"], actor_name(who))
            return {"grant": summary(grant), "code": code}

        return mutate(who, save)

    @router.post("/care-circle/{grant_id}/invite")
    def reinvite(grant_id: str, who=actor):
        def save(state):
            grant = next((g for g in state["care_circle"] if g["id"] == grant_id), None)
            if not grant or grant["status"] == "revoked":
                raise HTTPException(404, "That person is not in your Care Circle.")
            may_manage(who, grant["role"], grant["permissions"])
            return {"grant": summary(grant), "code": invite_code(who["owner"], grant)}

        return mutate(who, save)

    @router.put("/care-circle/{grant_id}")
    def change_access(grant_id: str, body: GrantUpdate, who=actor):
        def save(state):
            grant = next((g for g in state["care_circle"] if g["id"] == grant_id), None)
            if not grant or grant["status"] == "revoked":
                raise HTTPException(404, "That person is not in your Care Circle.")
            grant["role"] = body.role
            grant["permissions"] = permissions_for(body.role, body.extras)
            add_event(
                state,
                "circle_changed",
                f"Access changed for {grant['name']}",
                ", ".join(PERMISSIONS[p] for p in grant["permissions"]),
                permission="manage_circle",
            )
            record(state, "circle_changed", grant_id)
            return summary(grant)

        return mutate(who, save, owner_only=True)

    @router.delete("/care-circle/{grant_id}")
    def remove_person(grant_id: str, who=actor):
        def save(state):
            grant = next((g for g in state["care_circle"] if g["id"] == grant_id), None)
            if not grant or grant["status"] == "revoked":
                raise HTTPException(404, "That person is not in your Care Circle.")
            if who["role"] != "owner":
                may_manage(who, grant["role"], grant["permissions"])
            grant.update(status="revoked", invite=None, revoked_at=time.time())
            add_event(
                state,
                "circle_removed",
                f"{grant['name']} no longer has access",
                permission="manage_circle",
                actor=actor_name(who),
            )
            record(state, "circle_removed", grant_id, actor_name(who))
            return summary(grant)

        return mutate(who, save)

    @router.post("/caregiver/invite")
    def invite(who=actor):
        """Earlier single-caregiver flow: one approver, named in the profile."""

        def save(state):
            name = state["profile"]["caregiver_name"] or "Caregiver"
            grant = new_grant(name, "", "approver", [], "owner")
            state["care_circle"].append(grant)
            record(state, "circle_invited", grant["id"])
            return {"code": invite_code(who["owner"], grant), "grant": summary(grant)}

        return mutate(who, save, True)

    @router.post("/caregiver/join")
    def join(body: Join, response: Response):
        data = decode(body.code)
        if "token" not in data or "grant" not in data:
            raise HTTPException(400, "Use a Care Circle invitation code.")

        def accept(state):
            ensure(state)
            grant = next((g for g in state["care_circle"] if g["id"] == data["grant"]), None)
            invite = grant and grant["invite"]
            if (
                not invite
                or grant["status"] == "revoked"
                or invite["expires"] < time.time()
                or not hmac.compare_digest(
                    invite["hash"], hashlib.sha256(data["token"].encode()).hexdigest()
                )
            ):
                raise HTTPException(403, "Invitation expired or already used.")
            grant.update(status="active", invite=None, joined_at=time.time())
            who = {
                "owner": data["owner"],
                "role": "caregiver",
                "grant": grant["id"],
                "grant_record": grant,
                "expires": time.time() + 86400,
            }
            add_event(
                state,
                "circle_joined",
                f"{grant['name']} joined the Care Circle",
                permission="manage_circle",
                actor=grant["name"],
            )
            record(state, "caregiver_linked", grant["id"], grant["name"])
            return who, public(state, who)

        who, result = store.change(data["owner"], accept)
        who.pop("grant_record")
        cookie(response, who)
        return result

    @router.delete("/caregiver")
    def revoke(who=actor):
        def remove(state):
            for grant in state["care_circle"]:
                if grant["status"] != "revoked":
                    grant.update(status="revoked", invite=None, revoked_at=time.time())
            record(state, "caregiver_revoked")
            return public(state, who)

        return mutate(who, remove, True)

    @router.delete("/data")
    def reset(who=actor):
        def clear(state):
            state.clear()
            state.update(ensure(initial_state()))
            return public(state, who)

        return mutate(who, clear, True)

    return router
