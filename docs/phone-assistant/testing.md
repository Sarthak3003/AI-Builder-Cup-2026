# Phone assistant verification

## Local checks

From the repository root:

```sh
cd backend
../.venv/bin/python -m ruff check .
../.venv/bin/python -m ruff format --check .
../.venv/bin/python -m pytest -q
../.venv/bin/python -m build
cd ../frontend
npm run lint
npm test
npm run build
```

Use the Windows virtual-environment executable on Windows. Tests require no Twilio account, paid number or Gemini key. They use the official SDK to sign form callbacks, TestClient HTTP, real local transactions and simulated service providers. Gemini replies are controlled fakes. This is automated integration testing, not a product simulator.

Coverage includes multi-turn conversations, pairing races, isolation, signature URL/body validation, wrong accounts, speech/DTMF, silence, callback ordering/replay, call limits, hang-up, provider errors, explicit confirmation, corrections, caretaker approvals, transcript privacy, read-only polling and retention cleanup.

## Current evidence

- Backend: **386 passed**, **5 skipped**; existing Starlette/httpx deprecation warning.
- Frontend: **164 passed**; lint, TypeScript and production build passed.
- Python lint/format and package build passed.
- Browser: disabled Call Saathi card checked at 320/390 px without overflow or simulator controls. Enabled pairing/history behaviour is covered in frontend tests.
- Five tests need a running Firestore emulator and were skipped. Transaction fakes do not substitute for the emulator integration gate.
- **Not run:** real inbound call, real Twilio STT/TTS, live Gemini, cloud deployment or this feature branch's remote GitLab pipeline. This task has not pushed the branch.

GitLab's existing backend job discovers all phone/security tests through `pytest`; JUnit output makes failures visible in merge requests. Frontend checks discover the phone tests too.

## Firestore gate

Follow the existing [Firestore guide](../firestore.md) to start the emulator with a loopback address, then run:

```sh
cd backend
../.venv/bin/python -m pytest -q -m emulator
```

Never point tests at a real project or weaken rules. Browser access remains deny-all; the backend uses its configured server identity.

## Live smoke test — external setup required

After [Twilio setup](telephony-setup.md) with approved credentials/number:

1. Ride: pair → cab → Home → Doctor → exact fare → confirm → reference → exactly one booking and phone summary in Activity.
2. Food: pair → dinner → preferences → numbered choice → total → confirm → exactly one food order.
3. Failure: arm fail-next → call and confirm → hear failure; Activity shows no successful booking/payment.
4. Approval: request above the owner's limit → confirm → approval pending, not bypassed.
5. Privacy: try guest, wrong/expired/reused pairing codes and app revocation, using fictional details only.

Record the real date, region, speech model/voice, latency and result only after a live test. Until then, never label real calling as verified.