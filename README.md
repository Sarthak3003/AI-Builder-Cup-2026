# Saathi

An accessible everyday companion: call, message, or use the app with one shared identity and memory.

## Current state

**Phase 1 (Foundation, `v0.1.0`) is in progress and has not passed its gate.** React + TypeScript (Vite) frontend; Python 3.12 + FastAPI backend with `/health`, `/version` and a Firestore readiness probe (`/ready`). Nothing is deployed; the current commit's remote pipeline status has not been checked.

`develop` also carries later-phase prototype features: local demo sessions, simulated food, ride and medicine requests, caregiver approvals, a simplified view, browser voice and optional Gemini text/audio understanding. Anonymous demo sessions run locally and in cloud mode without Google login. Cloud mode still requires a signing secret; visitor data is isolated by browser session for up to 24 hours. Each feature still needs its own phase acceptance gate. Historical evidence and remaining gates are in `docs/phase-1.md`.

## Firebase / Google Cloud setup

The selected deployment uses Firebase Hosting, Firestore, Cloud Run in Mumbai (`asia-south1`) and a server-only Gemini key in Secret Manager. Visitors enter automatically with isolated, signed 24-hour demo sessions; no Google login or Firebase Authentication setup is required. Start with [the deployment guide](docs/deployment.md). `scripts/deploy-google.ps1` requires an explicit new `-ProjectId` and `-GeminiModel`; it generates a local plan unless `-Apply` is supplied. The old deployment passed health checks and owner-confirmed sign-in/Gemini tests before project shutdown was requested. This anonymous-session version has been tested locally, not deployed. Cost review precedes new billable work.

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
   - **Simplified view**: the "Enable simplified view" switch near the top strips the app down to the essentials: a bigger microphone, three large Ride / Food / Medicine tiles, and only Home and Activity in the bottom bar. Requests become one field, short choices, "Book this?" and Done, with the "Demo" labels kept. "Show full view" switches back. The choice is saved in the profile.
2. **Just ask**: press the large microphone and say what you need, for example "Take me to Dr Mehta's clinic" or "मुझे खाना चाहिए", or type it underneath. Saathi works out whether it is a ride, food or medicine and opens the matching options to review. If the request is unclear it asks back instead of guessing.
   - **With Gemini** (`SAATHI_GEMINI_API_KEY` set, see below): the microphone records up to 15 seconds, stopping by itself after a short pause, and sends the clip as WAV to Gemini, which writes down what was said and routes it. This works in any browser that can record, and handles Hindi and mixed speech. The screen says that the recording goes to Google. Typed requests also go to Gemini, falling back to word matching if Gemini fails.
   - **Without Gemini**: the browser's own speech recognition (Chrome, Edge or Safari, which may send audio to their own servers) plus simple English and Hindi word matching (not AI).

   To turn Gemini on, create a key in Google AI Studio, then in the terminal that starts the backend run `read -s SAATHI_GEMINI_API_KEY && export SAATHI_GEMINI_API_KEY` (type or paste the key; it is not shown or saved in shell history) and restart the backend. `SAATHI_GEMINI_MODEL` overrides the default model, `gemini-3.8-flash`. Never commit the key.
3. **Book a ride**: type a destination (or press Use microphone), then Show options. Rapido, Ola and Uber each quote a fare and arrival time, marked Demo.
4. **Choose, review, book**: pick an option, read the review, then press Book with the chosen app. Nothing is booked before that button. The result shows a simulated reference.
5. **Order food**: the same flow for Uber Eats, Swiggy and Zomato, following the diet, spice and budget saved in Profile.
6. **Apps**: turn each demo app on or off. Switch Uber off and the next ride comparison leaves it out.
7. **Activity**: upcoming appointments and reminders, then every booking with its app, booking status and, separately, its simulated payment status. Filter by type, status and date; open a booking for its details and timeline.
8. **Family (Care Circle)**: invite trusted people with a role and explicit permissions, choose what is shared, manage trusted contacts and ask for help. See [Care Circle Dashboard](#care-circle-dashboard).
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

## Care Circle Dashboard

The older adult stays in control. Trusted people ("caretakers") join a Care Circle by invitation and see only what the older adult chose to share. Every permission is checked by the backend inside the same transaction as the change, so hiding a button is never the only protection, and removing someone takes effect on their very next request. All providers, bookings and payments are simulated: nothing is dispatched, ordered or charged.

### Roles and permissions

| Role | Includes |
| --- | --- |
| Viewer | See shared rides, orders and appointments |
| Assistant | Viewer, plus add and change reminders and appointments, and fix the saved address |
| Approver | Viewer, plus approve, decline or ask about requests the older adult sends for approval |
| Administrator | Viewer, plus invite and remove viewers and assistants (never approvers, admins or sensitive permissions) |

The older adult can add, per person: conversation summaries, safety alerts and, marked as sensitive, medicine details, full transcripts, simulated payment status and emergency-contact changes. Sharing can also be switched off per service (rides, food, medicine, appointments) or per booking.

### What each side sees

- **Older adult** (owner): Family tab → Care Circle (people, invitations, access, sharing, approval rule, trusted contacts, alerts, "Ask my Care Circle for help"); Activity → upcoming plans, filters, booking details with a timeline and a sharing switch.
- **Caretaker**: a separate dashboard with Overview (needs your attention, upcoming, active rides and orders, new updates), Activity, Approvals, Chats (summaries; transcripts only with permission), Safety (suspected and confirmed events kept apart, trusted contacts) and Care Circle & settings (what they can and cannot do). It refreshes every 8 seconds and when the tab is reopened.

Booking status (waiting for approval, booked, completed, failed, cancelled, declined) and simulated payment status (not charged, pay on completion, paid) are separate fields everywhere.

### Seed or reset the demo data

Demo controls are on automatically when `SAATHI_ENVIRONMENT` is `local` or `test`. Anywhere else they are off unless `SAATHI_DEMO_CONTROLS=1` is set, and the API answers 404.

- **Seed**: Profile → Demo controls → **Load Meera's demo** → confirm. This replaces this browser's demo data with Meera: a check-up with Dr Mehta tomorrow at 10:30 (India time), an eye check-up, reminders (one missed, one done), a medicine reorder waiting for approval, a completed meal, a suspected scam message, trusted contacts, and two pending invitations: **Asha** (Approver, plus summaries, alerts, medicine details and reminders) and **Ravi** (Viewer). The two invitation links are shown on screen. API: `POST /api/hub/demo/seed` with an owner session.
- **Force a failure**: Profile → Demo controls → **Make the next booking fail**.
- **Mark a booking completed**: open a booked item in Activity → **Demo: mark completed**. This sets the payment to paid (simulated).
- **Reset**: About → **Reset demo data** clears this browser's demo, including everyone's Care Circle access.

All seeded addresses, phone numbers and medicines are labelled as samples.

### Run the full hackathon demo

Start the backend and frontend (see [Run locally](#run-locally)). Cookies are per site name, so use **http://127.0.0.1:5173** for Meera and open the caretaker links on **http://localhost:5173** or in a private window. Both names reach the same servers.

1. **Meera**: open http://127.0.0.1:5173/#/profile → Load Meera's demo → copy Asha's and Ravi's links.
2. **Asha**: open Asha's link (with `127.0.0.1` replaced by `localhost`, or in a private window) → Join as caretaker. The Overview shows a medicine request waiting for approval, a suspected scam alert, a missed reminder and tomorrow's check-up.
3. **Ravi**: open his link in another private window → Join. He sees shared activity only: no medicine names, payments, conversations, alerts or approval buttons.
4. **Care coordination**: as Meera, type or say "Please take me to my doctor's appointment". Saathi uses the saved appointment for the destination. Choose **Ola Mini (₹165)** → **Book with Ola**. It is above Meera's ₹150 limit, so it shows **Sent for approval**, payment **Not charged (simulated)**.
5. **Delegated approval**: as Asha, Approvals → see why approval is needed → **Approve**. Within seconds Meera's Activity shows **Booked · simulated** and **Pay on completion (simulated) · nothing charged yet**. The details show "Approved by Asha", the appointment, the timeline, and a summary that separates **Confirmed** from **Suggestions (not done)**.
6. **Permissions hold on the server**: Ravi's Approvals tab says he has no access. Calling the approval API directly as Ravi returns 403 (the end-to-end script checks this).
7. **Failure path**: as Meera, Make the next booking fail → book any ride. It shows **Booking failed**, nothing booked or charged, with Try again. Asha gets a confirmed alert in Safety, and Ravi's Activity shows it as failed, not completed.
8. **Revocation**: as Meera, Family → Ravi → **Remove**. Ravi's next refresh says "Your Care Circle access was removed."

`scripts/e2e-local.cjs` runs these steps in three browser contexts, using Playwright with Edge or Chrome.

### Tests for this feature

- Backend: `backend/tests/test_care_circle.py` (roles, sensitive permissions, sharing, separate payment status, forced failure, one decision per request, revocation, invitations, administrator limits) and `backend/tests/test_care_plans.py` (appointments, reminders, coordination, summaries, transcripts, scam, repeated trouble, help, contacts, address, seed, production demo-control lock).
- Frontend: `frontend/src/CareCircle.test.tsx` (owner Care Circle screens and the caretaker dashboard).
- Run them with the normal [Checks](#checks).

### Implemented and not yet implemented

Implemented: shared activity timeline with filters and details; role-based access with explicit sensitive permissions, enforced by the backend; multiple caretakers; per-service and per-booking sharing; appointments and reminders, with missed reminders flagged for follow-up and never treated as proof a medicine was taken; approvals with "ask a question"; the safety centre (failed bookings, suspected scams, emergency mentions, repeated trouble, help requests); conversation summaries with confirmed actions taken only from stored records; optional Gemini-written summaries (owner or summary holders, when a key is set); care coordination from a saved appointment; audit of who did what; seed, reset, forced failure and simulated completion.

Not implemented, or different from the plan:

- **Live updates** use polling (8 seconds and on tab focus), not Firestore listeners. The deployed Firestore rules deny direct client access, and there is no client sign-in to authorise listeners.
- **Identity**: Firebase sign-in was removed on `develop`. Owners and caretakers are anonymous, signed demo sessions that last up to 24 hours per browser. Invitations are one-use and expire after 24 hours.
- **Notifications** appear in the app only; no SMS, email or push.
- **Phone calls and WhatsApp** are not connected. The "message" channel is an in-app preview, and seeded conversations are labelled as samples.
- **Scam detection** is word matching, labelled as a suspicion; there is no AI classifier.
- **Multiple caretakers**: there are no primary or backup contacts and no appointment responsibilities. Editing an appointment exists in the API (`PUT /api/hub/appointments/{id}`), but the UI only adds and removes.
- **Gemini summaries** have not been tried with a real key; tests fake the Gemini responses.
- **End-to-end script**: `scripts/e2e-local.cjs` has not been run here, because this laptop's managed browsers block automation. The flow was checked by hand in a real browser with two sessions.

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

- `frontend/`: React app, mobile first. `src/screens/` holds the older adult's screens (Home, the request flow, Activity and details, Apps, Care Circle, Profile, About, invitation); `src/care/` the caretaker dashboard; `src/components/` shared pieces (bottom navigation, activity list and details, plans, alerts, summaries, demo controls); `src/theme.css` the Google palette (contrast is enforced by `src/theme.test.ts`); `public/` the manifest, icons and service worker.
- `backend/`: configuration, health/version/readiness API, prototype routes (`app/hub.py`, `app/demo.py`), Care Circle rules and caretaker views (`app/care.py`), the demo seed (`app/seed.py`), request routing (`app/intent.py`), Gemini calls (`app/assistant.py`), the simulated provider apps (`app/providers.py`), tests, Dockerfile, pinned dependency snapshots.
- `infrastructure/`: deny-all Firestore rules until Phase 2 authentication.
- `firebase.json`: static Hosting plus `/api/**` forwarding to Cloud Run.
- `.gitlab-ci.yml`: lint, tests, package builds, container build and run check; no automatic deployment.
- `scripts/`: `smoke.mjs` (API and browser smoke test), `container-smoke.sh` (container check), `make-icons.sh` (regenerates the app icons on macOS), `firestore-local.ps1` (Windows emulator launcher), `e2e-local.cjs` (the scripted Care Circle demo, end to end, on a phone-sized screen).
- `docs/phase-1.md`: acceptance status, evidence and remaining work.
- `docs/deployment.md`: proposed deployment steps for a separately approved cloud task.
- `docs/firestore.md`, `docs/local-demo.md`: Firestore emulator setup and the local prototype.

## Configuration

`SAATHI_ENVIRONMENT`: local (default), test, development, production.
`SAATHI_VERSION`: 0.1.0 by default.
`PORT`: Cloud Run container port, default 8080 in Docker.
Firestore variables (`SAATHI_FIRESTORE_MODE`, `SAATHI_FIRESTORE_PROJECT`, `FIRESTORE_EMULATOR_HOST`) are described in `docs/firestore.md`.
Prototype-only variables, not part of Phase 1 acceptance: `SAATHI_GEMINI_API_KEY`, `SAATHI_GEMINI_MODEL`, `SAATHI_SESSION_SECRET` (32+ characters; required when the prototype routes run outside `local` and `test`), `SAATHI_ALLOWED_ORIGINS`, `SAATHI_LOCAL_DB`, `SAATHI_DEMO_CONTROLS` (`1` enables seed, forced failure and simulated completion outside `local`/`test`; leave it unset in production).

Do not commit credentials or service-account keys. No credentials are required for local Phase 1. Firebase Hosting and the API share an origin; permissive CORS is unnecessary.

## Budget and approvals

Target: zero out-of-pocket prototype development. Cloud deployment requires checking account eligibility and billing first; no free-forever guarantee. Each new task requires the owner's approval. No cloud resources or paid services have been created by this local setup. Cloud Run needs a linked Cloud Billing account, and linking one upgrades a Firebase Spark project to the Blaze plan (Firebase documentation, checked 2026-10-11); `docs/deployment.md` lists the approvals needed.

## Firestore readiness

See `docs/firestore.md` for the local emulator setup and explicit cloud opt-in. Database mode defaults to disabled; `/ready` returns 503 until a real Firestore probe succeeds. `/health` remains API liveness-only. Cloud Firestore has not been connected or deployed.
