// Local end-to-end run against a running backend (8000) and frontend dev server (5173), on a phone-sized screen.
// Usage: SAATHI_BROWSER_CHANNEL=chrome node scripts/e2e-local.cjs   (default channel: msedge)
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve(__dirname, '../frontend')] }));

const BASE = 'http://127.0.0.1:5173';
const PHONE = { width: 390, height: 844 };
const tab = (page, name) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name, exact: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SAATHI_BROWSER_CHANNEL || 'msedge' });
  const owner = await (await browser.newContext({ viewport: PHONE })).newPage();
  const errors = [];
  owner.on('pageerror', (error) => errors.push(error.message));

  await owner.goto(BASE);
  await owner.getByText('Hello, Friend.').waitFor();

  // Profile: name, larger text, caregiver approvals above Rs 100.
  await tab(owner, 'Profile').click();
  await owner.getByLabel('Your name', { exact: true }).fill('Demo Friend');
  await owner.getByLabel('Larger text', { exact: true }).check();
  await owner.getByLabel('Require caregiver approval', { exact: false }).check();
  await owner.getByLabel('Approval limit (₹)', { exact: true }).fill('100');
  await owner.getByRole('button', { name: 'Save preferences' }).click();
  await owner.getByText('Preferences saved for every service.').waitFor();

  // Family: invite a caregiver, who joins from a second browser context.
  await tab(owner, 'Family').click();
  await owner.getByRole('button', { name: 'Create invitation' }).click();
  const invitation = await owner.getByLabel('Private invitation code').inputValue();
  const caregiver = await (await browser.newContext({ viewport: PHONE })).newPage();
  await caregiver.goto(BASE);
  await caregiver.getByText('Hello, Friend.').waitFor();
  await tab(caregiver, 'Family').click();
  await caregiver.getByLabel('Invitation code', { exact: true }).fill(invitation);
  await caregiver.getByRole('button', { name: 'Join as caregiver' }).click();
  await caregiver.getByRole('heading', { name: 'Caregiver approvals' }).waitFor();

  // Food above the limit: the owner confirms, then the caregiver approves.
  await tab(owner, 'Home').click();
  await owner.getByRole('link', { name: /Order food/ }).click();
  await owner.getByRole('button', { name: 'Show options' }).click();
  await owner.getByRole('button', { name: 'Choose Vegetable khichdi from Swiggy' }).click();
  await owner.getByRole('button', { name: 'Book with Swiggy' }).click();
  await owner.getByRole('heading', { name: 'Sent for approval' }).waitFor();
  await owner.getByRole('link', { name: 'See my activity' }).click();
  await owner.getByText('Waiting for caregiver', { exact: true }).waitFor();
  await caregiver.getByRole('button', { name: 'Refresh activity' }).click();
  await caregiver.getByRole('button', { name: 'Approve', exact: true }).click();
  await owner.getByRole('button', { name: 'Refresh activity' }).click();
  await owner.getByText('Booked · demo only', { exact: true }).waitFor();

  // Ride below the limit, asked as a message: booked straight away.
  await tab(owner, 'Home').click();
  await owner.getByRole('link', { name: /Book a ride/ }).click();
  await owner.getByLabel('Where to?', { exact: true }).fill('Community centre');
  await owner.getByText('More options', { exact: true }).click();
  await owner.getByLabel('How are you asking?').selectOption('message');
  await owner.getByRole('button', { name: 'Show options' }).click();
  await owner.getByRole('button', { name: 'Choose Rapido Auto from Rapido' }).click();
  await owner.getByRole('button', { name: 'Book with Rapido' }).click();
  await owner.getByRole('heading', { name: 'All done' }).waitFor();
  await owner.getByRole('link', { name: 'See my activity' }).click();
  await owner.getByRole('heading', { name: 'Your activity' }).waitFor();
  await owner.getByRole('heading', { name: 'Rapido Auto' }).waitFor();

  // Medicine always needs approval once caregiver approvals are on; the caregiver declines.
  await tab(owner, 'Home').click();
  await owner.getByRole('link', { name: /Medicine request/ }).click();
  await owner.getByRole('button', { name: 'Show options' }).click();
  await owner.getByRole('button', { name: 'Choose Saved medicine A from Demo pharmacy' }).click();
  await owner.getByRole('button', { name: 'Book with Demo pharmacy' }).click();
  await owner.getByRole('heading', { name: 'Sent for approval' }).waitFor();
  await caregiver.getByRole('button', { name: 'Refresh activity' }).click();
  await caregiver.getByRole('button', { name: 'Decline', exact: true }).click();
  await owner.getByRole('link', { name: 'See my activity' }).click();
  await owner.getByRole('button', { name: 'Refresh activity' }).click();
  await owner.getByText('Declined by caregiver', { exact: true }).waitFor();

  // Apps: turning Uber off keeps it out of the next ride comparison.
  await tab(owner, 'Apps').click();
  await owner.getByRole('switch', { name: 'Use Uber' }).click();
  await owner.waitForFunction(() => document.querySelector('[aria-label="Use Uber"]')?.getAttribute('aria-checked') === 'false');
  await tab(owner, 'Home').click();
  await owner.getByRole('link', { name: 'Book a ride Ola · Rapido (demo)' }).waitFor();

  // Everything survives a reload; screenshots are for the submission.
  await owner.reload();
  await owner.getByText('Hello, Demo Friend.').waitFor();
  await tab(owner, 'Activity').click();
  assert.equal(await owner.locator('.activity-list article').count(), 3);
  await owner.locator('.activity-list').screenshot({ path: 'submission/saathi-activity.png' });
  await tab(owner, 'Home').click();
  await owner.evaluate(() => window.scrollTo(0, 0));
  await owner.screenshot({ path: 'submission/saathi-home.png', fullPage: false });
  assert(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scrolls sideways on a phone');

  // Revoking access takes effect for the caregiver straight away.
  await tab(owner, 'Family').click();
  await owner.getByRole('button', { name: 'Revoke caregiver access' }).click();
  await owner.getByText('Previous caregiver access and invitations are revoked.').waitFor();
  await caregiver.getByRole('button', { name: 'Refresh activity' }).click();
  await caregiver.getByText('Caregiver access was revoked.', { exact: false }).waitFor();

  assert.deepEqual(errors, []);
  console.log('PASS: profile, large text, caregiver link, food approval, ride, medicine decline, app switch, reload persistence, phone overflow, revocation, no page errors');
  await browser.close();
})().catch((error) => { console.error(error.stack); process.exit(1); });
