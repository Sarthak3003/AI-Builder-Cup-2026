"""Pairing is single-use, transactional and never trusts a caller-supplied account ID."""

import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.conversation import Turn
from app.hub_store import HubStore
from app.main import create_app
from app.phone import PhoneService


@pytest.fixture
def phone(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "phone.db"))
    store = HubStore(Settings(environment="test"))
    store.change("owner", lambda state: state["profile"].update(name="Meera"))
    return PhoneService(store, b"test-phone-secret-for-unit-tests")


def incoming(phone, controller="owner"):
    return phone.start(provider="simulator", call_id=uuid4().hex, controller=controller)


def test_pair_code_not_stored_and_read_bound_to_owner(phone):
    code = phone.create_code("owner", retain_transcript=True)
    assert len(code["code"]) == 8 and code["single_use"]
    key = f"phonePairings/{phone.verifier('pair', code['code'])}"
    assert code["code"] not in json.dumps(phone.store.read_document(key))
    session = incoming(phone)
    result = phone.pair(session["session_id"], code["code"], controller="owner")
    assert result["paired"] and result["transcript_retained"]
    assert "Meera" in result["reply"]
    assert "owner" not in result and "epoch" not in result
    assert phone.read(session["session_id"], owner="owner")["paired"]
    with pytest.raises(HTTPException) as denied:
        phone.read(session["session_id"], owner="another")
    assert denied.value.status_code == 404


def test_expired_reused_and_incorrect_codes_fail(phone):
    code = phone.create_code("owner")["code"]
    first = incoming(phone)
    phone.pair(first["session_id"], code, controller="owner")
    second = incoming(phone)
    with pytest.raises(HTTPException):
        phone.pair(second["session_id"], code, controller="owner")
    code = phone.create_code("owner")["code"]
    key = f"phonePairings/{phone.verifier('pair', code)}"
    phone.store.atomic([key], lambda docs: docs[key].update(expires_at=1))
    for invalid in (code, "000", "abcdefgh"):
        with pytest.raises(HTTPException) as denied:
            phone.pair(second["session_id"], invalid, controller="owner")
        assert denied.value.status_code == 401


def test_failed_attempts_survive_errors_and_rate_limit(phone):
    call = incoming(phone)
    for _ in range(5):
        with pytest.raises(HTTPException) as failure:
            phone.pair(call["session_id"], "invalid", controller="owner")
        assert failure.value.status_code == 401
    with pytest.raises(HTTPException) as failure:
        phone.pair(call["session_id"], phone.create_code("owner")["code"], controller="owner")
    assert failure.value.status_code == 429


def test_concurrent_redemption_only_one_call_can_win(phone):
    code = phone.create_code("owner")["code"]
    calls = [incoming(phone), incoming(phone)]

    def redeem(call):
        try:
            return phone.pair(call["session_id"], code, controller="owner")["paired"]
        except HTTPException:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(redeem, calls)) == [False, True]


def test_guest_and_simulator_controllers_are_isolated(phone):
    call = incoming(phone)
    with pytest.raises(HTTPException):
        phone.guest(call["session_id"], controller="different-browser")
    guest = phone.guest(call["session_id"], controller="owner")
    assert not guest["paired"] and "cannot book" in guest["reply"]
    result = phone.turn(
        call["session_id"], Turn(event_id=uuid4().hex, message="Book a cab"), controller="owner"
    )
    assert "Meera" not in str(result)
    with pytest.raises(HTTPException):
        phone.pair(call["session_id"], phone.create_code("owner")["code"], controller="owner")
    assert phone.store.read("owner")["activity"] == []


def test_deleting_account_revokes_live_phone_access(phone):
    call = incoming(phone)
    phone.pair(call["session_id"], phone.create_code("owner")["code"], controller="owner")
    phone.store.atomic(["hubAccounts/owner"], lambda docs: docs.update({"hubAccounts/owner": None}))
    with pytest.raises(HTTPException) as failure:
        phone.turn(
            call["session_id"], Turn(event_id=uuid4().hex, message="Home"), controller="owner"
        )
    assert failure.value.status_code == 403


def test_pairing_api_needs_owner_session_and_rejects_user_id(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "api.db"))
    app = create_app(Settings(environment="test"))
    with TestClient(app) as owner, TestClient(app) as caregiver:
        assert owner.post("/api/hub/phone/pairing-codes", json={}).status_code == 401
        owner.post("/api/hub/session")
        assert (
            owner.post("/api/hub/phone/pairing-codes", json={"user_id": "someone"}).status_code
            == 422
        )
        assert owner.post("/api/hub/phone/pairing-codes", json={}).status_code == 200
        code = owner.post("/api/hub/care-circle", json={"name": "Ravi", "role": "viewer"}).json()[
            "code"
        ]
        caregiver.post("/api/hub/caregiver/join", json={"code": code})
        assert caregiver.post("/api/hub/phone/pairing-codes", json={}).status_code == 403
        assert caregiver.get("/api/hub/phone/sessions/" + "a" * 40).status_code == 403
