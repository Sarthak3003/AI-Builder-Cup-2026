"""Simulated provider apps. Nothing here contacts a real service."""

import re
from hashlib import sha256
from typing import Literal, NamedTuple, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.domain import CURRENCY, ProviderType, ServiceType

Service = Literal["food", "ride", "medicine"]
MAX_FOOD_OPTIONS = 4


class Provider(NamedTuple):
    id: str
    name: str
    service: Service
    blurb: str


class Fare(NamedTuple):
    id: str
    vehicle: str
    rupees: int
    minutes: int


class Dish(NamedTuple):
    id: str
    name: str
    rupees: int
    vegetarian: bool
    mild: bool
    kitchen: str
    minutes: int


PROVIDERS = (
    Provider("uber", "Uber", "ride", "Cabs"),
    Provider("ola", "Ola", "ride", "Cabs"),
    Provider("rapido", "Rapido", "ride", "Autos and bikes"),
    Provider("ubereats", "Uber Eats", "food", "Meals delivered to your door"),
    Provider("swiggy", "Swiggy", "food", "Meals delivered to your door"),
    Provider("zomato", "Zomato", "food", "Meals delivered to your door"),
    Provider("pharmacy", "Demo pharmacy", "medicine", "Medicines saved in your profile"),
)
PROVIDER_IDS = tuple(provider.id for provider in PROVIDERS)
_NAMES = {provider.id: provider.name for provider in PROVIDERS}

# Fixed sample fares: real pricing would need each company's partner API.
_RIDES = {
    "uber": Fare("uber-go", "Uber Go", 180, 6),
    "ola": Fare("ola-mini", "Ola Mini", 165, 5),
    "rapido": Fare("rapido-auto", "Rapido Auto", 90, 3),
}

# Each menu is ordered cheapest first; kitchens are fictional.
_MENUS = {
    "ubereats": (
        Dish("dal", "Dal and rice", 130, True, True, "Demo Tiffin Kitchen", 30),
        Dish("paneer", "Paneer meal", 190, True, False, "Demo Tiffin Kitchen", 35),
        Dish("chicken", "Chicken and rice", 210, False, False, "Demo Tiffin Kitchen", 40),
    ),
    "swiggy": (
        Dish("khichdi", "Vegetable khichdi", 110, True, True, "Demo Home Kitchen", 25),
        Dish("paneer", "Paneer meal", 180, True, False, "Demo Home Kitchen", 30),
        Dish("chicken", "Chicken and rice", 200, False, False, "Demo Home Kitchen", 35),
    ),
    "zomato": (
        Dish("thali", "Mini veg thali", 150, True, True, "Demo Thali House", 40),
        Dish("paneer", "Paneer meal", 170, True, False, "Demo Thali House", 40),
        Dish("chicken", "Chicken and rice", 190, False, False, "Demo Thali House", 45),
    ),
}

NONE_ENABLED = {
    "ride": "Turn on a ride app in Apps first.",
    "food": "Turn on a food app in Apps first.",
    "medicine": "Turn on the demo pharmacy in Apps first.",
}


def catalogue() -> list[dict]:
    return [
        {"id": p.id, "name": p.name, "service": p.service, "blurb": p.blurb, "simulated": True}
        for p in PROVIDERS
    ]


def available(service: Service, enabled: list[str]) -> bool:
    return any(p.service == service and p.id in enabled for p in PROVIDERS)


def enabled_ids(profile: dict) -> list[str]:
    # Profiles saved before apps existed have no list, which means every app is on.
    saved = profile.get("enabled_providers")
    if saved is None:
        return list(PROVIDER_IDS)
    return [item for item in saved if item in PROVIDER_IDS]


def _option(provider_id: str, option_id: str, name: str, price: int, minutes: int, detail: str):
    return {
        "id": option_id,
        "provider": provider_id,
        "provider_name": _NAMES[provider_id],
        "name": name,
        "price": price,
        "eta_min": minutes,
        "detail": detail,
        "simulated": True,
    }


def _cheapest_first(options: list[dict]) -> list[dict]:
    return sorted(options, key=lambda option: (option["price"], option["id"]))


def _suits(dish: Dish, vegetarian: bool, mild: bool, budget: int) -> bool:
    if vegetarian and not dish.vegetarian:
        return False
    if mild and not dish.mild:
        return False
    return dish.rupees <= budget


def ride_options(enabled: list[str], pickup: str, destination: str) -> list[dict]:
    return _cheapest_first(
        [
            _option(
                provider_id,
                fare.id,
                fare.vehicle,
                fare.rupees,
                fare.minutes,
                f"{pickup} to {destination} · Sample fare",
            )
            for provider_id, fare in _RIDES.items()
            if provider_id in enabled
        ]
    )


def food_options(enabled: list[str], vegetarian: bool, mild: bool, budget: int) -> list[dict]:
    # Every enabled app gets its cheapest match first, so the choices show different apps.
    first, rest = [], []
    for provider_id, menu in _MENUS.items():
        if provider_id not in enabled:
            continue
        matches = [dish for dish in menu if _suits(dish, vegetarian, mild, budget)]
        for index, dish in enumerate(matches):
            diet = "Vegetarian" if dish.vegetarian else "Non-vegetarian"
            spice = "mild" if dish.mild else "medium spice"
            option = _option(
                provider_id,
                f"{provider_id}-{dish.id}",
                dish.name,
                dish.rupees,
                dish.minutes,
                f"From {dish.kitchen} · {diet}, {spice} · Price includes delivery",
            )
            (first if index == 0 else rest).append((dish, option))

    # Someone who eats everything sees meat dishes before further vegetarian ones.
    def rank(pair):
        dish, option = pair
        return (dish.vegetarian and not vegetarian, dish.rupees, option["id"])

    rest.sort(key=rank)
    spare = max(0, MAX_FOOD_OPTIONS - len(first))
    chosen = [option for _, option in first] + [option for _, option in rest[:spare]]
    return _cheapest_first(chosen)


def medicine_options(enabled: list[str], label: str) -> list[dict]:
    if "pharmacy" not in enabled:
        return []
    detail = "Demo pharmacy request. No prescription validation or supply."
    return [_option("pharmacy", "pharmacy", label, 80, 60, detail)]


# ---------------------------------------------------------------------------------------------
# Demo service providers. One simulated provider per category carries out every booking.
# Familiar app names (Uber, Ola, Rapido, Uber Eats, Swiggy, Zomato) are only labels on options:
# Saathi has no link to those companies, and nothing is dispatched, delivered or charged.
# ---------------------------------------------------------------------------------------------

FIRST_REFERENCE = 1042
MAX_QUANTITY = 5
MAX_LINES = 6


class ProviderError(Exception):
    """A provider refused or failed. Callers record a failure; they never turn it into success."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class PlaceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=60)
    address: str = Field(min_length=1, max_length=150)
    place_id: str | None = Field(default=None, max_length=40)


class ItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: str = Field(min_length=1, max_length=40)
    quantity: int = Field(default=1, ge=1, le=MAX_QUANTITY)


class QuoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_type: ServiceType
    # A ride option ("uber-go") or the food app a kitchen is listed under ("swiggy").
    option_id: str | None = Field(default=None, max_length=40)
    pickup: PlaceRef | None = None
    destination: PlaceRef | None = None
    items: list[ItemRequest] = Field(default_factory=list, max_length=MAX_LINES)


class LineItem(BaseModel):
    label: str
    amount_minor: int


class ProviderQuote(BaseModel):
    provider_type: ProviderType
    provider_label: str
    service_type: ServiceType
    option_id: str
    option_name: str
    app_id: str | None = None
    app_name: str | None = None
    title: str
    line_items: list[LineItem]
    amount_minor: int
    currency: str = CURRENCY
    pickup_eta_min: int | None = None
    duration_min: int | None = None
    delivery_min: int | None = None
    details: dict
    notice: str
    simulated: Literal[True] = True


class CreateBookingRequest(BaseModel):
    quote: ProviderQuote
    idempotency_key: str = Field(min_length=8, max_length=80)
    # Demo control only: the provider refuses this booking so the failure path can be shown.
    simulate_failure: bool = False


class BookingResult(BaseModel):
    provider_type: ProviderType
    provider_booking_id: str
    status: Literal["CONFIRMED", "CANCELLED", "COMPLETED"]
    message: str
    simulated: Literal[True] = True


class ServiceProvider(Protocol):
    provider_type: ProviderType
    service_type: ServiceType
    label: str
    capabilities: tuple[str, ...]

    def get_quote(self, request: QuoteRequest) -> ProviderQuote: ...

    def create_booking(self, request: CreateBookingRequest) -> BookingResult: ...

    def get_booking(self, provider_booking_id: str) -> BookingResult: ...

    def cancel_booking(self, provider_booking_id: str) -> BookingResult: ...


class App(NamedTuple):
    id: str
    name: str
    service_type: ServiceType


# Familiar names shown on options. Each one is fulfilled by the matching demo provider.
APPS = (
    App("uber", "Uber", "RIDE"),
    App("ola", "Ola", "RIDE"),
    App("rapido", "Rapido", "RIDE"),
    App("ubereats", "Uber Eats", "FOOD"),
    App("swiggy", "Swiggy", "FOOD"),
    App("zomato", "Zomato", "FOOD"),
)
APP_IDS = tuple(app.id for app in APPS)
_APP_NAMES = {app.id: app.name for app in APPS}


class RideOption(NamedTuple):
    id: str
    name: str
    app_id: str
    base_minor: int
    per_km_minor: int
    pickup_min: int


class MenuItem(NamedTuple):
    id: str
    name: str
    price_minor: int
    vegetarian: bool
    mild: bool
    minutes: int
    main: bool = True


class Kitchen(NamedTuple):
    app_id: str
    name: str
    items: tuple[MenuItem, ...]


class Product(NamedTuple):
    id: str
    name: str
    price_minor: int
    keywords: tuple[str, ...]


# Fixed sample pricing so every demo run shows the same fares.
RIDE_OPTIONS = (
    RideOption("rapido-auto", "Rapido Auto", "rapido", 2500, 1100, 3),
    RideOption("ola-mini", "Ola Mini", "ola", 4500, 1500, 5),
    RideOption("uber-go", "Uber Go", "uber", 5000, 1600, 6),
)
FOOD_DELIVERY_FEE = 2500
KITCHENS = (
    Kitchen(
        "ubereats",
        "Demo Tiffin Kitchen",
        (
            MenuItem("dal", "Dal and rice", 10500, True, True, 30),
            MenuItem("paneer", "Paneer meal", 16500, True, False, 35),
            MenuItem("chicken", "Chicken and rice", 18500, False, False, 40),
            MenuItem("buttermilk", "Buttermilk", 3000, True, True, 10, main=False),
        ),
    ),
    Kitchen(
        "swiggy",
        "Demo Home Kitchen",
        (
            MenuItem("khichdi", "Vegetable khichdi", 8500, True, True, 25),
            MenuItem("paneer", "Paneer meal", 15500, True, False, 30),
            MenuItem("chicken", "Chicken and rice", 17500, False, False, 35),
            MenuItem("roti", "Two rotis", 2000, True, True, 15, main=False),
        ),
    ),
    Kitchen(
        "zomato",
        "Demo Thali House",
        (
            MenuItem("thali", "Mini veg thali", 12500, True, True, 40),
            MenuItem("paneer", "Paneer meal", 14500, True, False, 40),
            MenuItem("chicken", "Chicken and rice", 16500, False, False, 45),
            MenuItem("fruit", "Fruit bowl", 6000, True, True, 15, main=False),
        ),
    ),
)
_KITCHENS = {kitchen.app_id: kitchen for kitchen in KITCHENS}
PHARMACY_OPTION = "demo-pharmacy"
PHARMACY_DELIVERY_FEE = 2000
PHARMACY_MINUTES = 45
# Everyday non-prescription samples only. Saathi never orders prescription medicine.
PRODUCTS = (
    Product(
        "ors",
        "ORS sachets, pack of 5 (sample)",
        6000,
        ("ors", "oral rehydration", "rehydration", "electrolyte"),
    ),
    Product("bandage", "Crepe bandage, 10 cm (sample)", 12000, ("bandage", "crepe", "पट्टी")),
    Product(
        "antiseptic", "Antiseptic liquid, 100 ml (sample)", 8500, ("antiseptic", "disinfectant")
    ),
    Product("thermometer", "Digital thermometer (sample)", 19900, ("thermometer", "थर्मामीटर")),
    Product("balm", "Pain relief balm, 25 g (sample)", 7500, ("balm", "pain relief")),
    Product("calcium", "Calcium supplement, 15 tablets (sample)", 11000, ("calcium",)),
    Product("sanitiser", "Hand sanitiser, 100 ml (sample)", 5000, ("sanitiser", "sanitizer")),
)
_PRODUCTS = {product.id: product for product in PRODUCTS}


def _whole_rupees(minor: int) -> int:
    return (minor + 50) // 100 * 100


def trip_tenths_km(pickup: str, destination: str) -> int:
    """A stable sample distance, 2.0 to 12.0 km, so the same trip always costs the same."""
    key = f"{_normal(pickup)}|{_normal(destination)}".encode()
    return 20 + int(sha256(key).hexdigest()[:8], 16) % 101


def _normal(text: str) -> str:
    return " ".join(text.lower().split())


def _has_word(text: str, word: str) -> bool:
    if not word.isascii():
        return word in text
    return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text) is not None


class _DemoProvider:
    provider_type: ProviderType
    service_type: ServiceType
    label: str
    prefix: str
    capabilities: tuple[str, ...]
    notice: str

    def __init__(self, ledger: dict):
        # The provider's own records for one account, saved in the same transaction.
        self.records = ledger.setdefault(
            self.provider_type, {"next": FIRST_REFERENCE, "bookings": {}, "keys": {}}
        )

    def get_quote(self, request: QuoteRequest) -> ProviderQuote:
        if request.service_type != self.service_type:
            raise ProviderError("WRONG_PROVIDER", f"The {self.label} cannot quote this request.")
        return self._quote(request)

    def _quote(self, request: QuoteRequest) -> ProviderQuote:
        raise NotImplementedError

    def create_booking(self, request: CreateBookingRequest) -> BookingResult:
        quote = request.quote
        if quote.provider_type != self.provider_type:
            raise ProviderError("WRONG_PROVIDER", "This quote belongs to another demo provider.")
        known = self.records["keys"].get(request.idempotency_key)
        if known:
            return self.get_booking(known)
        if request.simulate_failure:
            raise ProviderError(
                "SIMULATED_FAILURE",
                f"The {self.label} could not take this booking (simulated failure).",
            )
        number = self.records["next"]
        self.records["next"] = number + 1
        reference = f"{self.prefix}-{number}"
        self.records["bookings"][reference] = {
            "status": "CONFIRMED",
            "amount_minor": quote.amount_minor,
            "option_id": quote.option_id,
        }
        self.records["keys"][request.idempotency_key] = reference
        return self._result(reference)

    def get_booking(self, provider_booking_id: str) -> BookingResult:
        return self._result(provider_booking_id)

    def cancel_booking(self, provider_booking_id: str) -> BookingResult:
        record = self._record(provider_booking_id)
        if record["status"] == "COMPLETED":
            raise ProviderError("NOT_CANCELLABLE", "A completed booking cannot be cancelled.")
        record["status"] = "CANCELLED"
        return self._result(provider_booking_id)

    def complete_booking(self, provider_booking_id: str) -> BookingResult:
        """Demo control: the simulated trip or delivery has finished."""
        record = self._record(provider_booking_id)
        if record["status"] == "CANCELLED":
            raise ProviderError("NOT_COMPLETABLE", "A cancelled booking cannot be completed.")
        record["status"] = "COMPLETED"
        return self._result(provider_booking_id)

    def _record(self, provider_booking_id: str) -> dict:
        record = self.records["bookings"].get(provider_booking_id)
        if not record:
            raise ProviderError("NOT_FOUND", "The demo provider has no booking with that number.")
        return record

    def _result(self, provider_booking_id: str) -> BookingResult:
        status = self._record(provider_booking_id)["status"]
        words = {"CONFIRMED": "accepted", "CANCELLED": "cancelled", "COMPLETED": "completed"}
        return BookingResult(
            provider_type=self.provider_type,
            provider_booking_id=provider_booking_id,
            status=status,
            message=f"{self.label} {words[status]} this booking (simulated).",
        )

    def _items(self, request: QuoteRequest, lookup) -> list[tuple[object, int]]:
        if not request.items:
            raise ProviderError("NO_ITEMS", "Choose at least one item.")
        ids = [item.item_id for item in request.items]
        if len(set(ids)) != len(ids):
            raise ProviderError("REPEATED_ITEM", "List each item once and change its quantity.")
        chosen = []
        for item in request.items:
            found = lookup(item.item_id)
            if not found:
                raise ProviderError("UNKNOWN_ITEM", "Choose items from the demo catalogue.")
            chosen.append((found, item.quantity))
        return chosen


class DemoRideProvider(_DemoProvider):
    provider_type = "DEMO_RIDE"
    service_type = "RIDE"
    label = "Demo Ride Provider"
    prefix = "DEMO-RIDE"
    capabilities = ("quote_rides", "book_rides", "cancel_rides")
    notice = "Demo ride — no real driver will arrive."

    def _quote(self, request: QuoteRequest) -> ProviderQuote:
        option = next((o for o in RIDE_OPTIONS if o.id == request.option_id), None)
        if not option:
            raise ProviderError("UNKNOWN_OPTION", "Choose one of the listed ride options.")
        pickup, destination = request.pickup, request.destination
        if not pickup or not destination:
            raise ProviderError("MISSING_PLACE", "Choose a pickup and a destination.")
        if _normal(pickup.address) == _normal(destination.address):
            raise ProviderError("SAME_PLACE", "Pickup and destination are the same place.")
        tenths = trip_tenths_km(pickup.address, destination.address)
        distance = _whole_rupees(option.per_km_minor * tenths // 10)
        km = f"{tenths // 10}.{tenths % 10}"
        return ProviderQuote(
            provider_type=self.provider_type,
            provider_label=self.label,
            service_type=self.service_type,
            option_id=option.id,
            option_name=option.name,
            app_id=option.app_id,
            app_name=_APP_NAMES[option.app_id],
            title=f"{option.name} to {destination.label}",
            line_items=[
                LineItem(label="Base fare", amount_minor=option.base_minor),
                LineItem(
                    label=f"Distance, {km} km at ₹{option.per_km_minor // 100}/km",
                    amount_minor=distance,
                ),
            ],
            amount_minor=option.base_minor + distance,
            pickup_eta_min=option.pickup_min,
            duration_min=5 + (tenths * 3 + 5) // 10,
            details={
                "pickup": pickup.model_dump(),
                "destination": destination.model_dump(),
                "distance_km": float(km),
            },
            notice=self.notice,
        )


class DemoFoodProvider(_DemoProvider):
    provider_type = "DEMO_FOOD"
    service_type = "FOOD"
    label = "Demo Food Provider"
    prefix = "DEMO-FOOD"
    capabilities = ("quote_orders", "place_orders", "cancel_orders")
    notice = "Demo order — no real food will be delivered."

    def _quote(self, request: QuoteRequest) -> ProviderQuote:
        kitchen = _KITCHENS.get(request.option_id or "")
        if not kitchen:
            raise ProviderError("UNKNOWN_OPTION", "Choose one of the listed kitchens.")
        menu = {item.id: item for item in kitchen.items}
        chosen = self._items(request, menu.get)
        lines = [
            LineItem(label=f"{dish.name} × {quantity}", amount_minor=dish.price_minor * quantity)
            for dish, quantity in chosen
        ]
        lines.append(LineItem(label="Delivery fee (demo)", amount_minor=FOOD_DELIVERY_FEE))
        first = chosen[0][0].name
        more = len(chosen) - 1
        return ProviderQuote(
            provider_type=self.provider_type,
            provider_label=self.label,
            service_type=self.service_type,
            option_id=kitchen.app_id,
            option_name=kitchen.name,
            app_id=kitchen.app_id,
            app_name=_APP_NAMES[kitchen.app_id],
            title=f"{first}{f' and {more} more' if more else ''} from {kitchen.name}",
            line_items=lines,
            amount_minor=sum(line.amount_minor for line in lines),
            delivery_min=max(dish.minutes for dish, _ in chosen),
            details={
                "kitchen": kitchen.name,
                "items": [
                    {
                        "item_id": dish.id,
                        "name": dish.name,
                        "quantity": quantity,
                        "unit_minor": dish.price_minor,
                        "vegetarian": dish.vegetarian,
                        "mild": dish.mild,
                    }
                    for dish, quantity in chosen
                ],
            },
            notice=self.notice,
        )


class DemoPharmacyProvider(_DemoProvider):
    provider_type = "DEMO_PHARMACY"
    service_type = "PHARMACY"
    label = "Demo Pharmacy Provider"
    prefix = "DEMO-PHARM"
    capabilities = ("quote_orders", "place_orders", "cancel_orders")
    notice = (
        "Demo pharmacy order — sample non-prescription items only. Nothing will be delivered, "
        "and this is not medical advice."
    )

    def _quote(self, request: QuoteRequest) -> ProviderQuote:
        if request.option_id not in {None, PHARMACY_OPTION}:
            raise ProviderError("UNKNOWN_OPTION", "Use the demo pharmacy.")
        chosen = self._items(request, _PRODUCTS.get)
        lines = [
            LineItem(label=f"{item.name} × {quantity}", amount_minor=item.price_minor * quantity)
            for item, quantity in chosen
        ]
        lines.append(LineItem(label="Delivery fee (demo)", amount_minor=PHARMACY_DELIVERY_FEE))
        more = len(chosen) - 1
        return ProviderQuote(
            provider_type=self.provider_type,
            provider_label=self.label,
            service_type=self.service_type,
            option_id=PHARMACY_OPTION,
            option_name="Demo pharmacy",
            title=f"{chosen[0][0].name}{f' and {more} more' if more else ''}",
            line_items=lines,
            amount_minor=sum(line.amount_minor for line in lines),
            delivery_min=PHARMACY_MINUTES,
            details={
                "items": [
                    {
                        "item_id": item.id,
                        "name": item.name,
                        "quantity": quantity,
                        "unit_minor": item.price_minor,
                    }
                    for item, quantity in chosen
                ]
            },
            notice=self.notice,
        )


DEMO_PROVIDERS: dict[str, type[_DemoProvider]] = {
    "RIDE": DemoRideProvider,
    "FOOD": DemoFoodProvider,
    "PHARMACY": DemoPharmacyProvider,
}


def provider_for(service_type: str, ledger: dict) -> _DemoProvider:
    return DEMO_PROVIDERS[service_type](ledger)


def ride_option_ids(enabled_apps: list[str]) -> list[str]:
    return [option.id for option in RIDE_OPTIONS if option.app_id in enabled_apps]


def suggest_meals(
    enabled_apps: list[str], vegetarian: bool, mild: bool, budget_minor: int
) -> list[tuple[str, str]]:
    """Up to four (kitchen, dish) suggestions within budget, the cheapest from each app first."""
    first, rest = [], []
    for kitchen in KITCHENS:
        if kitchen.app_id not in enabled_apps:
            continue
        mains = sorted(
            (
                dish
                for dish in kitchen.items
                if dish.main
                and (dish.vegetarian or not vegetarian)
                and (dish.mild or not mild)
                and dish.price_minor + FOOD_DELIVERY_FEE <= budget_minor
            ),
            key=lambda dish: (dish.price_minor, dish.id),
        )
        for index, dish in enumerate(mains):
            (first if index == 0 else rest).append((kitchen.app_id, dish))
    # Someone who eats everything sees meat dishes before further vegetarian ones.
    rest.sort(key=lambda pair: (pair[1].vegetarian and not vegetarian, pair[1].price_minor))
    chosen = first + rest[: max(0, MAX_FOOD_OPTIONS - len(first))]
    chosen.sort(key=lambda pair: (pair[1].price_minor, pair[0]))
    return [(app_id, dish.id) for app_id, dish in chosen]


def match_products(message: str) -> list[str]:
    text = message.lower()
    return [p.id for p in PRODUCTS if any(_has_word(text, word) for word in p.keywords)]


def service_catalogue(enabled_apps: list[str]) -> dict:
    """What each demo provider offers, for the screens. Prices are integer paise."""
    return {
        "RIDE": {
            "options": [
                {
                    "id": option.id,
                    "name": option.name,
                    "app_id": option.app_id,
                    "app_name": _APP_NAMES[option.app_id],
                    "pickup_min": option.pickup_min,
                    "enabled": option.app_id in enabled_apps,
                }
                for option in RIDE_OPTIONS
            ]
        },
        "FOOD": {
            "delivery_fee_minor": FOOD_DELIVERY_FEE,
            "kitchens": [
                {
                    "id": kitchen.app_id,
                    "name": kitchen.name,
                    "app_name": _APP_NAMES[kitchen.app_id],
                    "enabled": kitchen.app_id in enabled_apps,
                    "items": [
                        {
                            "id": dish.id,
                            "name": dish.name,
                            "price_minor": dish.price_minor,
                            "vegetarian": dish.vegetarian,
                            "mild": dish.mild,
                            "minutes": dish.minutes,
                        }
                        for dish in kitchen.items
                    ],
                }
                for kitchen in KITCHENS
            ],
        },
        "PHARMACY": {
            "delivery_fee_minor": PHARMACY_DELIVERY_FEE,
            "items": [{"id": p.id, "name": p.name, "price_minor": p.price_minor} for p in PRODUCTS],
        },
    }
