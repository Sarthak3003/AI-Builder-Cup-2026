# Deployment and cost controls

No deployment or billable activation was performed. These are preparation steps for an approved deployment to the existing FastAPI Cloud Run service, not a new microservice.

## Existing infrastructure

- [Hosting](../../firebase.json) already forwards `/api/**`, including phone endpoints.
- [Firestore rules](../../infrastructure/firestore.rules) deny all direct client access. Pairing remains server-side.
- Cloud mode requires the existing stable `SAATHI_SESSION_SECRET`, explicit Firestore project and runtime IAM. SQLite is local-only, unsuitable for stateless Cloud Run instances.
- [Existing deployment instructions](../deployment.md) describe the stack. Provisioning remains subject to approval.

## When authorised

Store `TWILIO_AUTH_TOKEN` in Secret Manager and grant the runtime access only to the needed secret. Configure AccountSid, public HTTPS origin, display number and limits as environment settings. Keep the session-signing secret consistent across workers/revisions; pairing and call verifiers depend on it.

Enable `SAATHI_PHONE_ENABLED` only after number webhooks are ready. Setting it false and restarting/deploying rejects new signed calls and stops active calls on their next callback. Removing the number webhook in Twilio is the provider-side emergency stop. This is not an exact-second carrier disconnect.

## Timeouts and limits

Twilio documents a **15-second hard HTTP timeout** for voice callbacks. A longer Cloud Run timeout does not extend it. Gemini phone drafting uses a four-second network timeout and deterministic fallback, outside transactions. Firestore and cold-start latency still need measurement in the live smoke test.

Use conservative instance/concurrency limits and Twilio account spending controls. The persisted admission limit defaults to five active calls and twenty starts/minute across workers. Minimum instances can reduce latency but incur idle costs; they are not enabled automatically.

No background worker is relied on for booking. Completion callbacks release capacity; expiry bounds missing callbacks. Retention cleanup is an explicit command, not a provisioned scheduler.

## Billable components

Rates depend on country, account/region, number and speech model; no zero-cost guarantee is made. Potential charges:

- Twilio number rental, inbound call minutes, Gather speech recognition and Google/Polly TTS.
- Gemini requests/tokens.
- Cloud Run execution, image builds/storage and networking.
- Firestore reads/writes/storage, including active-screen polling.
- Secret Manager and operational logs.

Consult [Twilio pricing](https://www.twilio.com/en-us/voice/pricing), use existing cloud budgets and keep smoke tests short. No outgoing calls, SMS or WhatsApp messages are generated.

## Monitoring

Monitor latency, webhook 4xx/5xx, Twilio Debugger failures, admission limits and booking failures. Never enable request-body logging. Restrict provider Console access: Twilio processes pairing digits and speech even though Saathi does not record audio. Application logs use generic error categories only.