// The plan's scripted hackathon demo, end to end, phone-sized, against a running backend (8000) and
// frontend (5173) with demo controls on. Meera and her caretakers use separate browser contexts.
// Part 1 is the scripted demo from a fresh start; part 2 is Meera's seeded approval demo.
// Usage: SAATHI_BROWSER_CHANNEL=chrome node scripts/e2e-local.cjs   (default channel: msedge)
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve(__dirname, '../frontend')] }));

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const PHONE = { width: 390, height: 844 };
const tab = (page, name) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: new RegExp(`^${name}\\b`) });

async function expand(page, summary) {
  const group = page.locator('details', { has: page.locator(':scope > summary', { hasText: summary }) });
  if (await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
}

async function demoTools(page) {
  await page.goto(`${BASE}/#/profile`);
  await expand(page, 'Prototype tools');
}

async function rideToDoctor(page) {
  await page.goto(`${BASE}/#/request/ride`);
  await page.getByRole('combobox', { name: 'Where to?' }).selectOption({ label: 'Doctor' });
  await page.getByRole('button', { name: 'See prices' }).click();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SAATHI_BROWSER_CHANNEL || 'msedge' });
  const open = async () => (await browser.newContext({ viewport: PHONE })).newPage();
  const errors = [];
  const meera = await open();
  meera.on('pageerror', (error) => errors.push(error.message));

  // 0. Fresh start: the demo reset asks for confirmation, then opens setup.
  await demoTools(meera);
  await meera.getByRole('button', { name: 'Start fresh at setup' }).click();
  await meera.getByRole('button', { name: 'Yes, reset the demo' }).click();
  await meera.getByRole('heading', { name: 'Welcome' }).waitFor();

  // 1. Set up as Meera: usual pickup, Doctor, Demo Ride Provider, demo wallet, a view-only caretaker.
  await meera.getByRole('textbox', { name: 'What should Saathi call you?' }).fill('Meera');
  await meera.getByRole('button', { name: 'Continue' }).click();
  await meera.getByRole('heading', { name: 'Comfort and accessibility' }).waitFor();
  await meera.getByRole('checkbox', { name: 'Larger text' }).check();
  await meera.getByRole('button', { name: 'Continue' }).click();
  await meera.getByRole('heading', { name: 'Saved places' }).waitFor();
  for (const place of ['Home', 'Doctor']) {
    if (place !== 'Home') await meera.getByRole('button', { name: 'Add another place' }).click();
    await meera.getByRole('button', { name: `Use sample: ${place}` }).click();
    await meera.getByRole('button', { name: 'Save place' }).click();
    await meera.getByRole('list', { name: 'Saved places' }).getByText(place, { exact: true }).waitFor();
  }
  await meera.getByRole('button', { name: 'Continue' }).click();
  await meera.getByRole('heading', { name: 'Care Circle' }).waitFor();
  await meera.getByRole('textbox', { name: 'Their name' }).fill('Ravi');
  await meera.getByRole('textbox', { name: 'How you know them (optional)' }).fill('Son');
  await meera.getByRole('button', { name: 'Add to my Care Circle' }).click();
  const raviLink = await meera.getByRole('textbox', { name: 'Invitation link for Ravi' }).inputValue();
  await meera.getByRole('button', { name: 'Continue' }).click();
  await meera.getByRole('heading', { name: 'Demo services' }).waitFor();
  await expand(meera, 'Rides');
  await meera.getByRole('switch', { name: 'Use Demo Ride Provider' }).click();
  await meera.locator('[role="switch"][aria-label="Use Demo Ride Provider"][aria-checked="true"]').waitFor();
  await meera.getByRole('button', { name: 'Continue' }).click();
  await meera.getByRole('heading', { name: 'Payment (simulated)' }).waitFor();
  await meera.getByRole('radio', { name: /^Demo wallet \(simulated\)/ }).check();
  await meera.getByRole('button', { name: 'Continue' }).click();
  await meera.getByRole('heading', { name: 'Review and finish' }).waitFor();
  await meera.getByText('Ravi can see shared activity (view only)').waitFor();
  await meera.getByRole('button', { name: 'Yes, finish setup' }).click();
  await meera.getByRole('heading', { name: 'You are all set, Meera' }).waitFor();

  // 2. A ride to the doctor with the Demo Ride Provider's own option: the price and the demo warning first.
  await rideToDoctor(meera);
  await meera.getByRole('button', { name: 'Choose Demo Ride from Demo Ride Provider' }).click();
  await meera.getByRole('heading', { name: 'Check and confirm' }).waitFor();
  await meera.getByText('Demo ride — no real driver will arrive.').waitFor();
  assert.equal(await meera.locator('.review-price').innerText(), '₹94');

  // 3. Confirm: a stable demo reference, separate booking and payment statuses, no money charged.
  await meera.getByRole('button', { name: 'Confirm booking' }).click();
  await meera.getByRole('heading', { name: 'Demo booking confirmed' }).waitFor();
  await meera.getByText('DEMO-RIDE-1042').waitFor();
  await meera.getByText('Booked · simulated').waitFor();
  await meera.getByText('Paid (simulated) · no money charged').waitFor();
  await meera.getByText(/^No money charged\./).waitFor();
  const detail = await meera.getByRole('link', { name: 'Track ride' }).getAttribute('href');
  await meera.goto(`${BASE}/${detail}`);
  await meera.getByRole('heading', { name: 'Demo driver on the way' }).waitFor();
  await meera.getByText('Demo map · not live').waitFor();
  await meera.getByText('Ride PIN (demo)').waitFor();
  await meera.getByText('Not a real person · Car (sample)').waitFor();

  // 4. The same event in Meera's timeline and in Ravi's Care Circle view, without addresses or payment.
  await tab(meera, 'Activity').click();
  const mine = meera.getByRole('region', { name: 'Timeline' });
  await mine.getByText('Booked (simulated): Demo Ride to Doctor').waitFor();
  const ravi = await open();
  ravi.on('pageerror', (error) => errors.push(error.message));
  await ravi.goto(raviLink);
  await ravi.getByRole('button', { name: 'Join as caretaker' }).click();
  await ravi.getByRole('heading', { name: 'Supporting Meera' }).waitFor();
  await tab(ravi, 'Activity').click();
  await ravi.getByRole('region', { name: 'Timeline' }).getByText('Booked (simulated): Demo Ride to Doctor').waitFor();
  await ravi.goto(`${BASE}/${detail}`);
  await ravi.getByRole('heading', { name: 'Demo Ride to Doctor' }).waitFor();
  const seen = await ravi.locator('main').innerText();
  assert(!/Sample Lane|Example Road|Paid \(simulated\)|Ride PIN/.test(seen), 'Ravi sees an address, payment or ride PIN he was not given');

  // 5. Ravi tries what view-only access does not allow; the server refuses.
  await ravi.getByRole('button', { name: 'Try to cancel this booking' }).click();
  await ravi.getByText('Refused by the server: Only the account owner can perform this action.').waitFor();
  await ravi.getByRole('button', { name: 'Try to approve this booking' }).click();
  await ravi.getByText(/^Refused by the server: Not shared with you/).waitFor();

  // 6. A forced failure: neither booking nor payment is marked successful, and the first ride is unchanged.
  const armed = await meera.evaluate(async () => {
    const response = await fetch('/api/hub/demo/fail-next', { method: 'POST' });
    return response.ok;
  });
  assert(armed, 'Could not arm the API-only failure test');
  await rideToDoctor(meera);
  await meera.getByRole('button', { name: 'Choose Demo Ride from Demo Ride Provider' }).click();
  await meera.getByRole('button', { name: 'Confirm booking' }).click();
  await meera.getByRole('heading', { name: 'Booking failed' }).waitFor();
  await meera.getByText('Failed · nothing booked').waitFor();
  await meera.getByText('Not charged (simulated)').waitFor();
  await meera.goto(`${BASE}/${detail}`);
  await meera.getByText('Booked · simulated').first().waitFor();

  // Part 2. Meera's seeded demo: Ola Mini (₹125) is above her ₹100 limit, so Asha must approve.
  await demoTools(meera);
  await meera.getByRole('button', { name: "Load Meera's demo" }).click();
  await meera.getByRole('button', { name: 'Yes, reset the demo' }).click();
  await meera.getByText("Meera's demo is loaded.").waitFor();
  const ashaLink = await meera.getByRole('textbox', { name: 'Asha (approver)' }).inputValue();
  const asha = await open();
  asha.on('pageerror', (error) => errors.push(error.message));
  await asha.goto(ashaLink);
  await asha.getByRole('button', { name: 'Join as caretaker' }).click();
  await asha.getByRole('heading', { name: 'Supporting Meera' }).waitFor();
  await rideToDoctor(meera);
  await meera.getByRole('button', { name: 'Choose Ola Mini from Ola' }).click();
  await meera.getByText(/must approve this first/).waitFor();
  await meera.getByRole('button', { name: 'Confirm booking' }).click();
  await meera.getByRole('heading', { name: 'Sent for approval' }).waitFor();
  await tab(asha, 'Approvals').click();
  await asha.reload();
  await asha.locator('article', { hasText: 'Ola Mini to Doctor' }).getByRole('button', { name: 'Approve' }).click();
  await asha.getByText(/Approved\./).waitFor();
  await meera.goto(`${BASE}/#/activity`);
  await meera.locator('article.activity', { hasText: 'Ola Mini to Doctor' }).getByText('Booked · simulated').waitFor();

  for (const page of [meera, ravi, asha]) {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scrolls sideways on a phone');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: fresh reset, setup as Meera, ride quote, confirm (DEMO-RIDE-1042), shared timeline, viewer refused by the server, forced failure, seeded approval, no page errors');
  await browser.close();
})().catch((error) => { console.error(error.stack); process.exit(1); });
