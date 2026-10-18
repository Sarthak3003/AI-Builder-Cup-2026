"""Atomic document storage in SQLite or explicitly configured Firestore."""

import json
import os
import re
import sqlite3
from contextlib import closing
from copy import deepcopy
from pathlib import Path

from fastapi import HTTPException
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from app.config import Settings
from app.domain import SCHEMA
from app.onboarding import PROFILE_DEFAULTS, new_setup

_DOCUMENT_KEY = re.compile(r"[A-Za-z0-9_-]+/[A-Za-z0-9_-]+")


def initial_state():
    return {
        "schema": SCHEMA,
        **new_setup(),
        "profile": {
            **PROFILE_DEFAULTS,
            "name": "Friend",
            "language": "en-IN",
            "large_text": False,
            "high_contrast": False,
            "simple": False,
            "vegetarian": True,
            "mild": True,
            "budget": 200,
            "home": "",
            "caregiver_name": "",
            "approval_limit": 150,
            "caregiver_enabled": False,
            # Saved labels for reminders only; the demo pharmacy never orders them.
            "medicines": [],
        },
        "activity": [],
        "messages": [],
        "audit": [],
    }


def _document_location(key: str) -> tuple[str, str]:
    if not isinstance(key, str) or not _DOCUMENT_KEY.fullmatch(key):
        raise ValueError(
            "Document keys must be two slash-separated alphanumeric, _ or - components."
        )
    namespace, document_id = key.split("/")
    # Accounts keep their original IDs and table; other namespaces use the full key.
    return ("accounts", document_id) if namespace == "hubAccounts" else ("documents", key)


def _apply_callback(documents: dict[str, dict | None], callback):
    originals = deepcopy(documents)
    result = callback(documents)
    if documents.keys() != originals.keys():
        raise ValueError(
            "Atomic callbacks must keep the specified document keys; use None to delete."
        )
    if any(state is not None and not isinstance(state, dict) for state in documents.values()):
        raise ValueError("Document states must be dictionaries or None.")
    changes = {key: state for key, state in documents.items() if state != originals[key]}
    return deepcopy(result), changes


class HubStore:
    def __init__(self, config: Settings):
        self.config = config
        self.path = Path(os.environ.get("SAATHI_LOCAL_DB", ".local/saathi.db"))
        if config.firestore_mode == "disabled":
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(self.path)) as db, db:
                db.execute("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, state TEXT)")
                db.execute("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, state TEXT)")

    @property
    def mode(self):
        return {
            "emulator": "firestore-emulator",
            "cloud": "firestore-cloud",
            "disabled": "local-sqlite",
        }[self.config.firestore_mode]

    def _firestore_client(self):
        if self.config.firestore_mode not in {"emulator", "cloud"}:
            raise HTTPException(503, "This local prototype does not use cloud storage.")
        if os.environ.get("FIRESTORE_EMULATOR_HOST") != self.config.firestore_emulator_host:
            raise HTTPException(503, "Firestore environment changed. Restart Saathi.")
        kwargs = {"project": self.config.firestore_project}
        if self.config.firestore_mode == "emulator":
            kwargs["credentials"] = AnonymousCredentials()
        return firestore.Client(**kwargs)

    def atomic(self, keys: list[str], callback):
        """Read and mutate the specified documents in one transaction, returning a detached result.

        Missing documents are None. Mutate or replace values to save them, or assign None to
        delete them; only unequal values are written. The mapping's keys must stay unchanged.
        Firestore may retry the callback, so it must not perform external side effects.
        """
        locations = {key: _document_location(key) for key in keys}
        if self.config.firestore_mode != "disabled":
            client = self._firestore_client()
            try:
                refs = {key: client.document(key) for key in locations}

                @firestore.transactional
                def apply(transaction):
                    documents = {}
                    for key, ref in refs.items():
                        snapshot = ref.get(transaction=transaction, timeout=5, retry=None)
                        documents[key] = snapshot.to_dict() if snapshot.exists else None
                    result, changes = _apply_callback(documents, callback)
                    for key, state in changes.items():
                        if state is None:
                            transaction.delete(refs[key])
                        else:
                            transaction.set(refs[key], state)
                    return result

                return apply(client.transaction(max_attempts=3))
            finally:
                client.close()
        with closing(sqlite3.connect(self.path, timeout=10)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            documents = {}
            for key, (table, document_id) in locations.items():
                row = db.execute(f"SELECT state FROM {table} WHERE id=?", (document_id,)).fetchone()
                documents[key] = json.loads(row[0]) if row else None
            result, changes = _apply_callback(documents, callback)
            for key, state in changes.items():
                table, document_id = locations[key]
                if state is None:
                    db.execute(f"DELETE FROM {table} WHERE id=?", (document_id,))
                else:
                    db.execute(
                        f"INSERT OR REPLACE INTO {table} (id, state) VALUES (?, ?)",
                        (document_id, json.dumps(state)),
                    )
            return result

    def change(self, owner, callback):
        """Mutate an account, initialising only a missing account, through atomic()."""
        key = f"hubAccounts/{owner}"

        def apply(documents):
            if documents[key] is None:
                documents[key] = initial_state()
            return callback(documents[key])

        return self.atomic([key], apply)

    def read_document(self, key: str) -> dict | None:
        """Read a document without a write transaction or creating missing data."""
        table, document_id = _document_location(key)
        if self.config.firestore_mode != "disabled":
            client = self._firestore_client()
            try:
                snapshot = client.document(key).get(timeout=5, retry=None)
                return snapshot.to_dict() if snapshot.exists else None
            finally:
                client.close()
        with closing(
            sqlite3.connect(f"{self.path.resolve().as_uri()}?mode=ro", uri=True, timeout=10)
        ) as db:
            row = db.execute(f"SELECT state FROM {table} WHERE id=?", (document_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def read(self, owner) -> dict:
        """Read an account, returning unsaved initial state only when it does not exist."""
        state = self.read_document(f"hubAccounts/{owner}")
        return initial_state() if state is None else state

    def expired_phone_keys(self, before: float, limit: int = 100) -> list[str]:
        namespaces = ("phoneSessions", "phonePairings", "phoneEvents")
        if not 1 <= limit <= 500:
            raise ValueError("Cleanup batch limit must be between 1 and 500")
        keys = []
        if self.config.firestore_mode != "disabled":
            client = self._firestore_client()
            try:
                for namespace in namespaces:
                    query = (
                        client.collection(namespace)
                        .where(filter=FieldFilter("expires_delete_at", "<=", before))
                        .limit(limit - len(keys))
                    )
                    keys.extend(doc.reference.path for doc in query.stream(timeout=5, retry=None))
                    if len(keys) >= limit:
                        break
            finally:
                client.close()
        else:
            with closing(sqlite3.connect(self.path, timeout=10)) as db:
                for namespace in namespaces:
                    rows = db.execute(
                        "SELECT id FROM documents WHERE id LIKE ? "
                        "AND json_extract(state, '$.expires_delete_at') <= ? LIMIT ?",
                        (namespace + "/%", before, limit - len(keys)),
                    )
                    keys.extend(row[0] for row in rows)
                    if len(keys) >= limit:
                        break
        return keys
