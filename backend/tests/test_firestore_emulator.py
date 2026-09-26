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
