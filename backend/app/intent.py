"""Route one spoken or typed sentence to a ride, food or medicine request.

Plain word matching in English and Hindi, not AI: predictable, offline and testable.
Nothing here books anything; it only drafts a request the user still reviews.
"""

import re

from app.assistant import Draft

EMERGENCY_WORDS = ("emergency", "chest pain", "can't breathe", "cannot breathe", "आपातकाल")
EMERGENCY = (
    "Saathi cannot respond to emergencies. Contact local emergency "
    "services or a trusted person directly. No request was placed."
)
NOT_UNDERSTOOD = (
    "Sorry, I could not tell whether you need a ride, food or medicine. "
    "Try “Take me to the market” or “Order something light to eat”."
)
AMBIGUOUS = "Do you need a ride, food or medicine? Please say just one, or tap a choice below."
NO_DESTINATION = "Where would you like to go? Try “Take me to Dr Mehta's clinic”."
SCAM = (
    "This sounds like it could be a scam. Never share an OTP, PIN or bank details, "
    "and check with someone you trust. Saathi did not do anything."
)
# Common Indian fraud phrasings. A match is a suspicion, never a confirmed scam.
SCAM_WORDS = (
    "otp",
    "one time password",
    "upi pin",
    "atm pin",
    "cvv",
    "kyc",
    "lottery",
    "you have won",
    "prize money",
    "account will be blocked",
    "account is blocked",
    "verify your account",
    "gift card",
    "anydesk",
    "teamviewer",
    "remote access",
    "ओटीपी",
    "लॉटरी",
    "केवाईसी",
)
APPOINTMENT_WORDS = (
    "doctor",
    "appointment",
    "clinic",
    "check-up",
    "checkup",
    "hospital",
    "डॉक्टर",
    "अस्पताल",
)


def looks_like_scam(message: str) -> bool:
    text = message.lower()
    return any(_has(text, word) for word in SCAM_WORDS)


def mentions_appointment(message: str) -> bool:
    text = message.lower()
    return any(_has(text, word) for word in APPOINTMENT_WORDS)


FOOD_APPS = ("uber eats", "ubereats", "swiggy", "zomato")
KEYWORDS = {
    "ride": (
        "ride",
        "cab",
        "taxi",
        "auto",
        "rickshaw",
        "car",
        "uber",
        "ola",
        "rapido",
        "take me",
        "drop me",
        "pick me up",
        "go to",
        "going to",
        "get to",
        "travel",
        "trip",
        "टैक्सी",
        "ऑटो",
        "कैब",
        "गाड़ी",
        "जाना",
        "ले चलो",
        "छोड़ दो",
    ),
    "food": (
        "food",
        "eat",
        "hungry",
        "lunch",
        "dinner",
        "breakfast",
        "meal",
        "snack",
        "khichdi",
        "dal",
        "thali",
        "roti",
        "rice",
        "soup",
        "tiffin",
        *FOOD_APPS,
        "खाना",
        "भूख",
        "नाश्ता",
        "खिचड़ी",
        "दाल",
        "थाली",
    ),
    "medicine": (
        "medicine",
        "medicines",
        "tablet",
        "tablets",
        "pill",
        "pills",
        "pharmacy",
        "chemist",
        "refill",
        "prescription",
        "दवा",
        "दवाई",
        "दवाइयाँ",
        "गोली",
    ),
}

_TRAILING = re.compile(
    r"(?:\s+(?:please|now|right now|today|tonight|tomorrow|quickly|asap|at\s+\d.*|to\s+.*))+$",
    re.IGNORECASE,
)
_ENGLISH_PLACE = re.compile(
    r"\b(?:go|going|get|take me|drop me|ride|cab|taxi|auto|travel|trip|head|reach|book)\b"
    r".*?\b(?:to|till|until)\s+(.+)$",
    re.IGNORECASE,
)
_HINDI_PLACE = re.compile(
    r"^(?:मुझे\s+)?(.+?)\s+(?:तक\s+|पर\s+|को\s+)?(?:जाना|ले\s*चलो|छोड़\s*दो|चलना)"
)
_BUDGET = re.compile(
    r"(?:under|below|within|less than|up to|upto|max(?:imum)?|budget(?: of)?)\s*"
    r"(?:₹|rs\.?|inr|rupees)?\s*(\d{1,5})|₹\s*(\d{1,5})|(\d{1,5})\s*(?:rupees|rs\b|₹)",
    re.IGNORECASE,
)


def _has(text: str, word: str) -> bool:
    if not word.isascii():
        return word in text
    return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text) is not None


def _score(text: str, words: tuple[str, ...]) -> int:
    return sum(_has(text, word) for word in words)


def destination(message: str) -> str:
    match = _ENGLISH_PLACE.search(message) or _HINDI_PLACE.search(message.strip())
    if not match:
        return ""
    place = _TRAILING.sub("", match.group(1)).strip(" .,!?।")
    return place[:150]


def budget(message: str) -> int | None:
    match = _BUDGET.search(message)
    if not match:
        return None
    value = int(next(group for group in match.groups() if group))
    return value if value <= 10000 else None


def _diet(text: str) -> tuple[bool | None, bool | None]:
    vegetarian = None
    if re.search(r"\b(?:non[- ]?veg\w*|chicken|mutton|fish|eggs?|meat)\b", text):
        vegetarian = False
    elif re.search(r"\bveg(?:etarian)?\b", text) or "शाकाहारी" in text:
        vegetarian = True
    mild = None
    if (
        re.search(r"\b(?:no spice|not spicy|less spic\w*|mild|light|bland)\b", text)
        or "कम मसाला" in text
    ):
        mild = True
    elif re.search(r"\b(?:spicy|teekha)\b", text) or "तीखा" in text:
        mild = False
    return vegetarian, mild


def understand(message: str, profile: dict) -> tuple[Draft | None, str]:
    """Return a draft request, or None and a question to ask back."""
    text = message.lower()
    if any(word in text for word in EMERGENCY_WORDS):
        return None, EMERGENCY

    saved = profile.get("medicines", [])
    named = [label for label in saved if label.lower() in text]
    without_food_apps = text
    for app in FOOD_APPS:
        without_food_apps = without_food_apps.replace(app, " ")
    scores = {
        "ride": _score(without_food_apps, KEYWORDS["ride"]),
        "food": _score(text, KEYWORDS["food"]),
        "medicine": _score(text, KEYWORDS["medicine"]) + len(named),
    }
    best = max(scores.values())
    if best == 0:
        return None, NOT_UNDERSTOOD
    winners = [service for service, score in scores.items() if score == best]
    if len(winners) > 1:
        return None, AMBIGUOUS
    service = winners[0]
    limit = budget(message)

    if service == "ride":
        place = destination(message)
        return Draft(
            service="ride",
            destination=place,
            budget=limit,
            clarification="" if place else NO_DESTINATION,
        ), ""
    if service == "food":
        vegetarian, mild = _diet(text)
        return Draft(service="food", budget=limit, vegetarian=vegetarian, mild=mild), ""
    if len(named) == 1:
        return Draft(service="medicine", medicine=named[0], budget=limit), ""
    if not named and len(saved) == 1:
        return Draft(service="medicine", medicine=saved[0], budget=limit), ""
    if not saved:
        question = "Add your medicine's name in Profile first, then ask again."
    else:
        question = "Which medicine? Your saved list: " + ", ".join(saved) + "."
    return Draft(service="medicine", clarification=question[:300]), ""
