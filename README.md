# Saathi

An accessible everyday companion: call, message, or use the app with one shared identity and memory.

## Current state

**Phase 1 (Foundation, `v0.1.0`) is in progress and has not passed its gate.** React + TypeScript (Vite) frontend; Python 3.12 + FastAPI backend with `/health`, `/version` and a Firestore readiness probe (`/ready`). Nothing is deployed, and the GitLab pipeline has not run yet.

`develop` also carries an unreviewed prototype of later-phase features (commit `89919c2`): local demo sessions, simulated food, ride and medicine requests, caregiver approvals, browser voice and optional Gemini drafting. It runs only in `local` and `test` environments, is not part of Phase 1 acceptance, and each feature still needs its own phase test gate. Evidence, findings and remaining gates are in `docs/phase-1.md`.

This branch also turns the prototype into a mobile-first, installable web app (PWA) in Google's colours, and adds simulated provider apps: Uber, Ola and Rapido for rides, Uber Eats, Swiggy and Zomato for food. They are clearly labelled demos. Saathi is not connected to those companies, nothing is booked or charged, and a real connection would need each company's approval and the user's own sign-in. The point of the flow is that an older person asks Saathi, reviews the choice and confirms, instead of calling family to book for them.

## Run locally

Prerequisites: Node.js 24 (CI uses 24; Node 22 installs with engine warnings and passed the unit tests and build), npm, Python 3.12, and Docker for the container check. Run commands from the repository root unless stated otherwise.

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e backend
cd frontend
npm ci
```

On this workstation Python is available at:
`C:\Users\sarth\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.
Use that executable for the first command if Python is not on PATH. The existing `.venv` is already set up.

Backend, from the root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, in a second terminal:

```powershell
cd frontend
npm run dev
```

### macOS / Linux

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
(cd frontend && npm ci)
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # terminal 1
(cd frontend && npm run dev)                                            # terminal 2
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the backend on port 8000. The footer status confirms an actual backend response (`/api/health` and `/api/version`); it does not imply database or AI connectivity. Local API docs: http://127.0.0.1:8000/docs.

## See the features

With the backend and frontend running, open http://127.0.0.1:5173. The app is one phone-shaped column, so a narrow browser window looks like a phone, and on a wide screen it is centred.

1. **Home**: greeting, the "no need to call family" line, and three service cards. Each card names the demo apps it compares.
2. **Just ask**: press the large microphone and say what you need, for example "Take me to Dr Mehta's clinic" or "मुझे खाना चाहिए", or type it underneath. Saathi works out whether it is a ride, food or medicine and opens the matching options to review. If the request is unclear it asks back instead of guessing. Routing uses Gemini when `SAATHI_GEMINI_API_KEY` is set, otherwise simple English and Hindi word matching (not AI). Voice needs a browser with speech recognition, such as Chrome, Edge or Safari, which may send the audio to its own servers.
3. **Book a ride**: type a destination (or press Use microphone), then Show options. Rapido, Ola and Uber each quote a fare and arrival time, marked Demo.
4. **Choose, review, book**: pick an option, read the review, then press Book with the chosen app. Nothing is booked before that button. The result shows a simulated reference.
5. **Order food**: the same flow for Uber Eats, Swiggy and Zomato, following the diet, spice and budget saved in Profile.
6. **Apps**: turn each demo app on or off. Switch Uber off and the next ride comparison leaves it out.
7. **Activity**: every booking with its app, reference and status; cancel from here.
8. **Family**: turn on caregiver approvals in Profile, create an invitation, then join from a private window. Requests above your limit, and every medicine request, wait for the caregiver.
9. **Profile**: larger text, high contrast, Hindi voice language and preferences. The **About this demo** link in the footer lists what is real and what is simulated.

### Install it as an app

The service worker is deliberately off in dev mode, so installing needs a production build:

```sh
(cd frontend && npm run build && npm run preview)   # http://127.0.0.1:4173, backend still on 8000
```

Open http://127.0.0.1:4173 in Chrome or Edge and use the install icon in the address bar (Android Chrome: menu, Install app; iPhone Safari: Share, Add to Home Screen). On Android and Windows, long-pressing the installed icon offers Ride, Food and Medicine shortcuts. After one visit the app still opens with no network and shows an offline notice; API responses are never cached.

Installing, the service worker and offline use need HTTPS or `localhost`, so they do not work from a phone over plain Wi-Fi. The Firebase Hosting deployment (`docs/deployment.md`) will provide HTTPS.

### Look at it on a phone over Wi-Fi (view only)

```sh
ipconfig getifaddr en0   # this Mac's address on Wi-Fi, for example 198.51.100.20
SAATHI_ALLOWED_ORIGINS=http://198.51.100.20:5173 .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
(cd frontend && npm run dev -- --host 0.0.0.0)
```

Then open `http://198.51.100.20:5173` on the phone. Without `SAATHI_ALLOWED_ORIGINS` the backend refuses the phone's requests as cross-site. `--host 0.0.0.0` lets anyone on that network reach the demo, which holds no real data, so use a network you trust and stop the server afterwards. Voice input and install are unavailable over plain http.

## Checks

```powershell
cd frontend
npm run lint
npm test
npm run build
```

From `backend`:

```powershell
..\.venv\Scripts\python.exe -m ruff check .
..\.venv\Scripts\python.exe -m ruff format --check .
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m build
```

On macOS and Linux, run the same commands with `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`.

`npm run preview` serves the production build, and Vite applies the same `/api` proxy to port 8000, so the backend must be running. It does not replicate Firebase Hosting; the Hosting rewrite to Cloud Run is only checked by the smoke test after deployment.

### Smoke tests

With the backend (port 8000) and frontend (port 5173) running:

```sh
node scripts/smoke.mjs --api-only   # API contract and readiness, no browser
node scripts/smoke.mjs              # also loads the page and checks the footer status
```

For a deployed site, require a ready Firestore and pin the expected values:

```sh
BASE_URL=https://PROJECT_ID.web.app EXPECT_VERSION=0.1.0 EXPECT_ENVIRONMENT=production node scripts/smoke.mjs --require-ready
```

The browser step uses Playwright (installed by `npm ci` in `frontend/`) and `SAATHI_BROWSER_CHANNEL` (default `chrome`; `msedge` and `chromium` also work). If a managed browser blocks DevTools the script says so; then run `(cd frontend && npx playwright install chromium)` and set `SAATHI_BROWSER_CHANNEL=chromium`, or use `--api-only`. `/api/ready` is 503 until Firestore is configured and is only enforced by `--require-ready`.

### Container check

```sh
docker build --tag saathi-api:local backend
sh scripts/container-smoke.sh saathi-api:local
```

This starts the image in the `production` environment on an injected `PORT`, then checks the user, health, version and readiness responses and that local-only routes are absent. CI runs the same script.

## Layout

- `frontend/`: React app, mobile first. `src/screens/` holds Home, the request flow, Activity, Apps, Family, Profile and About; `src/components/` the bottom navigation, option cards and banners; `src/theme.css` the Google palette (contrast is enforced by `src/theme.test.ts`); `public/` the manifest, icons and service worker.
- `backend/`: configuration, health/version/readiness API, local-only prototype routes (`app/hub.py`, `app/demo.py`), the simulated provider apps (`app/providers.py`), tests, Dockerfile, pinned dependency snapshots.
- `infrastructure/`: deny-all Firestore rules until Phase 2 authentication.
- `firebase.json`: static Hosting plus `/api/**` forwarding to Cloud Run.
- `.gitlab-ci.yml`: lint, tests, package builds, container build and run check; no automatic deployment.
- `scripts/`: `smoke.mjs` (API and browser smoke test), `container-smoke.sh` (container check), `make-icons.sh` (regenerates the app icons on macOS), `firestore-local.ps1` (Windows emulator launcher), `e2e-local.cjs` (prototype end-to-end run on a phone-sized screen).
- `docs/phase-1.md`: acceptance status, evidence and remaining work.
- `docs/deployment.md`: proposed deployment steps for a separately approved cloud task.
- `docs/firestore.md`, `docs/local-demo.md`: Firestore emulator setup and the local prototype.

## Configuration

`SAATHI_ENVIRONMENT`: local (default), test, development, production.
`SAATHI_VERSION`: 0.1.0 by default.
`PORT`: Cloud Run container port, default 8080 in Docker.
Firestore variables (`SAATHI_FIRESTORE_MODE`, `SAATHI_FIRESTORE_PROJECT`, `FIRESTORE_EMULATOR_HOST`) are described in `docs/firestore.md`.
Prototype-only variables, not part of Phase 1 acceptance: `SAATHI_GEMINI_API_KEY`, `SAATHI_GEMINI_MODEL`, `SAATHI_FIREBASE_PROJECT`, `SAATHI_SESSION_SECRET` (32+ characters; required when the prototype routes run outside `local` and `test`), `SAATHI_ALLOWED_ORIGINS`, `SAATHI_LOCAL_DB`.

Do not commit credentials or service-account keys. No credentials are required for local Phase 1. Firebase Hosting and the API share an origin; permissive CORS is unnecessary.

## Budget and approvals

Target: zero out-of-pocket prototype development. Cloud deployment requires checking account eligibility and billing first; no free-forever guarantee. Each new task requires the owner's approval. No cloud resources or paid services have been created by this local setup. Cloud Run needs a linked Cloud Billing account, and linking one upgrades a Firebase Spark project to the Blaze plan (Firebase documentation, checked 2026-10-11); `docs/deployment.md` lists the approvals needed.

## Firestore readiness

See `docs/firestore.md` for the local emulator setup and explicit cloud opt-in. Database mode defaults to disabled; `/ready` returns 503 until a real Firestore probe succeeds. `/health` remains API liveness-only. Cloud Firestore has not been connected or deployed.
