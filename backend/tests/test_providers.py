"""Familiar app names are simulated options; Saathi's demo providers make every booking."""

from uuid import uuid4

import pytest
from booking_helpers import book, confirm, ok, quotes, ready, state
from fastapi.testclient import TestClient

from app import providers
from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "providers.db"))
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    return create_app(Settings(environment="test"))


@pytest.fixture
def client(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        ready(api)
        yield api


def save_profile(client, **changes):
    return ok(client.put("/api/hub/profile", json={**state(client)["profile"], **changes}))


def test_catalogue_lists_every_familiar_name_as_simulated(client):
    current = state(client)
    names = {item["id"]: item["name"] for item in current["catalogue"]}
    assert names == {
        "uber": "Uber",
        "ola": "Ola",
        "rapido": "Rapido",
        "ubereats": "Uber Eats",
        "swiggy": "Swiggy",
        "zomato": "Zomato",
    }
    assert all(item["simulated"] for item in current["catalogue"])
    assert current["profile"]["enabled_providers"] == list(providers.APP_IDS)


def test_a_familiar_name_is_only_a_label_the_demo_provider_makes_the_booking(client):
    booked = book(client, option="uber-go")
    assert (booked["app_name"], booked["option_name"]) == ("Uber", "Uber Go")
    assert (booked["provider_type"], booked["provider_label"]) == (
        "DEMO_RIDE",
        "Demo Ride Provider",
    )
    assert booked["provider_booking_id"].startswith("DEMO-RIDE-")
    assert booked["simulated"] is True and "no real driver" in booked["notice"]


def test_meal_suggestions_follow_diet_spice_and_budget(client):
    reply = ok(
        client.post(
            "/api/hub/ask",
            json={"id": str(uuid4()), "message": "I'm hungry, something light to eat"},
        )
    )
    assert {q["app_id"] for q in reply["quotes"]} == {None, "ubereats", "swiggy", "zomato"}
    assert reply["quotes"][0]["option_name"] == "Saathi Demo Kitchen"
    for quote in reply["quotes"]:
        item = quote["details"]["items"][0]
        assert item["vegetarian"] and item["mild"] and quote["amount_minor"] <= 20000
    save_profile(client, vegetarian=False, mild=False, budget=500)
    reply = ok(client.post("/api/hub/ask", json={"id": str(uuid4()), "message": "I want dinner"}))
    assert len(reply["quotes"]) == providers.MAX_FOOD_OPTIONS
    assert any(not q["details"]["items"][0]["vegetarian"] for q in reply["quotes"])


def test_an_option_switched_off_after_the_quote_cannot_be_confirmed(client):
    uber = next(q for q in quotes(client) if q["option_id"] == "uber-go")
    save_profile(client, enabled_providers=["ola"])
    refused = confirm(client, uber)
    assert refused.status_code == 409 and "switched off" in refused.json()["detail"]
    assert state(client)["activity"] == []


@pytest.mark.parametrize("bad", [["nope"], ["uber", "uber"], ["pharmacy"]])
def test_profile_rejects_unknown_or_repeated_names(client, bad):
    profile = state(client)["profile"]
    assert (
        client.put("/api/hub/profile", json={**profile, "enabled_providers": bad}).status_code
        == 422
    )


def test_the_pharmacy_has_no_brand_and_no_quote_claims_a_real_booking(client):
    pharmacy = quotes(client, "medicine")[0]
    assert (pharmacy["app_name"], pharmacy["provider_label"]) == (None, "Demo Pharmacy Provider")
    save_profile(client, vegetarian=False, mild=False, budget=500)
    for service in ("ride", "food", "medicine"):
        for quote in quotes(client, service):
            assert quote["simulated"] is True and quote["notice"].startswith("Demo")
