"""Shared local service workflows. External providers are always simulated."""

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.accounts import verify_account
from app.assistant import configured as gemini_configured
from app.assistant import draft_request, hear_request
from app.config import Settings
from app.hub_store import HubStore, initial_state
from app.intent import EMERGENCY, EMERGENCY_WORDS, understand
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
    action: Literal["approve", "reject"]


class FirebaseLogin(BaseModel):
    token: str = Field(min_length=10, max_length=10000)


class Join(BaseModel):
    code: str = Field(min_length=10, max_length=500)


def record(state, event, request_id=""):
    state["audit"].append({"event": event, "request_id": request_id, "at": time.time()})
    state["audit"] = state["audit"][-200:]


def hub_router(config: Settings):
    router = APIRouter(prefix="/api/hub")
    store = HubStore(config)
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
            if who["role"] == "caregiver" and (
                who["version"] != state["caregiver_version"]
                or not state["profile"]["caregiver_enabled"]
            ):
                raise HTTPException(403, "Caregiver access was revoked.")
            return action(state)

        try:
            return store.change(who["owner"], checked)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Could not save your changes. Please retry.") from None

    def public(state, who):
        profile = {**state["profile"], "enabled_providers": enabled_ids(state["profile"])}
        return {
            "profile": profile,
            "activity": state["activity"],
            "messages": state["messages"],
            "audit": state["audit"],
            "requests": state["requests"],
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
            sign(who),
            httponly=True,
            secure=config.environment not in {"local", "test"},
            samesite="strict",
            max_age=86400,
            path="/api/hub",
        )

    @router.post("/session")
    def start(response: Response, saathi_hub: str | None = Cookie(default=None, alias="__session")):
        if saathi_hub:
            who = identity(saathi_hub)
        else:
            if config.environment not in {"local", "test"}:
                raise HTTPException(401, "Sign in with Firebase to continue.")
            who = {"owner": uuid4().hex, "role": "owner", "expires": time.time() + 86400}
        result = mutate(who, lambda state: public(state, who))
        cookie(response, who)
        return result

    @router.post("/auth/firebase")
    def firebase_login(body: FirebaseLogin, response: Response):
        uid = verify_account(body.token)
        who = {
            "owner": hashlib.sha256(uid.encode()).hexdigest(),
            "role": "owner",
            "expires": time.time() + 86400,
        }
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
            if state["profile"]["caregiver_enabled"] and not body.caregiver_enabled:
                state["caregiver_version"] += 1
                state["invite"] = None
            state["profile"] = body.model_dump()
            record(state, "profile_updated")
            return public(state, who)

        return mutate(who, save, owner_only=True)

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
            if any(word in message for word in EMERGENCY_WORDS):
                clarification = EMERGENCY
            elif not available(body.service, enabled):
                clarification = NONE_ENABLED[body.service]
            elif body.service == "food":
                if any(word in message for word in ["allerg", "diabet", "एलर्जी"]):
                    clarification = "Demo meals cannot verify medical diets or allergens."
                else:
                    options = food_options(enabled, profile["vegetarian"], profile["mild"], budget)
            elif body.service == "ride":
                if not body.destination:
                    clarification = "Enter a destination before comparing demo rides."
                else:
                    options = ride_options(enabled, profile["home"], body.destination)
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
            state["requests"].append(proposal)
            state["messages"].extend(
                [
                    {
                        "role": "user",
                        "text": body.message or f"Help with {body.service}",
                        "channel": body.channel,
                    },
                    {
                        "role": "assistant",
                        "text": clarification or proposal["summary"],
                        "channel": body.channel,
                    },
                ]
            )
            state["messages"] = state["messages"][-100:]
            record(state, "options_proposed", request_id)
            return proposal

        return mutate(who, propose, owner_only=True)

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

    def routed(request_id, message, channel, draft, question, by, who):
        if draft is None or draft.clarification:
            return {
                "id": str(request_id),
                "service": draft.service if draft else None,
                "channel": channel,
                "summary": "More details needed",
                "clarification": draft.clarification if draft else question,
                "options": [],
                "status": "needs_details",
                "expires_at": time.time(),
                "understood_by": by,
                "transcript": message,
            }
        fields = {"service", "destination", "medicine", "budget", "vegetarian", "mild"}
        request = ServiceRequest(
            id=request_id, message=message, channel=channel, **draft.model_dump(include=fields)
        )
        return {**create(request, who), "understood_by": by, "transcript": message}

    @router.post("/ask")
    def ask(body: AssistantRequest, who=actor):
        """One sentence in, a routed request out. Gemini if configured, else word matching."""
        if gemini_configured():
            profile = mutate(who, ai_profile, owner_only=True)
            try:
                draft = draft_request(body.message, profile)
                return routed(body.id, body.message, body.channel, draft, "", "gemini", who)
            except HTTPException as failure:
                if failure.status_code != 502:
                    raise
        else:
            profile = mutate(who, lambda state: dict(state["profile"]), owner_only=True)
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
            needs_approval = p["caregiver_enabled"] and (
                option["price"] > p["approval_limit"] or proposal["service"] == "medicine"
            )
            order = {
                "id": rid,
                "service": proposal["service"],
                "channel": proposal["channel"],
                "option": option,
                "reference": f"SIM-{rid[:8].upper()}",
                "simulated": True,
                "status": "awaiting_approval" if needs_approval else "simulated_confirmed",
                "created_at": time.time(),
            }
            state["activity"].insert(0, order)
            proposal["status"] = order["status"]
            record(state, "owner_confirmed", rid)
            return order

        return mutate(who, save, owner_only=True)

    def transition(state, rid, action, who):
        order = next((item for item in state["activity"] if item["id"] == rid), None)
        if not order:
            raise HTTPException(404, "Activity not found.")
        target = {"approve": "simulated_confirmed", "reject": "rejected", "cancel": "cancelled"}[
            action
        ]
        if order["status"] == target:
            return order
        allowed = (
            {"awaiting_approval", "simulated_confirmed"}
            if action == "cancel"
            else {"awaiting_approval"}
        )
        if order["status"] not in allowed:
            raise HTTPException(409, "This activity can no longer change that way.")
        order["status"] = target
        for proposal in state["requests"]:
            if proposal["id"] == rid:
                proposal["status"] = target
        record(state, f"{who['role']}_{action}", rid)
        return order

    @router.post("/activity/{request_id}/cancel")
    def cancel(request_id: UUID, who=actor):
        return mutate(who, lambda state: transition(state, str(request_id), "cancel", who), True)

    @router.post("/activity/{request_id}/decision")
    def decision(request_id: UUID, body: Decision, who=actor):
        if who["role"] != "caregiver":
            raise HTTPException(403, "A linked caregiver must make this decision.")
        return mutate(who, lambda state: transition(state, str(request_id), body.action, who))

    @router.post("/caregiver/invite")
    def invite(who=actor):
        def create(state):
            if not state["profile"]["caregiver_enabled"]:
                raise HTTPException(409, "Enable caregiver approvals in your profile first.")
            token = secrets.token_hex(16)
            state["invite"] = {
                "hash": hashlib.sha256(token.encode()).hexdigest(),
                "expires": time.time() + 600,
            }
            return {
                "code": sign(
                    {"owner": who["owner"], "token": token, "expires": state["invite"]["expires"]}
                )
            }

        return mutate(who, create, True)

    @router.post("/caregiver/join")
    def join(body: Join, response: Response):
        data = decode(body.code)
        if "token" not in data:
            raise HTTPException(400, "Use a caregiver invitation code.")

        def accept(state):
            invite = state["invite"]
            if (
                not invite
                or invite["expires"] < time.time()
                or not hmac.compare_digest(
                    invite["hash"], hashlib.sha256(data["token"].encode()).hexdigest()
                )
                or not state["profile"]["caregiver_enabled"]
            ):
                raise HTTPException(403, "Invitation expired or already used.")
            state["invite"] = None
            who = {
                "owner": data["owner"],
                "role": "caregiver",
                "expires": time.time() + 86400,
                "version": state["caregiver_version"],
            }
            record(state, "caregiver_linked")
            return who, public(state, who)

        who, result = store.change(data["owner"], accept)
        cookie(response, who)
        return result

    @router.delete("/caregiver")
    def revoke(who=actor):
        def remove(state):
            state["caregiver_version"] += 1
            state["invite"] = None
            record(state, "caregiver_revoked")
            return public(state, who)

        return mutate(who, remove, True)

    @router.delete("/data")
    def reset(who=actor):
        def clear(state):
            version = state["caregiver_version"] + 1
            state.clear()
            state.update(initial_state())
            state["caregiver_version"] = version
            return public(state, who)

        return mutate(who, clear, True)

    return router
