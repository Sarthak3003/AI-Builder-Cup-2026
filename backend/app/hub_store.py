"""Atomic local state, with an opt-in Firestore emulator implementation."""

import json
import os
import sqlite3
from pathlib import Path

from fastapi import HTTPException
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.config import Settings
from app.onboarding import PROFILE_DEFAULTS, new_setup


def initial_state():
    return {
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
            "home": "Demo home",
            "caregiver_name": "",
            "approval_limit": 150,
            "caregiver_enabled": False,
            "medicines": ["Saved medicine A"],
        },
        "requests": [],
        "activity": [],
        "messages": [],
        "audit": [],
        "caregiver_version": 0,
        "invite": None,
    }


class HubStore:
    def __init__(self, config: Settings):
        self.config = config
        self.path = Path(os.environ.get("SAATHI_LOCAL_DB", ".local/saathi.db"))
        if config.firestore_mode == "disabled":
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(self.path) as db:
                db.execute("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, state TEXT)")

    @property
    def mode(self):
        return {
            "emulator": "firestore-emulator",
            "cloud": "firestore-cloud",
            "disabled": "local-sqlite",
        }[self.config.firestore_mode]

    def change(self, owner, callback):
        if self.config.firestore_mode in {"emulator", "cloud"}:
            if os.environ.get("FIRESTORE_EMULATOR_HOST") != self.config.firestore_emulator_host:
                raise HTTPException(503, "Firestore environment changed. Restart Saathi.")
            kwargs = {"project": self.config.firestore_project}
            if self.config.firestore_mode == "emulator":
                kwargs["credentials"] = AnonymousCredentials()
            client = firestore.Client(**kwargs)
            try:
                ref = client.document(f"hubAccounts/{owner}")

                @firestore.transactional
                def apply(transaction):
                    snapshot = ref.get(transaction=transaction, timeout=5, retry=None)
                    state = snapshot.to_dict() if snapshot.exists else initial_state()
                    result = callback(state)
                    transaction.set(ref, state)
                    return result

                return apply(client.transaction(max_attempts=3))
            finally:
                client.close()
        if self.config.firestore_mode != "disabled":
            raise HTTPException(503, "This local prototype does not use cloud storage.")
        with sqlite3.connect(self.path, timeout=10) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT state FROM accounts WHERE id=?", (owner,)).fetchone()
            state = json.loads(row[0]) if row else initial_state()
            result = callback(state)
            db.execute("INSERT OR REPLACE INTO accounts VALUES (?, ?)", (owner, json.dumps(state)))
            return result
