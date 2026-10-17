import base64
import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from booking_helpers import book, confirm, ok, quotes, ready
from fastapi import HTTPException
from fastapi.testclient import TestClient
from test_assistant import fake_gemini

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "hub.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def client(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        ready(api)
        yield api


def enable_care(client):
    profile = client.get("/api/hub/state").json()["profile"]
    profile.update(caregiver_enabled=True, approval_limit=100, caregiver_name="Demo caregiver")
    assert client.put("/api/hub/profile", json=profile).status_code == 200
    return client.post("/api/hub/caregiver/invite").json()["code"]


@pytest.mark.parametrize("automatic", [False, True])
@pytest.mark.parametrize(
    "message,reply",
    [
        ("Can you help me with something?", {"service": "food"}),
        ("मुझे मदद चाहिए", {"service": "food"}),
        ("Something suitable please", {"service": None}),
        ("Please arrange something", {"service": "food", "clarification": "What meal?"}),
    ],
)
def test_unclear_ai_requests_never_quote_or_auto_book(
    client, monkeypatch, automatic, message, reply
):
    fake_gemini(monkeypatch, reply)
    ok(client.patch("/api/hub/onboarding/profile", json={"show_options": not automatic}))
    result = ok(client.post("/api/hub/ask", json={"id": str(uuid4()), "message": message}))
    assert result["status"] == "needs_details" and result["clarification"]
    assert result["quotes"] == [] and not result.get("booking")
    saved = ok(client.get("/api/hub/state"))
    assert not saved["quotes"] and not saved["activity"]


@pytest.mark.parametrize("service", ["food", "ride", "medicine"])
def test_all_services_persist_and_cancel(client, service):
    quote = quotes(client, service)[0]
    key = str(uuid4())
    result = ok(confirm(client, quote, key))
    assert result["booking_status"] == "CONFIRMED_SIMULATED"
    assert client.get("/api/hub/state").json()["activity"][0] == result
    assert ok(confirm(client, quote, key)) == result
    path = f"/api/hub/bookings/{result['id']}/cancel"
    assert ok(client.post(path))["booking_status"] == "CANCELLED_SIMULATED"
    assert ok(client.post(path))["booking_status"] == "CANCELLED_SIMULATED"
    assert ok(confirm(client, quote, key))["booking_status"] == "CANCELLED_SIMULATED"
    assert confirm(client, quote).status_code == 409


def test_caregiver_permissions_and_revocation(app, client):
    code = enable_care(client)
    pending = book(client, "medicine")
    assert pending["booking_status"] == "AWAITING_APPROVAL"
    decision = f"/api/hub/bookings/{pending['id']}/decision"
    assert client.post(decision, json={"action": "approve"}).status_code == 403
    with TestClient(app) as caregiver:
        joined = caregiver.post("/api/hub/caregiver/join", json={"code": code})
        assert joined.json()["role"] == "caregiver"
        assert caregiver.post("/api/hub/caregiver/join", json={"code": code}).status_code == 403
        ride = {"service_type": "RIDE", "destination_text": "Park"}
        assert caregiver.post("/api/hub/quotes", json=ride).status_code == 403
        assert caregiver.delete("/api/hub/data").status_code == 403
        approved = ok(caregiver.post(decision, json={"action": "approve"}))
        assert approved["booking_status"] == "CONFIRMED_SIMULATED"
        assert caregiver.post(decision, json={"action": "reject"}).status_code == 409
        client.delete("/api/hub/caregiver")
        assert caregiver.get("/api/hub/state").status_code == 403


def test_other_owner_cannot_see_or_confirm_a_quote(app, client):
    quote = quotes(client)[0]
    booked = book(client)
    with TestClient(app) as other:
        other.post("/api/hub/session")
        assert confirm(other, quote).status_code == 404
        assert other.get(f"/api/hub/bookings/{booked['id']}").status_code == 404
        assert other.post(f"/api/hub/bookings/{booked['id']}/cancel").status_code == 404
        assert other.get("/api/hub/state").json()["activity"] == []
    assert ok(confirm(client, quote))["booking_status"] == "CONFIRMED_SIMULATED"


def test_confirmation_cannot_send_prices_or_skip_the_explicit_yes(client):
    quote = quotes(client)[0]
    path = f"/api/hub/quotes/{quote['id']}/confirm"
    key = str(uuid4())
    for body in (
        {"idempotency_key": key, "confirmed": False},
        {"idempotency_key": key},
        {"confirmed": True},
        {"idempotency_key": key, "confirmed": True, "amount_minor": 1},
        {"idempotency_key": key, "confirmed": True, "booking_status": "CONFIRMED_SIMULATED"},
        {"idempotency_key": "bad key!", "confirmed": True},
    ):
        assert client.post(path, json=body).status_code == 422, body
    assert (
        client.post(
            "/api/hub/quotes/nope/confirm", json={"idempotency_key": key, "confirmed": True}
        ).status_code
        == 404
    )
    assert client.get("/api/hub/state").json()["activity"] == []


def test_a_retry_key_belongs_to_one_quote(client):
    first, second = quotes(client)[:2]
    key = str(uuid4())
    booked = ok(confirm(client, first, key))
    assert ok(confirm(client, first, key)) == booked
    reused = confirm(client, second, key)
    assert reused.status_code == 409 and "another booking" in reused.json()["detail"]
    assert len(client.get("/api/hub/state").json()["activity"]) == 1


@pytest.mark.parametrize("same_key", [True, False])
def test_parallel_confirmations_only_create_one_booking_and_payment(app, client, same_key):
    quote = quotes(client)[0]
    cookie = client.cookies.get("__session")
    shared = str(uuid4())

    def send(_):
        with TestClient(app) as api:
            api.cookies.set("__session", cookie)
            return confirm(api, quote, shared if same_key else None)

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    codes = sorted(result.status_code for result in results)
    assert codes == ([200] * 4 if same_key else [200, 409, 409, 409])
    activity = client.get("/api/hub/state").json()["activity"]
    assert len(activity) == 1 and activity[0]["provider_booking_id"] == "DEMO-RIDE-1042"
    ledger = [r.json()["id"] for r in results if r.status_code == 200]
    assert set(ledger) == {activity[0]["id"]}


def ask(client, message, channel="voice"):
    result = client.post(
        "/api/hub/ask", json={"id": str(uuid4()), "message": message, "channel": channel}
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_unclear_unsafe_or_unbookable_requests_are_asked_back(client, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    tiny = ask(client, "something to eat under 1 rupees")
    assert tiny["quotes"] == [] and "No demo meals fit" in tiny["clarification"]
    assert ask(client, "book a taxi")["status"] == "needs_details"
    assert ask(client, "chest pain emergency")["clarification"].startswith("Saathi cannot")
    assert "medical diets" in ask(client, "food please, I have a peanut allergy")["clarification"]
    assert client.get("/api/hub/state").json()["quotes"] == []


def test_ask_routes_one_sentence_to_quotes_without_booking(client, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    ride = ask(client, "Take me to Dr Mehta's clinic please")
    assert (ride["service"], ride["status"], ride["understood_by"]) == (
        "ride",
        "quoted",
        "keywords",
    )
    assert ride["input"]["destination"] == "Dr Mehta's clinic"
    assert [q["app_id"] for q in ride["quotes"]] == [None, "rapido", "ola", "uber"]
    assert {q["request_id"] for q in ride["quotes"]} == {ride["request_id"]}
    food = ask(client, "something light to eat under 120", channel="app")
    assert [(q["option_id"], q["details"]["items"][0]["item_id"]) for q in food["quotes"]] == [
        ("demo-kitchen", "khichdi"),
        ("demo-kitchen", "dal"),
        ("swiggy", "khichdi"),
    ]
    state = client.get("/api/hub/state").json()
    assert state["activity"] == []
    uber = next(q for q in ride["quotes"] if q["option_id"] == "uber-go")
    assert ok(confirm(client, uber))["provider_booking_id"].startswith("DEMO-RIDE-")


def test_ask_asks_back_instead_of_guessing(client, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    unclear = ask(client, "what is the weather")
    assert (unclear["service"], unclear["quotes"]) == (None, [])
    assert "ride, food or medicine" in unclear["clarification"]
    where = ask(client, "book me a taxi")
    assert (where["service"], where["status"]) == ("ride", "needs_details")
    assert ask(client, "I have chest pain")["clarification"].startswith("Saathi cannot respond")
    assert client.get("/api/hub/state").json()["quotes"] == []


def test_ask_explains_how_to_connect_a_missing_service(client, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    ok(client.post("/api/hub/services/RIDE/disconnect"))
    reply = ask(client, "Take me to the market")
    assert reply["quotes"] == [] and reply["service"] == "ride"
    assert reply["clarification"] == "Connect the Demo Ride Provider first, in Services."


def test_ask_uses_gemini_when_configured(client, monkeypatch):
    from app.assistant import Draft

    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.hub.draft_request", lambda message, profile: Draft(service="ride", destination="Park")
    )
    result = ask(client, "anything at all")
    assert (result["service"], result["understood_by"]) == ("ride", "gemini")
    assert result["input"]["destination"] == "Park"


@pytest.mark.parametrize("voice", [False, True])
def test_hindi_ai_clarification_keeps_english_input_verbatim(client, monkeypatch, voice):
    ok(client.patch("/api/hub/onboarding/profile", json={"language": "hi-IN"}))
    message = "Please take me somewhere"
    clarification = "आप कहाँ जाना चाहते हैं?"
    sent = fake_gemini(
        monkeypatch, {"service": "ride", "transcript": message, "clarification": clarification}
    )
    result = ok(speak(client)) if voice else ask(client, message)
    assert result["clarification"] == clarification
    assert result["service"] == "ride" and result["status"] == "needs_details"
    assert result["input"]["message"] == message and result["quotes"] == []
    payload = json.loads(sent[0].data)
    assert "Hindi (Devanagari)" in payload["systemInstruction"]["parts"][0]["text"]
    stored = ok(client.get("/api/hub/state"))
    conv = stored["conversations"][0]["id"]
    transcript = ok(client.get(f"/api/hub/conversations/{conv}/transcript"))["transcript"]
    assert transcript[0]["text"] == message
    assert stored["activity"] == []


def test_ask_falls_back_to_word_matching_when_gemini_fails(client, monkeypatch):
    def broken(message, profile):
        raise HTTPException(502, "Gemini could not understand this request. Please retry.")

    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.hub.draft_request", broken)
    result = ask(client, "Take me to the park")
    assert (result["service"], result["understood_by"]) == ("ride", "keywords")
    assert client.get("/api/hub/state").json()["gemini"] is True


WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + bytes(48)


def speak(client, audio=WAV):
    body = {"id": str(uuid4()), "audio": base64.b64encode(audio).decode()}
    return client.post("/api/hub/ask/voice", json=body)


def test_voice_needs_gemini(client, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    assert client.get("/api/hub/state").json()["gemini"] is False
    assert speak(client).status_code == 503


def test_gemini_hears_the_recording_and_routes_it(client, monkeypatch):
    from app.assistant import Heard

    heard = []
    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.hub.hear_request",
        lambda audio, mime, profile: (
            heard.append((audio, mime))
            or Heard(service="ride", destination="the park", transcript="मुझे पार्क जाना है")
        ),
    )
    result = speak(client).json()
    assert heard == [(WAV, "audio/wav")]
    assert (result["service"], result["status"], result["understood_by"]) == (
        "ride",
        "quoted",
        "gemini",
    )
    assert (result["transcript"], result["channel"]) == ("मुझे पार्क जाना है", "voice")
    assert result["input"]["message"] == "मुझे पार्क जाना है"
    assert client.get("/api/hub/state").json()["activity"] == []


def test_silent_or_unclear_recording_is_asked_again(client, monkeypatch):
    from app.assistant import Heard

    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.hub.hear_request", lambda audio, mime, profile: Heard(service="ride", transcript="")
    )
    result = speak(client).json()
    assert result["status"] == "needs_details"
    assert result["clarification"] == "Sorry, I could not hear that. Please try again."


def test_voice_rejects_anything_but_wav(client, monkeypatch):
    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    assert speak(client, b"OggS" + bytes(60)).status_code == 422
    bad = {"id": str(uuid4()), "audio": "not base64!" * 10}
    assert client.post("/api/hub/ask/voice", json=bad).status_code == 422
    other = {"id": str(uuid4()), "audio": "A" * 100, "mime_type": "audio/webm"}
    assert client.post("/api/hub/ask/voice", json=other).status_code == 422


def test_caregiver_cannot_ask(app, client):
    code = enable_care(client)
    with TestClient(app) as helper:
        assert helper.post("/api/hub/caregiver/join", json={"code": code}).status_code == 200
        refused = helper.post(
            "/api/hub/ask", json={"id": str(uuid4()), "message": "Take me to the park"}
        )
        assert refused.status_code == 403


def test_channels_share_history_and_profile(client, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    profile = client.get("/api/hub/state").json()["profile"]
    profile.update(name="Demo user", large_text=True, language="hi-IN", budget=120)
    client.put("/api/hub/profile", json=profile)
    for channel in ["app", "message", "voice"]:
        reply = ask(client, "I am hungry, something light", channel=channel)
        assert [q["option_id"] for q in reply["quotes"]] == [
            "demo-kitchen",
            "demo-kitchen",
            "swiggy",
        ]
        ok(confirm(client, reply["quotes"][0]))
    state = client.get("/api/hub/state").json()
    assert state["profile"]["name"] == "Demo user"
    assert len(state["activity"]) == 3
    assert {item["channel"] for item in state["activity"]} == {"app", "message", "voice"}
    assert {m["channel"] for m in state["messages"]} == {"app", "message", "voice"}


def test_expired_quotes_cannot_be_confirmed(client, monkeypatch):
    import time

    quote = quotes(client)[0]
    now = time.time()
    monkeypatch.setattr("app.bookings.time.time", lambda: now + 901)
    expired = confirm(client, quote)
    assert expired.status_code == 409 and "expired" in expired.json()["detail"]
    assert client.get("/api/hub/state").json()["activity"] == []


def test_cross_site_requests_rejected(client):
    assert (
        client.post("/api/hub/session", headers={"Origin": "https://evil.invalid"}).status_code
        == 403
    )


@pytest.mark.parametrize("port", [5173, 4173])
def test_local_dev_and_preview_origins_are_accepted(client, port):
    # Vite's proxy rewrites Host, so both of its ports must be allow-listed in local mode.
    result = client.post("/api/hub/session", headers={"Origin": f"http://127.0.0.1:{port}"})
    assert result.status_code == 200


def test_other_local_ports_are_still_refused(client):
    result = client.post("/api/hub/session", headers={"Origin": "http://127.0.0.1:9999"})
    assert result.status_code == 403


def test_extra_origin_from_environment_is_accepted_and_others_are_not(tmp_path, monkeypatch):
    # How a phone on the same Wi-Fi is allowed in: SAATHI_ALLOWED_ORIGINS names its address.
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "origins.db"))
    monkeypatch.setenv("SAATHI_ALLOWED_ORIGINS", "http://198.51.100.20:5173")
    with TestClient(create_app(Settings(environment="test"))) as api:
        phone = api.post("/api/hub/session", headers={"Origin": "http://198.51.100.20:5173"})
        stranger = api.post("/api/hub/session", headers={"Origin": "http://198.51.100.21:5173"})
    assert phone.status_code == 200
    assert stranger.status_code == 403


def test_reset_clears_history(client):
    book(client)
    result = client.delete("/api/hub/data")
    assert result.status_code == 200
    assert result.json()["activity"] == []
    assert result.json()["onboarding"]["completed"] is False


def test_cookie_tamper_rejected(app):
    with TestClient(app) as client:
        client.cookies.set("__session", "forged.token")
        assert client.get("/api/hub/state").status_code == 401


def test_simplified_view_is_saved_and_older_profiles_default_to_full(client):
    profile = client.get("/api/hub/state").json()["profile"]
    assert profile["simple"] is False
    saved = client.put("/api/hub/profile", json={**profile, "simple": True}).json()
    assert saved["profile"]["simple"] is True
    older = {key: value for key, value in profile.items() if key != "simple"}
    assert client.put("/api/hub/profile", json=older).json()["profile"]["simple"] is False


def test_local_data_survives_app_restart(client):
    booked = book(client)
    cookie = client.cookies.get("__session")
    with TestClient(create_app(Settings(environment="test"))) as restarted:
        restarted.cookies.set("__session", cookie)
        activity = restarted.get("/api/hub/state").json()["activity"]
        assert activity == [booked]
        assert activity[0]["booking_status"] == "CONFIRMED_SIMULATED"
        assert activity[0]["payment"]["status"] == "SUCCEEDED_SIMULATED"


def test_demo_data_saved_by_an_older_version_starts_again(client, tmp_path):
    import json
    import sqlite3

    book(client)
    with sqlite3.connect(tmp_path / "hub.db") as db:
        owner, raw = db.execute("SELECT id, state FROM accounts").fetchone()
        older = json.loads(raw)
        older.pop("schema")
        older["activity"] = [{"id": "x", "status": "simulated_confirmed", "option": {}}]
        db.execute("UPDATE accounts SET state=? WHERE id=?", (json.dumps(older), owner))
    fresh = client.get("/api/hub/state").json()
    assert fresh["activity"] == [] and fresh["onboarding"]["completed"] is False
