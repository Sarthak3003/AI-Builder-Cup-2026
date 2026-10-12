"""Simulated provider apps. Nothing here contacts a real service."""

from typing import Literal, NamedTuple

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
