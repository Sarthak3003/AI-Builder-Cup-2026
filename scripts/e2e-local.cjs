// The scripted hackathon demo as an end-to-end run: Meera (owner), Asha (approver) and Ravi (viewer)
// in three separate browser contexts, phone-sized, against a running backend (8000) and frontend (5173).
// Usage: SAATHI_BROWSER_CHANNEL=chrome node scripts/e2e-local.cjs   (default channel: msedge)
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve(__dirname, '../frontend')] }));

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const PHONE = { width: 390, height: 844 };
const tab = (page, name) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: new RegExp(`^${name}\\b`) });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SAATHI_BROWSER_CHANNEL || 'msedge' });
  const open = async () => (await browser.newContext({ viewport: PHONE })).newPage();
  const meera = await open();
  const errors = [];
  meera.on('pageerror', (error) => errors.push(error.message));

  // 1. Load the seeded demo and collect the two caretaker invitation links.
  await meera.goto(`${BASE}/#/profile`);
  await meera.getByRole('button', { name: /Load Meera's demo/ }).click();
  await meera.getByRole('button', { name: 'Yes, replace my demo data' }).click();
  await meera.getByText("Meera's demo is loaded.").waitFor();
  const [ashaLink, raviLink] = await meera.locator('.invite-box input').evaluateAll((inputs) => inputs.map((input) => input.value));

  const asha = await open();
  await asha.goto(ashaLink);
  await asha.getByRole('button', { name: 'Join as caretaker' }).click();
  await asha.getByRole('heading', { name: 'Supporting Meera' }).waitFor();
  const ravi = await open();
  await ravi.goto(raviLink);
  await ravi.getByRole('button', { name: 'Join as caretaker' }).click();
  await ravi.getByRole('heading', { name: 'Supporting Meera' }).waitFor();

  // 2. Care coordination: Meera asks for her doctor's appointment; Saathi uses the saved appointment.
  await meera.goto(`${BASE}/#/`);
  await meera.getByRole('textbox', { name: 'Or type it here' }).fill("Please take me to my doctor's appointment");
  await meera.getByRole('button', { name: 'Ask Saathi' }).click();
  await meera.getByText('For your appointment:').waitFor();
  await meera.getByRole('button', { name: /^Choose Ola Mini from Ola$/ }).click();
  await meera.getByRole('button', { name: 'Book with Ola' }).click();
  await meera.getByRole('heading', { name: 'Sent for approval' }).waitFor();
  await meera.getByText('Not charged (simulated)').waitFor();

  // 3. Asha approves in her own dashboard; Meera's same task becomes booked, payment still separate.
  await asha.goto(`${BASE}/#/approvals`);
  await asha.reload();
  await asha.locator('article.activity', { hasText: 'Ola Mini' }).getByRole('button', { name: 'Approve' }).click();
  await asha.getByText('Approved. The booking is confirmed (simulated).').waitFor();
  await meera.goto(`${BASE}/#/activity`);
  await meera.reload();
  const ride = meera.locator('article.activity', { hasText: 'Ola Mini' });
  await ride.getByText('Booked · simulated').waitFor();
  await ride.getByText('Payment: Pay on completion (simulated) · nothing charged yet').waitFor();

  // 4. Ravi (viewer) sees the ride, cannot approve or read conversations, and the API refuses him too.
  await ravi.reload();
  await tab(ravi, 'Approvals').click();
  await ravi.getByText(/has not given you access to approving requests/).waitFor();
  const refused = await ravi.evaluate(async () => {
    const state = await (await fetch('/api/hub/state')).json();
    const target = state.activity[0];
    const response = await fetch(`/api/hub/activity/${target.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) });
    return { status: response.status, payments: state.activity.some((item) => 'payment' in item), medicines: state.profile.medicines.length };
  });
  assert.deepEqual(refused, { status: 403, payments: false, medicines: 0 });
  await tab(ravi, 'Chats').click();
  await ravi.getByText(/access to conversation summaries/).waitFor();

  // 5. Forced failure: shown as failed, nothing booked or charged, and Asha gets an alert.
  await meera.goto(`${BASE}/#/profile`);
  await meera.getByRole('button', { name: 'Make the next booking fail' }).click();
  await meera.goto(`${BASE}/#/request/ride`);
  await meera.getByRole('textbox', { name: 'Where to?' }).fill('Market');
  await meera.getByRole('button', { name: 'Show options' }).click();
  await meera.getByRole('button', { name: /^Choose Rapido Auto from Rapido$/ }).click();
  await meera.getByRole('button', { name: 'Book with Rapido' }).click();
  await meera.getByRole('heading', { name: 'Booking failed' }).waitFor();
  await meera.getByText(/Nothing was booked and nothing was charged/).waitFor();
  await asha.goto(`${BASE}/#/safety`);
  await asha.reload();
  await asha.getByText('Booking failed: Rapido Auto with Rapido').waitFor();

  // 6. Revoking Ravi takes effect on his very next request.
  await meera.goto(`${BASE}/#/family`);
  await meera.locator('li.member', { hasText: 'Ravi' }).getByRole('button', { name: 'Remove' }).click();
  await meera.getByText('Ravi no longer has access.').waitFor();
  await ravi.reload();
  await ravi.getByText('Your Care Circle access was removed.').waitFor();

  for (const page of [meera, asha]) {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scrolls sideways on a phone');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: seed, two caretakers join, appointment ride, delegated approval, viewer refused (UI and API), forced failure, revocation, no page errors');
  await browser.close();
})().catch((error) => { console.error(error.stack); process.exit(1); });
