"""Cross-namespace storage contracts; real Firestore is opt-in and emulator-only."""

import json
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
from threading import Barrier
from unittest.mock import MagicMock, call, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from google.auth.credentials import AnonymousCredentials

from app.config import Settings
from app.hub_store import HubStore, initial_state

ACCOUNT = "hubAccounts/owner_1"
SESSION = "phoneSessions/shared-id"
PAIRING = "phonePairings/shared-id"
EVENT = "phoneEvents/shared-id"
LIMITS = "phoneLimits/global"
MISSING = "phoneEvents/absent"


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "store.db"))
    return HubStore(Settings(environment="test", firestore_mode="disabled"))


@pytest.fixture
def sql_trace(store, monkeypatch):
    statements = []
    connect = sqlite3.connect

    def traced_connect(*args, **kwargs):
        db = connect(*args, **kwargs)
        db.set_trace_callback(statements.append)
        return db

    monkeypatch.setattr("app.hub_store.sqlite3.connect", traced_connect)
    return statements


def starting_documents():
    return {
        ACCOUNT: {"profile": {"name": "Kept"}, "history": [{"id": "old"}]},
        SESSION: None,
        PAIRING: {"used": False},
        EVENT: {"received": True},
        LIMITS: {"active": 0},
        MISSING: None,
    }


def update_documents(documents):
    assert documents == starting_documents()
    documents[ACCOUNT]["history"].append({"id": "phone"})
    documents[SESSION] = {"owner": "owner_1"}
    documents[PAIRING]["used"] = True
    documents[EVENT] = None
    documents[LIMITS] = deepcopy(documents[LIMITS])
    return {"session": documents[SESSION], "history": documents[ACCOUNT]["history"]}


def test_sqlite_atomic_reads_every_key_before_writing_only_changes(store, sql_trace):
    before = starting_documents()
    keys = list(before)
    store.atomic(keys, lambda documents: documents.update(deepcopy(before)))
    sql_trace.clear()

    result = store.atomic([*keys, ACCOUNT], update_documents)
    expected = deepcopy(before)
    assert result == update_documents(expected)
    assert sql_trace[0] == "BEGIN IMMEDIATE"
    assert [statement.split()[0] for statement in sql_trace] == (
        ["BEGIN"] + ["SELECT"] * len(keys) + ["INSERT"] * 3 + ["DELETE", "COMMIT"]
    )
    assert {key: store.read_document(key) for key in keys} == expected
    with closing(sqlite3.connect(store.path)) as db:
        assert db.execute("SELECT id FROM accounts").fetchall() == [("owner_1",)]
        assert {row[0] for row in db.execute("SELECT id FROM documents")} == {
            SESSION,
            PAIRING,
            LIMITS,
        }


def test_sqlite_noop_atomic_does_not_write_or_create_missing_documents(store, sql_trace):
    before = starting_documents()
    store.atomic(list(before), lambda documents: documents.update(deepcopy(before)))
    sql_trace.clear()

    assert store.atomic(list(before), lambda documents: deepcopy(documents)) == before
    assert [statement.split()[0] for statement in sql_trace] == (
        ["BEGIN"] + ["SELECT"] * len(before) + ["COMMIT"]
    )
    assert store.read_document(SESSION) is None
    assert store.read_document(MISSING) is None


@pytest.mark.parametrize("failure", ["callback", "serialization"])
def test_sqlite_atomic_rolls_back_every_namespace(store, sql_trace, failure):
    before = starting_documents()
    keys = list(before)
    store.atomic(keys, lambda documents: documents.update(deepcopy(before)))
    sql_trace.clear()

    def fail(documents):
        documents[ACCOUNT]["history"].append({"id": "must-rollback"})
        documents[PAIRING] = None
        documents[SESSION] = {"not_json": {1, 2}}
        if failure == "callback":
            raise RuntimeError("abort callback")

    error = RuntimeError if failure == "callback" else TypeError
    with pytest.raises(error):
        # In the serialization case, both earlier SQL writes must be rolled back too.
        store.atomic([ACCOUNT, PAIRING, SESSION, EVENT, LIMITS, MISSING], fail)
    assert sql_trace[-1] == "ROLLBACK"
    if failure == "serialization":
        assert any(statement.startswith("INSERT") for statement in sql_trace)
        assert any(statement.startswith("DELETE") for statement in sql_trace)
    assert {key: store.read_document(key) for key in keys} == before
    store.atomic(keys, update_documents)
    assert store.read_document(SESSION) == {"owner": "owner_1"}


def test_reads_neither_write_nor_create_accounts(store, sql_trace, monkeypatch):
    before = starting_documents()[ACCOUNT]
    store.atomic([ACCOUNT], lambda documents: documents.update({ACCOUNT: deepcopy(before)}))
    sql_trace.clear()
    monkeypatch.setattr(store, "atomic", MagicMock(side_effect=AssertionError("read used atomic")))
    monkeypatch.setattr(store, "change", MagicMock(side_effect=AssertionError("read used change")))

    assert store.read_document(SESSION) is None
    assert store.read_document("hubAccounts/missing") is None
    fresh = store.read("missing")
    assert fresh == initial_state()
    fresh["profile"]["name"] = "Not saved"
    fresh["activity"].append({"id": "Not saved"})
    assert store.read("missing") == initial_state()
    existing = store.read("owner_1")
    assert existing == before
    existing["history"].clear()
    assert store.read_document(ACCOUNT) == before
    assert sql_trace and all(statement.startswith("SELECT") for statement in sql_trace)
    with closing(sqlite3.connect(store.path)) as db:
        assert db.execute("SELECT id FROM accounts").fetchall() == [("owner_1",)]
        assert db.execute("SELECT COUNT(*) FROM documents").fetchone() == (0,)


@pytest.mark.parametrize("saved", [None, {}, {"profile": {"name": "Legacy"}, "custom": [1]}])
def test_change_delegates_to_atomic_and_only_initialises_missing_accounts(store, saved):
    store.atomic([ACCOUNT], lambda documents: documents.update({ACCOUNT: deepcopy(saved)}))
    expected = initial_state() if saved is None else saved
    callback = MagicMock(side_effect=lambda state: state)
    with patch.object(store, "atomic", wraps=store.atomic) as atomic:
        assert store.change("owner_1", callback) == expected
        atomic.assert_called_once()
        assert atomic.call_args.args[0] == [ACCOUNT]
        callback.assert_called_once_with(expected)
    assert store.read_document(ACCOUNT) == expected
    assert store.read("owner_1") == expected


def test_atomic_returns_a_deeply_detached_callback_result(store):
    captured = {}

    def apply(documents):
        documents[SESSION] = {"nested": {"events": ["saved"]}}
        captured.update(documents)
        return {"session": documents[SESSION]}

    result = store.atomic([SESSION], apply)
    captured[SESSION]["nested"]["events"].append("outside callback")
    assert result == {"session": {"nested": {"events": ["saved"]}}}
    result["session"]["nested"]["events"].append("outside result")
    assert store.read_document(SESSION) == {"nested": {"events": ["saved"]}}


def test_existing_accounts_table_is_used_without_reset_or_migration(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(path))
    old = {"schema": -1, "profile": {"name": "Legacy"}, "history": [{"id": "old"}]}
    raw = json.dumps(old, indent=2)
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY, state TEXT)")
        db.execute("INSERT INTO accounts VALUES (?, ?)", ("owner_1", raw))

    store = HubStore(Settings(environment="test", firestore_mode="disabled"))
    assert store.read("owner_1") == old
    assert store.change("owner_1", lambda state: state) == old
    assert store.atomic([ACCOUNT], lambda documents: documents[ACCOUNT]) == old
    with closing(sqlite3.connect(path)) as db:
        assert db.execute("SELECT state FROM accounts WHERE id='owner_1'").fetchone() == (raw,)
        assert [(row[1], row[2], row[5]) for row in db.execute("PRAGMA table_info(documents)")] == [
            ("id", "TEXT", 1),
            ("state", "TEXT", 0),
        ]
        assert db.execute("SELECT COUNT(*) FROM documents").fetchone() == (0,)

    def append(documents):
        documents[ACCOUNT]["history"].append({"id": "new"})
        documents[SESSION] = {"owner": "owner_1"}

    store.atomic([ACCOUNT, SESSION], append)
    old["history"].append({"id": "new"})
    assert HubStore(store.config).read("owner_1") == old
    with closing(sqlite3.connect(path)) as db:
        assert db.execute("SELECT id FROM accounts").fetchall() == [("owner_1",)]
        assert db.execute("SELECT id FROM documents").fetchall() == [(SESSION,)]


@pytest.mark.parametrize(
    "key",
    [
        "",
        "hubAccounts",
        "/owner",
        "hubAccounts/",
        "/hubAccounts/owner",
        "hubAccounts/owner/extra",
        "hubAccounts//owner",
        "../owner",
        "hubAccounts/..",
        "hubAccounts/.",
        "hubAccounts/a..b",
        "hubAccounts/a\\b",
        "hubAccounts/%2e%2e",
        "hubAccounts/a b",
        "hubAccounts/id\n",
        "hubAccounts/a?b",
        "hubAccounts/a#b",
        "hubAccounts/x');DROP TABLE accounts;--",
        None,
        b"hubAccounts/owner",
    ],
)
def test_invalid_keys_are_rejected_before_any_storage_access(store, key):
    callback = MagicMock()
    with patch("app.hub_store.sqlite3.connect") as connect:
        with pytest.raises(ValueError, match="Document keys"):
            store.read_document(key)
        with pytest.raises(ValueError, match="Document keys"):
            store.atomic([ACCOUNT, key], callback)
        connect.assert_not_called()
    callback.assert_not_called()


@pytest.mark.parametrize("invalid", ["extra-key", "unsafe-key", "removed-key", "not-dict"])
def test_atomic_rejects_changed_key_sets_and_invalid_document_values(store, invalid):
    before = starting_documents()[ACCOUNT]
    store.atomic([ACCOUNT], lambda documents: documents.update({ACCOUNT: deepcopy(before)}))

    def invalid_update(documents):
        documents[ACCOUNT]["history"].clear()
        if invalid == "extra-key":
            documents[EVENT] = {}
        elif invalid == "unsafe-key":
            documents["phoneEvents/../../outside"] = {}
        elif invalid == "removed-key":
            del documents[ACCOUNT]
        else:
            documents[ACCOUNT] = []

    with pytest.raises(ValueError):
        store.atomic([ACCOUNT], invalid_update)
    assert store.read_document(ACCOUNT) == before
    assert store.read_document(EVENT) is None


def exercise_single_use_race(store):
    owner = uuid4().hex
    account, pairing, limits = [
        f"{namespace}/{owner}" for namespace in ("hubAccounts", "phonePairings", "phoneLimits")
    ]
    sessions = [f"phoneSessions/{owner}_{index}" for index in range(4)]
    events = [f"phoneEvents/{owner}_{index}" for index in range(4)]
    keys = [account, pairing, limits, *sessions, *events]
    initial = {account: {"claims": 0}, pairing: {"owner": owner}, limits: {"active": 0}}
    start = Barrier(4)
    # Independent instances prove that exclusion is provided by storage, not a Python lock.
    stores = [HubStore(store.config) for _ in sessions]

    def claim(index):
        start.wait(timeout=10)

        def consume(documents):
            if documents[pairing] is None:
                return False
            assert documents[pairing] == {"owner": owner}
            documents[pairing] = None
            documents[account]["claims"] += 1
            documents[limits]["active"] += 1
            documents[sessions[index]] = {"owner": owner}
            documents[events[index]] = {"session": sessions[index]}
            return True

        return stores[index].atomic(
            [account, pairing, limits, sessions[index], events[index]], consume
        )

    try:
        store.atomic(keys, lambda documents: documents.update(deepcopy(initial)))
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(claim, range(4)))
        assert results.count(True) == 1
        assert results.count(False) == 3
        assert store.read(owner) == {"claims": 1}
        assert store.read_document(limits) == {"active": 1}
        assert store.read_document(pairing) is None
        for index, won in enumerate(results):
            assert store.read_document(sessions[index]) == ({"owner": owner} if won else None)
            assert store.read_document(events[index]) == (
                {"session": sessions[index]} if won else None
            )
    finally:
        store.atomic(keys, lambda documents: documents.update(dict.fromkeys(keys)))


def test_sqlite_pairing_is_single_use_across_concurrent_store_instances(store):
    exercise_single_use_race(store)


@pytest.fixture(params=["emulator", "cloud"])
def remote_store(request, tmp_path, monkeypatch):
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "must-not-exist" / "store.db"))
    if request.param == "emulator":
        monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
        config = Settings(
            environment="test", firestore_mode="emulator", firestore_project="demo-saathi"
        )
    else:
        monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
        config = Settings(
            environment="production", firestore_mode="cloud", firestore_project="saathi-store-test"
        )
    # Cloud behaviour is tested only with a fake; no ADC lookup or network access is possible.
    with patch("app.hub_store.firestore.Client") as constructor:
        monkeypatch.setattr("app.hub_store.firestore.transactional", lambda callback: callback)
        yield HubStore(config), constructor


@pytest.mark.parametrize("saved", [None, {}, {"legacy": {"values": [1]}}])
def test_firestore_clients_are_lazy_and_reads_are_pure(remote_store, saved):
    store, constructor = remote_store
    constructor.assert_not_called()
    assert not store.path.parent.exists()
    client = constructor.return_value
    snapshot = client.document.return_value.get.return_value
    snapshot.exists = saved is not None
    snapshot.to_dict.side_effect = lambda: deepcopy(saved)

    assert store.read_document(SESSION) == saved
    assert store.read("owner_1") == (initial_state() if saved is None else saved)
    assert client.document.call_args_list == [call(SESSION), call(ACCOUNT)]
    assert client.document.return_value.get.call_args_list == [
        call(timeout=5, retry=None),
        call(timeout=5, retry=None),
    ]
    client.document.return_value.set.assert_not_called()
    client.document.return_value.delete.assert_not_called()
    client.transaction.assert_not_called()
    assert client.close.call_count == 2
    assert constructor.call_args.kwargs["project"] == store.config.firestore_project
    if store.config.firestore_mode == "emulator":
        assert isinstance(constructor.call_args.kwargs["credentials"], AnonymousCredentials)
    else:
        assert "credentials" not in constructor.call_args.kwargs
    assert not store.path.parent.exists()


def test_firestore_atomic_reads_all_documents_before_writing_only_changes(remote_store):
    store, constructor = remote_store
    client = constructor.return_value
    transaction = client.transaction.return_value
    before = starting_documents()
    refs = {key: MagicMock() for key in before}
    client.document.side_effect = refs.__getitem__
    operations = []
    for key, state in before.items():
        snapshot = MagicMock(exists=state is not None)
        snapshot.to_dict.return_value = deepcopy(state)

        def get(*, snapshot=snapshot, **kwargs):
            operations.append("read")
            return snapshot

        refs[key].get.side_effect = get
    transaction.set.side_effect = lambda *args: operations.append("set")
    transaction.delete.side_effect = lambda *args: operations.append("delete")

    def update(documents):
        operations.append("callback")
        return update_documents(documents)

    result = store.atomic([*before, ACCOUNT], update)
    expected = deepcopy(before)
    assert result == update_documents(expected)
    assert operations == ["read"] * len(before) + ["callback", "set", "set", "set", "delete"]
    for ref in refs.values():
        ref.get.assert_called_once_with(transaction=transaction, timeout=5, retry=None)
    assert client.document.call_args_list == [call(key) for key in before]
    assert transaction.set.call_args_list == [
        call(refs[key], expected[key]) for key in (ACCOUNT, SESSION, PAIRING)
    ]
    transaction.delete.assert_called_once_with(refs[EVENT])
    client.transaction.assert_called_once_with(max_attempts=3)
    client.close.assert_called_once()
    assert not store.path.parent.exists()


@pytest.mark.parametrize("fail", [False, True])
def test_firestore_noop_or_callback_failure_never_queues_writes(remote_store, fail):
    store, constructor = remote_store
    client = constructor.return_value
    snapshot = client.document.return_value.get.return_value
    snapshot.exists = True
    snapshot.to_dict.return_value = {"nested": {"values": [1]}}

    def callback(documents):
        if fail:
            documents[ACCOUNT]["nested"]["values"].append(2)
            raise RuntimeError("abort callback")
        return documents[ACCOUNT]

    if fail:
        with pytest.raises(RuntimeError, match="abort callback"):
            store.atomic([ACCOUNT], callback)
    else:
        assert store.atomic([ACCOUNT], callback) == {"nested": {"values": [1]}}
    client.transaction.return_value.set.assert_not_called()
    client.transaction.return_value.delete.assert_not_called()
    client.close.assert_called_once()


@pytest.mark.parametrize("method", ["atomic", "change", "read_document", "read"])
def test_firestore_environment_changes_fail_closed_for_every_api(remote_store, monkeypatch, method):
    store, constructor = remote_store
    if store.config.firestore_mode == "emulator":
        monkeypatch.delenv("FIRESTORE_EMULATOR_HOST")
    else:
        monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    callback = MagicMock()
    args = {
        "atomic": ([ACCOUNT], callback),
        "change": ("owner_1", callback),
        "read_document": (ACCOUNT,),
        "read": ("owner_1",),
    }
    with pytest.raises(HTTPException) as error:
        getattr(store, method)(*args[method])
    assert error.value.status_code == 503
    assert error.value.detail == "Firestore environment changed. Restart Saathi."
    constructor.assert_not_called()
    callback.assert_not_called()
    assert not store.path.parent.exists()


def test_firestore_invalid_keys_are_rejected_before_client_creation(remote_store):
    store, constructor = remote_store
    with pytest.raises(ValueError, match="Document keys"):
        store.atomic([ACCOUNT, "phoneSessions/id/nested"], lambda documents: None)
    with pytest.raises(ValueError, match="Document keys"):
        store.read_document("phoneEvents/../outside")
    with pytest.raises(ValueError, match="Document keys"):
        store.change("owner/nested", lambda state: None)
    with pytest.raises(ValueError, match="Document keys"):
        store.read("owner/nested")
    constructor.assert_not_called()


@pytest.fixture
def emulator_store(tmp_path, monkeypatch):
    if os.environ.get("SAATHI_RUN_EMULATOR_TESTS") != "1":
        pytest.skip("Set SAATHI_RUN_EMULATOR_TESTS=1 with the emulator running")
    monkeypatch.setenv("SAATHI_LOCAL_DB", str(tmp_path / "must-not-exist" / "store.db"))
    # Invalid/missing loopback host fails settings validation; never fall back to cloud.
    return HubStore(
        Settings(environment="test", firestore_mode="emulator", firestore_project="demo-saathi")
    )


@pytest.mark.emulator
def test_emulator_cross_namespace_round_trip_and_rollback(emulator_store):
    store = emulator_store
    owner = uuid4().hex
    keys = [
        f"{namespace}/{owner}"
        for namespace in (
            "hubAccounts",
            "phoneSessions",
            "phonePairings",
            "phoneEvents",
            "phoneLimits",
        )
    ]
    account, _, pairing, event, _ = keys
    original = {key: {"nested": {"events": [key]}} for key in keys}
    try:
        assert {key: store.read_document(key) for key in keys} == dict.fromkeys(keys)
        assert store.read(owner) == initial_state()
        assert store.read_document(account) is None
        store.atomic(keys, lambda documents: documents.update(deepcopy(original)))
        assert {key: store.read_document(key) for key in keys} == original

        def update(documents):
            documents[account]["nested"]["events"].append("saved")
            documents[pairing] = None
            return documents[account]

        result = store.atomic(keys, update)
        expected = deepcopy(original)
        expected[account]["nested"]["events"].append("saved")
        expected[pairing] = None
        assert result == expected[account]
        assert {key: store.read_document(key) for key in keys} == expected

        def fail(documents):
            documents[account]["nested"]["events"].append("rollback")
            documents[event] = None
            raise RuntimeError("abort callback")

        with pytest.raises(RuntimeError, match="abort callback"):
            store.atomic(keys, fail)
        assert {key: store.read_document(key) for key in keys} == expected
    finally:
        store.atomic(keys, lambda documents: documents.update(dict.fromkeys(keys)))
    assert not store.path.parent.exists()


@pytest.mark.emulator
def test_emulator_pairing_is_single_use_across_concurrent_store_instances(emulator_store):
    exercise_single_use_race(emulator_store)
