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

from app.assistant import Draft, choose_offer, draft_request, hear_request, summarise_conversation
from app.assistant import configured as gemini_configured
from app.bookings import (
    AUTO_BOOK,
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
    lets_saathi_book,
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
from app.config import PhoneSettings, Settings
from app.conversation import ConversationEngine, Turn, new_session
from app.domain import PAYMENT_METHODS, PaymentMethod, ServiceType
from app.hub_store import HubStore, initial_state
from app.intent import looks_like_scam, mentions_appointment, understand
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
from app.phone import PhoneService
from app.providers import APP_IDS, apps_catalogue, enabled_apps
from app.seed import SAMPLE_PLACES, seed
from app.telephony import twilio_router
from app.workflows import ai_profile, next_appointment, record, remember


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
    # False is the owner's standing choice: Saathi picks the best ride or meal and books it.
    show_options: bool = True

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


class DemoResetIn(BaseModel):
    """fresh: an empty profile that starts at setup. meera: Meera's finished setup and history."""

    model_config = ConfigDict(extra="forbid")
    scenario: Literal["fresh", "meera"]
    confirm: Literal[True]


class AssistantRequest(BaseModel):
    id: UUID
    message: str = Field(min_length=3, max_length=1000)
    channel: Literal["app", "message", "voice"] = "app"


class PairingCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    retain_transcript: bool = False


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


def hub_router(config: Settings):
    router = APIRouter(prefix="/api/hub")
    store = HubStore(config)
    engine = ConversationEngine()
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
    phone_config = PhoneSettings()
    phone = PhoneService(
        store,
        key,
        max_calls=phone_config.max_calls,
        duration=phone_config.max_duration,
        max_turns=phone_config.max_turns,
    )

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
                "demo_controls": demo_controls,
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
            "phone": {"enabled": phone_config.enabled, "number": phone_config.number},
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

        return book_pick(
            who, ai_pick(who, mutate(who, save, owner_only=True)), body.idempotency_key
        )

    def book_pick(who, result, key):
        """For an owner who lets Saathi book: book Saathi's pick, or the one option asked for."""
        quotes = result["quotes"]
        pick = next((q for q in quotes if q.get("recommended")), None)
        pick = pick or (quotes[0] if len(quotes) == 1 else None)
        if not pick or not key or pick["service_type"] not in AUTO_BOOK:
            return result

        def save(state):
            if not lets_saathi_book(state):
                return None
            earlier = next((b for b in state["activity"] if b.get("idempotency_key") == key), None)
            if earlier:
                return earlier
            confirmed = ConfirmIn(idempotency_key=key, confirmed=True)
            booking, _ = confirm_quote(state, pick["id"], confirmed, apps(state))
            booking["chosen_by"] = pick.get("recommended")
            failed = booking["booking_status"] == "FAILED"
            record(state, "booking_failed" if failed else "auto_booked", booking["id"])
            return booking

        booking = mutate(who, save, owner_only=True)
        return {**result, "booking": booking} if booking else result

    def ai_pick(who, result):
        """With a Gemini key, Gemini re-weighs Saathi's pick; otherwise the rule's pick stands."""
        quotes = result["quotes"]
        if not gemini_configured() or len(quotes) < 2:
            return result
        if not any(q.get("recommended") for q in quotes):
            return result
        try:
            mutate(who, ai_profile, owner_only=True)
            pick = choose_offer(quotes)
        except HTTPException:
            return result
        if pick.choice > len(quotes):
            return result
        chosen = quotes[pick.choice - 1]
        mark = {"reason": pick.reason, "by": "gemini"}
        for offered in quotes:
            offered["recommended"] = mark if offered is chosen else None
        marks = {offered["id"]: offered["recommended"] for offered in quotes}

        def save(state):
            for stored in state["quotes"]:
                if stored["id"] in marks:
                    stored["recommended"] = marks[stored["id"]]

        mutate(who, save, owner_only=True)
        return result

    def routed(conv_id, message, channel, draft, question, by, who, appointment=None):
        def act(state):
            return engine.app_request(
                state, conv_id, message, channel, draft, question, by, appointment
            )

        return book_pick(who, ai_pick(who, mutate(who, act, owner_only=True)), f"ask-{conv_id}")

    @router.post("/conversation-sessions")
    def start_conversation(who=actor):
        def save(state):
            sessions = state.setdefault("dialogues", {})
            if len(sessions) >= 20:
                sessions.pop(next(iter(sessions)))
            session = new_session("app", language=state["profile"]["language"])
            sessions[session["id"]] = session
            return engine.view(session)

        return mutate(who, save, owner_only=True)

    @router.post("/phone/pairing-codes")
    def pairing_code(body: PairingCodeIn, who=actor):
        mutate(who, lambda state: None, owner_only=True)
        return phone.create_code(who["owner"], retain_transcript=body.retain_transcript)

    @router.get("/phone/sessions/{session_id}")
    def phone_session(session_id: str, who=actor):
        if who["role"] != "owner":
            raise HTTPException(403, "Only the account owner can read phone sessions.")
        return phone.read(session_id, owner=who["owner"])

    @router.post("/conversation-sessions/{session_id}/turns")
    def conversation_turn(session_id: str, body: Turn, who=actor):
        def save(state):
            session = state.get("dialogues", {}).get(session_id)
            if not session:
                raise HTTPException(404, "Conversation not found.")
            return engine.process(state, session, body)

        return mutate(who, save, owner_only=True)

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

    @router.post("/demo/reset")
    def demo_reset(body: DemoResetIn, response: Response, who=actor):
        """Demo control: replace this account's data with a known starting point.

        Needs confirm=true, so a stray request cannot wipe a demo. Meera's scenario also
        returns fresh one-use invitations for Asha and Ravi.
        """
        if not demo_controls:
            raise HTTPException(404, "Not available.")
        who["demo"] = True

        def load(state):
            state.clear()
            state.update(ensure(initial_state()))
            invites = []
            if body.scenario == "meera":
                invites = [
                    {"name": g["name"], "role": g["role"], "code": invite_code(who["owner"], g)}
                    for g in seed(state)
                ]
            record(state, f"demo_reset_{body.scenario}")
            return {"scenario": body.scenario, "state": public(state, who), "invites": invites}

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

    combined = APIRouter()
    combined.include_router(router)
    combined.include_router(twilio_router(phone, phone_config))
    return combined
