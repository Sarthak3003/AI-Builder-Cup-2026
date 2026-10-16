"""Phase 1: the demo provider contract, deterministic pricing and the setup data model."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import onboarding, providers
from app.care import ensure
from app.config import Settings
from app.hub_store import initial_state
from app.main import create_app
from app.onboarding import PlaceIn
from app.providers import (
    CreateBookingRequest,
    ItemRequest,
    PlaceRef,
    ProviderError,
    QuoteRequest,
    provider_for,
)
from app.seed import seed

HOME = PlaceRef(label="Home", address="12 Sample Lane, Demo Nagar (sample address)")
DOCTOR = PlaceRef(label="Doctor", address="Sunrise Clinic, 4 Example Road (sample address)")


def ride(option="uber-go", pickup=HOME, destination=DOCTOR):
    return QuoteRequest(
        service_type="RIDE", option_id=option, pickup=pickup, destination=destination
    )


def food(kitchen="swiggy", *items):
    lines = [ItemRequest(item_id=item, quantity=qty) for item, qty in items or [("khichdi", 1)]]
    return QuoteRequest(service_type="FOOD", option_id=kitchen, items=lines)


def pharmacy(*items):
    lines = [ItemRequest(item_id=item, quantity=qty) for item, qty in items]
    return QuoteRequest(service_type="PHARMACY", items=lines)


def test_every_demo_provider_implements_the_same_contract():
    ledger = {}
    for service_type in ("RIDE", "FOOD", "PHARMACY"):
        provider = provider_for(service_type, ledger)
        assert provider.label.startswith("Demo ")
        assert provider.provider_type == f"DEMO_{service_type}"
        assert provider.capabilities
        for method in ("get_quote", "create_booking", "get_booking", "cancel_booking"):
            assert callable(getattr(provider, method))


def test_ride_quotes_are_itemised_deterministic_and_marked_simulated():
    provider = provider_for("RIDE", {})
    first = provider.get_quote(ride())
    assert first == provider.get_quote(ride())
    assert first.provider_label == "Demo Ride Provider"
    assert (first.app_name, first.option_name) == ("Uber", "Uber Go")
    assert first.currency == "INR" and first.simulated is True
    assert first.amount_minor == sum(line.amount_minor for line in first.line_items)
    assert all(isinstance(line.amount_minor, int) for line in first.line_items)
    assert first.amount_minor % 100 == 0
    assert first.pickup_eta_min == 6 and first.duration_min > 5
    assert first.notice == "Demo ride — no real driver will arrive."
    assert first.title == "Uber Go to Doctor"
    assert 2 <= first.details["distance_km"] <= 12
    cheaper = provider.get_quote(ride("rapido-auto"))
    assert cheaper.amount_minor < first.amount_minor
    assert cheaper.details["distance_km"] == first.details["distance_km"]


@pytest.mark.parametrize(
    "request_, code",
    [
        (ride(option="limousine"), "UNKNOWN_OPTION"),
        (ride(destination=None), "MISSING_PLACE"),
        (ride(destination=PlaceRef(label="Also home", address=HOME.address.upper())), "SAME_PLACE"),
        (food(), "WRONG_PROVIDER"),
    ],
)
def test_ride_provider_refuses_bad_requests_with_explicit_errors(request_, code):
    with pytest.raises(ProviderError) as error:
        provider_for("RIDE", {}).get_quote(request_)
    assert error.value.code == code and error.value.message


def test_food_quotes_add_items_and_a_demo_delivery_fee():
    quote = provider_for("FOOD", {}).get_quote(food("swiggy", ("khichdi", 2), ("roti", 1)))
    assert [line.label for line in quote.line_items] == [
        "Vegetable khichdi × 2",
        "Two rotis × 1",
        "Delivery fee (demo)",
    ]
    assert quote.amount_minor == 2 * 8500 + 2000 + providers.FOOD_DELIVERY_FEE
    assert quote.title == "Vegetable khichdi and 1 more from Demo Home Kitchen"
    assert (quote.app_name, quote.provider_label) == ("Swiggy", "Demo Food Provider")
    assert quote.notice.startswith("Demo order")


@pytest.mark.parametrize(
    "request_, code",
    [
        (food("swiggy", ("dal", 1)), "UNKNOWN_ITEM"),
        (food("swiggy", ("khichdi", 1), ("khichdi", 2)), "REPEATED_ITEM"),
        (QuoteRequest(service_type="FOOD", option_id="swiggy"), "NO_ITEMS"),
        (food("dominos"), "UNKNOWN_OPTION"),
    ],
)
def test_food_provider_refuses_unknown_or_malformed_orders(request_, code):
    with pytest.raises(ProviderError) as error:
        provider_for("FOOD", {}).get_quote(request_)
    assert error.value.code == code


def test_quantities_and_item_counts_are_bounded_by_validation():
    with pytest.raises(ValidationError):
        ItemRequest(item_id="khichdi", quantity=6)
    with pytest.raises(ValidationError):
        QuoteRequest(service_type="FOOD", items=[{"item_id": f"x{i}"} for i in range(7)])
    with pytest.raises(ValidationError):
        QuoteRequest(service_type="TAXI")
    with pytest.raises(ValidationError):
        QuoteRequest(service_type="RIDE", price=1)


def test_pharmacy_sells_only_sample_non_prescription_items():
    quote = provider_for("PHARMACY", {}).get_quote(pharmacy(("ors", 2)))
    assert quote.amount_minor == 2 * 6000 + providers.PHARMACY_DELIVERY_FEE
    assert "(sample)" in quote.title and "not medical advice" in quote.notice
    assert quote.provider_label == "Demo Pharmacy Provider" and quote.app_name is None
    assert all("(sample)" in item.name for item in providers.PRODUCTS)
    with pytest.raises(ProviderError):
        provider_for("PHARMACY", {}).get_quote(pharmacy(("bp-tablet", 1)))


def booking(provider, key="key-00000001", fail=False, quote=None):
    quote = quote or provider.get_quote(ride())
    return provider.create_booking(
        CreateBookingRequest(quote=quote, idempotency_key=key, simulate_failure=fail)
    )


def test_bookings_get_stable_demo_references_once_per_idempotency_key():
    ledger = {}
    provider = provider_for("RIDE", ledger)
    first = booking(provider)
    assert (first.provider_booking_id, first.status) == ("DEMO-RIDE-1042", "CONFIRMED")
    # ride() books an Uber Go, so the sample vehicle is a hatchback; the PIN follows the reference.
    assert first.trip.model_dump() == {"vehicle": "Hatchback", "plate": "DEMO 1042", "pin": "2957"}
    assert booking(provider) == first
    assert booking(provider_for("RIDE", ledger), "key-00000002").provider_booking_id == (
        "DEMO-RIDE-1043"
    )
    food_provider = provider_for("FOOD", ledger)
    meal = booking(food_provider, quote=food_provider.get_quote(food()))
    assert meal.provider_booking_id == "DEMO-FOOD-1042" and meal.trip is None
    assert provider.get_booking("DEMO-RIDE-1042") == first


def test_a_simulated_failure_raises_and_creates_nothing():
    ledger = {}
    provider = provider_for("RIDE", ledger)
    with pytest.raises(ProviderError) as error:
        booking(provider, fail=True)
    assert error.value.code == "SIMULATED_FAILURE"
    assert ledger["DEMO_RIDE"]["bookings"] == {} and ledger["DEMO_RIDE"]["next"] == 1042
    assert booking(provider).provider_booking_id == "DEMO-RIDE-1042"


def test_cancel_complete_and_lookup_follow_provider_rules():
    provider = provider_for("RIDE", {})
    reference = booking(provider).provider_booking_id
    assert provider.cancel_booking(reference).status == "CANCELLED"
    with pytest.raises(ProviderError):
        provider.complete_booking(reference)
    other = booking(provider, "key-00000002").provider_booking_id
    assert provider.complete_booking(other).status == "COMPLETED"
    with pytest.raises(ProviderError) as error:
        provider.cancel_booking(other)
    assert error.value.code == "NOT_CANCELLABLE"
    with pytest.raises(ProviderError) as error:
        provider.get_booking("DEMO-RIDE-9999")
    assert error.value.code == "NOT_FOUND"
    pharmacy_quote = provider_for("PHARMACY", {}).get_quote(pharmacy(("ors", 1)))
    with pytest.raises(ProviderError) as error:
        booking(provider, "key-00000003", quote=pharmacy_quote)
    assert error.value.code == "WRONG_PROVIDER"


def test_meal_suggestions_respect_diet_spice_budget_and_enabled_apps():
    every = list(providers.APP_IDS)
    picks = providers.suggest_meals(every, vegetarian=True, mild=True, budget_minor=20000)
    assert picks == [
        ("demo-kitchen", "khichdi"),
        ("swiggy", "khichdi"),
        ("demo-kitchen", "dal"),
        ("ubereats", "dal"),
        ("zomato", "thali"),
    ]
    assert providers.suggest_meals(every, True, True, 11000) == [
        ("demo-kitchen", "khichdi"),
        ("swiggy", "khichdi"),
    ]
    # The provider's own kitchen stays available when every familiar name is off.
    assert providers.suggest_meals(["zomato"], True, True, 20000) == [
        ("demo-kitchen", "khichdi"),
        ("demo-kitchen", "dal"),
        ("zomato", "thali"),
    ]
    assert providers.suggest_meals([], True, True, 10500) == [("demo-kitchen", "khichdi")]
    anything = providers.suggest_meals(every, False, False, 50000)
    assert len(anything) == providers.MAX_FOOD_OPTIONS
    assert any(dish == "chicken" for _, dish in anything)


def test_pharmacy_words_match_catalogue_items_only():
    assert providers.match_products("I need ORS and a crepe bandage") == ["ors", "bandage"]
    assert providers.match_products("please reorder my BP tablets") == []


def test_catalogue_lists_options_under_familiar_names_with_integer_prices():
    catalogue = providers.service_catalogue(["ola", "swiggy"])
    rides = {option["id"]: option for option in catalogue["RIDE"]["options"]}
    assert rides["ola-mini"]["enabled"] and not rides["uber-go"]["enabled"]
    assert rides["demo-ride"]["enabled"] and rides["demo-ride"]["app_name"] is None
    kitchens = {kitchen["id"]: kitchen for kitchen in catalogue["FOOD"]["kitchens"]}
    assert kitchens["swiggy"]["name"] == "Demo Home Kitchen" and kitchens["swiggy"]["enabled"]
    assert kitchens["demo-kitchen"]["enabled"] and not kitchens["zomato"]["enabled"]
    prices = [item["price_minor"] for item in catalogue["PHARMACY"]["items"]]
    assert all(isinstance(price, int) and price > 0 for price in prices)


def test_new_accounts_start_with_setup_to_do_and_nothing_connected():
    state = initial_state()
    assert state["onboarding"]["completed"] is False
    assert all(step is None for step in state["onboarding"]["steps"].values())
    assert {c["status"] for c in state["connections"].values()} == {"SETUP_REQUIRED"}
    assert state["places"] == [] and state["quotes"] == [] and state["approvals"] == []
    assert state["profile"]["payment_method"] is None


def test_older_accounts_gain_the_setup_fields_without_losing_data():
    older = initial_state()
    for key in ("onboarding", "places", "connections", "quotes", "approvals", "provider_ledger"):
        del older[key]
    del older["profile"]["payment_method"]
    older["profile"]["name"] = "Kept"
    onboarding.ensure_setup(older)
    assert older["profile"]["name"] == "Kept"
    assert older["onboarding"]["completed"] is False
    assert older["connections"]["RIDE"]["status"] == "SETUP_REQUIRED"


def test_places_keep_exactly_one_usual_pickup_and_mirror_it_to_the_profile():
    state = initial_state()
    home = onboarding.save_place(state, PlaceIn(label="Home", address="1 Sample Road"))
    assert home["is_default_pickup"] and state["profile"]["home"] == "1 Sample Road"
    clinic = onboarding.save_place(
        state, PlaceIn(label="Doctor", address="2 Sample Road", is_default_pickup=True)
    )
    assert [p["is_default_pickup"] for p in state["places"]] == [False, True]
    with pytest.raises(HTTPException) as error:
        onboarding.save_place(state, PlaceIn(label="doctor", address="3 Sample Road"))
    assert error.value.status_code == 409
    onboarding.delete_place(state, clinic["id"])
    assert state["places"][0]["is_default_pickup"] and state["profile"]["home"] == "1 Sample Road"
    with pytest.raises(ValidationError):
        PlaceIn(label="", address="x")
    with pytest.raises(ValidationError):
        PlaceIn(label="Home", address="1 Sample Road", latitude=1)


def test_steps_are_checked_on_the_server_and_only_optional_ones_can_be_skipped():
    state = initial_state()
    with pytest.raises(HTTPException) as error:
        onboarding.mark(state, "places")
    assert "at least one place" in error.value.detail
    with pytest.raises(HTTPException):
        onboarding.mark(state, "payment")
    with pytest.raises(HTTPException) as error:
        onboarding.mark(state, "places", skip=True)
    assert error.value.status_code == 422
    assert onboarding.mark(state, "services", skip=True)["current"] == "welcome"
    with pytest.raises(HTTPException) as error:
        onboarding.finish(state)
    assert "Welcome" in error.value.detail


def test_connections_record_consent_capabilities_and_can_be_reset():
    state = initial_state()
    record = onboarding.connect(state, "RIDE", now=100.0)
    assert record["status"] == "CONNECTED" and record["consent_at"] == 100.0
    assert record["connection_mode"] == "SIMULATED"
    assert record["granted_capabilities"] == ["quote_rides", "book_rides", "cancel_rides"]
    assert onboarding.disconnect(state, "RIDE")["granted_capabilities"] == []
    assert onboarding.reset_connection(state, "RIDE")["status"] == "SETUP_REQUIRED"


def test_meera_seed_is_fully_set_up_with_sample_places(tmp_path, monkeypatch):
    state = ensure(initial_state())
    seed(state, now=1_000_000.0)
    assert state["onboarding"]["completed"] is True
    assert [p["label"] for p in state["places"]] == ["Home", "Doctor", "Eye care"]
    assert all("(sample address)" in p["address"] for p in state["places"])
    assert state["profile"]["payment_method"] == "DEMO_WALLET"
    assert {c["status"] for c in state["connections"].values()} == {"CONNECTED"}
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "setup.db"))
    with TestClient(create_app(Settings(environment="test"))) as api:
        fresh = api.post("/api/hub/session").json()
        assert fresh["profile"]["payment_method"] is None
        assert api.put("/api/hub/profile", json=fresh["profile"]).status_code == 200
