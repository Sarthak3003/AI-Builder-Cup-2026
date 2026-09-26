"""Read-only Firestore readiness probe, with explicit opt-in for cloud access."""

import logging
import os
from typing import Literal

from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.config import Settings

logger = logging.getLogger(__name__)
DatabaseStatus = Literal["disabled", "ready", "unavailable"]


class FirestoreConnection:
    def __init__(self, settings: Settings):
        self.settings = settings

    def probe(self) -> DatabaseStatus:
        config = self.settings
        if config.firestore_mode == "disabled":
            return "disabled"
        client = None
        try:
            # The SDK reads this variable at construction. Fail closed if it changed
            # since settings validation, rather than silently reaching another target.
            if os.environ.get("FIRESTORE_EMULATOR_HOST") != config.firestore_emulator_host:
                raise ValueError("Firestore environment changed since validation")
            kwargs = {"project": config.firestore_project}
            if config.firestore_mode == "emulator":
                kwargs["credentials"] = AnonymousCredentials()
            client = firestore.Client(**kwargs)
            # A missing document still proves a successful database read. No writes.
            client.document("_system/connectivity").get(
                retry=None, timeout=config.firestore_timeout
            )
            return "ready"
        except Exception:
            # Keep credentials, project paths, and SDK error details out of HTTP responses.
            logger.warning("Firestore readiness probe failed")
            return "unavailable"
        finally:
            if client is not None:
                client.close()
