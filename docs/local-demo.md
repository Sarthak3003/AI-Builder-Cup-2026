# Local food demo

Team: git set go. Team leader: Lokita Varma. Members: Lokita Varma and Sarthak Bhan.

The local demo calls Gemini to extract food preferences, filters a simulated INR catalogue,
requires explicit confirmation, and saves/reloads the result through Firestore.
No payments, real ordering or delivery occur. Voice, authentication and public hosting are pending.

## Run

1. Start the emulator in a terminal: `./scripts/firestore-local.ps1`.
2. In a separate PowerShell terminal, configure the server environment:

```powershell
$env:SAATHI_FIRESTORE_MODE = 'emulator'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
$env:SAATHI_GEMINI_MODEL = 'gemini-2.5-flash'
$secret = Read-Host 'Gemini API key' -AsSecureString
$env:SAATHI_GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
& .venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

3. Start the frontend from `frontend`: `npm run dev -- --host 127.0.0.1`.
4. Open http://127.0.0.1:5173. Request a mild vegetarian lunch under 150 rupees.
5. Select a meal, review, confirm, refresh, then use Load saved activity.

Keep the key only in the server environment. Never add it to source, screenshots or client code.
Get a key from Google AI Studio: https://aistudio.google.com/apikey
Model availability and account quotas must be checked with a live call.

## Verification scope

Automated tests inject a controlled Gemini interpretation. They do not prove live model quality.
The emulator test exercises actual Firestore storage, repeat confirmation, price selection and
session isolation. Missing Gemini configuration produces an explicit setup error, never a fake answer.
The browser stores only the most recent order ID. The HttpOnly session cookie controls access.
Emulator data is temporary and can disappear after restarting it.

These routes are deliberately available only in local/test environments. Public deployment needs
Firebase identity/access controls, abuse limits, cloud Firestore configuration and a live Gemini test.
Do not claim the current local implementation is deployed or submission-ready.

Gemini integration reference: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
