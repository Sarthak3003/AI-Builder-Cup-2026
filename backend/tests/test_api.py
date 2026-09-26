import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app(Settings(environment="test", version="0.1.0"))) as test_client:
        yield test_client


@pytest.mark.parametrize("path", ["/health", "/api/health"])
def test_health_contract(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "saathi-api"}


@pytest.mark.parametrize("path", ["/version", "/api/version"])
def test_version_contract(client, path):
    assert client.get(path).json() == {"version": "0.1.0", "environment": "test"}


def test_configuration_from_environment(monkeypatch):
    monkeypatch.setenv("SAATHI_ENVIRONMENT", "production")
    assert Settings().environment == "production"


def test_invalid_environment_rejected(monkeypatch):
    monkeypatch.setenv("SAATHI_ENVIRONMENT", "typo")
    with pytest.raises(ValidationError):
        Settings()


def test_unknown_route_is_not_success(client):
    assert client.get("/api/orders").status_code == 404
