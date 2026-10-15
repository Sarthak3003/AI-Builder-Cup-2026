"""Run explicitly against a local emulator; never falls back to Google Cloud."""

import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.config import Settings
from app.database import FirestoreConnection
from app.main import create_app


@pytest.mark.emulator
def test_firestore_emulator_round_trip():
    if os.environ.get("SAATHI_RUN_EMULATOR_TESTS") != "1":
        pytest.skip("Set SAATHI_RUN_EMULATOR_TESTS=1 with the emulator running")
    # Missing/invalid host raises instead of skipping when explicitly requested.
    config = Settings(
        environment="test", firestore_mode="emulator", firestore_project="demo-saathi"
    )
    client = firestore.Client(project=config.firestore_project, credentials=AnonymousCredentials())
    document = client.document(f"_integration/{uuid4().hex}")
    try:
        document.set({"purpose": "local connectivity test"}, retry=None, timeout=3)
        assert document.get(retry=None, timeout=3).to_dict() == {
            "purpose": "local connectivity test"
        }
        assert FirestoreConnection(config).probe() == "ready"
        with TestClient(create_app(config)) as api:
            response = api.get("/api/ready")
            assert response.status_code == 200
            assert response.json() == {"status": "ready", "firestore": "ready"}
    finally:
        try:
            document.delete(retry=None, timeout=3)
        finally:
            client.close()


def test_food_flow_with_real_firestore(monkeypatch):
    import os

    import pytest
    from fastapi.testclient import TestClient
    from test_demo import exercise_flow

    from app import demo
    from app.config import Settings
    from app.main import create_app

    if os.environ.get("SAATHI_RUN_EMULATOR_TESTS") != "1":
        pytest.skip("Requires local Firestore emulator")
    monkeypatch.setattr(
        demo,
        "interpret",
        lambda message: demo.Interpretation(
            summary="Mild vegetarian lunch under 150", budget=150, vegetarian=True, mild=True
        ),
    )
    settings = Settings(environment="test", firestore_mode="emulator")
    with TestClient(create_app(settings)) as client:
        exercise_flow(client)


@pytest.mark.emulator
def test_hub_services_and_caregiver_with_firestore(tmp_path, monkeypatch):
    from booking_helpers import book, ready
    from test_hub import enable_care

    if os.environ.get("SAATHI_RUN_EMULATOR_TESTS") != "1":
        pytest.skip("Requires local Firestore emulator")
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "emulator-session.db"))
    application = create_app(Settings(environment="test", firestore_mode="emulator"))
    with TestClient(application) as owner, TestClient(application) as caregiver:
        assert owner.post("/api/hub/session").json()["storage"] == "firestore-emulator"
        ready(owner)
        code = enable_care(owner)
        assert caregiver.post("/api/hub/caregiver/join", json={"code": code}).status_code == 200
        for service in ("food", "ride", "medicine"):
            booked = book(owner, service)
            if booked["booking_status"] == "AWAITING_APPROVAL":
                assert (
                    caregiver.post(
                        f"/api/hub/bookings/{booked['id']}/decision", json={"action": "approve"}
                    ).status_code
                    == 200
                )
        activity = owner.get("/api/hub/state").json()["activity"]
        assert len(activity) == 3
        assert all(item["booking_status"] == "CONFIRMED_SIMULATED" for item in activity)
        owner.delete("/api/hub/caregiver")
        assert caregiver.get("/api/hub/state").status_code == 403
        owner.delete("/api/hub/data")
