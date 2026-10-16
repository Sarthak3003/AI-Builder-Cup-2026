import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { CareEvent, Conversation, Grant, HubState, Reminder } from './hub'
import { applyFilters, noFilters } from './filters'
import { booking, fail, makeCareState, makeState, mealQuote, rideQuote, stubApi } from './test-utils'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const now = () => Date.now() / 1000
const ride = () => booking(rideQuote())
const event = (overrides: Partial<CareEvent>): CareEvent => ({
  id: 'ev1', at: now() - 30, kind: 'booked', title: 'Booked (simulated)', detail: '', permission: 'view_activity', ref: null,
  severity: 'info', certainty: 'confirmed', actor: 'saathi', status: 'info', ...overrides,
})
const asha: Grant = { id: 'g1', name: 'Asha', relationship: 'Daughter', role: 'approver', permissions: ['approve', 'view_activity', 'view_medication'], status: 'active' }
const summary = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'conv1', channel: 'voice', at: now() - 120, service: 'ride', request_id: 'r-1', safety: null, status: 'CONFIRMED_SIMULATED',
  summary: { by: 'rules', text: 'Asked for a ride to Doctor.', confirmed: ['Booked Uber Go to Doctor with the Demo Ride Provider (simulated).'], suggestions: ['Ask whether someone could go along to the appointment.'] },
  ...overrides,
})

// ---------- Owner ----------

test('booking status and simulated payment status are shown as separate facts', async () => {
  const pending = booking(rideQuote({ payment_method: 'PAY_ON_COMPLETION' }))
  stubApi({}, makeState({ activity: [pending, booking(mealQuote(), 'COMPLETED_SIMULATED'), booking(rideQuote(), 'FAILED', { failure: 'The Demo Ride Provider could not take this booking (simulated failure). Nothing was booked or charged.' })] }))
  window.location.hash = '#/activity'
  render(<App />)
  expect(await screen.findByText('Booked · simulated')).toBeInTheDocument()
  expect(screen.getByText('Payment: Pending (simulated) · nothing charged yet')).toBeInTheDocument()
  expect(screen.getByText('Completed · simulated')).toBeInTheDocument()
  expect(screen.getByText('Payment: Paid (simulated) · no money charged')).toBeInTheDocument()
  expect(screen.getByText('Failed · nothing booked')).toBeInTheDocument()
  expect(screen.getByText('Payment: Not charged (simulated)')).toBeInTheDocument()
  expect(screen.queryByText(/Completed/, { selector: '.status.failed' })).not.toBeInTheDocument()
})

test('activity filters by type, status and date', () => {
  const items = [ride(), booking(mealQuote(), 'COMPLETED_SIMULATED'), booking(rideQuote(), 'FAILED'), { ...booking(rideQuote(), 'CANCELLED_SIMULATED'), created_at: now() - 10 * 86_400 }]
  expect(applyFilters(items, { ...noFilters, status: 'failed' }).map((i) => i.booking_status)).toEqual(['FAILED'])
  expect(applyFilters(items, { ...noFilters, service: 'food' }).map((i) => i.booking_status)).toEqual(['COMPLETED_SIMULATED'])
  expect(applyFilters(items, { ...noFilters, range: 'week' })).toHaveLength(3)
  expect(applyFilters(items, { ...noFilters, status: 'cancelled', range: 'week' })).toHaveLength(0)
})

test('a failed booking says nothing was booked or charged and offers a way forward', async () => {
  stubApi({ 'POST /quotes': () => ({ request_id: 'r-1', service_type: 'RIDE', quotes: [rideQuote()] }), 'POST /quotes/*/confirm': () => booking(rideQuote(), 'FAILED', { failure: 'x' }) })
  window.location.hash = '#/request/ride'
  render(<App />)
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Where to?' }), 'Doctor')
  await userEvent.click(screen.getByRole('button', { name: 'Get demo prices' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm demo booking' }))
  expect(await screen.findByRole('heading', { name: 'Booking failed' })).toBeInTheDocument()
  expect(screen.getByText(/Nothing was booked and nothing was charged/)).toBeInTheDocument()
  expect(screen.getByText('Not charged (simulated)')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Demo booking confirmed' })).not.toBeInTheDocument()
  expect(screen.queryByText('DEMO-RIDE-1042')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('a ride for an appointment shows the appointment and only suggests asking someone along', async () => {
  const appointment = { id: 'appt1', title: 'Check-up with Dr Mehta', with_whom: 'Dr Mehta', place: 'Sunrise Clinic', starts_at: now() + 86_400, notes: '', ride_request_id: null, created_by: 'owner' }
  const quote = rideQuote({ appointment_id: 'appt1', title: 'Uber Go to Check-up with Dr Mehta' })
  const state = makeState({ appointments: [appointment], quotes: [quote] })
  const calls = stubApi({ 'POST /quotes/*/confirm': () => booking(quote), 'POST /help': () => event({}) }, state)
  window.location.hash = '#/request/ride/r-1'
  render(<App />)
  expect(await screen.findByText(/For your appointment:/)).toHaveTextContent('Check-up with Dr Mehta')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm demo booking' }))
  expect(await screen.findByText(/Nobody is asked unless you choose to/)).toBeInTheDocument()
  expect(calls.some((call) => call.url.endsWith('/help'))).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Ask if someone can come with me' }))
  expect(calls.find((call) => call.url.endsWith('/help'))?.body).toEqual({ kind: 'accompany', appointment_id: 'appt1' })
  expect(await screen.findByText('Your Care Circle was asked. Nobody has agreed yet.')).toBeInTheDocument()
})

test('the owner invites someone with a role plus chosen sensitive permissions and gets a one-use link', async () => {
  const calls = stubApi({ 'POST /care-circle': () => ({ grant: asha, code: 'abc.def' }) })
  window.location.hash = '#/family'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Your Care Circle' })).toBeInTheDocument()
  const form = screen.getByRole('heading', { name: 'Add someone' }).closest('section') as HTMLElement
  await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Asha')
  await userEvent.click(within(form).getByRole('radio', { name: /Approver/ }))
  await userEvent.click(within(form).getByRole('checkbox', { name: 'See saved medicine details' }))
  expect(within(form).getByRole('checkbox', { name: 'Read full conversation transcripts' })).not.toBeChecked()
  await userEvent.click(within(form).getByRole('button', { name: 'Create invitation' }))
  expect(calls.find((call) => call.url.endsWith('/care-circle'))?.body).toEqual({ name: 'Asha', relationship: '', role: 'approver', extras: ['view_medication'] })
  expect(await within(form).findByDisplayValue(/#\/join\/abc\.def$/)).toBeInTheDocument()
})

test('the owner can change what is shared, remove a person and ask for help', async () => {
  const calls = stubApi({
    'PUT /profile': (body) => makeState({ care_circle: [asha], profile: body as HubState['profile'] }),
    'DELETE /care-circle/*': () => asha,
    'POST /help': () => event({ kind: 'help_requested' }),
  }, makeState({ care_circle: [asha] }))
  window.location.hash = '#/family'
  render(<App />)
  const person = (await screen.findByText('Asha', { selector: 'strong' })).closest('li') as HTMLElement
  expect(within(person).getByText('Approve or decline requests sent for approval')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Rides' }))
  const saved = calls.find((call) => call.method === 'PUT')?.body as HubState['profile']
  expect(saved.sharing).toEqual({ ride: false, food: true, medicine: true, appointments: true })
  await userEvent.click(within(person).getByRole('button', { name: 'Remove' }))
  expect(calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/care-circle/g1'))).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Ask my Care Circle for help' }))
  expect(calls.find((call) => call.url.endsWith('/help'))?.body).toEqual({ kind: 'help' })
})

test('activity details show the reference, timeline, sharing switch and separate demo controls', async () => {
  const booked = booking(rideQuote({ payment_method: 'PAY_ON_COMPLETION' }))
  const calls = stubApi({
    'PUT /bookings/*/sharing': () => ({ ...booked, shared: false }),
    'POST /bookings/*/complete': () => booking(rideQuote(), 'COMPLETED_SIMULATED'),
    'POST /bookings/*/payment/complete': () => booked,
  }, makeState({ demo_controls: true, activity: [booked], events: [event({ ref: booked.id, title: 'Booked (simulated): Uber Go to Doctor' })], conversations: [summary()] }))
  window.location.hash = `#/activity/${booked.id}`
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Uber Go to Doctor' })).toBeInTheDocument()
  expect(screen.getByText('DEMO-RIDE-1042 (simulated)')).toBeInTheDocument()
  expect(screen.getByText('12 Sample Lane, Demo Nagar (sample address)')).toBeInTheDocument()
  expect(screen.getByText('Booked (simulated): Uber Go to Doctor')).toBeInTheDocument()
  expect(screen.getByText('CONFIRMED_SIMULATED')).toBeInTheDocument()
  expect(screen.getByText('PENDING_SIMULATED')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Confirmed' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Suggestions (not done)' })).toBeInTheDocument()
  expect(screen.getByText('Automatic summary (not AI)')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Share this with my Care Circle' }))
  expect(calls.find((call) => call.url.endsWith('/sharing'))?.body).toEqual({ shared: false })
  await userEvent.click(screen.getByRole('button', { name: 'Demo: mark simulated payment complete' }))
  expect(calls.some((call) => call.url.endsWith(`/bookings/${booked.id}/payment/complete`))).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Demo: mark trip or delivery completed' }))
  expect(calls.some((call) => call.url.endsWith(`/bookings/${booked.id}/complete`))).toBe(true)
})

test('a booked ride reads like a ride app, and every part says it is a demo', async () => {
  const booked = booking(rideQuote())
  const calls = stubApi({ 'POST /help': () => event({ kind: 'help_requested' }) }, makeState({ activity: [booked] }))
  window.location.hash = `#/activity/${booked.id}`
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Demo driver on the way' })).toBeInTheDocument()
  expect(screen.getByText('Pickup from Home in about 6 min (estimate). Simulated: no real driver will arrive.')).toBeInTheDocument()
  expect(screen.getByText('Demo map · not live')).toBeInTheDocument()
  expect(screen.getByText('Ride PIN (demo)')).toBeInTheDocument()
  expect(screen.getByText('2 9 5 7')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Demo driver' })).toBeInTheDocument()
  expect(screen.getByText('Not a real person · Hatchback (sample)')).toBeInTheDocument()
  expect(screen.getByText('DEMO 1042')).toBeInTheDocument()
  expect(screen.getByText('5.3 km · about 21 min')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Call the demo driver' }))
  expect(screen.getByText('Demo only: there is no driver to call.')).toHaveAttribute('role', 'status')
  await userEvent.click(screen.getByRole('button', { name: 'Help' }))
  expect(calls.find((call) => call.url.endsWith('/help'))?.body).toEqual({ kind: 'help', note: 'Help with Uber Go to Doctor' })
  expect(screen.getByRole('button', { name: 'Cancel ride' })).toBeInTheDocument()
})

test('a meal order reads like a food delivery app, and every part says it is a demo', async () => {
  const ordered = booking(mealQuote())
  const calls = stubApi({ 'POST /help': () => event({ kind: 'help_requested' }) }, makeState({ activity: [ordered] }))
  window.location.hash = `#/activity/${ordered.id}`
  render(<App />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Demo Home Kitchen' })).toBeInTheDocument()
  expect(screen.getByText(/· 1 item$/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Preparing your order' })).toBeInTheDocument()
  expect(screen.getByText(/^Arrives by about .+ · demo estimate$/)).toBeInTheDocument()
  expect(document.querySelector('.eta-badge')).toHaveTextContent(/^2[45] mins$/)
  expect(screen.getByText('Demo map · not live')).toBeInTheDocument()
  expect(screen.getByText(/· 12 Sample Lane, Demo Nagar \(sample address\)/)).toBeInTheDocument()
  expect(screen.getByText('Not a real person · picks up when the food is ready')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Call the demo delivery partner' }))
  expect(screen.getByText('Demo only: there is no delivery partner to call.')).toHaveAttribute('role', 'status')
  expect(document.querySelector('.order-items')).toHaveTextContent('Vegetable khichdi × 1, vegetarian₹85')
  expect(screen.getByText('DEMO-FOOD-1042 (simulated)')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Help' }))
  expect(calls.find((call) => call.url.endsWith('/help'))?.body).toEqual({ kind: 'help', note: 'Help with Vegetable khichdi from Demo Home Kitchen' })
  expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
})

test('a caretaker sees the meal order page without the address, payment or partner call', async () => {
  const shared = { ...booking(mealQuote()), payment: undefined }
  stubApi({}, makeCareState(['view_activity'], { activity: [shared] }))
  window.location.hash = `#/activity/${shared.id}`
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Preparing your order' })).toBeInTheDocument()
  expect(screen.queryByText('Delivering to')).not.toBeInTheDocument()
  expect(screen.queryByText(/Payment:/)).not.toBeInTheDocument()
  expect(screen.getByText('Payment details are not shared with you.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument()
})

test('the ride page shows no PIN or driver once a ride is over or before it is booked', async () => {
  const done = booking(rideQuote(), 'COMPLETED_SIMULATED')
  const waiting = booking(rideQuote(), 'AWAITING_APPROVAL', { approval_reason: 'Above the ₹100 approval limit.' })
  stubApi({}, makeState({ activity: [done, waiting] }))
  window.location.hash = `#/activity/${done.id}`
  const { unmount } = render(<App />)
  expect(await screen.findByRole('heading', { name: 'Arrived at Doctor' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Demo driver' })).toBeInTheDocument()
  expect(screen.queryByText('Ride PIN (demo)')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Call the demo driver' })).not.toBeInTheDocument()
  unmount()
  window.location.hash = `#/activity/${waiting.id}`
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument()
  expect(screen.getByText('Above the ₹100 approval limit. Nothing is booked until an approver agrees.')).toBeInTheDocument()
  expect(screen.queryByText('Ride PIN (demo)')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Demo driver' })).not.toBeInTheDocument()
})

test('upcoming plans flag missed reminders without claiming a medicine was taken', async () => {
  const reminders: Reminder[] = [
    { id: 'r1', title: 'Reorder BP tablet', kind: 'medicine', due_at: now() - 3600, notes: '', done_at: null, status: 'missed', created_by: 'owner' },
  ]
  const calls = stubApi({ 'POST /reminders/*/done': () => ({ ...reminders[0], status: 'done' }) }, makeState({ reminders }))
  window.location.hash = '#/activity'
  render(<App />)
  expect(await screen.findByText('Missed · follow up')).toBeInTheDocument()
  expect(screen.getByText('A reminder is not proof that a medicine was taken.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: "I've done this" }))
  expect(calls.some((call) => call.url.endsWith('/reminders/r1/done'))).toBe(true)
})

test('demo controls load Meera with caretaker links and arm a failure, only when enabled', async () => {
  const seeded = makeState({ profile: { ...makeState().profile, name: 'Meera' }, demo_controls: true })
  const calls = stubApi({ 'POST /demo/reset': () => ({ scenario: 'meera', state: seeded, invites: [{ name: 'Asha', role: 'approver', code: 'c1.s' }, { name: 'Ravi', role: 'viewer', code: 'c2.s' }] }), 'POST /demo/fail-next': () => ({ fail_next: true }) }, makeState({ demo_controls: true }))
  window.location.hash = '#/profile'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: "Load Meera's demo" }))
  expect(calls.some((call) => call.url.endsWith('/demo/reset'))).toBe(false)
  expect(screen.getByRole('button', { name: 'Keep my data' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Yes, reset the demo' }))
  expect(await screen.findByDisplayValue(/#\/join\/c1\.s$/)).toBeInTheDocument()
  expect(screen.getByDisplayValue(/#\/join\/c2\.s$/)).toBeInTheDocument()
  expect(calls.find((call) => call.url.endsWith('/demo/reset'))?.body).toEqual({ scenario: 'meera', confirm: true })
  await userEvent.click(screen.getByRole('button', { name: 'Make the next booking fail' }))
  expect(calls.some((call) => call.url.endsWith('/demo/fail-next'))).toBe(true)
})

test('a fresh demo reset asks first, then opens setup', async () => {
  const fresh = makeState({ demo_controls: true, onboarding: { ...makeState().onboarding!, completed: false, started_at: null, current: 'welcome' } })
  const calls = stubApi({ 'POST /demo/reset': () => ({ scenario: 'fresh', state: fresh, invites: [] }) }, makeState({ demo_controls: true }))
  window.location.hash = '#/profile'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Start fresh at setup' }))
  await userEvent.click(screen.getByRole('button', { name: 'Keep my data' }))
  expect(calls.some((call) => call.url.endsWith('/demo/reset'))).toBe(false)
  expect(screen.getByRole('button', { name: 'Start fresh at setup' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Start fresh at setup' }))
  await userEvent.click(screen.getByRole('button', { name: 'Yes, reset the demo' }))
  expect(await screen.findByText('Demo reset. Setup starts now.')).toBeInTheDocument()
  expect(window.location.hash).toBe('#/onboarding')
  expect(calls.find((call) => call.url.endsWith('/demo/reset'))?.body).toEqual({ scenario: 'fresh', confirm: true })
})

test('without demo controls the profile has no seed or failure buttons', async () => {
  stubApi()
  window.location.hash = '#/profile'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Load Meera's demo/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Start fresh at setup' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Switch account' })).not.toBeInTheDocument()
})

test('in a loaded demo the profile switches between Meera and her caretakers by name', async () => {
  const people = [{ id: 'owner', name: 'Meera', role: 'Older adult' }, { id: 'g1', name: 'Asha', role: 'Approver' }, { id: 'g2', name: 'Ravi', role: 'Viewer' }]
  const meera = makeState({ profile: { ...makeState().profile, name: 'Meera' }, demo_people: people, demo_person: 'owner' })
  const asha = makeCareState(['view_activity', 'approve'], { demo_people: people, demo_person: 'g1' })
  const calls = stubApi({ 'POST /demo/switch': (body) => ((body as { to: string }).to === 'owner' ? meera : asha) }, meera)
  window.location.hash = '#/'
  render(<App />)
  await userEvent.click(await screen.findByRole('link', { name: 'Open profile' }))
  const accounts = await screen.findByRole('region', { name: 'Switch account' })
  expect(accounts).toHaveTextContent('You are Meera · Older adult')
  expect(within(accounts).getByRole('button', { name: /Meera/ })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(within(accounts).getByRole('button', { name: /Asha/ }))
  expect(calls.find((call) => call.url.endsWith('/demo/switch'))?.body).toEqual({ to: 'g1' })
  expect(await screen.findByRole('heading', { name: 'Supporting Meera' })).toBeInTheDocument()
  expect(window.location.hash).toBe('#/')
  expect(screen.queryByRole('region', { name: 'Switch account' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: 'Care Circle and settings' }))
  const back = await screen.findByRole('region', { name: 'Switch account' })
  expect(back).toHaveTextContent('You are Asha · Approver')
  await userEvent.click(within(back).getByRole('button', { name: /Meera/ }))
  expect(calls.filter((call) => call.url.endsWith('/demo/switch')).at(-1)?.body).toEqual({ to: 'owner' })
  expect(await screen.findByRole('link', { name: 'Open profile' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Supporting Meera' })).not.toBeInTheDocument()
})

// ---------- Caretaker ----------

// What the server sends a view-only caretaker: labels instead of addresses, and no payment.
function shared() {
  const full = ride()
  return { ...full, payment: undefined, trip: undefined, details: { pickup: { label: 'Home' }, destination: { label: 'Doctor' }, distance_km: 5.3 } }
}

test('the owner and a caretaker see the same ride event; the caretaker without addresses or payment', async () => {
  const booked = event({ id: 'ev-ride', ref: ride().id, title: 'Booked (simulated): Uber Go to Doctor', detail: 'Demo Ride Provider · DEMO-RIDE-1042. Demo ride — no real driver will arrive.' })
  stubApi({}, makeState({ activity: [ride()], events: [booked] }))
  window.location.hash = '#/activity'
  const { unmount } = render(<App />)
  const mine = (await screen.findByRole('heading', { name: 'Timeline' })).closest('section') as HTMLElement
  expect(within(mine).getByText('Booked (simulated): Uber Go to Doctor')).toBeInTheDocument()
  unmount()

  stubApi({}, makeCareState(['view_activity'], { activity: [shared()], events: [booked] }))
  window.location.hash = `#/activity/${ride().id}`
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Uber Go to Doctor' })).toBeInTheDocument()
  expect(screen.getByText('Booked (simulated): Uber Go to Doctor')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Demo driver on the way' })).toBeInTheDocument()
  expect(screen.queryByText('Ride PIN (demo)')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Demo driver' })).not.toBeInTheDocument()
  expect(screen.getByText('Home')).toBeInTheDocument()
  expect(screen.queryByText(/Sample Lane/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Payment:/)).not.toBeInTheDocument()
  expect(screen.getByText('not shared with you')).toBeInTheDocument()
})

test('in the demo a view-only caretaker can try a refused action and sees the server say no', async () => {
  const calls = stubApi({
    'POST /bookings/*/cancel': () => fail(403, { detail: 'Only the account owner can perform this action.' }),
    'POST /bookings/*/decision': () => fail(403, { detail: 'Not shared with you: approve or decline requests sent for approval.' }),
  }, makeCareState(['view_activity'], { activity: [shared()], demo_controls: true }))
  window.location.hash = `#/activity/${ride().id}`
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Try to cancel this booking' }))
  expect(await screen.findByText('Refused by the server: Only the account owner can perform this action.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Try to approve this booking' }))
  expect(await screen.findByText('Refused by the server: Not shared with you: approve or decline requests sent for approval.')).toBeInTheDocument()
  expect(calls.filter((call) => call.url.includes('/bookings/')).map((call) => call.url)).toEqual([
    `/api/hub/bookings/${ride().id}/cancel`, `/api/hub/bookings/${ride().id}/decision`,
  ])
})

test('without demo controls a caretaker gets no permission-check buttons', async () => {
  stubApi({}, makeCareState(['view_activity'], { activity: [shared()] }))
  window.location.hash = `#/activity/${ride().id}`
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Uber Go to Doctor' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Try to cancel this booking' })).not.toBeInTheDocument()
})

test('an invitation link joins this browser as a caretaker', async () => {
  const calls = stubApi({ 'POST /caregiver/join': () => makeCareState(['view_activity']) })
  window.location.hash = '#/join/abc.def'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Join a Care Circle' })).toBeInTheDocument()
  expect(screen.getByText(/open this link in a private window/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Join as caretaker' }))
  expect(calls.find((call) => call.url.endsWith('/caregiver/join'))?.body).toEqual({ code: 'abc.def' })
  expect(await screen.findByRole('heading', { name: 'Supporting Meera' })).toBeInTheDocument()
})

test('the overview answers what needs action, what is coming and what changed', async () => {
  const waiting = booking(mealQuote(), 'AWAITING_APPROVAL')
  stubApi({}, makeCareState(['view_activity', 'approve', 'receive_alerts'], {
    approvals: [waiting], activity: [waiting, ride()],
    appointments: [{ id: 'a1', title: 'Check-up with Dr Mehta', with_whom: '', place: 'Sunrise Clinic', starts_at: now() + 86_400, notes: '', ride_request_id: 'x', created_by: 'owner' }],
    reminders: [{ id: 'r1', title: 'Call the clinic', kind: 'appointment', due_at: now() - 60, notes: '', done_at: null, status: 'missed', created_by: 'owner' }],
    events: [event({ kind: 'suspected_scam', title: 'Possible scam message', permission: 'receive_alerts', severity: 'attention', certainty: 'suspected', status: 'open' })],
  }))
  render(<App />)
  const attention = (await screen.findByRole('heading', { name: 'Needs your attention' })).closest('section') as HTMLElement
  expect(within(attention).getByRole('link', { name: '1 request waiting for your approval' })).toHaveAttribute('href', '#/approvals')
  expect(within(attention).getByRole('link', { name: '1 alert to review' })).toHaveAttribute('href', '#/safety')
  expect(within(attention).getByText(/Missed reminder: Call the clinic/)).toHaveTextContent('does not mean anything was or was not done')
  expect(screen.getByText(/Check-up with Dr Mehta/)).toBeInTheDocument()
  expect(screen.getByText('Possible scam message (suspected, not confirmed)')).toBeInTheDocument()
})

test('an approver approves, asks first, and sees a clear message if someone else already decided', async () => {
  const waiting = booking(mealQuote(), 'AWAITING_APPROVAL', { approval_reason: 'Above the ₹100 approval limit.' })
  let decisions = 0
  const calls = stubApi({ 'POST /bookings/*/decision': () => (++decisions === 3 ? fail(409, { detail: 'Already approved by Ravi.' }) : { ...waiting }) },
    makeCareState(['view_activity', 'approve'], { approvals: [waiting], activity: [waiting] }))
  window.location.hash = '#/approvals'
  render(<App />)
  expect(await screen.findByText('Why: Above the ₹100 approval limit.')).toBeInTheDocument()
  await userEvent.type(screen.getByRole('textbox', { name: 'Ask a question first' }), 'Is this lunch?')
  await userEvent.click(screen.getByRole('button', { name: 'Send question' }))
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
  expect(calls.filter((call) => call.url.endsWith('/decision')).map((call) => call.body)).toEqual([{ action: 'ask', note: 'Is this lunch?' }, { action: 'approve', note: '' }])
  await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
  expect(await screen.findByText('Already approved by Ravi.')).toBeInTheDocument()
})

test('a caretaker without a permission sees why, not an empty page', async () => {
  stubApi({}, makeCareState(['view_activity']))
  window.location.hash = '#/approvals'
  render(<App />)
  expect(await screen.findByText(/Meera has not given you access to approving requests/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  window.location.hash = '#/conversations'
  expect(await screen.findByText(/access to conversation summaries/)).toBeInTheDocument()
})

test('summaries show confirmed actions apart from suggestions; transcripts only with permission', async () => {
  stubApi({ 'GET /conversations/*/transcript': () => ({ id: 'conv1', transcript: [{ role: 'user', text: 'Take me to my doctor' }, { role: 'assistant', text: 'Rides to Sunrise Clinic' }] }) },
    makeCareState(['view_activity', 'view_summaries'], { conversations: [summary()] }))
  window.location.hash = '#/conversations'
  const { unmount } = render(<App />)
  expect(await screen.findByText('Booked Uber Go to Doctor with the Demo Ride Provider (simulated).')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Suggestions (not done)' })).toBeInTheDocument()
  expect(screen.getByText(/Full transcripts are not shared with you/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Show transcript' })).not.toBeInTheDocument()
  unmount()

  stubApi({ 'GET /conversations/*/transcript': () => ({ id: 'conv1', transcript: [{ role: 'user', text: 'Take me to my doctor' }] }) },
    makeCareState(['view_activity', 'view_summaries', 'view_transcripts'], { conversations: [summary()] }))
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Show transcript' }))
  expect(await screen.findByText('Take me to my doctor')).toBeInTheDocument()
})

test('safety separates suspicions from confirmed events and lets alert holders resolve them', async () => {
  const calls = stubApi({ 'POST /events/*/resolve': () => ({}) }, makeCareState(['view_activity', 'receive_alerts'], {
    events: [
      event({ id: 'e1', kind: 'suspected_scam', title: 'Possible scam message', permission: 'receive_alerts', severity: 'attention', certainty: 'suspected', status: 'open' }),
      event({ id: 'e2', kind: 'booking_failed', title: 'Booking failed: Uber Go to Doctor', permission: 'receive_alerts', severity: 'attention', status: 'open' }),
    ],
  }))
  window.location.hash = '#/safety'
  render(<App />)
  expect(await screen.findByText('Suspected · not confirmed')).toBeInTheDocument()
  expect(screen.getByText('Confirmed event')).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: 'Mark as handled' })[0])
  expect(calls.some((call) => call.url.endsWith('/events/e1/resolve'))).toBe(true)
})

test('settings list what the caretaker can and cannot do, and leaving ends the caretaker view', async () => {
  const calls = stubApi({}, makeCareState(['view_activity']))
  window.location.hash = '#/circle'
  render(<App />)
  expect(await screen.findByText(/See shared rides, orders and appointments/)).toHaveTextContent('allowed')
  expect(screen.getByText(/Read full conversation transcripts/)).toHaveTextContent('not allowed')
  await userEvent.click(screen.getByRole('button', { name: 'Leave the caretaker view on this browser' }))
  expect(calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/session'))).toBe(true)
})

test('updates arrive without refreshing, and a revoked caretaker is told access was removed', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let state = 0
  stubApi({ 'GET /state': () => (++state === 1 ? makeCareState(['view_activity', 'approve'], { approvals: [booking(mealQuote(), 'AWAITING_APPROVAL')] }) : fail(403, { detail: 'Your Care Circle access was removed.' })) },
    makeCareState(['view_activity', 'approve']))
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Supporting Meera' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /request waiting/ })).not.toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
  expect(await screen.findByRole('link', { name: '1 request waiting for your approval' })).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
  expect(await screen.findByText('Your Care Circle access was removed.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Supporting Meera' })).not.toBeInTheDocument()
})
