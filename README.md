# Saathi

An accessible everyday companion: call, message, or use the app with one shared identity and memory.

## Current state

**Phase 1 (Foundation, `v0.1.0`) is in progress and has not passed its gate.** React + TypeScript (Vite) frontend; Python 3.12 + FastAPI backend with `/health`, `/version` and a Firestore readiness probe (`/ready`). Nothing is deployed; the current commit's remote pipeline status has not been checked.

`develop` also carries later-phase prototype features: local demo sessions, simulated food, ride and medicine requests, caregiver approvals, a simplified view, browser voice and optional Gemini text/audio understanding. Anonymous demo sessions run locally and in cloud mode without Google login. Cloud mode still requires a signing secret; visitor data is isolated by browser session for up to 24 hours. Each feature still needs its own phase acceptance gate. Historical evidence and remaining gates are in `docs/phase-1.md`.

## Firebase / Google Cloud setup

The selected deployment uses Firebase Hosting, Firestore, Cloud Run in Mumbai (`asia-south1`) and a server-only Gemini key in Secret Manager. Visitors enter automatically with isolated, signed 24-hour demo sessions; no Google login or Firebase Authentication setup is required. Start with [the deployment guide](docs/deployment.md). `scripts/deploy-google.ps1` requires an explicit new `-ProjectId` and `-GeminiModel`; it generates a local plan unless `-Apply` is supplied. The old deployment passed health checks and owner-confirmed sign-in/Gemini tests before project shutdown was requested. This anonymous-session version has been tested locally, not deployed. Cost review precedes new billable work.

This branch also turns the prototype into a mobile-first, installable web app (PWA) in Google's colours, with a guided setup, three simulated providers (the Demo Ride Provider, Demo Food Provider and Demo Pharmacy Provider), prices set by the server, explicit confirmation, and simulated payments. Familiar names (Uber, Ola and Rapido for rides; Uber Eats, Swiggy and Zomato for food) appear only as labels on demo options. Saathi is not connected to those companies, and every booking is made by a demo provider. Nothing is dispatched, delivered or charged, and Saathi never asks for card numbers, UPI PINs, OTPs or bank logins. The point of the flow is that an older person asks Saathi, checks the price and confirms, instead of calling family to book for them.

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
3. **Set up once**: a new browser starts in a seven-step setup: name and language, comfort settings, saved places (one is the usual pickup; sample addresses are one tap away), an optional Care Circle person (view only, or view and approve), demo services to connect, how simulated payments work (Demo wallet or Pay on completion), then a review that needs a clear "Yes, finish setup". Each step is saved on the server as you go: leave and come back, and setup resumes at the first unfinished step. Profile → Your setup reopens any step.
4. **Book a ride**: choose where to (a saved place or somewhere else) and press **Get demo prices**. The first option is the Demo Ride Provider's own **Demo Ride**; below it are example options under familiar names (Rapido Auto, Ola Mini and Uber Go), which the same provider simulates. Each has a fare and pickup time, held for 15 minutes. Choose one to reach **Check and confirm**: the price line by line, the payment method, "Demo ride — no real driver will arrive." and **Confirm demo booking**. Nothing is booked before that button. The receipt shows a reference such as DEMO-RIDE-1042, the booking status and, separately, the payment status, with "No money charged".
   - **Let Saathi pick**: switch off Profile → Booking rides → **Show me the ride options to compare**. The button becomes **Find the best demo ride**: Saathi skips the list and shows one ride, chosen on price and minutes to pickup, with the reason. With a Gemini key, Gemini makes the choice ("Chosen by Gemini (AI)"); without one, a fixed rule does (lowest price plus ₹5 per minute of waiting, labelled "not AI"). **Confirm demo booking** is still needed, then Saathi goes straight to the ride page. **Compare all options** shows the full list.
5. **Order food or pharmacy items**: pick the Demo Food Provider's own **Saathi Demo Kitchen** or a fictional kitchen listed under Uber Eats, Swiggy or Zomato, then dishes; or sample non-prescription pharmacy items such as ORS sachets or bandages (not medical advice and not a real pharmacy order). The server prices each line and adds the demo delivery fee; the same check-and-confirm step follows.
6. **Services**: connect, disconnect or reset each demo provider, and choose which familiar-name options appear. The provider's own option is always offered. A service that is not connected cannot be booked; the request screen explains this and offers to connect it.
7. **Activity**: upcoming appointments and reminders, then every booking with its booking status and, separately, its simulated payment status. Filter by type, status and date; open a booking for its price lines, reference and history, to cancel it, or (demo only) to mark it completed or its simulated payment complete. The **Timeline** lists every event: the same record the Care Circle sees, minus anything not shared with them.
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

## How bookings work

Everything runs in the existing FastAPI app and the existing per-browser account document (SQLite locally, Firestore when configured). There is no new database and no new sign-in system. Every provider and payment is simulated ("Model C"); no real provider or payment API is ever called.

| Piece | File | Role |
| --- | --- | --- |
| Domain types | `backend/app/domain.py` | Service, provider, connection, quote, booking, payment and approval statuses. Money is whole paise. |
| Demo providers | `backend/app/providers.py` | `DemoRideProvider`, `DemoFoodProvider` and `DemoPharmacyProvider` behind one `ServiceProvider` interface: quote, create booking (idempotent by key), cancel and complete. Each offers its own option (Demo Ride, Saathi Demo Kitchen), listed first and always on, plus examples under familiar names. A booked ride also gets sample trip details (vehicle, a DEMO plate and a ride PIN), which caretakers never receive. Prices, times and references (DEMO-RIDE-1042, 1043, …) are deterministic. |
| Setup | `backend/app/onboarding.py` | Setup steps and progress, saved places, demo connections, the payment choice and the review. |
| Quotes and bookings | `backend/app/bookings.py` | Quotes with expiry, confirmation, approvals, booking and payment records, cancellation and completion. |
| Care Circle views | `backend/app/care.py` | What each caretaker may see; permission checks. |
| Routes | `backend/app/hub.py` | Everything under `/api/hub` (below). |
| Screens | `frontend/src/onboarding/`, `src/screens/RequestScreen.tsx`, `ServicesScreen.tsx`, `src/components/ActivityTimeline.tsx`, `DemoControls.tsx` | Setup, request, check and confirm, receipt, services, timeline and demo controls. |

The rules the server enforces:

- **Prices come from the server.** The browser sends only what was chosen (place ids, option, item ids and quantities). A quote holds its price for 15 minutes, belongs to one account and can be confirmed once. Expired, used, unknown or altered quotes are refused.
- **Nothing is booked without a clear yes.** Confirming needs `{"confirmed": true, "idempotency_key": "…"}`. A booking record is only written at that moment. When the owner lets Saathi pick a ride, the pick is only marked on one quote (`recommended`); it still needs the same confirmation.
- **One booking per key.** The same key returns the same booking, so a double tap or a network retry makes one booking and one payment record.
- **Approval first, where the owner asked for it.** With an approver in the Care Circle and approvals on, bookings above the owner's limit and every pharmacy order wait as `AWAITING_APPROVAL`, with payment `NOT_CHARGED_SIMULATED`, until an approver decides. A declined or expired approval books nothing.
- **Booking and payment are separate fields.** Booking: `AWAITING_APPROVAL`, `CONFIRMED_SIMULATED`, `COMPLETED_SIMULATED`, `FAILED`, `CANCELLED_SIMULATED`, `DECLINED`. Payment: `PENDING_SIMULATED`, `SUCCEEDED_SIMULATED`, `FAILED_SIMULATED`, `NOT_CHARGED_SIMULATED`. Demo wallet bookings are paid (simulated) on confirmation; pay-on-completion stays pending until the trip or delivery is marked completed. A failed booking is `FAILED` with `NOT_CHARGED_SIMULATED`, never a success. Cancelling a paid booking records a separate simulated refund.
- **One record, many views.** Every change is one transaction on the account document, and an error rolls back the whole change. The owner's timeline and each caretaker's view read the same stored events. Caretakers get only what their permissions allow: never addresses, retry keys or quote ids, and payment status or pharmacy item names only with those permissions.

API (owner session unless stated):

| Method and path | Purpose |
| --- | --- |
| `GET /api/hub/onboarding` | Setup progress, places, connections and the review |
| `PATCH /api/hub/onboarding/profile` | Name, language, comfort, channel, approval rule, payment method; marks a step when `step` is given |
| `POST /api/hub/onboarding/locations`, `DELETE …/locations/{id}` | Save, change or remove a place; exactly one usual pickup |
| `POST /api/hub/onboarding/caretaker-grants` | Invite a viewer, or an approver (`can_approve`) |
| `POST /api/hub/onboarding/steps/{step}` | Mark a step done, or skip an optional one |
| `POST /api/hub/onboarding/finish` | Finish setup; needs `{"confirmed": true}` |
| `GET /api/hub/services` | Demo providers, their status, capabilities and catalogue |
| `POST /api/hub/services/{RIDE,FOOD,PHARMACY}/connect-demo`, `/disconnect`, `/reset` | Manage a demo connection; connecting needs `{"consent": true}` |
| `POST /api/hub/quotes` | Server-priced quotes for a ride, meal or pharmacy order |
| `POST /api/hub/quotes/{id}/confirm` | Book (or send for approval); idempotent by key |
| `GET /api/hub/bookings`, `GET /api/hub/bookings/{id}` | Bookings with their separate payment records |
| `POST /api/hub/bookings/{id}/cancel`, `/complete`, `/payment/complete` | Cancel; demo-only completion of the trip or the simulated payment |
| `POST /api/hub/bookings/{id}/decision` | Approve, decline or ask (caretaker session with `approve`) |
| `GET /api/hub/activities` | Timeline events this session may see |
| `GET /api/hub/care-circle/activities` | Caretaker session only: permitted events and bookings |
| `POST /api/hub/demo/reset` | Demo only: `{"scenario": "fresh" or "meera", "confirm": true}` |
| `POST /api/hub/demo/fail-next` | Demo only: the next booking fails |

Where this differs from the written plan, it was adapted to the existing app:

- Routes sit under `/api/hub`, the session cookie's path; `/api/demo` already belongs to the older food demo.
- Places, quotes, bookings and events are lists inside the one account document instead of sub-collections, so each change stays a single transaction.
- Adapters run inside that transaction because they do no I/O.
- The plan's `DRAFT` and `QUOTED` stages are the request and quote records rather than booking statuses. `COMPLETED_SIMULATED`, `DECLINED` and a cancelled approval were added.
- Accounts saved by older versions of this prototype are reset to an empty setup.

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

Demo controls are on automatically when `SAATHI_ENVIRONMENT` is `local` or `test`. Anywhere else they are off unless `SAATHI_DEMO_CONTROLS=1` is set, and the demo API answers 404.

- **Reset**: Profile → Demo controls → **Start fresh at setup** or **Load Meera's demo**. Both first ask "Replace everything in this demo?" with focus on **Keep my data**, so pressing Enter twice cannot wipe a demo. API: `POST /api/hub/demo/reset` with `{"scenario": "fresh", "confirm": true}` (or `"meera"`). Without `"confirm": true` it is refused (422), and caretakers are refused (403).
  - **Fresh**: an empty profile that opens setup. Demo references start again at 1042. Use this for the scripted demo.
  - **Meera**: Meera's finished setup: Home, Doctor and Eye care (sample addresses), all three demo providers connected, the demo wallet, approvals above ₹100 and for every pharmacy order, a check-up with Dr Mehta tomorrow at 10:30 (India time) and an eye check-up, reminders (one missed, one done), a completed meal (DEMO-FOOD-1042), a pharmacy order (sample ORS and calcium) waiting for approval, a suspected scam message, trusted contacts, and two pending invitations: **Asha** (Approver, plus summaries, alerts, medicine details and reminders) and **Ravi** (Viewer). The two invitation links are shown on screen.
- **Switch account**: after a demo reset, the profile page shows **Switch account** at the top: Meera's Profile tab, or a caretaker's **Care Circle & settings** (tap the round initial in the top bar). Tap a name to use the app as that person in the same browser; it opens their home screen. Switching to a caretaker who has not joined yet joins them; their invitation link still works on another device. It only appears in the browser that reset the demo, never for a caretaker who joined by link, and not at all where demo controls are off. API: `POST /api/hub/demo/switch` with `{"to": "owner"}` or a Care Circle id.
- **Force a failure**: Profile → Demo controls → **Make the next booking fail**. Only the next confirmation fails.
- **Complete a booking**: open a booked item in Activity → **Demo: mark trip or delivery completed**, or, for pay on completion, **Demo: mark simulated payment complete**.
- **Delete my data**: About → **Delete my data** clears this browser's data, including everyone's Care Circle access. This is a privacy action, not a demo control, so it is available everywhere.

All seeded addresses, phone numbers and medicines are labelled as samples.

### Run the full hackathon demo

Start the backend and frontend (see [Run locally](#run-locally)) and open http://127.0.0.1:5173. One browser window is enough: use **Switch account** on the profile page to move between people. To show two people side by side instead, open a caretaker's invitation link on **http://localhost:5173** or in a private window. Cookies are per site name, and both names reach the same servers.

**Part 1: the scripted demo**

1. **Fresh start**: Profile → Demo controls → **Start fresh at setup** → **Yes, reset the demo**. Setup opens.
2. **Set up as Meera**: name **Meera** → Continue; comfort settings → Continue; **Use sample: Home** → Save place, then **Use sample: Doctor** → Save place (Home is the usual pickup) → Continue; add **Ravi** with "See my shared activity (view only)" → **Add to my Care Circle** → Continue; **Connect Demo Ride Provider** → Continue; **Demo wallet (simulated)** → Continue; check the review → **Yes, finish setup**.
3. **Ride to the doctor**: **Try a demo ride** → Where to? **Doctor** → **Get demo prices**. The Demo Ride Provider's own **Demo Ride** comes first at ₹94, then the familiar-name examples: Rapido Auto ₹83, Ola Mini ₹125, Uber Go ₹135. (These fares are for the sample Home and Doctor addresses; other addresses give other, equally fixed, fares.) Choose **Demo Ride** to see the fare line by line and "Demo ride — no real driver will arrive."
4. **Confirm**: **Confirm demo booking**. The receipt shows **DEMO-RIDE-1042**, Booking **Booked · simulated**, Payment **Paid (simulated) · no money charged** and "No money charged." **Demo details** shows `CONFIRMED_SIMULATED` and `SUCCEEDED_SIMULATED`. **Track your demo ride** opens a page laid out like a ride app: a drawn route marked "Demo map · not live", "Demo driver on the way", a four-digit **Ride PIN (demo)**, a demo driver card ("Not a real person", plate DEMO 1042, a call button that explains there is no driver), the pickup and drop, and the fare.
5. **Same event, two views**: Activity → **Timeline** shows "Booked (simulated): Demo Ride to Doctor". Then Profile → Switch account → **Ravi**: his Activity timeline shows the same event, and the booking shows Home → Doctor without addresses or payment.
6. **Forbidden action**: as Ravi, open the ride → **Demo: test the permission check** → **Try to cancel this booking**: "Refused by the server: Only the account owner can perform this action." **Try to approve this booking** is refused as well. Both are real API calls.
7. **Forced failure**: Switch account → **Meera** → Profile → **Make the next booking fail**, then book the Demo Ride again. **Booking failed**: Booking "Failed · nothing booked", Payment "Not charged (simulated)". The first ride is still booked.

**Part 2: approvals, with Meera's seeded demo**

1. Profile → Demo controls → **Load Meera's demo** → **Yes, reset the demo**.
2. **Asha**: tap **Asha** under Switch account (or open her link elsewhere → Join as caretaker). The Overview shows the pharmacy order waiting for approval, a suspected scam alert, a missed reminder and tomorrow's check-up. Switch back to **Meera**.
3. **Care coordination**: on Home, type or say "Please take me to my doctor's appointment". Saathi uses the saved appointment. Choose **Ola Mini (₹125)**: it is above Meera's ₹100 limit, so the check step says an approver must agree. **Confirm demo booking** → **Sent for approval**, payment **Not charged (simulated)**.
4. **Delegated approval**: as Asha, Approvals → **Approve**. Meera's Activity then shows **Booked · simulated** and, separately, **Paid (simulated) · no money charged**.
5. **Ravi** (Viewer) sees shared rides and "a pharmacy order", but no medicine names, payments, conversations or approval buttons.
6. **Revocation**: as Meera, Family → Ravi → **Remove**. If Ravi joined by link in another window, his next refresh says "Your Care Circle access was removed." In one window, he disappears from Switch account.

`scripts/e2e-local.cjs` runs both parts in separate phone-sized browser contexts with Playwright (Edge by default; set `SAATHI_BROWSER_CHANNEL=chrome` for Chrome). `backend/tests/test_scripted_demo.py` runs part 1 against the API on every `pytest` run.

### Tests for this feature

- Backend:
  - `test_domain.py` (types and statuses), `test_providers.py` (deterministic demo providers, idempotency, failure), `test_onboarding.py` (steps, resume, validation, review, connections, payment choice).
  - `test_quotes.py` (server prices, expiry, ownership, refused alterations) and `test_bookings.py` (confirmation, double taps and retries, approvals, separate payment status, failure, cancellation, completion).
  - `test_activities.py` (one event record for the owner and caretakers; 16 direct API calls a view-only caretaker must be refused; revocation on the next request).
  - `test_scripted_demo.py` (the confirmed demo reset and the whole scripted demo through the API).
  - `test_care_circle.py` and `test_care_plans.py` (roles, sensitive permissions, sharing, appointments, reminders, coordination, summaries, scam, help, contacts, demo person switching, production demo-control lock).
- Frontend: `Onboarding.test.tsx` (setup wizard), `App.test.tsx` (request, check and confirm, receipt, services, activity) and `CareCircle.test.tsx` (owner Care Circle screens, the caretaker dashboard, the shared timeline, the permission check, demo controls and Switch account).
- Run them with the normal [Checks](#checks).

### Implemented and not yet implemented

Implemented: guided setup with server-checked steps, resume and review; saved places with one usual pickup; three deterministic demo providers with connect, disconnect and reset; server-priced quotes for rides, meals and sample pharmacy items, with expiry; explicit confirmation; idempotent booking; approvals; separate simulated payment status (demo wallet or pay on completion), cancellation with a simulated refund, and demo completion; one activity timeline for the owner and caretakers; shared activity with filters and details; role-based access with explicit sensitive permissions, enforced by the backend; multiple caretakers; per-service and per-booking sharing; appointments and reminders, with missed reminders flagged for follow-up and never treated as proof a medicine was taken; approvals with "ask a question"; the safety centre (failed bookings, suspected scams, emergency mentions, repeated trouble, help requests); conversation summaries with confirmed actions taken only from stored records; optional Gemini-written summaries (owner or summary holders, when a key is set); care coordination from a saved appointment; audit of who did what; a confirmed demo reset (fresh or Meera), forced failure and simulated completion.

Not implemented, or different from the plan:

- **Live updates** use polling (8 seconds and on tab focus), not Firestore listeners. The deployed Firestore rules deny direct client access, and there is no client sign-in to authorise listeners.
- **Identity**: Firebase sign-in was removed on `develop`. Owners and caretakers are anonymous, signed demo sessions that last up to 24 hours per browser. Invitations are one-use and expire after 24 hours.
- **Notifications** appear in the app only; no SMS, email or push.
- **Phone calls and WhatsApp** are not connected. The "message" channel is an in-app preview, and seeded conversations are labelled as samples.
- **Scam detection** is word matching, labelled as a suspicion; there is no AI classifier.
- **Multiple caretakers**: there are no primary or backup contacts and no appointment responsibilities. Editing an appointment exists in the API (`PUT /api/hub/appointments/{id}`), but the UI only adds and removes.
- **Gemini summaries** have not been tried with a real key; tests fake the Gemini responses.
- **Real providers and payments** are out of scope by design: no provider accounts, no payment gateway, no stored payment details. The familiar app names are labels only.
- **Prescription medicines** are not represented; the demo pharmacy has sample non-prescription items only.
- **Places** are typed text with sample addresses; there are no maps, geocoding or live distances. Ride distances are worked out from the place names so that prices stay the same every time.
- **End-to-end script**: `scripts/e2e-local.cjs` could not be run on this laptop, because its managed browsers block automation. The same steps (both parts) were run with Playwright in the editor's built-in browser, and `test_scripted_demo.py` covers part 1 through the API. Layout was checked at 320 and 390 px wide, and the reset confirmation was checked with the keyboard.

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

- `frontend/`: React app, mobile first. `src/onboarding/` holds the setup wizard; `src/screens/` the older adult's screens (Home, the request flow, Activity and details, Services, Care Circle, Profile, About, invitation); `src/care/` the caretaker dashboard; `src/components/` shared pieces (bottom navigation, activity list, details and timeline, places editor, service connection cards, price lines, plans, alerts, summaries, demo controls); `src/theme.css` the Google palette (contrast is enforced by `src/theme.test.ts`); `public/` the manifest, icons and service worker.
- `backend/`: configuration, health/version/readiness API, prototype routes (`app/hub.py`, `app/demo.py`), domain types (`app/domain.py`), setup (`app/onboarding.py`), quotes, bookings and simulated payments (`app/bookings.py`), the demo providers (`app/providers.py`), Care Circle rules and caretaker views (`app/care.py`), the demo seed (`app/seed.py`), request routing (`app/intent.py`), Gemini calls (`app/assistant.py`), tests, Dockerfile, pinned dependency snapshots.
- `infrastructure/`: deny-all Firestore rules until Phase 2 authentication.
- `firebase.json`: static Hosting plus `/api/**` forwarding to Cloud Run.
- `.gitlab-ci.yml`: lint, tests, package builds, container build and run check; no automatic deployment.
- `scripts/`: `smoke.mjs` (API and browser smoke test), `container-smoke.sh` (container check), `make-icons.sh` (regenerates the app icons on macOS), `firestore-local.ps1` (Windows emulator launcher), `e2e-local.cjs` (the scripted hackathon demo, end to end, on a phone-sized screen).
- `docs/phase-1.md`: acceptance status, evidence and remaining work.
- `docs/deployment.md`: proposed deployment steps for a separately approved cloud task.
- `docs/firestore.md`, `docs/local-demo.md`: Firestore emulator setup and the local prototype.

## Configuration

`SAATHI_ENVIRONMENT`: local (default), test, development, production.
`SAATHI_VERSION`: 0.1.0 by default.
`PORT`: Cloud Run container port, default 8080 in Docker.
Firestore variables (`SAATHI_FIRESTORE_MODE`, `SAATHI_FIRESTORE_PROJECT`, `FIRESTORE_EMULATOR_HOST`) are described in `docs/firestore.md`.
Prototype-only variables, not part of Phase 1 acceptance: `SAATHI_GEMINI_API_KEY`, `SAATHI_GEMINI_MODEL`, `SAATHI_SESSION_SECRET` (32+ characters; required when the prototype routes run outside `local` and `test`), `SAATHI_ALLOWED_ORIGINS`, `SAATHI_LOCAL_DB`, `SAATHI_DEMO_CONTROLS` (`1` enables the demo reset, forced failure, demo completion, Switch account and the caretaker permission check outside `local`/`test`; leave it unset in production).

Do not commit credentials or service-account keys. No credentials are required for local Phase 1. Firebase Hosting and the API share an origin; permissive CORS is unnecessary.

## Budget and approvals

Target: zero out-of-pocket prototype development. Cloud deployment requires checking account eligibility and billing first; no free-forever guarantee. Each new task requires the owner's approval. No cloud resources or paid services have been created by this local setup. Cloud Run needs a linked Cloud Billing account, and linking one upgrades a Firebase Spark project to the Blaze plan (Firebase documentation, checked 2026-10-11); `docs/deployment.md` lists the approvals needed.

## Firestore readiness

See `docs/firestore.md` for the local emulator setup and explicit cloud opt-in. Database mode defaults to disabled; `/ready` returns 503 until a real Firestore probe succeeds. `/health` remains API liveness-only. Cloud Firestore has not been connected or deployed.
