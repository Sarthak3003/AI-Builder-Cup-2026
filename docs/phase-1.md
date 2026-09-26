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
