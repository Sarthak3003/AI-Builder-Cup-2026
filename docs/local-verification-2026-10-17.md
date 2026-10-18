# Local verification — 17 October 2026

## Verdict

Gemini text integration is working. After changes 1 and 2, the live retest below passed service routing/clarification for six text examples. The product is not fully verified: phone Gemini calls fell back, the pharmacy draft omitted the requested item, and earlier live audio inference failed because the provider was unavailable.

## Live accuracy retest after changes 1 and 2

Nine logical requests were attempted using the configured Gemini key: six direct text drafts, two phone-engine turns and one running-API safety check. No real call or booking was placed. Evidence: `.local/live-accuracy-results.json` and `.local/live_accuracy.py` (ignored local files).

| Input | Live result |
| --- | --- |
| Can you help me with something? | Null service and clarification; no quotes; 3.31 seconds |
| Please arrange something for me | Null service and clarification; no quotes; 4.58 seconds |
| Please take me to the railway station | Ride and destination extracted; four quotes; 3.98 seconds |
| Mild vegetarian meal under 150 rupees | Food, budget 150, vegetarian and mild extracted; five quotes; 3.42 seconds |
| Hindi request for railway station | Ride and Hindi destination extracted; four quotes; 5.75 seconds |
| I need ORS sachets | Medicine service identified; one quote, but draft medicine field was empty; 3.50 seconds |

All six direct requests passed the script's **service routing/clarification** checks. This is a small sample, not a general accuracy score or a full entity-extraction pass: ORS was missing from Gemini's structured medicine field.

Both phone-engine Gemini attempts failed and used deterministic fallback. The initial ambiguous turn asked which service was needed; the food follow-up returned meal options with zero bookings. The follow-up took 4.03 seconds against the four-second model budget, consistent with a timeout. The first failure took 0.28 seconds; its underlying cause is unknown because the application masks provider exceptions. Thus fallback behavior passed, but live Gemini-powered phone clarification remains unverified.

The running API with automatic booking enabled returned `needs_details`, zero quotes and zero new bookings for generic help. It reported `understood_by: keywords`, so this proves the safety guard, not successful Gemini inference on that API request. Earlier audio and cancellation findings remain unresolved.

## Scope and isolation

- Tested the running frontend proxy and FastAPI backend on ports 5173 and 8000, backed by local SQLite.
- Used separate HTTP cookie sessions and a localhost browser session with fictional QA/Meera data. Did not reset the user's 127.0.0.1 browser profile.
- All bookings, payments, cancellations and refunds were simulated. No Twilio calls, purchases or cloud deployments were made.
- Live Gemini text, offer selection and synthetic audio requests consumed API quota; actual billing was not inspected.

## Observed results

| Check | Result and evidence |
| --- | --- |
| Live ride intent | Gemini; four ride quotes; 5.64 seconds for the recorded API test |
| Live meal intent | Gemini; five meal quotes; 4.38 seconds |
| Live pharmacy intent | Gemini; ORS request returned one pharmacy quote; 17.38 seconds |
| Hindi ride request | Gemini; four ride quotes; 10.23 seconds |
| Ambiguous intent | **Failed:** “Can you help me with something?” produced five food quotes rather than a follow-up question |
| Emergency/medical request | Refused, zero quotes and no booking |
| Automatic booking preference | Gemini interpreted the request and selected an offer with a reason; one confirmed simulated ride was returned and subsequently cancelled |
| Ride, food and pharmacy lifecycle | Confirmation persisted; replay with the same idempotency key returned the same booking; cancellation persisted |
| Browser ride workflow | Typed request → four prices → review → confirmation → receipt → tracking |
| Browser cancellation | UI initially timed out. SQLite confirmed cancellation plus simulated refund; reopening the page displayed both correctly |
| Partial browser onboarding | Name, larger-text setting and fictional Home location saved across navigation; then seeded demo used for booking checks |
| Care Circle | Asha and Ravi invitation joins succeeded; booking waited for approval; viewer approval returned 403; approver confirmed it |
| Viewer privacy | Checked snapshot contained neither the sample pickup address nor ride PIN field |
| Forced provider failure | FAILED booking with NOT_CHARGED_SIMULATED payment |
| Account isolation | Another session could not read the test booking (404) |
| Phone pairing/revocation API | Eight-digit single-use code generated; revoke succeeded |
| Unsigned Twilio request | Rejected with 403 |
| Phone runtime | Calling reported disabled during the live API checks |
| Synthetic audio | Voice endpoint returned 502. A direct diagnostic request returned Gemini HTTP 503 UNAVAILABLE: model experiencing high demand |
| Browser console after reopen | No error entries reported on the cancellation page |

The rapid text test sequence also reached Saathi's local AI request rate limit (429). A later safety request succeeded; this was not an invalid-key diagnosis.

## Problems to address

Update after the approved changes 1 and 2: the draft schema now permits an unknown service, generic help requests cannot generate quotes even if the model guesses food, and unknown/clarification responses are kept out of the app booking path. Phone clarification questions now pause quoting, preserve known details, send the previous question with follow-up answers to Gemini, invalidate stale offers, and retain explicit confirmation. Regression coverage includes automatic-booking mode, English/Hindi clarification, unknown intent, corrections and signed callback replay. The live retest above supplements these mocked tests. Items 3 and 4 below are unchanged; items 1 and 2 describe the original defects addressed by the fixes.

Validation of these fixes: **436 backend tests passed, 5 emulator tests skipped**; the final conversation/Twilio subset also passed **78 tests** after the follow-up-context adjustment. Ruff and whitespace checks passed. No live Gemini or Twilio requests were made while implementing the fixes.

1. **Ambiguous intent:** require clarification before offering a service when the user has not named or implied one. Add a regression case for the exact phrase above. This is particularly important when automatic booking is enabled.
2. **Phone clarification:** `backend/app/conversation.py` discards a nonempty draft clarification while populating the request. Earlier deterministic reproduction supplied a draft asking “What would you like to eat?” and received meal quotes instead. Preserve and ask that question before quoting.
3. **Provider error reporting:** `backend/app/assistant.py` maps all generation exceptions to “could not understand.” Distinguish upstream unavailability, rate limits and invalid audio; provide a bounded retry path without duplicating bookings.
4. **Uncertain mutation outcomes:** cancellation committed despite the client timeout. Refresh/read the existing record before encouraging a retry. The exact timeout cause was not established; concurrent checks were unusually slow.

## Follow-up implementation: provider errors and uncertain writes

Implemented changes 3 and 4 after the live test:

- Gemini errors now distinguish quota exhaustion, access/model configuration, input rejection, temporary unavailability, transport failure, timeout and malformed responses. Provider bodies and credentials are not exposed.
- Transient server/transport failures may retry inference once using the remaining timeout budget. Quota errors, invalid responses and configuration errors do not retry. Short phone calls retain their four-second limit and fallback behavior. Retrying inference can consume additional quota; no execution or booking action is retried by this mechanism.
- After a lost or server-error response, quote confirmation reads the snapshot for a matching quote; cancellation, completion and payment completion read the existing booking. Verified results continue the normal UI flow. Unresolved outcomes tell the user to check Activity. No mutation is automatically resent; manual confirmation retries retain the existing idempotency key.
- New error messages have Hindi translations. The pharmacy schema now describes the medicine field explicitly, but improved live item extraction has not been verified.

Validation: **442 backend tests passed, 5 emulator tests skipped; 242 frontend tests passed**. Recovery tests cover committed writes, unresolved outcomes, matching quote identity and definitive rejection. The frontend production build passed. No live Gemini requests or paid services were used for this implementation. Real phone latency, live audio and ORS extraction remain follow-up checks.

## Earlier verification and remaining limits

Before these fixes, regression runs passed backend **422 tests, 5 skipped** and frontend **235 tests** with one worker. The backend emitted an existing Starlette/httpx deprecation warning. An earlier concurrent frontend run had timeouts and was interrupted; the complete single-worker rerun passed.

- No successful live audio transcription yet; provider unavailability prevented that conclusion. Synthetic audio testing does not verify physical microphone permissions or capture.
- No real inbound Twilio call, carrier behavior, speech recognition, TTS or tunnel tested.
- Firestore emulator/cloud and deployment availability were not verified.
- Automated tests use mocked AI/telephony responses; they cannot certify live provider availability.
- No claim that every possible input, browser, device or accessibility interaction was tested.

## Evidence files

Local, Git-ignored evidence under `.local/`: `live-verification.json`, `care-verification.json`, `audio-auto-verification.json`, `verified-ride.png` and `verified-cancellation.png`. Diagnostic scripts contain no embedded credentials; the voice diagnostic reads the existing ignored environment file.
