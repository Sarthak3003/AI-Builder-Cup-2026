# Saathi

An accessible everyday companion: call, message, or use the app with one shared identity and memory.

## Current state

Phase 1 local foundation. React + TypeScript (Vite) frontend; Python 3.12 + FastAPI backend. No AI, login, transactions, Firestore connection, or cloud deployment is active yet. Future features are labelled in the UI.

## Run locally

Prerequisites: Node.js 24, npm, Python 3.12. Run commands from the repository root unless stated otherwise.

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

Open http://127.0.0.1:5173. Vite proxies `/api` to the backend on port 8000. The foundation panel confirms an actual backend response; it does not imply database or AI connectivity. Local API docs: http://127.0.0.1:8000/docs.

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

`npm run preview` serves only the static build, without the development API proxy. Use the dev server for the local integrated flow, or Firebase Hosting after deployment.

## Layout

- `frontend/`: accessible home and sign-in placeholder, connection status, frontend tests.
- `backend/`: configuration, health/version API, tests, Dockerfile, pinned dependency snapshots.
- `infrastructure/`: deny-all Firestore rules until Phase 2 authentication.
- `firebase.json`: static Hosting plus `/api/**` forwarding to Cloud Run.
- `.gitlab-ci.yml`: lint, tests, package builds, Docker build; no automatic deployment.
- `docs/phase-1.md`: acceptance status and remaining work.
- `docs/deployment.md`: proposed deployment steps for a separately approved cloud task.

## Configuration

`SAATHI_ENVIRONMENT`: local (default), test, development, production.
`SAATHI_VERSION`: 0.1.0 by default.
`PORT`: Cloud Run container port, default 8080 in Docker.

Do not commit credentials or service-account keys. No credentials are required for local Phase 1. Firebase Hosting and the API share an origin; permissive CORS is unnecessary.

## Budget and approvals

Target: zero out-of-pocket prototype development. Cloud deployment requires checking account eligibility and billing first; no free-forever guarantee. Each new task requires the owner's approval. No cloud resources, paid services, GitLab project, or remote changes have been created by this local setup.

## Firestore readiness

See `docs/firestore.md` for the local emulator setup and explicit cloud opt-in. Database mode defaults to disabled; `/ready` returns 503 until a real Firestore probe succeeds. `/health` remains API liveness-only. Cloud Firestore has not been connected or deployed.
