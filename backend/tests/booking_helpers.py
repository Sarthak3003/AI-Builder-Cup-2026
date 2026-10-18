"""Shared steps for API tests: set up an account, then quote and confirm through the real API."""

from uuid import uuid4

HOME = {"label": "Home", "address": "12 Sample Lane, Demo Nagar (sample address)"}
DOCTOR = {"label": "Doctor", "address": "Sunrise Clinic, 4 Example Road (sample address)"}
REQUESTS = {
    "ride": {"service_type": "RIDE", "destination_text": "Market"},
    "food": {"service_type": "FOOD", "option_id": "swiggy", "items": [{"item_id": "khichdi"}]},
    "medicine": {"service_type": "PHARMACY", "items": [{"item_id": "ors"}]},
}


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def ready(api, payment="DEMO_WALLET", services=("RIDE", "FOOD", "PHARMACY")):
    """Saved places, connected demo services and a payment choice: enough to book."""
    ok(api.post("/api/hub/onboarding/locations", json=HOME))
    places = ok(api.post("/api/hub/onboarding/locations", json=DOCTOR))["places"]
    for service in services:
        ok(api.post(f"/api/hub/services/{service}/connect-demo", json={"consent": True}))
    ok(api.patch("/api/hub/onboarding/profile", json={"payment_method": payment}))
    return {place["label"]: place["id"] for place in places}


def quotes(api, service="ride", **extra):
    return ok(api.post("/api/hub/quotes", json={**REQUESTS[service], **extra}))["quotes"]


def confirm(api, quote, key=None):
    body = {"idempotency_key": key or str(uuid4()), "confirmed": True}
    return api.post(f"/api/hub/quotes/{quote['id']}/confirm", json=body)


def book(api, service="ride", option=None, **extra):
    """Quote and confirm in one go. Rides use the Demo Ride unless an option is named."""
    offered = quotes(api, service, **extra)
    chosen = next(q for q in offered if q["option_id"] == option) if option else offered[0]
    return ok(confirm(api, chosen))


def require_approval(api, limit=50):
    profile = ok(api.get("/api/hub/state"))["profile"]
    profile.update(caregiver_enabled=True, approval_limit=limit)
    ok(api.put("/api/hub/profile", json=profile))


def state(api):
    return ok(api.get("/api/hub/state"))
