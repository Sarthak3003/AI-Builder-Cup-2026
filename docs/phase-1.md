# Phase 1 acceptance tracker

Phase 1 (Foundation, `v0.1.0`) has **not** passed its gate. The gate in `context.md` is "deployed app and API communicate reliably"; nothing is deployed and the GitLab pipeline has not run.

## Gate status (updated 2026-10-11)

| Requirement | Status | Evidence or blocker |
| --- | --- | --- |
| Repository skeleton, React frontend, FastAPI backend, `/health` | Done | Unit tests below |
| Frontend and backend unit tests | Pass locally | Backend 43 passed, 3 skipped; frontend 12 passed |
| Firestore connection | Local emulator only | Emulator test passed on Windows on 2026-09-26; not re-run on macOS (Java 21 not installed). Cloud Firestore is not connected |
| Basic GitLab CI | Written, never run | `.gitlab-ci.yml` parses as YAML; no pipeline has executed |
| Backend container | Runs locally | `scripts/container-smoke.sh`; the unmodified `pip install` line is exercised only by CI (see limitations) |
| Browser-to-API smoke test | Script ready; browser step not yet run | API steps pass locally; the browser step has not run in any real browser |
| Firebase Hosting and Cloud Run deployment | Not started | Needs owner approval, billing and a project (`docs/deployment.md`) |
| Deployed health check | Blocked on deployment | `node scripts/smoke.mjs --require-ready` against the Hosting URL |
| CI green | Not verified | Needs the branches pushed and a Docker-in-Docker runner |
| **Gate: deployed app and API communicate reliably** | **Not passed** | |

## Findings that affect the gate

1. **`develop` contains later-phase prototype code.** Commit `89919c2` ("dev-feature v0.0.2", 35 files) added local demo sessions, simulated food, ride and medicine requests, caregiver approvals, browser voice and optional Gemini drafting. It arrived without an issue or merge request and has no phase test gate, so it does not count towards Phase 1 and must not be presented as Phase 2-7 progress until those gates pass. It also removed the Phase 1 backend-status panel; the footer `ConnectionStatus` component restores it. **Decision needed before tagging `v0.1.0`:** either release from the Phase 1 line (`a6f1a80` plus the Phase 1 branches, through a `release/v0.1.0` branch) and let `89919c2` re-enter through its own phases, or release from `develop` with the prototype included.
2. **Cloud Firestore mode also mounts the prototype `/api/hub/*` routes** (`backend/app/main.py`). They need `SAATHI_SESSION_SECRET` (32+ characters) or the service refuses to start, and behind `--allow-unauthenticated` they would be publicly reachable. Gate them behind an explicit setting, or deploy the Phase 1 line, before enabling cloud Firestore.
3. **In production with Firestore disabled the prototype UI cannot start a session** (`/api/hub/session` returns 404), so the page shows an error banner beside a working footer status. This is expected until Phase 2 adds sign-in.
4. The earlier README claim that `npm run preview` has no API proxy was wrong: Vite applies `server.proxy` to preview as well.
5. **The mobile PWA and demo provider apps (branch `feature/mobile-pwa-providers`, 2026-10-12) are prototype work beyond Phase 1.** They rework the UI into an installable, phone-first app in Google's colours and add simulated ride and food apps (Phase 4-style mock providers). They were built on request, are labelled as demos in the product, and do not count towards any phase gate until that phase's own tests pass. Verified: backend 62 passed and 3 skipped, frontend 97 passed, lint and type-check clean, production build checked in a real browser (service worker active, shell cached, no API response cached, shell opens with the server stopped). Not verified: an actual install prompt on a phone, the Playwright end-to-end script (`scripts/e2e-local.cjs`, updated but not run here), and any live Uber, Ola, Rapido, Uber Eats, Swiggy or Zomato account, none of which is connected.

## Re-verification on 2026-10-11

Machine: macOS arm64, Python 3.12.13, Node 22.21.1 (CI uses 24), Docker 27.4.0. Code under test: `develop` at `89919c2` plus the Phase 1 branches.

| Check | Result |
| --- | --- |
| Backend `ruff check .` and `ruff format --check .` | Pass |
| Backend `pytest -q` | 43 passed, 3 skipped (the real Firestore emulator tests) |
| Backend `python -m build` | sdist and wheel built |
| Frontend `npm run lint` | No errors; one existing warning (`Date.now` during render in `App.tsx`) |
| Frontend `npm test` | 12 passed (the Phase 1 line at `a6f1a80` on its own: 4 passed, lint and build clean) |
| Frontend `npm run build` | Pass, type-checked |
| `npm audit` | 0 vulnerabilities |
| `scripts/smoke.mjs --api-only` against the local stack | Pass; `/api/ready` is 503 with Firestore disabled, as designed |
| Smoke negative cases | `--require-ready` fails with Firestore disabled; wrong `EXPECT_*` values fail; HTML served for `/api` (a misrouted rewrite) fails |
| `scripts/container-smoke.sh` | 8 of 8 checks pass: non-root, `PORT` honoured, health and version contracts, 503 readiness, no `/api/demo` or `/api/hub` routes; a deliberately wrong expectation fails with exit 1 |

### Limitations of this verification

- The browser step of `scripts/smoke.mjs` was not executed in a real browser. The installed Chrome and Edge refuse DevTools control on this machine and the Playwright image could not be pulled. The footer status is covered by jsdom unit tests only.
- The container was built from the real Dockerfile with a single change: wheels downloaded on the host replaced `pip install`, because the build could not reach PyPI through this machine's TLS-inspecting proxy. CI is the first place the unmodified Dockerfile builds.
- The GitLab pipeline, Firebase Hosting, Cloud Run and Cloud Firestore were not touched.
- The emulator integration tests were not re-run: `scripts/firestore-local.ps1` is Windows-only and there is no macOS or Linux launcher yet.

## Remaining gates before Phase 1 is complete

1. Decide the release line for `v0.1.0` (finding 1) and whether to gate `/api/hub/*` (finding 2).
2. Create the GitLab milestone and issues, push the Phase 1 branches and open merge requests into `develop`; get a green pipeline (the container job needs a Docker-in-Docker runner).
3. Approve cloud setup only after checking billing: Cloud Run needs a linked Cloud Billing account, which upgrades a Firebase Spark project to Blaze.
4. Create or select the Firebase/GCP project and Firestore database. Grant the Cloud Run service account `roles/datastore.viewer` (enough for the read-only probe) or `roles/datastore.user` if routes that write are enabled.
5. Deploy the backend to Cloud Run and the static frontend to Firebase Hosting (`docs/deployment.md`).
6. Run `BASE_URL=<hosting URL> EXPECT_ENVIRONMENT=production node scripts/smoke.mjs --require-ready` from a machine where the browser step can run, and record the URL and output here.
7. Run the emulator integration tests on macOS, Linux or in CI, so the Firestore connection is not evidenced by a single Windows run.
8. Tag `v0.1.0` from `main` only after items 1 to 7.

Authentication belongs to Phase 2; do not start it before the gate passes. Firestore rules currently deny all client access. No mocked database connection is presented as a real connection.

## Task 2: local foundation

_Historical record from the original setup (2026-09-26); the current status is above._

- React/TypeScript frontend and accessible placeholder screens.
- Live backend status with bounded timeout, invalid-response rejection, and retry.
- FastAPI `/health`, `/version`, and matching `/api` routes.
- Environment validation, tests, dependency snapshots, and container definition.
- GitLab CI configuration and Firebase Hosting configuration.

Verification results are recorded below after local checks finish.

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
