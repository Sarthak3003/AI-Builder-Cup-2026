# Pairing, permissions and privacy

## Identity

1. Owner opens Profile → Call Saathi → Generate pairing code.
2. Backend generates eight cryptographically random decimal digits, valid for five minutes.
3. Only an HMAC-SHA256 verifier is stored; leading zeros matter.
4. Caller enters the code in Twilio's DTMF prompt, then `#`.
5. One transaction consumes the code and binds this call to the issuing account.

Caller ID, `From`, `To`, a supplied user ID or guessed call ID never grants access. Caretakers cannot issue pairing codes, revoke owner phone access or read raw call sessions. No Google login is required.

Only enter the code on a call you initiated to Saathi. It grants temporary access to saved places and simulated bookings; it is not permanent phone-number login or account recovery.

| Route | Authorisation |
| --- | --- |
| `POST /api/hub/phone/pairing-codes` | Owner cookie and same-origin guard; optional `retain_transcript` boolean |
| `GET /api/hub/phone/sessions` | Owner only, read-only |
| `GET /api/hub/phone/sessions/{id}` | Owning profile only, read-only |
| `POST /api/hub/phone/revoke` | Owner only; rotates access epoch |
| `/api/phone/twilio/*` | Official SDK validation of signature, exact external URL and every form field; configured AccountSid must match |

No public JSON pairing endpoint or simulator route exists. Redemption occurs only through verified Twilio callbacks. Revocation invalidates unused codes and the next action on paired calls. Account deletion/reset also removes access.

## Limits

- Five code issuances per owner per five minutes.
- Five redemption attempts per call; thirty globally per minute.
- Twenty starts per minute; five concurrent calls by default.
- Ten-minute lifetime and forty callback steps by default, with bounded Gather waits.
- Webhook bodies limited to 16 KiB; duplicate form fields rejected. Unknown provider fields are still included in signature validation.
- Step numbers are non-secret and signature-bound. Persistent replay responses and revisions prevent duplicate bookings.
- Confirmation, receipt and demo-provider ledger commit together. A future external provider requires reconciliation before retrying uncertain execution.

Duration is enforced at callback boundaries, not as a carrier-level exact-second cutoff. A caller already speaking inside Gather can remain connected until that bounded Gather ends. Configure provider spending controls too.

## Privacy and retention

- No `<Record>`, audio files, media downloads or continuous stream.
- Twilio processes speech/DTMF; its logs/retention are outside Saathi's database. Restrict Console access and do not copy sensitive Request Inspector bodies into tickets.
- Gemini receives request text and existing minimal drafting context, never pairing codes or caller IDs. It cannot authorise purchases.
- Text transcript retention is opt-in per pairing code. Recognised sensitive inputs are redacted; otherwise event text is `[Not retained]`.
- Structured workflow state and bounded replay replies are still needed to operate a call. They expire with session data.
- Sessions, events and pairing records become deletion-eligible after 24 hours. Transcript reads stop at expiry even before physical cleanup. Booking receipts and summaries remain until account deletion.
- Application logs do not include webhook bodies, pairing codes or credentials. Keep proxy request-body logging disabled. Secrets belong in environment variables or Secret Manager.
- Existing caretaker summary/transcript permissions and per-booking sharing apply.

## Physical cleanup

From the repository root, in the configured backend environment:

```sh
.venv/bin/python -m app.phone_cleanup
.venv/bin/python -m app.phone_cleanup --apply --limit 100
```

The first command is a dry-run. The second rechecks expiry transactionally, deletes only expired phone namespaces, clears duplicated transcript text from account conversations and preserves receipts. Repeat bounded batches as needed.

No scheduled cleanup or Firestore TTL policy was provisioned. An operator must arrange approved execution. Numerical deletion timestamps are not native Firestore TTL timestamps.