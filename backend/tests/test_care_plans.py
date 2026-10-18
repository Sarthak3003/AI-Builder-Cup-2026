"""Appointments, reminders, conversations, safety signals, coordination and the demo seed."""

import json
import time
from uuid import uuid4

import pytest
from booking_helpers import confirm, ok, ready
from fastapi.testclient import TestClient
from test_assistant import fake_gemini

from app.assistant import Summary
from app.config import Settings
from app.hub_store import HubStore
from app.main import create_app

MEERA = {"scenario": "meera", "confirm": True}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "plans.db"))
    monkeypatch.delenv("SAATHI_GEMINI_API_KEY", raising=False)
    return create_app(Settings(environment="test"))


@pytest.fixture
def owner(app):
    with TestClient(app) as api:
        api.post("/api/hub/session")
        ready(api)
        yield api


def join(app, owner, name, role="viewer", extras=()):
    code = owner.post(
        "/api/hub/care-circle", json={"name": name, "role": role, "extras": list(extras)}
    ).json()["code"]
    helper = TestClient(app)
    assert helper.post("/api/hub/caregiver/join", json={"code": code}).status_code == 200
    return helper


def appointment(api, title="Check-up with Dr Mehta", hours=20):
    body = {
        "title": title,
        "with_whom": "Dr Mehta",
        "place": "Sunrise Clinic",
        "starts_at": time.time() + hours * 3600,
    }
    return api.post("/api/hub/appointments", json=body)


def ask(api, message, channel="app"):
    result = api.post(
        "/api/hub/ask", json={"id": str(uuid4()), "message": message, "channel": channel}
    )
    assert result.status_code == 200, result.text
    return result.json()


def state(api):
    return api.get("/api/hub/state").json()


def test_appointments_need_manage_reminders_and_follow_sharing(app, owner):
    assert appointment(owner).status_code == 200
    viewer = join(app, owner, "Ravi")
    helper = join(app, owner, "Asha", "assistant")
    assert appointment(viewer).status_code == 403
    added = appointment(helper, "Eye check-up", 100).json()
    assert added["created_by"] == "Asha"
    changed = {**added, "title": "Eye check-up (moved)"}
    for key in ("id", "ride_request_id", "created_by", "created_at"):
        changed.pop(key)
    assert helper.put(f"/api/hub/appointments/{added['id']}", json=changed).status_code == 200
    assert [a["title"] for a in state(viewer)["appointments"]] == [
        "Check-up with Dr Mehta",
        "Eye check-up (moved)",
    ]
    profile = state(owner)["profile"]
    profile["sharing"]["appointments"] = False
    owner.put("/api/hub/profile", json=profile)
    hidden = state(viewer)
    assert hidden["appointments"] == []
    assert not [e for e in hidden["events"] if e.get("topic") == "appointments"]
    assert len(state(helper)["appointments"]) == 2


def test_missed_reminders_are_flagged_and_done_is_not_proof_of_medicine(app, owner):
    past = owner.post(
        "/api/hub/reminders", json={"title": "Call clinic", "due_at": time.time() - 60}
    ).json()
    assert past["status"] == "missed"
    pill = owner.post(
        "/api/hub/reminders",
        json={"title": "BP tablet", "kind": "medicine", "due_at": time.time() + 3600},
    ).json()
    assert pill["status"] == "upcoming"
    helper = join(app, owner, "Asha", "assistant")
    assert [r["title"] for r in state(helper)["reminders"]] == ["Call clinic"]
    assert (
        helper.post(
            "/api/hub/reminders",
            json={"title": "Pills", "kind": "medicine", "due_at": time.time() + 60},
        ).status_code
        == 403
    )
    assert helper.post(f"/api/hub/reminders/{past['id']}/done").status_code == 403
    done = owner.post(f"/api/hub/reminders/{past['id']}/done").json()
    assert done["status"] == "done" and done["done_at"]
    nurse = join(app, owner, "Nurse", "assistant", ["view_medication"])
    assert {r["title"] for r in state(nurse)["reminders"]} == {"Call clinic", "BP tablet"}


def test_doctor_request_uses_the_saved_appointment_and_caretaker_sees_the_ride(app, owner):
    appt = appointment(owner).json()
    viewer = join(app, owner, "Ravi")
    asked = ask(owner, "Please take me to my doctor's appointment", "voice")
    assert (asked["service"], asked["understood_by"]) == ("ride", "appointment")
    assert asked["appointment_id"] == appt["id"]
    assert "Sunrise Clinic" in asked["summary"]
    assert all(q["appointment_id"] == appt["id"] for q in asked["quotes"])
    assert all(q["details"]["destination"]["label"] == appt["title"] for q in asked["quotes"])
    order = ok(confirm(owner, asked["quotes"][0]))
    assert order["appointment_id"] == appt["id"]
    assert state(owner)["appointments"][0]["ride_request_id"] == order["id"]
    seen = state(viewer)
    assert seen["activity"][0]["appointment_id"] == appt["id"]
    assert any(e["kind"] == "appointment_ride" for e in seen["events"])
    owner.post(f"/api/hub/bookings/{order['id']}/cancel")
    after = state(viewer)
    cancelled = [e for e in after["events"] if e["kind"] == "ride_cancelled"]
    assert cancelled and cancelled[0]["severity"] == "attention"
    assert state(owner)["appointments"][0]["ride_request_id"] is None


def test_an_appointment_ride_is_only_called_arranged_once_approved(app, owner):
    appointment(owner)
    profile = state(owner)["profile"]
    profile.update(caregiver_enabled=True, approval_limit=50)
    owner.put("/api/hub/profile", json=profile)
    asha = join(app, owner, "Asha", "approver")
    asked = ask(owner, "Take me to the doctor")
    uber = next(q for q in asked["quotes"] if q["option_id"] == "uber-go")
    order = ok(confirm(owner, uber))
    assert order["booking_status"] == "AWAITING_APPROVAL"
    titles = [e["title"] for e in state(owner)["events"] if e["kind"] == "appointment_ride"]
    assert titles == ["Ride for Check-up with Dr Mehta is waiting for approval"]
    asha.post(f"/api/hub/bookings/{order['id']}/decision", json={"action": "approve"})
    titles = [e["title"] for e in state(owner)["events"] if e["kind"] == "appointment_ride"]
    assert titles[0] == "Ride arranged for Check-up with Dr Mehta"


def test_summaries_separate_confirmed_actions_from_suggestions(app, owner):
    appointment(owner)
    asked = ask(owner, "Take me to the doctor")
    early = state(owner)["conversations"][0]["summary"]
    assert early["confirmed"] == [] and "nothing was booked" in early["text"]
    ok(confirm(owner, asked["quotes"][0]))
    summary = state(owner)["conversations"][0]["summary"]
    assert summary["by"] == "rules"
    assert summary["confirmed"][0].startswith("Booked") and "(simulated)" in summary["confirmed"][0]
    assert summary["suggestions"] == ["Ask whether someone could go along to the appointment."]


def test_summaries_and_transcripts_need_separate_permissions(app, owner):
    asked = ask(owner, "Take me to the market")
    order = ok(confirm(owner, asked["quotes"][0]))
    viewer = join(app, owner, "Ravi")
    reader = join(app, owner, "Asha", "viewer", ["view_summaries"])
    full = join(app, owner, "Kiran", "viewer", ["view_summaries", "view_transcripts"])
    assert state(viewer)["conversations"] == []
    shown = state(reader)["conversations"]
    assert len(shown) == 1 and "transcript" not in shown[0]
    path = f"/api/hub/conversations/{shown[0]['id']}/transcript"
    assert reader.get(path).status_code == 403
    assert viewer.get(path).status_code == 403
    assert full.get(path).json()["transcript"][0]["text"] == "Take me to the market"
    owner.put(f"/api/hub/bookings/{order['id']}/sharing", json={"shared": False})
    assert full.get(path).status_code == 404
    assert state(full)["conversations"] == []
    assert any(
        a["event"] == "transcript_viewed" and a["actor"] == "Kiran" for a in state(owner)["audit"]
    )


def test_pharmacy_summaries_hide_item_names_without_medication_permission(app, owner):
    asked = ask(owner, "Please order ORS sachets")
    assert asked["service"] == "medicine" and asked["quotes"][0]["title"].startswith("ORS")
    ok(confirm(owner, asked["quotes"][0]))
    reader = join(app, owner, "Asha", "viewer", ["view_summaries"])
    text = str(state(reader)["conversations"])
    assert "ORS" not in text and "pharmacy order" in text


def test_prescription_medicine_is_never_quoted(owner):
    asked = ask(owner, "Please reorder my BP tablets")
    assert (asked["service"], asked["quotes"]) == ("medicine", [])
    assert "cannot order prescription medicines" in asked["clarification"]
    assert state(owner)["quotes"] == []


def test_gemini_summary_never_decides_what_was_confirmed(app, owner, monkeypatch):
    asked = ask(owner, "Take me to the market")
    conv = state(owner)["conversations"][0]["id"]
    assert owner.post(f"/api/hub/conversations/{conv}/summary").status_code == 503
    monkeypatch.setenv("SAATHI_GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.hub.summarise_conversation",
        lambda lines, confirmed, *, language="en-IN": Summary(
            text="Meera wanted to go to the market.", suggestions=["Offer to go along."]
        ),
    )
    result = owner.post(f"/api/hub/conversations/{conv}/summary").json()["summary"]
    assert result == {
        "by": "gemini",
        "text": "Meera wanted to go to the market.",
        "confirmed": [],
        "suggestions": ["Offer to go along."],
    }
    ok(confirm(owner, asked["quotes"][0]))
    assert state(owner)["conversations"][0]["summary"]["confirmed"][0].startswith("Booked")


@pytest.mark.parametrize("as_caregiver", [False, True])
def test_ai_summary_uses_current_owner_language_and_preserves_history(
    app, owner, monkeypatch, as_caregiver
):
    asked = ask(owner, "Take me to the market")
    ok(confirm(owner, asked["quotes"][0]))
    conversation = state(owner)["conversations"][0]
    conv = conversation["id"]
    confirmed = conversation["summary"]["confirmed"]
    path = f"/api/hub/conversations/{conv}"
    before = ok(owner.get(path + "/transcript"))
    reader = join(app, owner, "Asha", "viewer", ["view_summaries"]) if as_caregiver else owner
    ok(owner.patch("/api/hub/onboarding/profile", json={"language": "hi-IN"}))
    text = "बाज़ार जाने के लिए डेमो बुकिंग की पुष्टि हुई।"
    suggestions = ["पूछें कि क्या कोई साथ चल सकता है।"]
    sent = fake_gemini(monkeypatch, {"text": text, "suggestions": suggestions})
    result = ok(reader.post(path + "/summary"))["summary"]
    assert result == {
        "by": "gemini",
        "text": text,
        "suggestions": suggestions,
        "confirmed": confirmed,
    }
    payload = json.loads(sent[0].data)
    assert "Hindi (Devanagari)" in payload["systemInstruction"]["parts"][0]["text"]
    assert "user: Take me to the market" in payload["contents"][0]["parts"][0]["text"]
    assert ok(owner.get(path + "/transcript")) == before
    assert state(owner)["conversations"][0]["summary"] == result


def test_suspected_scam_is_flagged_as_a_suspicion_and_nothing_happens(app, owner):
    reply = ask(owner, "Bank says my KYC is blocked, share the OTP to unblock", "message")
    assert reply["status"] == "needs_details" and "scam" in reply["clarification"]
    events = [e for e in state(owner)["events"] if e["kind"] == "suspected_scam"]
    assert events[0]["certainty"] == "suspected"
    assert state(owner)["quotes"] == []
    alerts = join(app, owner, "Asha", "viewer", ["receive_alerts", "view_summaries"])
    viewer = join(app, owner, "Ravi")
    reader = join(app, owner, "Kiran", "viewer", ["view_summaries"])
    assert any(e["kind"] == "suspected_scam" for e in state(alerts)["events"])
    assert state(alerts)["conversations"][0]["safety"] == "suspected_scam"
    assert state(reader)["conversations"] == []
    assert not any(e["kind"] == "suspected_scam" for e in state(viewer)["events"])


def test_repeated_trouble_and_emergencies_alert_without_guessing(owner):
    for message in ("hello there", "what is this", "hmm okay"):
        ask(owner, message)
    trouble = [e for e in state(owner)["events"] if e["kind"] == "repeated_trouble"]
    assert len(trouble) == 1 and trouble[0]["certainty"] == "confirmed"
    ask(owner, "I have chest pain")
    assert any(e["kind"] == "emergency_mentioned" for e in state(owner)["events"])


def test_help_requests_reach_alert_holders_who_can_resolve_them(app, owner):
    appt = appointment(owner).json()
    asked = owner.post(
        "/api/hub/help", json={"kind": "accompany", "appointment_id": appt["id"]}
    ).json()
    assert "come to Check-up with Dr Mehta" in asked["title"]
    assert "No one has agreed yet" in asked["detail"]
    alerts = join(app, owner, "Asha", "viewer", ["receive_alerts"])
    viewer = join(app, owner, "Ravi")
    assert viewer.post(f"/api/hub/events/{asked['id']}/resolve", json={}).status_code == 403
    resolved = alerts.post(
        f"/api/hub/events/{asked['id']}/resolve", json={"note": "I'll go with her."}
    ).json()
    assert (resolved["status"], resolved["resolved_by"]) == ("resolved", "Asha")
    assert owner.post("/api/hub/help", json={"kind": "accompany"}).status_code == 404
    assert alerts.post("/api/hub/help", json={}).status_code == 403


def test_assistants_may_fix_the_home_address_but_nothing_else(app, owner):
    viewer = join(app, owner, "Ravi")
    helper = join(app, owner, "Asha", "assistant")
    body = {"home": "14 Sample Lane (sample address)"}
    assert viewer.put("/api/hub/profile/home", json=body).status_code == 403
    assert helper.put("/api/hub/profile/home", json=body).json()["profile"]["home"] == body["home"]
    assert state(owner)["profile"]["home"] == body["home"]
    assert helper.put("/api/hub/profile/home", json={**body, "name": "X"}).status_code == 422
    profile = state(owner)["profile"]
    assert helper.put("/api/hub/profile", json=profile).status_code == 403


def test_trusted_contacts_need_their_own_permission(app, owner):
    added = owner.post(
        "/api/hub/contacts", json={"name": "Asha", "phone": "+91 90000 00001", "primary": True}
    ).json()
    viewer = join(app, owner, "Ravi")
    keeper = join(app, owner, "Asha", "viewer", ["manage_contacts"])
    assert state(viewer)["contacts"] == []
    assert viewer.post("/api/hub/contacts", json={"name": "Eve"}).status_code == 403
    assert viewer.delete(f"/api/hub/contacts/{added['id']}").status_code == 403
    assert [c["name"] for c in state(keeper)["contacts"]] == ["Asha"]
    other = keeper.post("/api/hub/contacts", json={"name": "Dr Rao", "primary": True}).json()
    contacts = state(owner)["contacts"]
    assert [c["primary"] for c in contacts] == [False, True]
    assert other["added_by"] == "Asha"


def test_demo_seed_loads_meera_with_invites_that_work(app, owner):
    seeded = owner.post("/api/hub/demo/reset", json=MEERA).json()
    meera = seeded["state"]
    assert meera["profile"]["name"] == "Meera"
    assert [a["title"] for a in meera["appointments"]][0] == "Check-up with Dr Mehta"
    assert {r["status"] for r in meera["reminders"]} == {"upcoming", "missed", "done"}
    assert [i["name"] for i in seeded["invites"]] == ["Asha", "Ravi"]
    asha = TestClient(app)
    asha.post("/api/hub/caregiver/join", json={"code": seeded["invites"][0]["code"]})
    ravi = TestClient(app)
    ravi.post("/api/hub/caregiver/join", json={"code": seeded["invites"][1]["code"]})
    approvals = state(asha)["approvals"]
    assert approvals[0]["title"].startswith("ORS sachets")
    assert approvals[0]["approval_reason"] == "Pharmacy orders need approval."
    seen_by_ravi = state(ravi)
    assert "ORS" not in str(seen_by_ravi["activity"])
    assert seen_by_ravi["conversations"] == [] and seen_by_ravi["contacts"] == []
    meal = next(b for b in state(owner)["activity"] if b["service"] == "food")
    assert (meal["booking_status"], meal["payment"]["status"]) == (
        "COMPLETED_SIMULATED",
        "SUCCEEDED_SIMULATED",
    )
    assert meal["provider_booking_id"] == "DEMO-FOOD-1042"
    asked = ask(owner, "Take me to my doctor's appointment")
    assert asked["appointment_id"] == "appt-mehta"


def test_demo_switcher_plays_each_person_in_the_demo_this_browser_loaded(app, owner):
    seeded = owner.post("/api/hub/demo/reset", json=MEERA).json()
    meera = seeded["state"]
    people = {person["name"]: person["id"] for person in meera["demo_people"]}
    assert meera["demo_person"] == "owner" and set(people) == {"Meera", "Asha", "Ravi"}

    switch = lambda to: owner.post("/api/hub/demo/switch", json={"to": to})  # noqa: E731
    asha = switch(people["Asha"]).json()
    assert (asha["role"], asha["grant"]["name"], asha["demo_person"]) == (
        "caregiver",
        "Asha",
        people["Asha"],
    )
    assert state(owner)["approvals"] and "profile" in state(owner)
    ride = {"service_type": "RIDE", "destination_text": "Market"}
    assert owner.post("/api/hub/quotes", json=ride).status_code == 403
    ravi = switch(people["Ravi"]).json()
    assert ravi["grant"]["name"] == "Ravi" and ravi["approvals"] == []
    back = switch("owner").json()
    assert (back["role"], back["profile"]["name"]) == ("owner", "Meera")

    owner.delete(f"/api/hub/care-circle/{people['Ravi']}")
    assert switch(people["Ravi"]).status_code == 404
    with TestClient(app) as phone:
        code = seeded["invites"][0]["code"]
        assert phone.post("/api/hub/caregiver/join", json={"code": code}).status_code == 200
        assert phone.post("/api/hub/demo/switch", json={"to": "owner"}).status_code == 403
        assert "demo_people" not in state(phone)


def test_switching_needs_a_demo_loaded_in_this_browser(owner):
    assert owner.post("/api/hub/demo/switch", json={"to": "owner"}).status_code == 403
    assert "demo_people" not in state(owner)


def production(tmp_path, monkeypatch):
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.setenv("SAATHI_SESSION_SECRET", "test-secret-" * 4)
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "prod.db"))
    local = HubStore(Settings(environment="test", firestore_mode="disabled"))
    monkeypatch.setattr("app.hub.HubStore", lambda config: local)
    return create_app(
        Settings(environment="production", firestore_mode="cloud", firestore_project="demo")
    )


@pytest.mark.parametrize("enabled", [False, True])
def test_demo_controls_are_off_in_production_unless_opted_in(tmp_path, monkeypatch, enabled):
    if enabled:
        monkeypatch.setenv("SAATHI_DEMO_CONTROLS", "1")
    else:
        monkeypatch.delenv("SAATHI_DEMO_CONTROLS", raising=False)
    with TestClient(production(tmp_path, monkeypatch), base_url="https://api.example") as api:
        api.post("/api/hub/session")
        assert state(api)["demo_controls"] is enabled
        expected = 200 if enabled else 404
        assert api.post("/api/hub/demo/reset", json=MEERA).status_code == expected
        assert api.post("/api/hub/demo/fail-next").status_code == expected
        assert api.post("/api/hub/demo/switch", json={"to": "owner"}).status_code == expected
