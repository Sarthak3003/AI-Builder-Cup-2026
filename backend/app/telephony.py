"""Provider authentication and TwiML; conversation and booking logic live elsewhere."""

import re
from typing import Protocol
from urllib.parse import parse_qsl

from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse

from app.config import PhoneSettings
from app.conversation import TERMINAL, Turn
from app.phone import PhoneService

PREFIX = "/api/phone/twilio"
MAX_BODY = 16_384
CALL_ID = re.compile(r"CA[0-9a-fA-F]{32}\Z")
ENDED = {"completed", "busy", "failed", "no-answer", "canceled"}


class TelephonyAdapter(Protocol):
    def valid(self, url: str, form: FormData, signature: str) -> bool: ...

    def render(self, call: dict) -> str: ...

    def stop(self, message: str = "", language: str = "en-IN", *, reject=False) -> str: ...


class TwilioVoice:
    def __init__(self, settings: PhoneSettings):
        self.settings = settings
        self.validator = RequestValidator(settings.auth_token.get_secret_value())

    def valid(self, url: str, form: FormData, signature: str) -> bool:
        return bool(signature) and self.validator.validate(url, form, signature)

    def _say(self, parent, text, language):
        voice = self.settings.voice_hi if language == "hi-IN" else self.settings.voice_en
        parent.say(text, language=language, voice=voice)

    def stop(self, message="", language="en-IN", *, reject=False):
        response = VoiceResponse()
        if reject:
            response.reject(reason="busy")
        else:
            if message:
                self._say(response, message, language)
            response.hangup()
        return str(response)

    def render(self, call):
        language = call.get("language", "en-IN")
        reply = call["reply"]
        if call["status"] in {"ENDED", "EXPIRED"}:
            return self.stop(reply, language)
        pairing = call["status"] == "PAIRING"
        response = VoiceResponse()
        gather = response.gather(
            action=f"{self.settings.public_base_url}{PREFIX}/gather?step={call['next_step']}",
            method="POST",
            input="dtmf" if pairing else "speech dtmf",
            num_digits=8 if pairing else 1,
            finish_on_key="#",
            timeout=8,
            action_on_empty_result=True,
            **(
                {}
                if pairing
                else {
                    "language": language,
                    "speech_timeout": 2,
                    "speech_model": self.settings.speech_model,
                }
            ),
        )
        if call.get("error"):
            reply = (
                "कोड सही नहीं है या उसकी समय सीमा खत्म हो गई। नया ऐप कोड डालें, फिर हैश दबाएं।"
                if language == "hi-IN"
                else "That code is invalid or expired. Enter a new app code, then hash, "
                "or press 0 then hash for guest mode."
            )
        if not pairing:
            reply += (
                " दोहराने के लिए 9, कॉल समाप्त करने के लिए 0 दबाएं।"
                if language == "hi-IN"
                else " Press 9 to repeat, or 0 to end the call."
            )
            if call["state"] == "AWAITING_CONFIRMATION":
                reply += " पुष्टि के लिए 1 दबाएं।" if language == "hi-IN" else " Press 1 to confirm."
        self._say(gather, reply, language)
        return str(response)


def twilio_router(phone: PhoneService, settings: PhoneSettings):
    router = APIRouter(prefix=PREFIX, tags=["Twilio Voice"])
    adapter: TelephonyAdapter = TwilioVoice(settings)
    controller = f"twilio:{settings.account_sid}"

    def xml(content):
        return Response(
            content, media_type="application/xml", headers={"Cache-Control": "no-store"}
        )

    async def verified(request: Request):
        if not settings.auth_token.get_secret_value() or not settings.public_base_url:
            raise HTTPException(404, "Phone calling is not configured.")
        if request.headers.get("content-type", "").split(";")[0].strip() != (
            "application/x-www-form-urlencoded"
        ):
            raise HTTPException(415, "Use a Twilio form webhook.")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY:
                raise HTTPException(413, "Webhook is too large.")
        try:
            pairs = parse_qsl(body.decode("utf-8"), keep_blank_values=True, max_num_fields=64)
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(400, "Invalid webhook form.") from None
        if len({key for key, _ in pairs}) != len(pairs):
            raise HTTPException(400, "Duplicate webhook parameters.")
        form = FormData(pairs)
        path = request.scope["raw_path"].decode("ascii")
        query = request.scope["query_string"].decode("ascii")
        url = settings.public_base_url + path + (f"?{query}" if query else "")
        if not adapter.valid(url, form, request.headers.get("X-Twilio-Signature", "")):
            raise HTTPException(403, "Invalid provider signature.")
        if form.get("AccountSid") != settings.account_sid or not CALL_ID.fullmatch(
            str(form.get("CallSid", ""))
        ):
            raise HTTPException(403, "Invalid provider account or call.")
        return form

    def session_id(form):
        return phone.verifier("twilio", str(form["CallSid"]))[:40]

    def reply_for(call):
        if call["state"] in TERMINAL | {"AWAITING_EXTERNAL_APPROVAL"}:
            phone.end(call["session_id"], controller=controller)
            call = {**call, "status": "ENDED"}
        return adapter.render(call)

    def incoming_call(form):
        if not settings.enabled:
            return adapter.stop(reject=True)
        if form.get("Direction") != "inbound":
            raise HTTPException(403, "Only incoming calls are accepted.")
        try:
            call = phone.start(
                provider="twilio", call_id=str(form["CallSid"]), controller=controller
            )
            # The initial webhook can also be replayed after the call has been paired or revoked.
            call = phone.read(call["session_id"], controller=controller)
            return reply_for(call)
        except HTTPException as error:
            if error.status_code == 429:
                return adapter.stop(reject=True)
            return adapter.stop("This call cannot continue. Please open Saathi and pair again.")

    @router.post("/incoming")
    async def incoming(request: Request):
        form = await verified(request)
        return xml(await run_in_threadpool(incoming_call, form))

    def collect(form, step):
        sid = session_id(form)
        try:
            current = phone.read(sid, controller=controller)
            if not settings.enabled or current["status"] == "EXPIRED":
                phone.end(
                    sid, controller=controller, reason="timeout" if settings.enabled else "disabled"
                )
                return adapter.stop("This call has ended. Check Activity in your Saathi app.")
            if current["status"] == "ENDED":
                return adapter.render(current)
            if current["next_step"] >= settings.max_turns:
                phone.end(sid, controller=controller, reason="limit")
                return adapter.stop("The call limit has been reached. Please call again later.")
            digits = str(form.get("Digits", ""))
            speech = str(form.get("SpeechResult", ""))
            if len(digits) > 64 or len(speech) > 1000:
                raise HTTPException(400, "Input is too long.")
            if current["status"] == "PAIRING":
                if digits == "0":
                    call = phone.guest(sid, controller=controller, step=step)
                elif digits in {"8", "9"}:
                    call = phone.language(
                        sid, "hi-IN" if digits == "9" else "en-IN", controller=controller, step=step
                    )
                else:
                    call = phone.pair(sid, digits, controller=controller, step=step)
                    if call.get("error") in {409, 429}:
                        phone.end(sid, controller=controller, reason="pairing_failed")
                        return adapter.stop("Pairing could not continue. Please call again later.")
            else:
                kind, message = ("keypad", digits) if digits else ("speech", speech)
                if digits == "0":
                    kind, message = "end", ""
                elif digits == "9":
                    kind, message = "speech", "repeat"
                try:
                    low_confidence = float(form.get("Confidence", "1")) < 0.6
                except (TypeError, ValueError):
                    low_confidence = True
                if (not digits and low_confidence) or not (digits or speech):
                    kind, message = "silence", ""
                turn = Turn(
                    event_id=f"twilio-step-{step}",
                    kind=kind,
                    message=message,
                    revision=current["revision"],
                )
                draft = None
                if step == current["next_step"]:
                    draft = phone.prepare(sid, turn, controller=controller)
                call = phone.turn(sid, turn, controller=controller, step=step, draft=draft)
            return reply_for(call)
        except HTTPException as error:
            if error.status_code == 409:
                return adapter.render(phone.read(sid, controller=controller))
            return adapter.stop("This call cannot continue. Check Activity before trying again.")

    @router.post("/gather")
    async def gather(request: Request):
        form = await verified(request)
        try:
            values = request.query_params.getlist("step")
            if len(values) != 1 or not values[0].isascii() or not values[0].isdigit():
                raise ValueError()
            step = int(values[0])
            if not 0 <= step <= settings.max_turns:
                raise ValueError()
        except ValueError:
            raise HTTPException(400, "Invalid call step.") from None
        return xml(await run_in_threadpool(collect, form, step))

    def finish(form, reason):
        try:
            phone.end(session_id(form), controller=controller, reason=reason)
        except HTTPException as error:
            if error.status_code not in {403, 404}:
                raise

    @router.post("/status")
    async def status(request: Request):
        form = await verified(request)
        if form.get("CallStatus") in ENDED:
            await run_in_threadpool(finish, form, str(form["CallStatus"]))
        return Response(status_code=204)

    @router.post("/fallback")
    async def fallback(request: Request):
        form = await verified(request)
        await run_in_threadpool(finish, form, "provider_error")
        return xml(
            adapter.stop(
                "Sorry, the call service had a problem. "
                "Check Activity in Saathi before trying again."
            )
        )

    return router
