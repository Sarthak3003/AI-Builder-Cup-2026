from fastapi.testclient import TestClient

from app import demo
from app.config import Settings
from app.main import create_app


def test_missing_key_is_honest(monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    with TestClient(create_app(Settings(environment="test"))) as client:
        client.post("/api/demo/session")
        response = client.post("/api/demo/requests", json={"message": "vegetarian lunch"})
        assert response.status_code == 503
        assert "Gemini is not configured" in response.json()["detail"]


def test_session_required():
    with TestClient(create_app(Settings(environment="test"))) as client:
        assert client.post("/api/demo/requests", json={"message": "lunch"}).status_code == 401


def exercise_flow(client):
    client.post("/api/demo/session")
    proposal = client.post("/api/demo/requests", json={"message": "mild veg under 150"})
    assert proposal.status_code == 200, proposal.text
    data = proposal.json()
    assert [item["id"] for item in data["options"]] == ["dal", "khichdi"]
    path = f"/api/demo/requests/{data['id']}/confirm"
    assert client.post(path, json={"option_id": "chicken", "confirmed": True}).status_code == 400
    assert client.post(path, json={"option_id": "dal", "confirmed": False}).status_code == 422
    result = client.post(path, json={"option_id": "dal", "confirmed": True})
    assert result.status_code == 200
    assert client.post(path, json={"option_id": "dal", "confirmed": True}).json() == result.json()
    assert client.post(path, json={"option_id": "khichdi", "confirmed": True}).status_code == 409
    assert client.get(f"/api/demo/activity/{data['id']}").json() == result.json()
    client.cookies.clear()
    client.post("/api/demo/session")
    assert client.get(f"/api/demo/activity/{data['id']}").status_code == 404


def test_complete_flow(monkeypatch):
    records = {}

    class Store:
        def __init__(self, config):
            pass

        def read(self, path):
            return records.get(path)

        def create(self, path, data):
            if path in records:
                return False
            records[path] = data
            return True

        def close(self):
            pass

    monkeypatch.setattr(demo, "DemoStore", Store)
    monkeypatch.setattr(
        demo,
        "interpret",
        lambda message: demo.Interpretation(
            summary="Mild vegetarian lunch under 150", budget=150, vegetarian=True, mild=True
        ),
    )
    with TestClient(create_app(Settings(environment="test"))) as client:
        exercise_flow(client)


def test_gemini_adapter_validates_response(monkeypatch):
    import io
    import json

    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-only")
    payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "summary": "Vegetarian lunch",
                                    "budget": 150,
                                    "vegetarian": True,
                                    "mild": True,
                                    "needs_clarification": False,
                                    "clarification": "",
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    monkeypatch.setattr(
        demo, "urlopen", lambda request, timeout: io.BytesIO(json.dumps(payload).encode())
    )
    assert demo.interpret("lunch").budget == 150
    monkeypatch.setattr(demo, "urlopen", lambda request, timeout: io.BytesIO(b"{}"))
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as error:
        demo.interpret("lunch")
    assert error.value.status_code == 502


def test_demo_routes_not_exposed_in_production():
    with TestClient(create_app(Settings(environment="production"))) as client:
        assert client.post("/api/demo/session").status_code == 404
