# Phone conversation states

The shared engine is independent of HTTP and Twilio. Authentication and storage transactions surround `process()`. App-session turns can also use it; existing app chat uses the compatible `app_request()` method.

| State | Meaning |
| --- | --- |
| `NEW` | Ask whether the caller needs a ride or meal |
| `COLLECTING_DETAILS` | Ask one question: pickup, destination or meal preferences |
| `SEARCHING` | Get server prices from simulated providers |
| `PRESENTING_OPTIONS` | Present up to three meals; accept a spoken number or keypad selection |
| `AWAITING_CONFIRMATION` | Read the exact total; ask for yes/confirm or keypad 1 |
| `AWAITING_EXTERNAL_APPROVAL` | Care Circle approval required; not booked yet |
| `EXECUTING` | Deterministic backend invokes the idempotent demo provider |
| `COMPLETED` | Provider confirmed the demo booking |
| `CANCELLED` | Caller cancelled, disconnected before confirmation or reached silence limit |
| `FAILED` | Provider refused or confirmation could not complete |
| `EXPIRED` | Session or quoted action expired/changed |

Searching/executing are transactional intermediate states, not additional asynchronous services.

## Examples

Ride: “Book a cab” → pickup? → “Home” → destination? → “Doctor” → exact demo fare → “Yes, confirm it” → verified demo reference → hang up.

Food: “Order dinner” → preferences? → “Vegetarian and mild under 150” → numbered meals → “one” → exact total → “yes” → verified demo reference → hang up.

Saved places/diet are available only after pairing. Guests can enter a fictional pickup and try estimates, but cannot book or access private profiles/payment preferences.

## Controls and safety

- `0` after pairing ends the call; `9` repeats the question.
- `1` confirms only in `AWAITING_CONFIRMATION`. At meal selection it selects option one; a separate confirmation is still required.
- A small deterministic English/Hindi yes/no grammar authorises actions, never Gemini. Ambiguous acknowledgements such as “maybe” do nothing.
- “Actually change to Bank” invalidates the destination quote. Pickup and food preference corrections invalidate old pending actions too.
- Pending actions bind the offer ID, provider, title, items/places, price, currency, payment method and expiry. A mismatch requires a fresh action.
- Persistent callback steps and revisions reject out-of-order input; duplicate confirmations return the existing outcome.
- Three empty/low-confidence turns end the call safely. Keypad confirmation remains available.
- Existing medical-diet/allergen and emergency safeguards apply; phone medicine requests are declined.
- Late callbacks cannot resume a disconnected pending request. If confirmation committed before disconnect, Activity remains the source of truth.

English/Hindi prompts and Twilio language settings are implemented. Catalogue names and some recovery text remain English; live pronunciation and recognition are not verified. Full mixed-language conversation quality is not claimed.