"""Signed Twilio webhooks exercise the actual shared engine, storage and demo providers."""

import json
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from uuid import uuid4
from xml.etree import ElementTree as ET

import pytest
from booking_helpers import ok, ready, require_approval, state
from fastapi import HTTPException
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

from app import assistant
from app.config import PhoneSettings, Settings
from app.hub_store import HubStore
from app.main import create_app
from app.telephony import PREFIX

ORIGIN = "https://voice.example.test"
ACCOUNT = "AC" + "1" * 32
TOKEN = "fake-token-for-tests-only"


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "twilio.db"))
    monkeypatch.setenv("SAATHI_PHONE_ENABLED", "true")
    monkeypatch.setenv("SAATHI_PHONE_PUBLIC_BASE_URL", ORIGIN)
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", ACCOUNT)
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", TOKEN)
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as client:
        ok(client.post("/api/hub/session"))
        ready(client)
        profile = state(client)["profile"]
        profile.update(name="Meera", show_options=False)
        ok(client.put("/api/hub/profile", json=profile))
        yield client


def post(api, path, fields, *, signature=None, signed_url=None):
    url = path if path.startswith("https:") else ORIGIN + path
    parsed = urlsplit(url)
    target = parsed.path + ("?" + parsed.query if parsed.query else "")
    sign = RequestValidator(TOKEN).compute_signature(signed_url or url, fields)
    return api.post(
        target,
        data=fields,
        headers={"X-Twilio-Signature": sign if signature is None else signature},
    )


class Call:
    def __init__(self, api, sid=None):
        self.api = api
        self.fields = {
            "AccountSid": ACCOUNT,
            "CallSid": sid or "CA" + uuid4().hex,
            "Direction": "inbound",
            "From": "+15555550123",
            "To": "+15555550124",
        }
        self.xml = self.send(PREFIX + "/incoming")

    def send(self, path, **extra):
        response = post(self.api, path, {**self.fields, **extra})
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/xml")
        assert "no-store" in response.headers["cache-control"]
        self.xml = ET.fromstring(response.text)
        return self.xml

    @property
    def action(self):
        return self.xml.find("Gather").attrib["action"]

    @property
    def text(self):
        return " ".join(self.xml.itertext())

    def say(self, message):
        return self.send(self.action, SpeechResult=message)

    def digits(self, digits):
        return self.send(self.action, Digits=digits)

    def pair(self, owner, retain=False):
        issued = ok(owner.post("/api/hub/phone/pairing-codes", json={"retain_transcript": retain}))
        code = issued["code"]
        self.digits(code)
        assert "Meera" in self.text
        return code


def session_documents():
    store = HubStore(Settings(environment="test"))
    limits = store.read_document("phoneLimits/calls")
    return store, list(limits["active"])


def test_incoming_speech_and_keypad_follow_documented_twiml(owner):
    call = Call(owner)
    gather = call.xml.find("Gather")
    assert gather.attrib["input"] == "dtmf" and gather.attrib["numDigits"] == "8"
    assert gather.attrib["actionOnEmptyResult"] == "true"
    assert "AI assistant" in call.text and "Twilio transcribes" in call.text
    call.pair(owner)
    gather = call.xml.find("Gather")
    assert gather.attrib["input"] == "speech dtmf"
    assert gather.attrib["language"] == "en-IN"
    assert gather.attrib["speechTimeout"] == "2"
    call.say("Book a cab")
    assert "pick you up" in call.text
    call.say("Home")
    assert "go?" in call.text
    call.say("Doctor")
    assert "₹83" in call.text and "Shall I confirm?" in call.text
    assert not state(owner)["activity"]
    call.digits("1")
    assert call.xml.find("Hangup") is not None and "DEMO-RIDE-1042" in call.text
    ride = state(owner)["activity"][0]
    assert (ride["channel"], ride["booking_status"], ride["payment"]["status"]) == (
        "phone",
        "CONFIRMED_SIMULATED",
        "SUCCEEDED_SIMULATED",
    )
    assert "Record" not in ET.tostring(call.xml).decode()


def test_pairing_and_confirmation_callbacks_are_replay_safe(owner):
    call = Call(owner)
    pair_url = call.action
    code = call.pair(owner)
    paired = ET.tostring(call.xml)
    call.send(pair_url, Digits=code)
    assert ET.tostring(call.xml) == paired
    call.say("Book a cab to Bank")
    call.say("Home")
    confirm_url = call.action
    call.say("yes confirm")
    confirmed = ET.tostring(call.xml)
    call.send(confirm_url, SpeechResult="yes confirm")
    assert ET.tostring(call.xml) == confirmed
    assert len(state(owner)["activity"]) == 1
    assert sum(e["event"] == "conversation_confirmed" for e in state(owner)["audit"]) == 1


def test_food_selection_then_confirmation_and_provider_failure(owner):
    call = Call(owner)
    call.pair(owner)
    call.say("Order dinner")
    assert "eat?" in call.text
    call.say("vegetarian and mild under 150")
    assert "Which option" in call.text
    call.digits("1")
    assert "Shall I confirm" in call.text and not state(owner)["activity"]
    ok(owner.post("/api/hub/demo/fail-next"))
    call.say("Yes, confirm it")
    assert "could not confirm" in call.text
    meal = state(owner)["activity"][0]
    assert (meal["booking_status"], meal["payment"]["status"]) == (
        "FAILED",
        "NOT_CHARGED_SIMULATED",
    )
    assert not meal["provider_booking_id"]


def test_phone_keeps_caretaker_approval_even_when_app_auto_books(owner):
    require_approval(owner, limit=1)
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Doctor")
    call.say("Home")
    call.digits("1")
    assert "approval" in call.text and "Nothing is booked" in call.text
    booking = state(owner)["activity"][0]
    assert booking["booking_status"] == "AWAITING_APPROVAL"
    assert booking["payment"]["status"] == "NOT_CHARGED_SIMULATED"


def test_guest_has_no_caller_id_identity_and_cannot_book(owner):
    call = Call(owner)
    call.digits("0")
    assert "cannot book" in call.text and "Meera" not in call.text
    call.say("Book a cab")
    call.say("Home")
    assert "do not have a saved home" in call.text
    call.say("12 Fictional Road")
    call.say("Bank")
    assert "Guest mode cannot book" in call.text
    call.say("yes")
    assert not state(owner)["activity"]


@pytest.mark.parametrize("endpoint", ["incoming", "gather?step=0", "status", "fallback"])
def test_all_provider_endpoints_reject_missing_or_bad_signatures(owner, endpoint):
    fields = {"AccountSid": ACCOUNT, "CallSid": "CA" + "2" * 32, "Direction": "inbound"}
    for signature in ("", "forged"):
        assert post(owner, f"{PREFIX}/{endpoint}", fields, signature=signature).status_code == 403
    assert not state(owner)["activity"]


def test_signatures_bind_the_public_url_query_and_every_form_field(owner):
    fields = {"AccountSid": ACCOUNT, "CallSid": "CA" + "2" * 32, "Direction": "inbound"}
    bad_url = post(owner, PREFIX + "/incoming", fields, signed_url="https://evil.test")
    wrong_account = post(owner, PREFIX + "/incoming", {**fields, "AccountSid": "AC" + "3" * 32})
    assert bad_url.status_code == wrong_account.status_code == 403
    call = Call(owner)
    fields = {**call.fields, "Digits": "0", "NewTwilioField": " keep spaces "}
    response = post(owner, call.action, fields)
    assert response.status_code == 200 and "Guest mode" in response.text
    assert owner.post(PREFIX + "/incoming", json=fields).status_code == 415
    oversized = owner.post(
        PREFIX + "/incoming",
        content="x" * 17000,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert oversized.status_code == 413


def test_pairing_attempts_silence_stale_and_duplicate_callbacks_are_bounded(owner):
    call = Call(owner)
    url = call.action
    call.digits("123")
    failed = ET.tostring(call.xml)
    call.send(url, Digits="123")
    assert ET.tostring(call.xml) == failed
    for _ in range(5):
        if call.xml.find("Gather") is not None:
            call.digits("123")
    assert call.xml.find("Hangup") is not None
    other = Call(owner)
    other.pair(owner)
    for _ in range(3):
        other.send(other.action)
    assert other.xml.find("Hangup") is not None


def test_low_confidence_cannot_confirm_and_keypad_repeat_works(owner):
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Bank")
    call.say("Home")
    call.send(call.action, SpeechResult="yes", Confidence="0.2")
    assert "did not hear" in call.text and not state(owner)["activity"]
    call.digits("9")
    assert "Shall I confirm" in call.text
    call.digits("0")
    assert call.xml.find("Hangup") is not None and not state(owner)["activity"]


def test_hangup_and_provider_fallback_prevent_late_confirmation(owner):
    for endpoint in ("status", "fallback"):
        call = Call(owner)
        call.pair(owner)
        call.say("Book a cab to Bank")
        call.say("Home")
        url = call.action
        ended = post(owner, f"{PREFIX}/{endpoint}", {**call.fields, "CallStatus": "completed"})
        assert ended.status_code == (204 if endpoint == "status" else 200)
        call.send(url, Digits="1")
        assert call.xml.find("Hangup") is not None
    assert not state(owner)["activity"]


def test_expired_call_and_concurrency_limit(owner, monkeypatch):
    monkeypatch.setenv("SAATHI_PHONE_MAX_CALLS", "1")
    limited = TestClient(create_app(Settings(environment="test")))
    first = Call(limited)
    second = Call(limited)
    assert second.xml.find("Reject") is not None
    store, ids = session_documents()
    key = "phoneSessions/" + ids[0]
    store.atomic([key], lambda docs: docs[key].update(expires_at=1))
    first.digits("0")
    assert first.xml.find("Hangup") is not None
    assert store.read_document("phoneLimits/calls")["active"] == {}


def test_hindi_language_and_xml_escaping(owner):
    call = Call(owner)
    call.digits("9")
    assert call.xml.find("Gather/Say").attrib["language"] == "hi-IN"
    profile = state(owner)["profile"]
    profile.update(language="hi-IN", name="Meera <Hangup/>")
    ok(owner.put("/api/hub/profile", json=profile))
    call.pair(owner)
    assert call.xml.find("Hangup") is None
    assert call.xml.find("Gather").attrib["language"] == "hi-IN"
    assert call.xml.find("Gather/Say").attrib["voice"] == "Google.hi-IN-Standard-A"


def test_gemini_uses_shared_drafting_outside_transaction_with_short_timeout(owner, monkeypatch):
    seen = []
    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "fake-ai-key")

    def draft(message, profile, *, timeout):
        seen.append((message, timeout))
        assert "home" in profile
        return assistant.Draft(service="ride", destination="Bank")

    monkeypatch.setattr(assistant, "draft_request", draft)
    call = Call(owner)
    call.pair(owner)
    call.say("Could you arrange transport to Bank")
    call.say("Home")
    call.digits("1")
    assert seen == [("Could you arrange transport to Bank", 4)]
    assert "DEMO-RIDE-1042" in call.text


def test_pairing_code_is_never_in_call_transcript_or_session(owner):
    call = Call(owner)
    code = call.pair(owner, retain=True)
    store, ids = session_documents()
    call.say("Book a cab")
    saved = store.read_document("phoneSessions/" + ids[0])
    assert code not in json.dumps(saved)
    view = ok(owner.get("/api/hub/phone/sessions/" + ids[0]))
    assert any(event["text"] == "Book a cab" for event in view["events"])
    stranger = TestClient(owner.app)
    ok(stranger.post("/api/hub/session"))
    assert stranger.get("/api/hub/phone/sessions/" + ids[0]).status_code == 404


def test_concurrent_signed_confirmations_execute_once(owner):
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab to Doctor")
    call.say("Home")
    url = call.action

    def confirm(_):
        with TestClient(owner.app) as api:
            return post(api, url, {**call.fields, "Digits": "1"}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(confirm, range(2))) == [200, 200]
    assert len(state(owner)["activity"]) == 1


def test_gemini_failure_uses_rules_and_disabled_service_rejects_calls(owner, monkeypatch):
    def unavailable(*args, **kwargs):
        raise HTTPException(502, "Not available")

    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "fake-ai-key")
    monkeypatch.setattr(assistant, "draft_request", unavailable)
    call = Call(owner)
    call.pair(owner)
    call.say("Book a cab")
    assert "pick you up" in call.text
    monkeypatch.setenv("SAATHI_PHONE_ENABLED", "false")
    disabled = TestClient(create_app(Settings(environment="test")))
    assert Call(disabled).xml.find("Reject") is not None
    assert disabled.post("/api/hub/phone/simulator/calls", json={}).status_code == 404


def test_phone_configuration_requires_explicit_credentials_and_https(monkeypatch):
    for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "SAATHI_PHONE_PUBLIC_BASE_URL"):
        monkeypatch.delenv(key, raising=False)
    assert not PhoneSettings().enabled
    with pytest.raises(ValueError):
        PhoneSettings(enabled=True)
    for url in ("http://voice.test", "https://user:pass@voice.test", "https://voice.test/path"):
        with pytest.raises(ValueError):
            PhoneSettings(public_base_url=url)
