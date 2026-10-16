# Connect Twilio Voice

**Live calling is not yet verified.** Add your own credentials and an approved Voice-capable Twilio number before the smoke test. This repository does not purchase numbers, create outbound calls or activate paid services.

## Official references used

- [Webhook signature verification](https://www.twilio.com/docs/usage/security#validating-requests)
- [Gather speech, keypad and timeouts](https://www.twilio.com/docs/voice/twiml/gather)
- [Say voices and languages](https://www.twilio.com/docs/voice/twiml/say/text-speech)
- [Incoming request and status callback parameters](https://www.twilio.com/docs/voice/twiml)
- [Voice webhook 15-second timeout and retries](https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides)

Reviewed 16 October 2026. Use a Voice number's webhooks, not a Studio flow, outbound REST call or Media Stream.

## Configuration

Copy [the environment example](../../backend/.env.example) to a local ignored environment file. Never paste tokens into chat, JavaScript, screenshots or Git.

| Variable | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Account/subaccount owning the number, `AC...` |
| `TWILIO_AUTH_TOKEN` | That account's primary Auth Token; not an API-key SID |
| `SAATHI_PHONE_PUBLIC_BASE_URL` | Exact external HTTPS origin, e.g. `https://your-approved-host.example`; no path/query |
| `SAATHI_PHONE_ENABLED` | `true` only when ready; default `false` |
| `SAATHI_PHONE_NUMBER` | Optional E.164 number displayed in the app |
| `SAATHI_PHONE_MAX_CALLS` | Concurrent calls, default `5` |
| `SAATHI_PHONE_MAX_DURATION` | Lifetime in seconds, default `600` |
| `SAATHI_PHONE_MAX_TURNS` | Callback step limit, default `40` |
| `SAATHI_PHONE_VOICE_EN` | Default `Google.en-IN-Standard-A` |
| `SAATHI_PHONE_VOICE_HI` | Default `Google.hi-IN-Standard-A` |
| `SAATHI_PHONE_SPEECH_MODEL` | Default `default`; check language support before overriding |
| `SAATHI_GEMINI_API_KEY` | Existing optional server Gemini key |
| `SAATHI_GEMINI_MODEL` | Existing model override; verify availability for your key |

Enabling calling with incomplete credentials or a non-HTTPS origin fails configuration validation. There is **no signature bypass**, including locally. Speech recognition and TTS charges can apply.

## Local backend

From the repository root:

```sh
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
.venv/bin/python -m uvicorn app.main:app --app-dir backend --env-file backend/.env --host 127.0.0.1 --port 8000
```

Run `npm run dev` in the frontend directory. For a real inbound test, use an approved HTTPS tunnel to backend port 8000, or an approved deployed service. Twilio cannot reach loopback URLs. Set the public origin to the actual tunnel/service origin and restart when it changes. Never disable signature validation to expose a local server.

## Twilio Console

On your approved number's Voice configuration, choose **Webhook** and **HTTP POST**:

| Setting | URL |
| --- | --- |
| A call comes in | `https://YOUR-HOST/api/phone/twilio/incoming` |
| Primary handler fails / fallback | `https://YOUR-HOST/api/phone/twilio/fallback` |
| Call status changes / status callback | `https://YOUR-HOST/api/phone/twilio/status` |

The backend generates `/api/phone/twilio/gather?step=N` as an absolute Gather action URL. Do not construct or configure these step URLs manually. The external HTTPS origin, path, query and trailing slash must match exactly for signatures. Forwarded host headers are deliberately not trusted.

Keep recording disabled in Twilio. Trial restrictions, verified caller requirements, geography permissions and local telephone regulations can affect testing; check your account rather than bypassing them.

## Using the call

1. Finish Saathi setup, save Home/Doctor and connect demo ride/food services.
2. Profile → Call Saathi → transcript preference → Generate pairing code.
3. Dial the configured number; enter eight digits, then `#`.
4. Or enter `0#` for guest quotes without account access or booking.
5. At the first prompt, `9#` selects Hindi and `8#` English. Pairing applies the profile's saved language.
6. Say “Book a cab”, “Home”, “Doctor”, then “Yes, confirm it”. Food uses numbered meal choices and a separate yes.
7. During conversation, `9` repeats and `0` ends. `1` confirms only at the confirmation question.
8. Activity shows the linked call and its actual demo booking outcome.

Twilio Gather handles STT and Say handles TTS. Prompts are nested in Gather to permit speech/keypad interruption. There is no continuous streaming session.