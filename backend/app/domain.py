"""Shared vocabulary for onboarding, demo services, quotes, bookings and simulated payments.

Everything a provider does here is simulated. Booking status and payment status are separate
fields with separate values, so a booking can be confirmed while its payment is still pending,
and a failed booking can never carry a successful payment.
"""

from typing import Literal

ServiceType = Literal["RIDE", "FOOD", "PHARMACY"]
ProviderType = Literal["DEMO_RIDE", "DEMO_FOOD", "DEMO_PHARMACY"]
ConnectionStatus = Literal["CONNECTED", "DISCONNECTED", "SETUP_REQUIRED"]
QuoteStatus = Literal["ACTIVE", "CONSUMED", "EXPIRED"]
# DRAFT and QUOTED from the plan are the request and quote records: a booking record is only
# written once the user explicitly confirms. COMPLETED_SIMULATED and DECLINED are additions.
BookingStatus = Literal[
    "AWAITING_APPROVAL",
    "CONFIRMED_SIMULATED",
    "COMPLETED_SIMULATED",
    "FAILED",
    "CANCELLED_SIMULATED",
    "DECLINED",
]
PaymentMethod = Literal["DEMO_WALLET", "PAY_ON_COMPLETION"]
PaymentStatus = Literal[
    "PENDING_SIMULATED", "SUCCEEDED_SIMULATED", "FAILED_SIMULATED", "NOT_CHARGED_SIMULATED"
]
ApprovalStatus = Literal["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]

SERVICE_TYPES: tuple[ServiceType, ...] = ("RIDE", "FOOD", "PHARMACY")
# The older internal service keys stay in use for routes, sharing settings and filters.
SERVICE_KEY: dict[str, str] = {"RIDE": "ride", "FOOD": "food", "PHARMACY": "medicine"}
SERVICE_TYPE: dict[str, ServiceType] = {"ride": "RIDE", "food": "FOOD", "medicine": "PHARMACY"}
PROVIDER_TYPE: dict[str, ProviderType] = {
    "RIDE": "DEMO_RIDE",
    "FOOD": "DEMO_FOOD",
    "PHARMACY": "DEMO_PHARMACY",
}

CURRENCY = "INR"
QUOTE_TTL_SECONDS = 15 * 60
APPROVAL_TTL_SECONDS = 24 * 3600

PAYMENT_METHODS: dict[str, str] = {
    "DEMO_WALLET": "Demo wallet (simulated)",
    "PAY_ON_COMPLETION": "Pay on completion (simulated)",
}

ONBOARDING_STEPS = (
    "welcome",
    "accessibility",
    "places",
    "care_circle",
    "services",
    "payment",
    "review",
)
OPTIONAL_STEPS = {"care_circle", "services"}


def rupees(amount_minor: int) -> str:
    """Format integer paise for messages; the UI formats its own copy."""
    whole, paise = divmod(amount_minor, 100)
    return f"₹{whole:,}" if not paise else f"₹{whole:,}.{paise:02d}"
