"""Durable call lifecycle and pairing; caller ID is never an identity credential."""

import copy
import hashlib
import hmac
import secrets
import time
from uuid import uuid4

from fastapi import HTTPException

from app.care import ensure
from app.conversation import ConversationEngine, Turn, new_session
from app.hub_store import HubStore, initial_state
from app.workflows import record


class PhoneService:
    def __init__(self, store: HubStore, key: bytes, *, max_calls=10, duration=600):
        self.store = store
        self.key = key
        self.max_calls = max_calls
        self.duration = duration
        self.engine = ConversationEngine()

    def verifier(self, purpose: str, value: str) -> str:
        return hmac.new(self.key, f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()

    def create_code(self, owner: str, *, retain_transcript=False):
        code = f"{secrets.randbelow(100_000_000):08d}"
        pairing_key = f"phonePairings/{self.verifier('pair', code)}"
        account_key = f"hubAccounts/{owner}"
        now = time.time()

        def issue(documents):
            account = documents[account_key]
            if account is None:
                raise HTTPException(401, "Start a Saathi session first.")
            ensure(account)
            attempts = [t for t in account.get("phone_code_attempts", []) if now - t < 300]
            if len(attempts) >= 5:
                raise HTTPException(429, "Wait five minutes before generating another code.")
            if documents[pairing_key] is not None:
                raise HTTPException(409, "Please generate a new code.")
            epoch = account.setdefault("phone_epoch", uuid4().hex)
            account["phone_code_attempts"] = attempts + [now]
            documents[pairing_key] = {
                "owner": owner,
                "epoch": epoch,
                "expires_at": now + 300,
                "consumed": False,
                "retain_transcript": retain_transcript,
            }
            record(account, "phone_pairing_created")
            return {"code": code, "expires_at": now + 300, "single_use": True}

        return self.store.atomic([account_key, pairing_key], issue)

    def start(self, *, provider: str, call_id: str, controller: str | None = None):
        session_id = self.verifier(provider, call_id)[:40]
        session_key = f"phoneSessions/{session_id}"
        limits_key = "phoneLimits/calls"
        now = time.time()

        def begin(documents):
            existing = documents[session_key]
            if existing:
                if existing.get("controller") != controller:
                    raise HTTPException(403, "Call is not available to this session.")
                return self.public(existing)
            limits = documents[limits_key] or {"active": {}, "starts": []}
            limits["active"] = {k: v for k, v in limits["active"].items() if v > now}
            limits["starts"] = [t for t in limits["starts"] if now - t < 60]
            if len(limits["active"]) >= self.max_calls or len(limits["starts"]) >= 20:
                raise HTTPException(429, "Saathi is handling other calls. Please try later.")
            engine = new_session("simulator" if provider == "simulator" else "phone", paired=False)
            engine["id"] = session_id
            engine["expires_at"] = now + self.duration
            engine["last_reply"] = (
                "Welcome to Saathi. All bookings are simulated. Enter your eight-digit app "
                "pairing code, or press 0 for guest mode. No audio is recorded by Saathi."
            )
            call = {
                "id": session_id,
                "call_id": call_id,
                "provider": provider,
                "controller": controller,
                "owner": None,
                "epoch": None,
                "status": "PAIRING",
                "created_at": now,
                "ended_at": None,
                "expires_at": now + self.duration,
                "pair_attempts": 0,
                "engine": engine,
                "guest": ensure(initial_state()),
                "expires_delete_at": now + 86400,
            }
            documents[session_key] = call
            limits["active"][session_id] = call["expires_at"]
            limits["starts"].append(now)
            documents[limits_key] = limits
            return self.public(call)

        return self.store.atomic([session_key, limits_key], begin)

    def _call(self, session_id):
        if not isinstance(session_id, str) or len(session_id) != 40 or not session_id.isalnum():
            raise HTTPException(404, "Call not found.")
        call = self.store.read_document(f"phoneSessions/{session_id}")
        if not call:
            raise HTTPException(404, "Call not found.")
        return call

    def _authorise(self, call, controller):
        if controller is not None and call.get("controller") != controller:
            raise HTTPException(404, "Call not found.")

    def pair(self, session_id, code, *, controller=None):
        call = self._call(session_id)
        self._authorise(call, controller)
        if not isinstance(code, str) or len(code) != 8 or not code.isascii() or not code.isdigit():
            code = "invalid"
        pairing_key = f"phonePairings/{self.verifier('pair', code)}"
        pairing = self.store.read_document(pairing_key)
        account_key = f"hubAccounts/{pairing['owner']}" if pairing else None
        call_key = f"phoneSessions/{session_id}"
        limits_key = "phoneLimits/pairing"
        keys = [call_key, pairing_key, limits_key] + ([account_key] if account_key else [])
        now = time.time()

        def redeem(documents):
            call = documents[call_key]
            self._authorise(call, controller)
            if call["status"] != "PAIRING" or call["expires_at"] <= now:
                return {"error": 409, "detail": "This call cannot be paired now."}
            limits = documents[limits_key] or {"attempts": []}
            attempts = [t for t in limits["attempts"] if now - t < 60]
            if call["pair_attempts"] >= 5 or len(attempts) >= 30:
                return {
                    "error": 429,
                    "detail": "Too many pairing attempts. Start a new call later.",
                }
            call["pair_attempts"] += 1
            documents[limits_key] = {"attempts": attempts + [now]}
            saved = documents[pairing_key]
            account = documents[account_key] if account_key else None
            if (
                not saved
                or saved["consumed"]
                or saved["expires_at"] <= now
                or not account
                or account.get("phone_epoch") != saved["epoch"]
            ):
                return {"error": 401, "detail": "That pairing code is invalid or expired."}
            saved["consumed"] = True
            saved["used_at"] = now
            call.update(owner=saved["owner"], epoch=saved["epoch"], status="ACTIVE")
            engine = call["engine"]
            engine.update(
                paired=True,
                retain_transcript=saved["retain_transcript"],
                language=account["profile"]["language"],
                last_reply=f"Hello, {account['profile']['name']}. You are paired. "
                "Would you like a demo ride or a meal?",
            )
            call.pop("guest", None)
            account.setdefault("phone_sessions", []).insert(0, session_id)
            account["phone_sessions"] = account["phone_sessions"][:20]
            record(account, "phone_paired", session_id)
            self.engine._history(account, engine)
            return self.public(call)

        result = self.store.atomic(keys, redeem)
        if "error" in result:
            raise HTTPException(result["error"], result["detail"])
        return result

    def guest(self, session_id, *, controller=None):
        call_key = f"phoneSessions/{session_id}"
        self._call(session_id)

        def enter(documents):
            call = documents[call_key]
            self._authorise(call, controller)
            if call["status"] != "PAIRING" or call["expires_at"] <= time.time():
                raise HTTPException(409, "This call cannot change identity.")
            call["status"] = "ACTIVE"
            call["engine"]["last_reply"] = (
                "Guest mode uses no private profile and cannot book. "
                "You can try a demo quote. Do you need a ride or a meal?"
            )
            return self.public(call)

        return self.store.atomic([call_key], enter)

    def turn(self, session_id, body: Turn, *, controller=None):
        call = self._call(session_id)
        self._authorise(call, controller)
        call_key = f"phoneSessions/{session_id}"
        account_key = f"hubAccounts/{call['owner']}" if call["owner"] else None
        keys = [call_key] + ([account_key] if account_key else [])
        now = time.time()

        def apply(documents):
            current = documents[call_key]
            self._authorise(current, controller)
            if current["status"] == "PAIRING":
                raise HTTPException(409, "Pair or choose guest mode first.")
            account = documents[account_key] if account_key else current["guest"]
            if account_key and (not account or account.get("phone_epoch") != current["epoch"]):
                raise HTTPException(403, "Phone access was removed. Pair again in a new call.")
            if current["status"] in {"ENDED", "EXPIRED"}:
                return self.public(current)
            if current["expires_at"] <= now:
                current["status"] = "EXPIRED"
                current["ended_at"] = now
            self.engine.process(account, current["engine"], body, now=now)
            if body.kind in {"end", "disconnect"} or current["engine"]["state"] in {
                "CANCELLED",
                "EXPIRED",
            }:
                current["status"] = (
                    "EXPIRED" if current["engine"]["state"] == "EXPIRED" else "ENDED"
                )
                current["ended_at"] = now
            return self.public(current)

        result = self.store.atomic(keys, apply)
        if result["status"] in {"ENDED", "EXPIRED"}:
            self.release(session_id)
        return result

    def release(self, session_id):
        def remove(documents):
            limits = documents["phoneLimits/calls"]
            if limits:
                limits["active"].pop(session_id, None)

        self.store.atomic(["phoneLimits/calls"], remove)

    def read(self, session_id, *, owner=None, controller=None):
        call = self._call(session_id)
        if controller is not None:
            self._authorise(call, controller)
        elif owner is None or call["owner"] != owner:
            raise HTTPException(404, "Call not found.")
        if call["owner"]:
            account = self.store.read(call["owner"])
            if account.get("phone_epoch") != call["epoch"]:
                raise HTTPException(403, "Phone access was removed.")
        return self.public(call)

    def public(self, call):
        engine = call["engine"]
        return {
            **self.engine.view(engine),
            "call_id": call["call_id"],
            "status": call["status"],
            "created_at": call["created_at"],
            "ended_at": call["ended_at"],
            "expires_at": call["expires_at"],
            "duration_seconds": max(0, int((call["ended_at"] or time.time()) - call["created_at"])),
            "transcript_retained": engine["retain_transcript"],
            "events": copy.deepcopy(engine["events"]),
        }
