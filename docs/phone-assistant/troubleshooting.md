# Troubleshooting Twilio calls

| Symptom | Check |
| --- | --- |
| Calling disabled | Fill credentials/origin and set `SAATHI_PHONE_ENABLED`, then restart. No simulator exists. |
| Twilio cannot reach localhost | Use an approved HTTPS tunnel or deployed service, not loopback. |
| 403 signature error | Correct primary Auth Token/AccountSid, exact HTTPS origin, path/query/trailing slash. Never bypass validation or sign the internal proxy URL. |
| 404 phone routes | Unconfigured service, or hub not mounted. Outside local/test this app needs cloud Firestore mode. |
| 415 or 400 | Use POST form webhooks, not JSON/duplicate fields. Do not edit Gather action URLs. |
| Code fails | All eight digits, including zeros, then `#`; single-use and five-minute expiry. |
| Pairing locked | Five attempts per call; global limits also apply. Wait and start a new call/code. |
| Known caller is a guest | Expected: caller ID is not identity. Pair with the app. |
| Silence ends call | Three empty/low-confidence turns end safely. Use keypad 1 only at confirmation. |
| Twilio application error | Check reachability, configured fallback and latency. Voice HTTP has a hard 15-second limit. Don't copy sensitive Debugger payloads. |
| Hindi failure | Confirm Say voice and Gather model support `hi-IN` in your account/region. Live recognition is not certified. |
| Caller still has to confirm | Expected even when app automatic booking is enabled. |
| Pending approval | Care Circle rules apply; hanging up never approves it. |
| Replay returns previous question | The persisted step response is replayed, not a duplicate booking. Follow its action URL. |
| Outcome unclear after error | Check Activity before retrying: the transaction may already have committed. |
| Missing transcript | Retention is opt-in per code and ends after 24 hours. No Saathi audio recording exists. |
| Old data remains on disk | Expiry blocks access; [physical cleanup](pairing-and-security.md#physical-cleanup) is explicit and not scheduled. |
| Booking absent in another browser | Profiles are browser-specific. Generate the code from the intended profile. |

No live inbound-call test has passed yet. Reproduce via signed-webhook tests before altering provider settings; do not weaken signature or permission checks.