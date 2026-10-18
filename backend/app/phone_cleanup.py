"""Explicit, bounded retention maintenance; never provisions or schedules infrastructure."""

import argparse
import json
import time

from app.config import Settings
from app.hub_store import HubStore


def cleanup(store: HubStore, *, apply=False, limit=100, now=None):
    now = time.time() if now is None else now
    keys = store.expired_phone_keys(now, limit)
    removed = 0
    if apply:
        for key in keys:
            saved = store.read_document(key)
            account_key = (
                f"hubAccounts/{saved['owner']}"
                if saved and key.startswith("phoneSessions/") and saved.get("owner")
                else None
            )

            def purge(documents, key=key, account_key=account_key):
                document = documents[key]
                if not document or document.get("expires_delete_at", now + 1) > now:
                    return False
                account = documents[account_key] if account_key else None
                if account:
                    for conversation in account.get("conversations", []):
                        if conversation["id"] == document["id"]:
                            conversation.update(transcript=[], transcript_retained=False)
                    account["phone_sessions"] = [
                        sid for sid in account.get("phone_sessions", []) if sid != document["id"]
                    ]
                documents[key] = None
                return True

            removed += store.atomic([key] + ([account_key] if account_key else []), purge)
    return {"eligible": len(keys), "deleted": removed, "dry_run": not apply}


def main():
    parser = argparse.ArgumentParser(description="Remove expired phone data; dry-run by default")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    print(json.dumps(cleanup(HubStore(Settings()), apply=args.apply, limit=args.limit)))


if __name__ == "__main__":
    main()
