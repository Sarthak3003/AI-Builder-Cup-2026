from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_firebase_identity_is_stable_and_separate(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "auth.db"))
    monkeypatch.setattr("app.hub.verify_account", lambda token: "verified-firebase-user")
    with TestClient(create_app(Settings(environment="test"))) as client:
        local = client.post("/api/hub/session").json()
        profile = {**local["profile"], "name": "Local only"}
        client.put("/api/hub/profile", json=profile)
        signed_in = client.post("/api/hub/auth/firebase", json={"token": "test-token-only"})
        assert signed_in.status_code == 200
        assert signed_in.json()["profile"]["name"] == "Friend"
        profile["name"] = "Signed in user"
        client.put("/api/hub/profile", json=profile)
        client.delete("/api/hub/session")
        assert (
            client.post("/api/hub/auth/firebase", json={"token": "test-token-only"}).json()[
                "profile"
            ]["name"]
            == "Signed in user"
        )


def test_firebase_not_configured_is_explicit(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "auth.db"))
    monkeypatch.delenv("SAATHI_FIREBASE_PROJECT", raising=False)
    with TestClient(create_app(Settings(environment="test"))) as client:
        assert (
            client.post("/api/hub/auth/firebase", json={"token": "test-token-only"}).status_code
            == 503
        )
