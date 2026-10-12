import json
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import providers
from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "providers.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def client(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        yield api


def profile_of(client):
    return client.get("/api/hub/state").json()["profile"]


def save_profile(client, **changes):
    result = client.put("/api/hub/profile", json={**profile_of(client), **changes})
    assert result.status_code == 200, result.text
    return result.json()["profile"]


def propose(client, service, **extra):
    body = {"id": str(uuid4()), "service": service, **extra}
    result = client.post("/api/hub/requests", json=body)
    assert result.status_code == 200, result.text
    return result.json()


def confirm(client, proposal, option_id):
    return client.post(
        f"/api/hub/requests/{proposal['id']}/confirm",
        json={"option_id": option_id, "confirmed": True},
    )


def test_catalogue_lists_every_app_as_simulated(client):
    state = client.get("/api/hub/state").json()
    names = {item["id"]: item["name"] for item in state["catalogue"]}
    assert names["uber"] == "Uber"
    assert names["ubereats"] == "Uber Eats"
    assert all(item["simulated"] for item in state["catalogue"])
    assert state["profile"]["enabled_providers"] == list(providers.PROVIDER_IDS)


def test_rides_compare_apps_cheapest_first(client):
    proposal = propose(client, "ride", destination="Community centre")
    options = proposal["options"]
    assert [option["provider"] for option in options] == ["rapido", "ola", "uber"]
    assert [option["price"] for option in options] == sorted(option["price"] for option in options)
    for option in options:
        assert option["simulated"] is True
        assert option["eta_min"] > 0
        assert "Community centre" in option["detail"]
        assert option["provider_name"] in {"Rapido", "Ola", "Uber"}


def test_food_shows_one_choice_per_app_within_diet_and_budget(client):
    options = propose(client, "food")["options"]
    assert {option["provider"] for option in options} == {"ubereats", "swiggy", "zomato"}
    assert all("Non-vegetarian" not in option["detail"] for option in options)
    assert all("medium" not in option["detail"] for option in options)
    assert all(option["price"] <= 200 for option in options)


def test_food_options_are_capped_for_older_users(client):
    save_profile(client, vegetarian=False, mild=False, budget=500)
    options = propose(client, "food")["options"]
    assert len(options) <= providers.MAX_FOOD_OPTIONS
    assert {option["provider"] for option in options} == {"ubereats", "swiggy", "zomato"}
    assert any("Non-vegetarian" in option["detail"] for option in options)


def test_option_ids_are_unique(client):
    save_profile(client, vegetarian=False, mild=False, budget=500)
    for service, extra in [("food", {}), ("ride", {"destination": "Park"})]:
        ids = [option["id"] for option in propose(client, service, **extra)["options"]]
        assert len(ids) == len(set(ids))


def test_turned_off_apps_are_not_offered(client):
    save_profile(client, enabled_providers=["ola", "swiggy"])
    rides = propose(client, "ride", destination="Park")["options"]
    meals = propose(client, "food")["options"]
    assert {option["provider"] for option in rides} == {"ola"}
    assert {option["provider"] for option in meals} == {"swiggy"}


def test_no_app_for_a_service_asks_to_turn_one_on(client):
    save_profile(client, enabled_providers=["uber"])
    result = propose(client, "food")
    assert result["options"] == []
    assert "Turn on a food app" in result["clarification"]
    assert result["status"] == "needs_details"


def test_confirmation_records_the_chosen_app_and_a_simulated_reference(client):
    proposal = propose(client, "ride", destination="Clinic")
    uber = next(option for option in proposal["options"] if option["provider"] == "uber")
    order = confirm(client, proposal, uber["id"]).json()
    assert order["option"]["provider_name"] == "Uber"
    assert order["simulated"] is True
    assert order["reference"] == f"SIM-{proposal['id'][:8].upper()}"
    assert order["status"] == "simulated_confirmed"
    assert confirm(client, proposal, uber["id"]).json() == order


def test_cannot_confirm_an_app_turned_off_after_the_quote(client):
    proposal = propose(client, "ride", destination="Clinic")
    uber = next(option for option in proposal["options"] if option["provider"] == "uber")
    save_profile(client, enabled_providers=["ola"])
    result = confirm(client, proposal, uber["id"])
    assert result.status_code == 409
    assert "turned off" in result.json()["detail"]
    assert client.get("/api/hub/state").json()["activity"] == []


@pytest.mark.parametrize("bad", [["nope"], ["uber", "uber"], ["uber", "ola", "x"]])
def test_profile_rejects_unknown_or_repeated_apps(client, bad):
    result = client.put("/api/hub/profile", json={**profile_of(client), "enabled_providers": bad})
    assert result.status_code == 422


def test_profile_saved_before_apps_existed_keeps_every_app_on(client, tmp_path):
    save_profile(client, enabled_providers=["uber"])
    with sqlite3.connect(tmp_path / "providers.db") as db:
        owner, raw = db.execute("SELECT id, state FROM accounts").fetchone()
        state = json.loads(raw)
        del state["profile"]["enabled_providers"]
        db.execute("UPDATE accounts SET state=? WHERE id=?", (json.dumps(state), owner))
    assert profile_of(client)["enabled_providers"] == list(providers.PROVIDER_IDS)
    assert len(propose(client, "ride", destination="Park")["options"]) == 3


def test_medicine_uses_only_the_demo_pharmacy_and_never_a_brand(client):
    options = propose(client, "medicine", medicine="Saved medicine A")["options"]
    assert [option["provider"] for option in options] == ["pharmacy"]
    assert options[0]["provider_name"] == "Demo pharmacy"


def test_no_option_claims_a_real_booking(client):
    save_profile(client, vegetarian=False, mild=False, budget=500)
    for service, extra in [("food", {}), ("ride", {"destination": "Park"})]:
        for option in propose(client, service, **extra)["options"]:
            assert option["simulated"] is True
            assert "Sample fare" in option["detail"] or "Demo" in option["detail"]
