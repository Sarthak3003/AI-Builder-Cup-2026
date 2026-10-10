from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

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
        yield api


def propose(client, service="food", **kwargs):
    body = {"id": str(uuid4()), "service": service, **kwargs}
    result = client.post("/api/hub/requests", json=body)
    assert result.status_code == 200, result.text
    return result.json()


def confirm(client, proposal, option=None):
    return client.post(
        f"/api/hub/requests/{proposal['id']}/confirm",
        json={"option_id": option or proposal["options"][0]["id"], "confirmed": True},
    )


def enable_care(client):
    profile = client.get("/api/hub/state").json()["profile"]
    profile.update(caregiver_enabled=True, approval_limit=100, caregiver_name="Demo caregiver")
    assert client.put("/api/hub/profile", json=profile).status_code == 200
    return client.post("/api/hub/caregiver/invite").json()["code"]


@pytest.mark.parametrize(
    "service,extra",
    [
        ("food", {}),
        ("ride", {"destination": "Community centre"}),
        ("medicine", {"medicine": "Saved medicine A"}),
    ],
)
def test_all_services_persist_and_cancel(client, service, extra):
    proposal = propose(client, service, **extra)
    result = confirm(client, proposal)
    assert result.status_code == 200
    assert result.json()["status"] == "simulated_confirmed"
    assert client.get("/api/hub/state").json()["activity"][0] == result.json()
    assert confirm(client, proposal).json() == result.json()
    path = f"/api/hub/activity/{proposal['id']}/cancel"
    assert client.post(path).json()["status"] == "cancelled"
    assert client.post(path).json()["status"] == "cancelled"
    assert confirm(client, proposal).json()["status"] == "cancelled"


def test_caregiver_permissions_and_revocation(app, client):
    code = enable_care(client)
    proposal = propose(client)
    assert confirm(client, proposal).json()["status"] == "awaiting_approval"
    decision = f"/api/hub/activity/{proposal['id']}/decision"
    assert client.post(decision, json={"action": "approve"}).status_code == 403
    with TestClient(app) as caregiver:
        assert (
            caregiver.post("/api/hub/caregiver/join", json={"code": code}).json()["role"]
            == "caregiver"
        )
        assert caregiver.post("/api/hub/caregiver/join", json={"code": code}).status_code == 403
        assert (
            caregiver.post(
                "/api/hub/requests", json={"id": str(uuid4()), "service": "food"}
            ).status_code
            == 403
        )
        assert caregiver.delete("/api/hub/data").status_code == 403
        assert (
            caregiver.post(decision, json={"action": "approve"}).json()["status"]
            == "simulated_confirmed"
        )
        assert caregiver.post(decision, json={"action": "reject"}).status_code == 409
        client.delete("/api/hub/caregiver")
        assert caregiver.get("/api/hub/state").status_code == 403


def test_other_owner_cannot_access_request(app, client):
    proposal = propose(client)
    with TestClient(app) as other:
        other.post("/api/hub/session")
        assert confirm(other, proposal).status_code == 404
        assert other.get("/api/hub/state").json()["activity"] == []


def test_confirmation_cannot_invent_prices_or_options(client):
    proposal = propose(client)
    assert confirm(client, proposal, "fake").status_code == 400
    path = f"/api/hub/requests/{proposal['id']}/confirm"
    assert client.post(path, json={"option_id": "dal", "confirmed": False}).status_code == 422
    assert (
        client.post(path, json={"option_id": "dal", "confirmed": True, "price": 1}).status_code
        == 422
    )


def test_request_idempotency_and_conflict(client):
    body = {"id": str(uuid4()), "service": "food"}
    first = client.post("/api/hub/requests", json=body).json()
    assert client.post("/api/hub/requests", json=body).json() == first
    assert client.post("/api/hub/requests", json={**body, "budget": 20}).status_code == 409
    assert len(client.get("/api/hub/state").json()["requests"]) == 1


def test_parallel_confirmations_only_create_one(app, client):
    proposal = propose(client)
    cookie = client.cookies.get("__session")

    def send(_):
        with TestClient(app) as api:
            api.cookies.set("__session", cookie)
            return confirm(api, proposal)

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(send, range(4)))
    assert all(result.status_code == 200 for result in results)
    assert len(client.get("/api/hub/state").json()["activity"]) == 1


def test_clarifications_and_budget(client):
    assert propose(client, budget=1)["options"] == []
    assert propose(client, "ride")["options"] == []
    assert propose(client, "medicine", medicine="unknown")["options"] == []
    assert propose(client, message="chest pain emergency")["options"] == []
    assert propose(client, message="peanut allergy")["options"] == []


def test_channels_share_history_and_profile(client):
    profile = client.get("/api/hub/state").json()["profile"]
    profile.update(name="Demo user", large_text=True, language="hi-IN", budget=100)
    client.put("/api/hub/profile", json=profile)
    for channel in ["app", "message", "voice"]:
        proposal = propose(client, channel=channel)
        assert [option["id"] for option in proposal["options"]] == ["khichdi"]
        confirm(client, proposal)
    state = client.get("/api/hub/state").json()
    assert state["profile"]["name"] == "Demo user"
    assert len(state["activity"]) == 3
    assert {item["channel"] for item in state["activity"]} == {"app", "message", "voice"}


def test_expired_options_rejected(client, monkeypatch):
    import time

    proposal = propose(client)
    now = time.time()
    monkeypatch.setattr("app.hub.time.time", lambda: now + 901)
    assert confirm(client, proposal).status_code == 409


def test_cross_site_requests_rejected(client):
    assert (
        client.post("/api/hub/session", headers={"Origin": "https://evil.invalid"}).status_code
        == 403
    )


def test_reset_clears_history(client):
    confirm(client, propose(client))
    result = client.delete("/api/hub/data")
    assert result.status_code == 200
    assert result.json()["activity"] == []


def test_cookie_tamper_rejected(app):
    with TestClient(app) as client:
        client.cookies.set("__session", "forged.token")
        assert client.get("/api/hub/state").status_code == 401


def test_local_data_survives_app_restart(client):
    confirm(client, propose(client))
    cookie = client.cookies.get("__session")
    with TestClient(create_app(Settings(environment="test"))) as restarted:
        restarted.cookies.set("__session", cookie)
        assert len(restarted.get("/api/hub/state").json()["activity"]) == 1
