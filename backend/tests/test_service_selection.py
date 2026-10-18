"""All visible service choices use the same simulated fulfilment."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def owner(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "selection.db"))
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    with TestClient(create_app(Settings(environment="test"))) as api:
        ok(api.post("/api/hub/session"))
        ok(
            api.post(
                "/api/hub/onboarding/locations",
                json={
                    "label": "Home",
                    "address": "12 Sample Lane",
                    "is_default_pickup": True,
                },
            )
        )
        ok(api.patch("/api/hub/onboarding/profile", json={"payment_method": "PAY_ON_COMPLETION"}))
        yield api


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def select(api, service, option, enabled=True):
    return ok(
        api.post(
            f"/api/hub/services/{service}/options",
            json={
                "option_id": option,
                "enabled": enabled,
                "consent": True,
            },
        )
    )


@pytest.mark.parametrize(
    "service,option,quote_id",
    [
        ("RIDE", "demo-ride", "demo-ride"),
        ("RIDE", "uber", "uber-go"),
        ("RIDE", "ola", "ola-mini"),
        ("RIDE", "rapido", "rapido-auto"),
        ("FOOD", "demo-kitchen", "demo-kitchen"),
        ("FOOD", "ubereats", "ubereats"),
        ("FOOD", "swiggy", "swiggy"),
        ("FOOD", "zomato", "zomato"),
    ],
)
def test_every_service_choice_runs_the_full_simulated_flow(owner, service, option, quote_id):
    selected = select(owner, service, option)
    connection = next(s for s in selected["services"] if s["service_type"] == service)
    assert connection["status"] == "CONNECTED"
    assert connection["own_option_enabled"] is option.startswith("demo-")
    body = {"service_type": service}
    if service == "RIDE":
        body["destination_text"] = "Doctor"
    else:
        kitchen = next(k for k in connection["catalogue"]["kitchens"] if k["id"] == quote_id)
        body.update(
            option_id=quote_id, items=[{"item_id": kitchen["items"][0]["id"], "quantity": 1}]
        )
    quotes = ok(owner.post("/api/hub/quotes", json=body))["quotes"]
    assert [q["option_id"] for q in quotes] == [quote_id]
    confirm = {"confirmed": True, "idempotency_key": str(uuid4())}
    path = f"/api/hub/quotes/{quotes[0]['id']}/confirm"
    booking = ok(owner.post(path, json=confirm))
    assert booking["provider_type"] == f"DEMO_{service}"
    assert booking["booking_status"] == "CONFIRMED_SIMULATED"
    assert ok(owner.post(path, json=confirm))["id"] == booking["id"]
    path = f"/api/hub/bookings/{booking['id']}"
    done = ok(owner.post(path + "/complete"))
    assert done["payment"]["status"] == "PENDING_SIMULATED"
    paid = ok(owner.post(path + "/payment/complete"))
    assert paid["booking_status"] == "COMPLETED_SIMULATED"
    assert paid["payment"]["status"] == "SUCCEEDED_SIMULATED"
    assert paid["simulated"] is True


def test_independent_toggles_persist_and_reject_stale_disabled_quotes(owner):
    select(owner, "RIDE", "demo-ride")
    select(owner, "RIDE", "ola")
    quotes = ok(
        owner.post("/api/hub/quotes", json={"service_type": "RIDE", "destination_text": "Doctor"})
    )["quotes"]
    assert [q["option_id"] for q in quotes] == ["demo-ride", "ola-mini"]
    select(owner, "RIDE", "demo-ride", False)
    refused = owner.post(
        f"/api/hub/quotes/{quotes[0]['id']}/confirm",
        json={"confirmed": True, "idempotency_key": str(uuid4())},
    )
    assert refused.status_code == 409
    assert (
        owner.post(
            "/api/hub/quotes",
            json={"service_type": "RIDE", "option_id": "demo-ride", "destination_text": "Doctor"},
        ).status_code
        == 409
    )
    cookie = owner.cookies.get("__session")
    with TestClient(create_app(Settings(environment="test"))) as restarted:
        restarted.cookies.set("__session", cookie)
        quotes = ok(
            restarted.post(
                "/api/hub/quotes", json={"service_type": "RIDE", "destination_text": "Doctor"}
            )
        )["quotes"]
        assert [q["option_id"] for q in quotes] == ["ola-mini"]
        state = select(restarted, "RIDE", "ola", False)
        assert state["services"][0]["status"] == "DISCONNECTED"
        select(restarted, "RIDE", "uber")
        quotes = ok(
            restarted.post(
                "/api/hub/quotes", json={"service_type": "RIDE", "destination_text": "Doctor"}
            )
        )["quotes"]
        assert [q["option_id"] for q in quotes] == ["uber-go"]


def test_request_screen_reconnect_restores_a_usable_demo_option(owner):
    select(owner, "RIDE", "demo-ride")
    select(owner, "RIDE", "demo-ride", False)
    ok(owner.post("/api/hub/services/RIDE/connect-demo", json={"consent": True}))
    quotes = ok(
        owner.post("/api/hub/quotes", json={"service_type": "RIDE", "destination_text": "Doctor"})
    )["quotes"]
    assert [q["option_id"] for q in quotes] == ["demo-ride"]


def test_food_catalogue_and_assistant_exclude_disabled_own_kitchen(owner):
    state = select(owner, "FOOD", "swiggy")
    kitchens = state["services"][1]["catalogue"]["kitchens"]
    assert [k["id"] for k in kitchens if k["enabled"]] == ["swiggy"]
    result = ok(
        owner.post(
            "/api/hub/ask",
            json={"id": str(uuid4()), "message": "I am hungry, something light", "channel": "app"},
        )
    )
    assert result["quotes"]
    assert all(q["option_id"] == "swiggy" for q in result["quotes"])
    refused = owner.post(
        "/api/hub/quotes",
        json={
            "service_type": "FOOD",
            "option_id": "demo-kitchen",
            "items": [{"item_id": "khichdi"}],
        },
    )
    assert refused.status_code == 409


def test_selection_requires_consent_valid_option_and_owner(owner):
    path = "/api/hub/services/RIDE/options"
    for body in [
        {"option_id": "uber", "enabled": True},
        {"option_id": "uber", "enabled": True, "consent": False},
        {"option_id": "swiggy", "enabled": True, "consent": True},
        {"option_id": "uber", "enabled": "true", "consent": True},
    ]:
        assert owner.post(path, json=body).status_code == 422
    invite = ok(
        owner.post("/api/hub/care-circle", json={"name": "Viewer", "role": "viewer", "extras": []})
    )
    with TestClient(create_app(Settings(environment="test"))) as care:
        ok(care.post("/api/hub/caregiver/join", json={"code": invite["code"]}))
        assert (
            care.post(
                path, json={"option_id": "uber", "enabled": True, "consent": True}
            ).status_code
            == 403
        )
