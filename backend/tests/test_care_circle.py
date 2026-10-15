"""Care Circle permissions, enforced by the API rather than by hiding buttons."""

import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "care.db"))
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        assert api.post("/api/hub/session").status_code == 200
        yield api


def invite(owner, name, role="viewer", extras=()):
    result = owner.post(
        "/api/hub/care-circle", json={"name": name, "role": role, "extras": list(extras)}
    )
    assert result.status_code == 200, result.text
    return result.json()


def join(app, owner, name, role="viewer", extras=()):
    code = invite(owner, name, role, extras)["code"]
    helper = TestClient(app)
    assert helper.post("/api/hub/caregiver/join", json={"code": code}).status_code == 200
    return helper


def book(owner, service="ride", option=None, **extra):
    body = {"id": str(uuid4()), "service": service, **extra}
    if service == "ride":
        body.setdefault("destination", "Sunrise Clinic")
    proposal = owner.post("/api/hub/requests", json=body).json()
    choice = option or proposal["options"][0]["id"]
    result = owner.post(
        f"/api/hub/requests/{proposal['id']}/confirm",
        json={"option_id": choice, "confirmed": True},
    )
    assert result.status_code == 200, result.text
    return result.json()


def require_approval(owner, limit=100):
    profile = owner.get("/api/hub/state").json()["profile"]
    profile.update(caregiver_enabled=True, approval_limit=limit)
    assert owner.put("/api/hub/profile", json=profile).status_code == 200


def test_viewer_sees_only_what_is_shared_and_never_private_fields(app, owner):
    ride = book(owner)
    hidden = book(owner, "food")
    assert (
        owner.put(f"/api/hub/activity/{hidden['id']}/sharing", json={"shared": False}).json()[
            "shared"
        ]
        is False
    )
    viewer = join(app, owner, "Ravi")
    state = viewer.get("/api/hub/state").json()
    assert state["role"] == "caregiver"
    assert [item["id"] for item in state["activity"]] == [ride["id"]]
    assert "payment" not in state["activity"][0]
    for private in ("messages", "audit", "requests", "care_circle", "contacts"):
        assert not state.get(private)
    assert state["profile"]["medicines"] == [] and state["profile"]["home"] == ""
    profile = owner.get("/api/hub/state").json()["profile"]
    profile["sharing"]["ride"] = False
    owner.put("/api/hub/profile", json=profile)
    assert viewer.get("/api/hub/state").json()["activity"] == []


def test_viewer_cannot_act_through_the_api(app, owner):
    require_approval(owner)
    pending = book(owner, "ride", option="uber-go")
    assert pending["status"] == "awaiting_approval"
    viewer = join(app, owner, "Ravi")
    decision = f"/api/hub/activity/{pending['id']}/decision"
    assert viewer.post(decision, json={"action": "approve"}).status_code == 403
    assert viewer.post(f"/api/hub/activity/{pending['id']}/cancel").status_code == 403
    assert viewer.put("/api/hub/profile", json={"name": "x"}).status_code in {403, 422}
    profile = owner.get("/api/hub/state").json()["profile"]
    assert viewer.put("/api/hub/profile", json=profile).status_code == 403
    assert viewer.post("/api/hub/care-circle", json={"name": "Eve"}).status_code == 403
    assert viewer.post("/api/hub/demo/fail-next").status_code == 403
    assert owner.get("/api/hub/state").json()["activity"][0]["status"] == "awaiting_approval"


def test_delegated_approval_updates_the_owners_task_once(app, owner):
    require_approval(owner)
    pending = book(owner, "ride", option="uber-go")
    assert pending["payment"]["status"] == "not_charged_simulated"
    asha = join(app, owner, "Asha", "approver")
    meena = join(app, owner, "Meena", "approver")
    assert [a["id"] for a in asha.get("/api/hub/state").json()["approvals"]] == [pending["id"]]
    decision = f"/api/hub/activity/{pending['id']}/decision"
    approved = asha.post(decision, json={"action": "approve"})
    assert approved.status_code == 200
    assert asha.post(decision, json={"action": "approve"}).status_code == 200
    second = meena.post(decision, json={"action": "approve"})
    assert second.status_code == 409 and "Asha" in second.json()["detail"]
    assert meena.post(decision, json={"action": "reject"}).status_code == 409
    mine = owner.get("/api/hub/state").json()["activity"][0]
    assert mine["status"] == "simulated_confirmed"
    assert mine["payment"]["status"] == "pending_simulated"
    assert mine["decision"]["name"] == "Asha"
    audit = owner.get("/api/hub/state").json()["audit"]
    assert [a["actor"] for a in audit if a["event"] == "caregiver_approve"] == ["Asha"]


def test_approver_can_ask_a_question_without_deciding(app, owner):
    require_approval(owner)
    pending = book(owner, "ride", option="uber-go")
    asha = join(app, owner, "Asha", "approver")
    asked = asha.post(
        f"/api/hub/activity/{pending['id']}/decision",
        json={"action": "ask", "note": "Is this for the clinic visit?"},
    ).json()
    assert asked["status"] == "awaiting_approval"
    mine = owner.get("/api/hub/state").json()
    assert mine["activity"][0]["questions"][0]["text"] == "Is this for the clinic visit?"
    assert any(e["kind"] == "question" for e in mine["events"])


def test_revoked_caretaker_loses_access_immediately(app, owner):
    asha = join(app, owner, "Asha", "approver")
    grant = asha.get("/api/hub/state").json()["grant"]["id"]
    assert owner.delete(f"/api/hub/care-circle/{grant}").status_code == 200
    assert asha.get("/api/hub/state").status_code == 403
    require_approval(owner)
    pending = book(owner, "ride", option="uber-go")
    assert (
        asha.post(
            f"/api/hub/activity/{pending['id']}/decision", json={"action": "approve"}
        ).status_code
        == 403
    )


def test_reducing_permissions_applies_to_the_next_request(app, owner):
    require_approval(owner)
    pending = book(owner, "ride", option="uber-go")
    asha = join(app, owner, "Asha", "approver")
    grant = asha.get("/api/hub/state").json()["grant"]["id"]
    owner.put(f"/api/hub/care-circle/{grant}", json={"role": "viewer", "extras": []})
    decision = f"/api/hub/activity/{pending['id']}/decision"
    assert asha.post(decision, json={"action": "approve"}).status_code == 403
    assert asha.get("/api/hub/state").json()["approvals"] == []


def test_booking_and_payment_statuses_stay_separate(owner):
    booked = book(owner)
    assert (booked["status"], booked["payment"]["status"]) == (
        "simulated_confirmed",
        "pending_simulated",
    )
    done = owner.post(f"/api/hub/activity/{booked['id']}/complete").json()
    assert (done["status"], done["payment"]["status"]) == ("completed", "succeeded_simulated")
    assert done["payment"]["simulated"] is True
    cancelled = owner.post(f"/api/hub/activity/{book(owner)['id']}/cancel").json()
    assert (cancelled["status"], cancelled["payment"]["status"]) == (
        "cancelled",
        "not_charged_simulated",
    )
    assert owner.post(f"/api/hub/activity/{cancelled['id']}/complete").status_code == 409


def test_failed_booking_is_failed_not_completed_and_not_charged(app, owner):
    assert owner.post("/api/hub/demo/fail-next").json() == {"fail_next": True}
    failed = book(owner)
    assert (failed["status"], failed["payment"]["status"]) == ("failed", "not_charged_simulated")
    assert "nothing was booked or charged" in failed["failure"]
    retry = owner.post(
        f"/api/hub/requests/{failed['id']}/confirm",
        json={"option_id": failed["option"]["id"], "confirmed": True},
    ).json()
    assert retry["status"] == "failed"
    assert owner.post(f"/api/hub/activity/{failed['id']}/complete").status_code == 409
    assert len(owner.get("/api/hub/state").json()["activity"]) == 1
    assert book(owner)["status"] == "simulated_confirmed"
    watcher = join(app, owner, "Asha", "viewer", ["receive_alerts"])
    viewer = join(app, owner, "Ravi")
    alerts = [e["kind"] for e in watcher.get("/api/hub/state").json()["events"]]
    assert "booking_failed" in alerts
    assert "booking_failed" not in [
        e["kind"] for e in viewer.get("/api/hub/state").json()["events"]
    ]
    statuses = [item["status"] for item in viewer.get("/api/hub/state").json()["activity"]]
    assert "failed" in statuses and "completed" not in statuses


def test_notifications_follow_permissions_and_sharing(app, owner):
    secret = book(owner, "food")
    owner.put(f"/api/hub/activity/{secret['id']}/sharing", json={"shared": False})
    viewer = join(app, owner, "Ravi")
    refs = {e["ref"] for e in viewer.get("/api/hub/state").json()["events"]}
    assert secret["id"] not in refs
    assert all(
        e["permission"] == "view_activity" for e in viewer.get("/api/hub/state").json()["events"]
    )


def test_medicine_details_need_their_own_permission(app, owner):
    profile = owner.get("/api/hub/state").json()["profile"]
    book(owner, "medicine", medicine=profile["medicines"][0])
    plain = join(app, owner, "Ravi").get("/api/hub/state").json()
    assert plain["activity"][0]["option"]["name"] == "Medicine request (details not shared)"
    allowed = join(app, owner, "Asha", "viewer", ["view_medication", "view_payments"])
    state = allowed.get("/api/hub/state").json()
    assert state["activity"][0]["option"]["name"] != "Medicine request (details not shared)"
    assert state["profile"]["medicines"] == profile["medicines"]
    assert state["activity"][0]["payment"]["simulated"] is True


def test_administrator_limits(app, owner):
    admin = join(app, owner, "Kiran", "administrator")
    assert admin.post("/api/hub/care-circle", json={"name": "Neighbour"}).status_code == 200
    for body in (
        {"name": "X", "role": "approver"},
        {"name": "X", "role": "administrator"},
        {"name": "X", "extras": ["view_transcripts"]},
        {"name": "X", "extras": ["approve"]},
    ):
        assert admin.post("/api/hub/care-circle", json=body).status_code == 403
    approver = invite(owner, "Asha", "approver")["grant"]["id"]
    assert admin.delete(f"/api/hub/care-circle/{approver}").status_code == 403
    circle = admin.get("/api/hub/state").json()["circle"]
    assert {person["name"] for person in circle} >= {"Kiran", "Neighbour", "Asha"}
    assert admin.put(f"/api/hub/care-circle/{approver}", json={"role": "viewer"}).status_code == 403


def test_invitations_are_one_use_expire_and_die_with_revocation(app, owner, monkeypatch):
    first = invite(owner, "Asha")
    with TestClient(app) as one, TestClient(app) as two:
        assert one.post("/api/hub/caregiver/join", json={"code": first["code"]}).status_code == 200
        assert two.post("/api/hub/caregiver/join", json={"code": first["code"]}).status_code == 403
    second = invite(owner, "Ravi")
    owner.delete(f"/api/hub/care-circle/{second['grant']['id']}")
    with TestClient(app) as late:
        assert late.post("/api/hub/caregiver/join", json={"code": second["code"]}).status_code in {
            403
        }
    third = invite(owner, "Old code")
    real = time.time
    monkeypatch.setattr("app.hub.time.time", lambda: real() + 2 * 86400)
    with TestClient(app) as slow:
        assert slow.post("/api/hub/caregiver/join", json={"code": third["code"]}).status_code == 401


def test_unknown_permissions_and_roles_are_rejected(owner):
    for body in (
        {"name": "X", "role": "owner"},
        {"name": "X", "extras": ["everything"]},
        {"name": "X", "extras": ["approve", "approve"]},
        {"name": ""},
    ):
        assert owner.post("/api/hub/care-circle", json=body).status_code == 422


def test_reset_removes_everyone(app, owner):
    asha = join(app, owner, "Asha", "approver")
    owner.delete("/api/hub/data")
    assert asha.get("/api/hub/state").status_code == 403
