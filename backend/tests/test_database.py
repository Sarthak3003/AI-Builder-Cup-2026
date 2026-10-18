from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.database import FirestoreConnection
from app.main import create_app


@pytest.fixture(autouse=True)
def isolate_environment(monkeypatch):
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.setenv("SAATHI_FIRESTORE_MODE", "disabled")


def emulator_settings(monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    return Settings(environment="test", firestore_mode="emulator")


def test_disabled_does_not_create_client():
    with patch("app.database.firestore.Client") as constructor:
        assert FirestoreConnection(Settings()).probe() == "disabled"
        constructor.assert_not_called()


@pytest.mark.parametrize("host", [None, "https://localhost:8085", "example.com:8085", "localhost"])
def test_emulator_rejects_missing_or_nonlocal_host(monkeypatch, host):
    if host:
        monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", host)
    with pytest.raises(ValidationError):
        Settings(firestore_mode="emulator")


def test_emulator_rejects_real_project(monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "localhost:8085")
    with pytest.raises(ValidationError):
        Settings(firestore_mode="emulator", firestore_project="real-project")


def test_cloud_rejects_local_environment():
    with pytest.raises(ValidationError):
        Settings(firestore_mode="cloud", firestore_project="real-project")


def test_cloud_rejects_emulator_environment(monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "localhost:8085")
    with pytest.raises(ValidationError):
        Settings(environment="production", firestore_mode="cloud", firestore_project="real-project")


def test_probe_reads_with_deadline_and_closes_client(monkeypatch):
    config = emulator_settings(monkeypatch)
    with patch("app.database.firestore.Client") as constructor:
        client = constructor.return_value
        client.document.return_value.get.return_value.exists = False
        assert FirestoreConnection(config).probe() == "ready"
        assert constructor.call_args.kwargs["project"] == "demo-saathi"
        client.document.assert_called_once_with("_system/connectivity")
        client.document.return_value.get.assert_called_once_with(retry=None, timeout=3.0)
        client.close.assert_called_once()


def test_environment_change_fails_closed(monkeypatch):
    config = emulator_settings(monkeypatch)
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST")
    with patch("app.database.firestore.Client") as constructor:
        assert FirestoreConnection(config).probe() == "unavailable"
        constructor.assert_not_called()


@pytest.mark.parametrize("path", ["/ready", "/api/ready"])
def test_readiness_is_not_faked_when_disabled(path):
    with TestClient(create_app(Settings())) as client:
        result = client.get(path)
        assert result.status_code == 503
        assert result.json() == {"status": "not_ready", "firestore": "disabled"}
        assert client.get("/health").status_code == 200


def test_database_failure_is_sanitized_and_connection_closed(monkeypatch):
    config = emulator_settings(monkeypatch)
    client = MagicMock()
    client.document.return_value.get.side_effect = RuntimeError("private SDK details")
    with patch("app.database.firestore.Client", return_value=client):
        with TestClient(create_app(config)) as api:
            result = api.get("/ready")
            assert result.status_code == 503
            assert result.json() == {"status": "not_ready", "firestore": "unavailable"}
    client.close.assert_called_once()


def test_successful_readiness_response(monkeypatch):
    config = emulator_settings(monkeypatch)
    with patch("app.database.firestore.Client"):
        with TestClient(create_app(config)) as api:
            assert api.get("/ready").json() == {"status": "ready", "firestore": "ready"}
