"""Phase 3: quotes are priced on the server, expire, and never book anything."""

import json
import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_assistant import fake_gemini

from app.config import Settings
from app.main import create_app

HOME = {"label": "Home", "address": "12 Sample Lane, Demo Nagar (sample address)"}
DOCTOR = {"label": "Doctor", "address": "Sunrise Clinic, 4 Example Road (sample address)"}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "quotes.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        yield api


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def set_up(api, *services, payment="DEMO_WALLET"):
    ok(api.post("/api/hub/onboarding/locations", json=HOME))
    doctor = ok(api.post("/api/hub/onboarding/locations", json=DOCTOR))
    for service in services or ("RIDE", "FOOD", "PHARMACY"):
        ok(api.post(f"/api/hub/services/{service}/connect-demo", json={"consent": True}))
    ok(api.patch("/api/hub/onboarding/profile", json={"payment_method": payment}))
    return {place["label"]: place["id"] for place in doctor["places"]}


def quote(api, **body):
    return api.post("/api/hub/quotes", json=body)


def test_a_ride_request_returns_server_priced_quotes_for_each_switched_on_option(owner):
    places = set_up(owner)
    result = ok(quote(owner, service_type="RIDE", destination_place_id=places["Doctor"]))
    quotes = result["quotes"]
    assert [q["option_name"] for q in quotes] == ["Demo Ride", "Rapido Auto", "Ola Mini", "Uber Go"]
    assert [q["amount_minor"] for q in quotes] == [9400, 8300, 12500, 13500]
    assert [q["app_name"] for q in quotes] == [None, "Rapido", "Ola", "Uber"]
    for q in quotes:
        assert q["provider_label"] == "Demo Ride Provider" and q["simulated"] is True
        assert q["currency"] == "INR" and q["status"] == "ACTIVE"
        assert q["amount_minor"] == sum(line["amount_minor"] for line in q["line_items"])
        assert q["expires_at"] - q["created_at"] == 900
        assert q["notice"] == "Demo ride — no real driver will arrive."
        assert q["details"]["pickup"]["label"] == "Home"
        assert q["details"]["destination"]["label"] == "Doctor"
        assert q["pickup_eta_min"] and q["duration_min"]
        assert q["payment_method"] == "DEMO_WALLET" and q["approval"]["required"] is False
        assert q["request_id"] == result["request_id"]
    assert len({q["id"] for q in quotes}) == 4
    state = ok(owner.get("/api/hub/state"))
    assert state["activity"] == []
    assert {q["id"] for q in state["quotes"]} == {q["id"] for q in quotes}


def test_one_option_typed_destinations_and_saved_place_names(owner):
    set_up(owner)
    single = ok(quote(owner, service_type="RIDE", option_id="uber-go", destination_text="Market"))
    assert [q["option_id"] for q in single["quotes"]] == ["uber-go"]
    assert single["quotes"][0]["details"]["destination"] == {
        "label": "Market",
        "address": "Market",
        "place_id": None,
    }
    named = ok(quote(owner, service_type="RIDE", destination_text="my doctor"))
    assert named["quotes"][0]["details"]["destination"]["label"] == "Doctor"
    assert named["quotes"][0]["amount_minor"] == 9400


def test_an_unconnected_service_cannot_be_quoted_and_says_how_to_connect(owner):
    set_up(owner, "FOOD")
    refused = quote(owner, service_type="RIDE", destination_text="Market")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Connect the Demo Ride Provider first, in Services."
    ok(owner.post("/api/hub/services/FOOD/disconnect"))
    meal = {"service_type": "FOOD", "option_id": "swiggy", "items": [{"item_id": "khichdi"}]}
    assert quote(owner, **meal).status_code == 409


def test_rides_need_a_pickup_and_a_destination_that_differ(owner):
    ok(owner.post("/api/hub/services/RIDE/connect-demo", json={"consent": True}))
    no_pickup = quote(owner, service_type="RIDE", destination_text="Market")
    assert no_pickup.status_code == 409 and "usual pickup" in no_pickup.json()["detail"]
    places = set_up(owner, "RIDE")
    assert quote(owner, service_type="RIDE").status_code == 422
    same = quote(owner, service_type="RIDE", destination_place_id=places["Home"])
    assert same.status_code == 422 and same.json()["detail"] == (
        "Pickup and destination are the same place."
    )
    assert quote(owner, service_type="RIDE", destination_place_id="nope").status_code == 404


def test_clients_cannot_send_prices_statuses_or_unknown_values(owner):
    set_up(owner)
    for body in [
        {"service_type": "RIDE", "destination_text": "Market", "amount_minor": 1},
        {"service_type": "RIDE", "destination_text": "Market", "status": "CONSUMED"},
        {"service_type": "TAXI", "destination_text": "Market"},
        {"service_type": "RIDE", "destination_text": "Market", "channel": "fax"},
        {
            "service_type": "FOOD",
            "option_id": "swiggy",
            "items": [{"item_id": "khichdi", "quantity": 9}],
        },
        {
            "service_type": "FOOD",
            "option_id": "swiggy",
            "items": [{"item_id": "khichdi", "price": 1}],
        },
    ]:
        assert quote(owner, **body).status_code == 422, body
    unknown = quote(owner, service_type="RIDE", option_id="helicopter", destination_text="Market")
    assert unknown.status_code == 422 and unknown.json()["detail"].startswith("Choose one of")


def test_switched_off_options_are_neither_offered_nor_quotable(owner):
    set_up(owner)
    profile = ok(owner.get("/api/hub/state"))["profile"]
    profile["enabled_providers"] = ["ola", "zomato"]
    ok(owner.put("/api/hub/profile", json=profile))
    rides = ok(quote(owner, service_type="RIDE", destination_text="Market"))["quotes"]
    assert [q["option_id"] for q in rides] == ["demo-ride", "ola-mini"]
    assert quote(
        owner, service_type="RIDE", option_id="uber-go", destination_text="X"
    ).status_code == (409)
    meal = {"service_type": "FOOD", "option_id": "swiggy", "items": [{"item_id": "khichdi"}]}
    assert quote(owner, **meal).json()["detail"] == "Swiggy is switched off in Services."
    profile["enabled_providers"] = []
    ok(owner.put("/api/hub/profile", json=profile))
    # The demo providers' own options have no familiar name, so they cannot be switched off.
    only = ok(quote(owner, service_type="RIDE", destination_text="Market"))["quotes"]
    assert [q["option_id"] for q in only] == ["demo-ride"]
    own = {"service_type": "FOOD", "option_id": "demo-kitchen", "items": [{"item_id": "dal"}]}
    assert ok(quote(owner, **own))["quotes"][0]["app_id"] is None


def test_food_and_pharmacy_quotes_itemise_and_label_the_simulation(owner):
    set_up(owner)
    meal = ok(
        quote(
            owner,
            service_type="FOOD",
            option_id="swiggy",
            items=[{"item_id": "khichdi", "quantity": 2}, {"item_id": "roti"}],
        )
    )["quotes"][0]
    assert meal["amount_minor"] == 2 * 8500 + 2000 + 2500
    assert (meal["app_name"], meal["provider_label"]) == ("Swiggy", "Demo Food Provider")
    assert meal["delivery_min"] == 25 and meal["service"] == "food"
    pharmacy = ok(quote(owner, service_type="PHARMACY", items=[{"item_id": "ors"}]))["quotes"][0]
    assert pharmacy["amount_minor"] == 6000 + 2000 and pharmacy["service"] == "medicine"
    assert "not medical advice" in pharmacy["notice"]
    refused = quote(owner, service_type="PHARMACY", items=[{"item_id": "bp-tablet"}])
    assert refused.status_code == 422 and refused.json()["detail"].startswith("Choose items")


def test_quotes_preview_the_payment_method_and_the_owners_approval_rule(owner):
    places = set_up(owner, payment="PAY_ON_COMPLETION")
    profile = ok(owner.get("/api/hub/state"))["profile"]
    profile.update(caregiver_enabled=True, approval_limit=100)
    ok(owner.put("/api/hub/profile", json=profile))
    rides = ok(quote(owner, service_type="RIDE", destination_place_id=places["Doctor"]))["quotes"]
    preview = {q["option_id"]: q["approval"] for q in rides}
    assert preview["demo-ride"] == {"required": False, "reason": ""}
    assert preview["rapido-auto"] == {"required": False, "reason": ""}
    assert preview["uber-go"] == {"required": True, "reason": "Above the ₹100 approval limit."}
    assert {q["payment_method"] for q in rides} == {"PAY_ON_COMPLETION"}
    pharmacy = ok(quote(owner, service_type="PHARMACY", items=[{"item_id": "ors"}]))["quotes"][0]
    assert pharmacy["approval"] == {"required": True, "reason": "Pharmacy orders need approval."}


def hide_ride_options(api):
    profile = ok(api.get("/api/hub/state"))["profile"]
    assert profile["show_ride_options"] is True
    profile["show_ride_options"] = False
    ok(api.put("/api/hub/profile", json=profile))


def test_with_ride_options_hidden_saathi_picks_one_ride_by_price_and_wait(owner, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    places = set_up(owner)
    doctor = {"service_type": "RIDE", "destination_place_id": places["Doctor"]}
    assert not any(q.get("recommended") for q in ok(quote(owner, **doctor))["quotes"])
    hide_ride_options(owner)
    rides = ok(quote(owner, **doctor))["quotes"]
    picked = [q for q in rides if q.get("recommended")]
    assert [q["option_id"] for q in picked] == ["rapido-auto"]
    assert picked[0]["recommended"] == {
        "reason": "Lowest price and shortest wait: ₹83, about 3 min away.",
        "by": "rules",
    }
    after = ok(owner.get("/api/hub/state"))
    assert {q["id"]: q.get("recommended") for q in after["quotes"]}[picked[0]["id"]][
        "by"
    ] == "rules"
    assert after["activity"] == [], "a pick is only a suggestion; nothing is booked"
    single = ok(quote(owner, **doctor, option_id="uber-go"))["quotes"]
    assert single[0].get("recommended") is None


def test_gemini_can_reweigh_the_pick_and_the_rule_stands_if_it_cannot(owner, monkeypatch):
    places = set_up(owner)
    hide_ride_options(owner)
    doctor = {"service_type": "RIDE", "destination_place_id": places["Doctor"]}
    sent = fake_gemini(monkeypatch, {"option_id": "demo-ride", "reason": "A car, ₹94, 4 min."})
    rides = ok(quote(owner, **doctor))["quotes"]
    picks = {q["option_id"]: q["recommended"] for q in rides if q.get("recommended")}
    assert picks == {"demo-ride": {"reason": "A car, ₹94, 4 min.", "by": "gemini"}}
    stored = {q["id"]: q.get("recommended") for q in ok(owner.get("/api/hub/state"))["quotes"]}
    assert [mark["by"] for mark in stored.values() if mark] == ["gemini"]
    prompt = json.loads(sent[0].data)["contents"][0]["parts"][0]["text"]
    assert '"minutes_to_pickup": 3' in prompt and '"price_rupees": 83.0' in prompt
    fake_gemini(monkeypatch, {"option_id": "helicopter", "reason": "Fastest."})
    rides = ok(quote(owner, **doctor))["quotes"]
    assert [q["option_id"] for q in rides if q.get("recommended")] == ["rapido-auto"]


def test_saathi_books_its_pick_end_to_end_once_per_retry_key(owner, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    places = set_up(owner)
    doctor = {"service_type": "RIDE", "destination_place_id": places["Doctor"]}
    asked = {**doctor, "idempotency_key": "book-best-0001"}
    assert "booking" not in ok(quote(owner, **asked)), "the list is still shown, so no booking"
    hide_ride_options(owner)
    first = ok(quote(owner, **asked))["booking"]
    assert (first["option_id"], first["provider_booking_id"]) == ("rapido-auto", "DEMO-RIDE-1042")
    assert (first["booking_status"], first["payment"]["status"]) == (
        "CONFIRMED_SIMULATED",
        "SUCCEEDED_SIMULATED",
    )
    assert first["chosen_by"] == {
        "reason": "Lowest price and shortest wait: ₹83, about 3 min away.",
        "by": "rules",
    }
    again = ok(quote(owner, **asked))["booking"]
    assert again["id"] == first["id"], "a retried request returns the same booking"
    after = ok(owner.get("/api/hub/state"))
    assert len(after["activity"]) == 1
    assert "auto_booked" in [entry["event"] for entry in after["audit"]]
    assert "booking" not in ok(quote(owner, **doctor)), "no retry key, so nothing is booked"


def test_asking_saathi_books_the_ride_and_a_forced_failure_books_nothing(owner, monkeypatch):
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    set_up(owner)
    hide_ride_options(owner)
    ask = {"id": "11111111-1111-4111-8111-111111111111", "message": "Take me to my doctor"}
    reply = ok(owner.post("/api/hub/ask", json=ask))
    assert reply["booking"]["title"] == "Rapido Auto to Doctor"
    assert reply["booking"]["booking_status"] == "CONFIRMED_SIMULATED"
    assert ok(owner.post("/api/hub/ask", json=ask))["booking"]["id"] == reply["booking"]["id"]
    ok(owner.post("/api/hub/demo/fail-next"))
    failed = ok(owner.post("/api/hub/ask", json={**ask, "id": str(uuid4())}))["booking"]
    assert (failed["booking_status"], failed["payment"]["status"]) == (
        "FAILED",
        "NOT_CHARGED_SIMULATED",
    )
    assert [b["booking_status"] for b in ok(owner.get("/api/hub/state"))["activity"]] == [
        "FAILED",
        "CONFIRMED_SIMULATED",
    ]


def test_expired_quotes_drop_out_of_the_active_list(owner, monkeypatch):
    set_up(owner)
    ok(quote(owner, service_type="RIDE", destination_text="Market"))
    later = time.time() + 901
    monkeypatch.setattr("app.bookings.time.time", lambda: later)
    assert ok(owner.get("/api/hub/state"))["quotes"] == []


def test_appointment_rides_use_the_saved_appointment(owner):
    set_up(owner)
    appointment = ok(
        owner.post(
            "/api/hub/appointments",
            json={
                "title": "Eye check-up",
                "place": "Demo Eye Care, 9 Sample Street (sample address)",
                "starts_at": time.time() + 86400,
            },
        )
    )
    rides = ok(quote(owner, service_type="RIDE", appointment_id=appointment["id"]))["quotes"]
    assert rides[0]["appointment_id"] == appointment["id"]
    assert rides[0]["details"]["destination"]["label"] == "Eye check-up"
    assert quote(owner, service_type="RIDE", appointment_id="gone").status_code == 404


def test_caretakers_and_other_accounts_cannot_request_quotes(app, owner):
    set_up(owner)
    code = ok(owner.post("/api/hub/onboarding/caretaker-grants", json={"name": "Asha"}))["code"]
    with TestClient(app) as asha, TestClient(app) as stranger:
        ok(asha.post("/api/hub/caregiver/join", json={"code": code}))
        assert quote(asha, service_type="RIDE", destination_text="Market").status_code == 403
        ok(stranger.post("/api/hub/session"))
        refused = quote(stranger, service_type="RIDE", destination_text="Market")
        assert refused.status_code == 409
        assert "quotes" not in ok(asha.get("/api/hub/state"))
