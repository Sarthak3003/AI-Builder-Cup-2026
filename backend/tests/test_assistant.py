import io
import json

import pytest
from fastapi import HTTPException

from app import assistant

PROFILE = {"budget": 200, "vegetarian": True, "mild": True, "medicines": ["Vitamin D"]}


def fake_gemini(monkeypatch, reply):
    sent = []

    def urlopen(request, timeout):
        sent.append(request)
        body = {"candidates": [{"content": {"parts": [{"text": json.dumps(reply)}]}}]}
        return io.BytesIO(json.dumps(body).encode())

    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("SAATHI_GEMINI_MODEL", raising=False)
    monkeypatch.setattr(assistant, "urlopen", urlopen)
    return sent


def test_audio_is_sent_inline_with_a_transcript_schema(monkeypatch):
    sent = fake_gemini(
        monkeypatch, {"service": "food", "transcript": "Something light to eat", "mild": True}
    )
    heard = assistant.hear_request(b"RIFF....WAVE", "audio/wav", PROFILE)
    assert (heard.service, heard.transcript, heard.mild) == (
        "food",
        "Something light to eat",
        True,
    )
    request = sent[0]
    payload = json.loads(request.data)
    assert request.full_url.endswith(f"/models/{assistant.DEFAULT_MODEL}:generateContent")
    assert request.get_header("X-goog-api-key") == "test-key"
    parts = payload["contents"][0]["parts"]
    assert parts[1] == {"inlineData": {"mimeType": "audio/wav", "data": "UklGRi4uLi5XQVZF"}}
    assert "transcript" in payload["generationConfig"]["responseJsonSchema"]["properties"]
    instruction = payload["systemInstruction"]["parts"][0]["text"]
    assert "ORS sachets, pack of 5 (sample)" in instruction
    assert "Vitamin D" not in instruction
    assert "test-key" not in request.data.decode()


def test_text_drafts_use_the_same_call(monkeypatch):
    sent = fake_gemini(monkeypatch, {"service": "ride", "destination": "Park"})
    assert assistant.draft_request("Take me to the park", PROFILE).destination == "Park"
    payload = json.loads(sent[0].data)
    assert payload["contents"][0]["parts"] == [{"text": "Take me to the park"}]
    assert "transcript" not in payload["generationConfig"]["responseJsonSchema"]["properties"]


def test_unusable_replies_become_a_retry_message(monkeypatch):
    fake_gemini(monkeypatch, {"service": "taxi"})
    with pytest.raises(HTTPException) as failure:
        assistant.hear_request(b"RIFF", "audio/wav", PROFILE)
    assert failure.value.status_code == 502


def test_without_a_key_nothing_is_sent(monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    assert assistant.configured() is False
    with pytest.raises(HTTPException) as failure:
        assistant.draft_request("hello", PROFILE)
    assert failure.value.status_code == 503
