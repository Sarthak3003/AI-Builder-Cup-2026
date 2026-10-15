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
from app.care import (
    NOT_CHARGED,
    PAID,
    PENDING,
    PERMISSIONS,
    ROLE_NAMES,
    ROLES,
    SENSITIVE,
    active_grant,
    actor_name,
    add_event,
    circle_view,
    conversation_view,
    conversation_visible,
    ensure,
    need,
    new_grant,
    payment,
    permissions_for,
    reminder_view,
    summarise,
    visible_events,
)
from app.config import Settings
from app.domain import PaymentMethod
from app.hub_store import HubStore, initial_state
from app.intent import (
    EMERGENCY,
    EMERGENCY_WORDS,
    SCAM,
    looks_like_scam,
    mentions_appointment,
    understand,
)
from app.providers import (
    NONE_ENABLED,
    PROVIDER_IDS,
    available,
    catalogue,
    enabled_ids,
    food_options,
    medicine_options,
    ride_options,
)
from app.seed import seed


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
    home: str = Field(default="Demo home", min_length=1, max_length=150)
    caregiver_name: str = Field(default="", max_length=60)
    approval_limit: int = Field(default=150, ge=0, le=10000)
    caregiver_enabled: bool = False
    medicines: list[str] = Field(default_factory=list, max_length=10)
    enabled_providers: list[str] = Field(
        default_factory=lambda: list(PROVIDER_IDS), max_length=len(PROVIDER_IDS)
    )
    sharing: Sharing = Field(default_factory=Sharing)
    channel: Literal["app", "voice", "message"] = "app"
    read_aloud: bool = False
    offer_help: bool = True
    payment_method: PaymentMethod | None = None

    @field_validator("enabled_providers")
    @classmethod
    def known_unique_apps(cls, value):
        if len(set(value)) != len(value) or any(item not in PROVIDER_IDS for item in value):
            raise ValueError("Choose each listed app at most once.")
        return value


class ServiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: UUID
    service: Literal["food", "ride", "medicine"]
    channel: Literal["app", "message", "voice"] = "app"
    message: str = Field(default="", max_length=1000)
    destination: str = Field(default="", max_length=150)
    medicine: str = Field(default="", max_length=80)
    budget: int | None = Field(default=None, ge=0, le=10000)
    vegetarian: bool | None = None
    mild: bool | None = None
    appointment_id: str | None = Field(default=None, max_length=40)


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


class Confirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    option_id: str = Field(max_length=60)
    confirmed: Literal[True]


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal["approve", "reject", "ask"]
    note: str = Field(default="", max_length=300)


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

    def public(state, who):
        if who["role"] == "caregiver":
            return {
                **circle_view(
                    state, who["grant_record"], storage=store.mode, catalogue=catalogue()
                ),
                **people(state, who),
            }
        profile = {**state["profile"], "enabled_providers": enabled_ids(state["profile"])}
        return {
            **people(state, who),
            "profile": profile,
            "activity": state["activity"],
            "messages": state["messages"],
            "audit": state["audit"],
            "requests": state["requests"],
            "care_circle": [
                {key: value for key, value in grant.items() if key != "invite"}
                for grant in state["care_circle"]
            ],
            "events": state["events"],
            "appointments": state["appointments"],
            "reminders": [reminder_view(r) for r in state["reminders"]],
            "contacts": state["contacts"],
            "conversations": [conversation_view(c, state) for c in state["conversations"]],
            "permissions": PERMISSIONS,
            "roles": {role: ROLES[role] for role in ROLES},
            "sensitive": sorted(SENSITIVE),
            "demo_controls": demo_controls,
            "role": who["role"],
            "storage": store.mode,
            "mode": "offline-demo",
            "providers": "simulated",
            "catalogue": catalogue(),
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
            record(state, "profile_updated")
            return public(state, who)

        return mutate(who, save, owner_only=True)

    @router.put("/profile/home")
    def change_home(body: HomeIn, who=actor):
        """Assistants may fix the pickup address; every other setting stays with the owner."""

        def save(state):
            need(who, "edit_profile")
            state["profile"]["home"] = body.home
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

    @router.post("/requests")
    def create(body: ServiceRequest, who=actor):
        def propose(state):
            request_id = str(body.id)
            payload = body.model_dump(mode="json")
            for old in state["requests"]:
                if old["id"] == request_id:
                    if old["input"] != payload:
                        raise HTTPException(409, "Use a new request ID when changing the request.")
                    return old
            if len(state["requests"]) >= 100:
                raise HTTPException(409, "Demo history is full. Export it and reset this demo.")
            profile = dict(state["profile"])
            if body.vegetarian is not None:
                profile["vegetarian"] = body.vegetarian
            if body.mild is not None:
                profile["mild"] = body.mild
            budget = body.budget if body.budget is not None else profile["budget"]
            enabled = enabled_ids(profile)
            options = []
            clarification = ""
            message = body.message.lower()
            appointment = None
            if body.appointment_id:
                appointment = next(
                    (a for a in state["appointments"] if a["id"] == body.appointment_id), None
                )
                if not appointment:
                    raise HTTPException(404, "That appointment is no longer saved.")
            destination = body.destination or (appointment["place"] if appointment else "")
            if any(word in message for word in EMERGENCY_WORDS):
                clarification = EMERGENCY
            elif looks_like_scam(body.message):
                clarification = SCAM
            elif not available(body.service, enabled):
                clarification = NONE_ENABLED[body.service]
            elif body.service == "food":
                if any(word in message for word in ["allerg", "diabet", "एलर्जी"]):
                    clarification = "Demo meals cannot verify medical diets or allergens."
                else:
                    options = food_options(enabled, profile["vegetarian"], profile["mild"], budget)
            elif body.service == "ride":
                if not destination:
                    clarification = "Enter a destination before comparing demo rides."
                else:
                    options = ride_options(enabled, profile["home"], destination)
            elif body.medicine not in profile["medicines"]:
                clarification = "Choose a medicine label already saved in your profile."
            else:
                options = medicine_options(enabled, body.medicine)
            options = [option for option in options if option["price"] <= budget]
            if not options and not clarification:
                clarification = "No demo options fit your budget. Adjust it and try again."
            proposal = {
                "id": request_id,
                "input": payload,
                "service": body.service,
                "channel": body.channel,
                "options": options,
                "clarification": clarification,
                "summary": f"{body.service.title()} options within ₹{budget}",
                "created_at": time.time(),
                "expires_at": time.time() + 900,
                "status": "proposed" if options else "needs_details",
            }
            if appointment and body.service == "ride":
                proposal["appointment_id"] = appointment["id"]
                proposal["summary"] = f"Rides to {appointment['place']} for {appointment['title']}"
            state["requests"].append(proposal)
            remember(
                state,
                request_id,
                body.channel,
                body.message or f"Help with {body.service}",
                clarification or proposal["summary"],
                service=body.service,
                request_id=request_id,
                destination=destination if body.service == "ride" else "",
                medicine=body.medicine if body.service == "medicine" else "",
                options=len(options),
                safety="suspected_scam" if clarification == SCAM else None,
            )
            record(state, "options_proposed", request_id)
            return proposal

        return mutate(who, propose, owner_only=True)

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

    @router.post("/assistant")
    def assistant(body: AssistantRequest, who=actor):
        profile = mutate(who, ai_profile, True)
        draft = draft_request(body.message, profile)
        if draft.clarification:
            return {
                "id": str(body.id),
                "service": draft.service,
                "channel": body.channel,
                "summary": "More details needed",
                "clarification": draft.clarification,
                "options": [],
                "status": "needs_details",
                "expires_at": time.time(),
            }
        return create(
            ServiceRequest(
                id=body.id,
                message=body.message,
                channel=body.channel,
                **draft.model_dump(exclude={"clarification"}),
            ),
            who,
        )

    def routed(request_id, message, channel, draft, question, by, who, appointment=None):
        if looks_like_scam(message):
            draft, question = None, SCAM
        if draft is None or draft.clarification:
            reply = draft.clarification if draft else question
            service = draft.service if draft else None

            def note(state):
                remember(
                    state,
                    str(request_id),
                    channel,
                    message or "(nothing heard)",
                    reply,
                    service=service,
                    safety="suspected_scam" if reply == SCAM else None,
                )

            mutate(who, note, owner_only=True)
            return {
                "id": str(request_id),
                "service": service,
                "channel": channel,
                "summary": "More details needed",
                "clarification": reply,
                "options": [],
                "status": "needs_details",
                "expires_at": time.time(),
                "understood_by": by,
                "transcript": message,
            }
        fields = {"service", "destination", "medicine", "budget", "vegetarian", "mild"}
        request = ServiceRequest(
            id=request_id,
            message=message,
            channel=channel,
            appointment_id=appointment["id"] if appointment else None,
            **draft.model_dump(include=fields),
        )
        return {**create(request, who), "understood_by": by, "transcript": message}

    def next_appointment(state):
        now = time.time()
        upcoming = [
            a for a in state["appointments"] if now - 3600 < a["starts_at"] < now + 14 * 86400
        ]
        return min(upcoming, key=lambda a: a["starts_at"], default=None)

    @router.post("/ask")
    def ask(body: AssistantRequest, who=actor):
        """One sentence in, a routed request out. Gemini if configured, else word matching."""
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

    @router.post("/requests/{request_id}/confirm")
    def confirm(request_id: UUID, body: Confirm, who=actor):
        def save(state):
            rid = str(request_id)
            existing = next((order for order in state["activity"] if order["id"] == rid), None)
            if existing:
                if existing["option"]["id"] != body.option_id:
                    raise HTTPException(409, "This request already has a selected option.")
                return existing
            proposal = next((item for item in state["requests"] if item["id"] == rid), None)
            if not proposal:
                raise HTTPException(404, "Request not found.")
            if proposal["expires_at"] < time.time():
                raise HTTPException(409, "These options expired. Start a new request.")
            option = next(
                (item for item in proposal["options"] if item["id"] == body.option_id), None
            )
            if not option:
                raise HTTPException(400, "Choose an offered option.")
            p = state["profile"]
            if option.get("provider") and option["provider"] not in enabled_ids(p):
                raise HTTPException(
                    409, "That app is turned off in Apps. Turn it on or start again."
                )
            reason = ""
            if p["caregiver_enabled"] and proposal["service"] == "medicine":
                reason = "Medicine requests need approval."
            elif p["caregiver_enabled"] and option["price"] > p["approval_limit"]:
                reason = f"Above the ₹{p['approval_limit']} approval limit."
            failed = state["demo"].get("fail_next", False)
            state["demo"]["fail_next"] = False
            status = (
                "failed" if failed else "awaiting_approval" if reason else "simulated_confirmed"
            )
            order = {
                "id": rid,
                "service": proposal["service"],
                "channel": proposal["channel"],
                "option": option,
                "reference": f"SIM-{rid[:8].upper()}",
                "simulated": True,
                "status": status,
                "payment": payment(
                    option["price"], PENDING if status == "simulated_confirmed" else NOT_CHARGED
                ),
                "shared": p["sharing"].get(proposal["service"], True),
                "approval_reason": reason,
                "appointment_id": proposal.get("appointment_id"),
                "decision": None,
                "questions": [],
                "failure": "Simulated provider failure: nothing was booked or charged."
                if failed
                else "",
                "created_at": time.time(),
            }
            state["activity"].insert(0, order)
            proposal["status"] = order["status"]
            label = f"{option['name']} with {option.get('provider_name') or 'Saathi'}"
            if failed:
                add_event(
                    state,
                    "booking_failed",
                    f"Booking failed: {label}",
                    "Simulated failure. Nothing was booked or charged.",
                    permission="receive_alerts",
                    ref=rid,
                    severity="attention",
                )
            elif reason:
                approvers = [
                    g
                    for g in state["care_circle"]
                    if g["status"] == "active" and "approve" in g["permissions"]
                ]
                add_event(
                    state,
                    "approval_needed",
                    f"Approval needed: {label}",
                    reason if approvers else f"{reason} No one in the Care Circle can approve yet.",
                    permission="approve",
                    ref=rid,
                    severity="attention",
                )
            else:
                add_event(state, "booked", f"Booked (simulated): {label}", ref=rid)
            linked = next(
                (a for a in state["appointments"] if a["id"] == order["appointment_id"]), None
            )
            if linked and not failed:
                linked["ride_request_id"] = rid
                waiting = status == "awaiting_approval"
                add_event(
                    state,
                    "appointment_ride",
                    f"Ride for {linked['title']} is waiting for approval"
                    if waiting
                    else f"Ride arranged for {linked['title']}",
                    f"{label} to {linked['place']}. Simulated: no real driver will come.",
                    ref=rid,
                    topic="appointments",
                )
            record(state, "booking_failed" if failed else "owner_confirmed", rid)
            return order

        return mutate(who, save, owner_only=True)

    def find_order(state, rid):
        order = next((item for item in state["activity"] if item["id"] == rid), None)
        if not order:
            raise HTTPException(404, "Activity not found.")
        return order

    def sync_proposal(state, rid, status):
        for proposal in state["requests"]:
            if proposal["id"] == rid:
                proposal["status"] = status

    def close_approval_alerts(state, rid, by):
        for event in state["events"]:
            if (
                event["ref"] == rid
                and event["kind"] == "approval_needed"
                and event["status"] == "open"
            ):
                event.update(status="resolved", resolved_by=by, resolved_at=time.time())

    def cancel_order(state, rid):
        order = find_order(state, rid)
        if order["status"] == "cancelled":
            return order
        if order["status"] not in {"awaiting_approval", "simulated_confirmed"}:
            raise HTTPException(409, "This activity can no longer change that way.")
        order["status"] = "cancelled"
        order["payment"]["status"] = NOT_CHARGED
        sync_proposal(state, rid, "cancelled")
        close_approval_alerts(state, rid, "owner")
        linked = next(
            (a for a in state["appointments"] if a["id"] == order.get("appointment_id")), None
        )
        if linked:
            linked["ride_request_id"] = None
        add_event(
            state,
            "ride_cancelled" if linked else "cancelled",
            f"Ride for {linked['title']} was cancelled"
            if linked
            else f"Cancelled: {order['option']['name']}",
            "Cancelled by the owner. Nothing was charged.",
            ref=rid,
            severity="attention" if linked else "info",
        )
        record(state, "owner_cancel", rid)
        return order

    def decide(state, rid, body, who):
        need(who, "approve")
        grant = who["grant_record"]
        order = find_order(state, rid)
        item = order["option"]["name"]
        if body.action == "ask":
            if order["status"] != "awaiting_approval":
                raise HTTPException(409, "This request is no longer waiting for approval.")
            question = body.note or "Could you tell me a little more about this request?"
            order["questions"].append({"by": grant["name"], "text": question, "at": time.time()})
            add_event(
                state,
                "question",
                f"{grant['name']} asked about {item}",
                question,
                permission="approve",
                ref=rid,
                severity="attention",
                actor=grant["name"],
            )
            record(state, "caregiver_ask", rid, grant["name"])
            return order
        earlier = order.get("decision")
        if earlier:
            if earlier["by"] == grant["id"] and earlier["action"] == body.action:
                return order
            done = "approved" if earlier["action"] == "approve" else "declined"
            raise HTTPException(409, f"Already {done} by {earlier['name']}.")
        if order["status"] != "awaiting_approval":
            raise HTTPException(409, "This request is no longer waiting for approval.")
        approved = body.action == "approve"
        order["status"] = "simulated_confirmed" if approved else "rejected"
        order["payment"]["status"] = PENDING if approved else NOT_CHARGED
        order["decision"] = {
            "action": body.action,
            "by": grant["id"],
            "name": grant["name"],
            "note": body.note,
            "at": time.time(),
        }
        sync_proposal(state, rid, order["status"])
        close_approval_alerts(state, rid, grant["name"])
        add_event(
            state,
            "approved" if approved else "declined",
            f"{grant['name']} {'approved' if approved else 'declined'} {item}",
            "Booking confirmed (simulated). Nothing was charged." if approved else body.note,
            ref=rid,
            actor=grant["name"],
        )
        linked = next(
            (a for a in state["appointments"] if a["id"] == order.get("appointment_id")), None
        )
        if linked:
            if not approved:
                linked["ride_request_id"] = None
            add_event(
                state,
                "appointment_ride",
                f"Ride arranged for {linked['title']}"
                if approved
                else f"Ride for {linked['title']} was declined",
                "Simulated: no real driver will come." if approved else "No ride is booked.",
                ref=rid,
                topic="appointments",
                severity="info" if approved else "attention",
            )
        record(state, f"caregiver_{body.action}", rid, grant["name"])
        return order

    @router.post("/activity/{request_id}/cancel")
    def cancel(request_id: UUID, who=actor):
        return mutate(who, lambda state: cancel_order(state, str(request_id)), True)

    @router.post("/activity/{request_id}/decision")
    def decision(request_id: UUID, body: Decision, who=actor):
        if who["role"] != "caregiver":
            raise HTTPException(403, "Approvals come from someone in your Care Circle.")
        return mutate(who, lambda state: decide(state, str(request_id), body, who))

    @router.put("/activity/{request_id}/sharing")
    def share(request_id: UUID, body: ShareUpdate, who=actor):
        def save(state):
            order = find_order(state, str(request_id))
            order["shared"] = body.shared
            record(state, "sharing_changed", order["id"])
            return order

        return mutate(who, save, owner_only=True)

    @router.post("/activity/{request_id}/complete")
    def complete(request_id: UUID, who=actor):
        """Demo control: the simulated trip or delivery finished and simulated payment settled."""
        if not demo_controls:
            raise HTTPException(404, "Not available.")

        def finish(state):
            order = find_order(state, str(request_id))
            if order["status"] == "completed":
                return order
            if order["status"] != "simulated_confirmed":
                raise HTTPException(409, "Only a confirmed booking can be completed.")
            order["status"] = "completed"
            order["payment"]["status"] = PAID
            sync_proposal(state, order["id"], "completed")
            add_event(
                state,
                "completed",
                f"Completed (simulated): {order['option']['name']}",
                "Simulated payment settled. No real money moved.",
                ref=order["id"],
            )
            record(state, "demo_completed", order["id"])
            return order

        return mutate(who, finish, owner_only=True)

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
