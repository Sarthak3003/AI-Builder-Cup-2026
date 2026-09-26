# Phase 1 acceptance tracker

## Task 2: local foundation

- React/TypeScript frontend and accessible placeholder screens.
- Live backend status with bounded timeout, invalid-response rejection, and retry.
- FastAPI `/health`, `/version`, and matching `/api` routes.
- Environment validation, tests, dependency snapshots, and container definition.
- GitLab CI configuration and Firebase Hosting configuration.

Verification results are recorded below after local checks finish.

## Remaining gates before Phase 1 is complete

1. Approve Git initialization and connect the intended GitLab repository.
2. Run the GitLab pipeline; select a suitable runner for the Docker-in-Docker job.
3. Approve cloud setup only after checking available credits and billing exposure.
4. Create/select Firebase/GCP project, configure Firestore, and implement/test the connection abstraction against an emulator or approved project.
5. Deploy the backend to Cloud Run and static frontend to Firebase Hosting.
6. Verify the production browser -> Hosting -> Cloud Run request and Firestore connectivity.
7. Record real deployment URLs and passing evidence before a v0.1.0-foundation release.

Authentication implementation belongs to Phase 2. Firestore rules currently deny all client access. No mocked database connection is presented as a real connection.

## Local verification completed

- Frontend lint: passed.
- Frontend tests: 4 passed (connection, failure/retry, unexpected payload, sign-in placeholder).
- TypeScript compilation and Vite production build: passed.
- Backend lint and formatting: passed.
- Backend tests: 7 passed (health/version contracts, environment loading/validation, unknown route).
- Python source distribution and wheel build: passed.
- Browser integration at http://127.0.0.1:5173: displayed `Backend connected · v0.1.0` through the Vite proxy to the running FastAPI server.
- Browser console: no errors or warnings observed.
- Frontend dependency audit on installation: zero reported vulnerabilities.

Limitations: Docker is unavailable locally, so the container build is not yet executed. GitLab CI is written but has not run remotely. Firebase/Cloud Run configurations have not been deployed. Firestore is not connected. Backend tests emit an upstream Starlette deprecation notice for the currently supported httpx test client; tests still pass.

## Firestore adapter task

Implemented explicit disabled/emulator/cloud configuration, a bounded read-only SDK probe, and `/ready` + `/api/ready`. Database access defaults to disabled. Local/test environments reject cloud mode. Emulator mode requires a loopback host and demo project.

Verification: 21 backend tests passed; 1 real emulator integration test skipped because Java 21/Firebase CLI are not installed. Ruff lint/format and pip dependency consistency checks passed. The emulator integration test is prepared but has NOT been executed. No cloud resources were accessed or created. These changes are local and have not been committed or pushed.

The local tooling/emulator follow-up has now completed; see the verification below. Committing/pushing still requires separate approval.


## Local emulator verification completed

- Project-local Temurin Java 21.0.12.1 installed; SHA-256 verified against Adoptium metadata.
- Project-local Firebase CLI 15.31.0 and Firestore emulator 1.22.0 installed under ignored `.tools/`.
- `scripts/firestore-local.ps1 -Test`: passed, exit code 0.
- Real emulator test wrote, read, and deleted an isolated test document in `demo-saathi`.
- Firestore adapter probe returned ready and FastAPI `/api/ready` returned HTTP 200 with Firestore ready.
- Emulator stopped automatically after the test. System Java and persistent environment settings unchanged.
- No production project, credentials, cloud database, deployment, or remote push was used.

The real local database integration gate now passes. Cloud IAM/Firestore connectivity and production deployment remain unverified. The upstream Starlette/httpx deprecation warning remains non-failing.
