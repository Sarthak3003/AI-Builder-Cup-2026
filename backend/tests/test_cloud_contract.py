"""Production contracts using local fakes; never access Google services."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.hub_store import HubStore
from app.main import create_app


def cloud_app(tmp_path, monkeypatch):
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.setenv("SAATHI_SESSION_SECRET", "test-secret-" * 4)
    monkeypatch.setenv("SAATHI_ALLOWED_ORIGINS", "https://saathi-example.web.app")
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "cloud-contract.db"))
    local = HubStore(Settings(environment="test", firestore_mode="disabled"))
    monkeypatch.setattr("app.hub.HubStore", lambda config: local)
    return create_app(
        Settings(
            environment="production", firestore_mode="cloud", firestore_project="saathi-example"
        )
    )


def test_cloud_creates_demo_and_sets_private_secure_cookie(tmp_path, monkeypatch):
    with TestClient(cloud_app(tmp_path, monkeypatch), base_url="https://api.example") as client:
        assert client.get("/api/hub/state").status_code == 401
        login = client.post(
            "/api/hub/session",
            headers={"origin": "https://saathi-example.web.app"},
        )
        assert login.status_code == 200
        cookie = login.headers["set-cookie"]
        assert "__session=" in cookie and "Secure" in cookie and "HttpOnly" in cookie
        assert login.headers["cache-control"] == "private, no-store"
        assert client.get("/api/hub/state").status_code == 200
        assert client.delete("/api/hub/session").status_code == 200
        assert client.get("/api/hub/state").status_code == 401
        assert client.post("/api/demo/session").status_code == 404


def test_cloud_blocks_cross_site_mutations_and_does_not_cache_errors(tmp_path, monkeypatch):
    with TestClient(cloud_app(tmp_path, monkeypatch), base_url="https://api.example") as client:
        result = client.post(
            "/api/hub/session",
            headers={"origin": "https://unrelated.example"},
        )
        assert result.status_code == 403
        assert result.headers["cache-control"] == "private, no-store"


def test_cloud_demo_profiles_are_isolated_and_resume(tmp_path, monkeypatch):
    app = cloud_app(tmp_path, monkeypatch)
    with TestClient(app, base_url="https://api.example") as first, TestClient(
        app, base_url="https://api.example"
    ) as second:
        profile = first.post("/api/hub/session").json()["profile"]
        profile["name"] = "First visitor"
        assert first.put("/api/hub/profile", json=profile).status_code == 200
        assert second.post("/api/hub/session").json()["profile"]["name"] == "Friend"
        assert first.post("/api/hub/session").json()["profile"]["name"] == "First visitor"
        token = first.cookies.get("__session")
        first.cookies.clear()
        first.cookies.set("__session", token + "tampered")
        assert first.get("/api/hub/state").status_code == 401
        first.cookies.clear()
        assert first.post("/api/hub/session").json()["profile"]["name"] == "Friend"
        assert first.post("/api/hub/auth/firebase", json={"token": "unused"}).status_code == 404


def test_cloud_cannot_start_without_session_secret(monkeypatch):
    monkeypatch.delenv("SAATHI_SESSION_SECRET", raising=False)
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    with pytest.raises(ValueError, match="session secret"):
        create_app(
            Settings(
                environment="production", firestore_mode="cloud", firestore_project="saathi-example"
            )
        )
