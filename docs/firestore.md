# Firestore local development

The default is `SAATHI_FIRESTORE_MODE=disabled`. Starting the app performs no database access. `/health` remains liveness-only. `/ready` and `/api/ready` perform a bounded, read-only database probe and return 200 only on a successful read; disabled/unavailable databases return 503. A missing probe document is acceptable. No user data is returned.

## Emulator prerequisites

Project-local Temurin Java 21.0.12.1 and Firebase CLI 15.31.0 are installed under ignored `.tools/`. The existing system Java installation is untouched. The Java archive was SHA-256 verified against Adoptium metadata.

After tooling setup, from the repository root:

```powershell
.\scripts\firestore-local.ps1
```

In a second terminal:

```powershell
$env:SAATHI_FIRESTORE_MODE = 'emulator'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Use a free port or stop the existing API first. The `demo-` project does not refer to a real cloud project. Loopback hosts only are accepted by the local configuration. The SDK automatically uses the emulator endpoint and anonymous credentials. Never put an `http://` prefix on the emulator host.

The launcher scopes Java and emulator cache settings to the current command and restores them afterward. It does not authenticate to Firebase or deploy anything.

To run the actual local database integration test (starts and stops the emulator automatically):

```powershell
.\scripts\firestore-local.ps1 -Test
```

Or, if the emulator is already running:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
$env:SAATHI_RUN_EMULATOR_TESTS = '1'
.\.venv\Scripts\python.exe -m pytest backend/tests/test_firestore_emulator.py -q
```

This writes/reads/deletes a uniquely named test document only in the emulator. Without explicit opt-in it is skipped; after opt-in missing configuration fails. Unit tests mock the SDK, so passing them alone is not proof of a real database connection.

## Future cloud configuration (not enabled)

Set `SAATHI_ENVIRONMENT=development` or `production`, `SAATHI_FIRESTORE_MODE=cloud`, and `SAATHI_FIRESTORE_PROJECT` to the approved project ID. Unset `FIRESTORE_EMULATOR_HOST`. The SDK uses Application Default Credentials; on Cloud Run use its service account with the required IAM access, not a committed key. Cloud mode is rejected in local/test environments.

The server SDK uses IAM and bypasses Firestore client Security Rules. The existing deny-all rules protect client access; they are not authorization for future server endpoints. Implement per-user server authorization in Phase 2.

Source: https://firebase.google.com/docs/emulator-suite/connect_firestore
