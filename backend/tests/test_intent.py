import pytest

from app.intent import AMBIGUOUS, EMERGENCY, NO_DESTINATION, NOT_UNDERSTOOD, understand

PROFILE = {"medicines": ["Vitamin D", "Saved medicine A"]}


@pytest.mark.parametrize(
    ("message", "place"),
    [
        ("Take me to Dr Mehta's clinic", "Dr Mehta's clinic"),
        ("I want to go to the market please", "the market"),
        ("Book an Uber to the railway station at 5 pm", "the railway station"),
        ("I need a cab to City Hospital to see my doctor", "City Hospital"),
        ("Need an auto till Mother and Child Hospital", "Mother and Child Hospital"),
        ("मुझे बाज़ार जाना है", "बाज़ार"),
        ("मुझे अस्पताल ले चलो", "अस्पताल"),
    ],
)
def test_rides_are_routed_with_their_destination(message, place):
    draft, question = understand(message, PROFILE)
    assert question == ""
    assert (draft.service, draft.destination, draft.clarification) == ("ride", place, "")


def test_a_ride_without_a_place_asks_where():
    draft, _ = understand("Please book me a taxi", PROFILE)
    assert (draft.service, draft.clarification) == ("ride", NO_DESTINATION)


@pytest.mark.parametrize(
    ("message", "vegetarian", "mild", "limit"),
    [
        ("I'm hungry, something light to eat", None, True, None),
        ("Order veg lunch under 150", True, None, 150),
        ("Spicy chicken for dinner, ₹300", False, False, 300),
        ("Get khichdi from Uber Eats", None, None, None),
        ("मुझे खाना चाहिए, कम मसाला", None, True, None),
    ],
)
def test_food_is_routed_with_diet_spice_and_budget(message, vegetarian, mild, limit):
    draft, _ = understand(message, PROFILE)
    assert draft.service == "food"
    assert (draft.vegetarian, draft.mild, draft.budget) == (vegetarian, mild, limit)


def test_uber_eats_is_food_not_a_ride():
    draft, _ = understand("Order from Uber Eats", PROFILE)
    assert draft.service == "food"


def test_medicine_uses_the_saved_label_named():
    draft, _ = understand("Please refill my vitamin d", PROFILE)
    assert (draft.service, draft.medicine, draft.clarification) == ("medicine", "Vitamin D", "")


def test_medicine_asks_which_when_several_are_saved():
    draft, _ = understand("I need my medicine", PROFILE)
    assert draft.service == "medicine"
    assert "Vitamin D, Saved medicine A" in draft.clarification


def test_medicine_with_one_saved_label_uses_it_and_with_none_asks_to_add_one():
    draft, _ = understand("दवा चाहिए", {"medicines": ["BP tablet"]})
    assert draft.medicine == "BP tablet"
    draft, _ = understand("Refill my pills", {"medicines": []})
    assert "Add your medicine" in draft.clarification


@pytest.mark.parametrize(
    ("message", "question"),
    [
        ("I have chest pain", EMERGENCY),
        ("What's the weather like?", NOT_UNDERSTOOD),
        ("Take me to the pharmacy", AMBIGUOUS),
    ],
)
def test_unclear_or_unsafe_requests_are_asked_back_not_guessed(message, question):
    assert understand(message, PROFILE) == (None, question)


def test_words_inside_other_words_do_not_count():
    assert understand("Great careful pricing", PROFILE) == (None, NOT_UNDERSTOOD)
