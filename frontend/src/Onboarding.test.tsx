import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { HubState, Profile } from './hub'
import { demoServices, fail, makeState, progress, stubApi } from './test-utils'

beforeEach(() => { window.history.replaceState(null, '', '/') })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const fresh = (overrides: Partial<HubState> = {}) =>
  makeState({ onboarding: progress(0), places: [], services: demoServices('SETUP_REQUIRED'), profile: { ...makeState().profile, payment_method: null }, ...overrides })
const sent = (calls: ReturnType<typeof stubApi>, method: string, end: string) => calls.filter((call) => call.method === method && call.url.endsWith(end)).map((call) => call.body)

test('a brand-new person is taken to setup once, step 1 of 7, with the demo explained', async () => {
  stubApi({}, fresh())
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
  expect(window.location.hash).toBe('#/onboarding')
  expect(screen.getByText('Step 1 of 7')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '1')
  expect(screen.getByText(/Every provider, booking and payment here is simulated/)).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'What should Saathi call you?' })).toHaveValue('')
})

test('continue saves the step on the server and moves on, focusing the new step', async () => {
  const calls = stubApi({ 'PATCH /onboarding/profile': () => fresh({ onboarding: progress(1) }) }, fresh())
  window.location.hash = '#/onboarding'
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'What should Saathi call you?' }), 'Meera')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Preferred language' }), 'hi-IN')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'Comfort and accessibility' })).toHaveFocus()
  expect(window.location.hash).toBe('#/onboarding/accessibility')
  expect(sent(calls, 'PATCH', '/onboarding/profile')).toEqual([{ step: 'welcome', name: 'Meera', language: 'hi-IN' }])

  await userEvent.click(screen.getByRole('checkbox', { name: 'Larger text' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Speaking' }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(sent(calls, 'PATCH', '/onboarding/profile')).toHaveLength(2))
  expect(sent(calls, 'PATCH', '/onboarding/profile')[1]).toEqual({
    step: 'accessibility', large_text: true, high_contrast: false, simple: false, read_aloud: false, offer_help: true, channel: 'voice',
    show_options: true,
  })
})

test.each([true, false])('setup saves booking choice %s through Continue, Back and a reload', async (showOptions) => {
  let saved = fresh({ onboarding: progress(1) })
  const calls = stubApi({
    'POST /session': () => saved,
    'PATCH /onboarding/profile': (body) => {
      const { step: _step, ...patch } = body as Partial<Profile> & { step: string }
      saved = { ...saved, profile: { ...saved.profile, ...patch }, onboarding: { ...progress(2), review: { ...progress(2).review, show_options: patch.show_options ?? true } } }
      return saved
    },
  }, saved)
  window.location.hash = '#/onboarding/accessibility'
  const { unmount } = render(<App />)
  const group = await screen.findByRole('group', { name: 'When I ask for a ride or a meal' })
  expect(within(group).getByRole('radio', { name: 'Show me the options and let me confirm' })).toBeChecked()
  expect(screen.getByText('Telephone calls always ask you to confirm. Care Circle approval rules still apply.')).toBeInTheDocument()
  const label = showOptions ? 'Show me the options and let me confirm' : 'Let Saathi choose the best option and book it for me'
  await userEvent.click(within(group).getByRole('radio', { name: label }))
  expect(sent(calls, 'PATCH', '/onboarding/profile')).toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'Saved places' })).toBeInTheDocument()
  expect(sent(calls, 'PATCH', '/onboarding/profile')[0]).toEqual(expect.objectContaining({ step: 'accessibility', show_options: showOptions }))
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(await screen.findByRole('radio', { name: label })).toBeChecked()
  unmount()
  render(<App />)
  expect(await screen.findByRole('radio', { name: label })).toBeChecked()
})

test('Save and exit persists the setup booking preference for Profile', async () => {
  const saved = fresh({ onboarding: progress(2), profile: { ...makeState().profile, show_options: false } })
  const calls = stubApi({ 'PATCH /onboarding/profile': () => saved }, fresh({ onboarding: progress(1) }))
  window.location.hash = '#/onboarding/accessibility'
  render(<App />)
  await userEvent.click(await screen.findByRole('radio', { name: 'Let Saathi choose the best option and book it for me' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save and exit' }))
  expect(await screen.findByRole('heading', { name: 'Finish setting up Saathi' })).toBeInTheDocument()
  expect(sent(calls, 'PATCH', '/onboarding/profile')[0]).toEqual(expect.objectContaining({ show_options: false }))
  await userEvent.click(screen.getByRole('link', { name: 'Open profile' }))
  expect(await screen.findByRole('radio', { name: 'Let Saathi choose the best option and book it for me' })).toBeChecked()
})

test('a returning person resumes at the first unfinished step', async () => {
  stubApi({}, fresh({ onboarding: progress(2) }))
  window.location.hash = '#/onboarding'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Saved places' })).toBeInTheDocument()
  expect(screen.getByText('Step 3 of 7')).toBeInTheDocument()
})

test('places use clearly fake samples, and server checks come back in plain words', async () => {
  const withHome = fresh({ onboarding: progress(2), places: [makeState().places![0]] })
  const calls = stubApi({
    'POST /onboarding/locations': () => withHome,
    'POST /onboarding/steps/places': () => fail(422, { detail: 'Choose one place as your usual pickup.' }),
  }, fresh({ onboarding: progress(2) }))
  window.location.hash = '#/onboarding/places'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Use sample: Home' }))
  expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('12 Sample Lane, Demo Nagar (sample address)')
  expect(sent(calls, 'POST', '/onboarding/locations')).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Save place' }))
  expect(await screen.findByText('Usual pickup')).toBeInTheDocument()
  expect(sent(calls, 'POST', '/onboarding/locations')).toEqual([
    { label: 'Home', address: '12 Sample Lane, Demo Nagar (sample address)', notes: 'Gate 2, ground floor', is_default_pickup: false },
  ])
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose one place as your usual pickup.')
  expect(screen.getByRole('heading', { name: 'Saved places' })).toBeInTheDocument()
})

test('the Care Circle step says exactly what is shared and adds a view-only person', async () => {
  const added = fresh({ onboarding: progress(3), care_circle: [{ id: 'g1', name: 'Ravi', relationship: 'Son', role: 'viewer', permissions: ['view_activity'], status: 'invited' }] })
  const calls = stubApi({
    'POST /onboarding/caretaker-grants': () => ({ code: 'invite.code', state: added }),
    'PATCH /onboarding/profile': () => fresh({ onboarding: progress(4) }),
  }, fresh({ onboarding: progress(3) }))
  window.location.hash = '#/onboarding/care_circle'
  render(<App />)
  expect(await screen.findByText(/will not see/)).toBeInTheDocument()
  expect(screen.getByText(/payment details, full conversations or medicine names/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()
  await userEvent.type(screen.getByRole('textbox', { name: 'Their name' }), 'Ravi')
  await userEvent.type(screen.getByRole('textbox', { name: 'How you know them (optional)' }), 'Son')
  expect(screen.getByRole('radio', { name: 'See my shared activity (view only)' })).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Add to my Care Circle' }))
  const link = await screen.findByRole('textbox', { name: 'Invitation link for Ravi' })
  expect((link as HTMLInputElement).value).toContain('#/join/invite.code')
  expect(sent(calls, 'POST', '/onboarding/caretaker-grants')).toEqual([{ name: 'Ravi', relationship: 'Son', can_approve: false }])
  expect(screen.getByText(/can see shared activity \(view only\)/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(sent(calls, 'PATCH', '/onboarding/profile')).toEqual([{ step: 'care_circle', caregiver_enabled: false, approval_limit: 150 }]))
})

test('demo services are labelled simulated and connect only with an explicit tap', async () => {
  const connected = fresh({ onboarding: progress(4), services: demoServices('SETUP_REQUIRED').map((s) => (s.service_type === 'RIDE' ? demoServices()[0] : s)) })
  const calls = stubApi({ 'POST /services/RIDE/options': () => connected }, fresh({ onboarding: progress(4) }))
  window.location.hash = '#/onboarding/services'
  render(<App />)
  expect(await screen.findByText('All options are simulated. No real bookings, deliveries or payments.')).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: 'Use Demo Ride Provider' })).not.toBeChecked()
  await userEvent.click(screen.getByRole('switch', { name: 'Use Demo Ride Provider' }))
  expect(await screen.findByRole('switch', { name: 'Use Demo Ride Provider' })).toBeChecked()
  expect(sent(calls, 'POST', '/services/RIDE/options')).toEqual([{ option_id: 'demo-ride', enabled: true, consent: true }])
})

test('the payment step offers only simulated methods and never asks for card or bank details', async () => {
  const calls = stubApi({ 'PATCH /onboarding/profile': () => fresh({ onboarding: progress(6) }) }, fresh({ onboarding: progress(5) }))
  window.location.hash = '#/onboarding/payment'
  render(<App />)
  const group = await screen.findByRole('group', { name: 'How should simulated payments work?' })
  expect(within(group).getAllByRole('radio')).toHaveLength(2)
  expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  expect(screen.getByText(/never asks for card numbers, UPI PINs, OTPs or bank logins/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: /Demo wallet \(simulated\)/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(sent(calls, 'PATCH', '/onboarding/profile')).toEqual([{ step: 'payment', payment_method: 'DEMO_WALLET' }]))
  expect(await screen.findByRole('heading', { name: 'Review and finish' })).toBeInTheDocument()
})

test('the review summarises every answer, links back to edit, and finishing needs a clear tap', async () => {
  const ready = fresh({ onboarding: { ...progress(6), review: { ...progress(6).review, missing: [] } } })
  const calls = stubApi({ 'POST /onboarding/finish': () => makeState({ profile: { ...makeState().profile, name: 'Meera' } }) }, ready)
  window.location.hash = '#/onboarding/review'
  render(<App />)
  expect(await screen.findByText('Home, Doctor · usual pickup: Home')).toBeInTheDocument()
  expect(screen.getByText('Ravi can see shared activity (view only)')).toBeInTheDocument()
  expect(screen.getByText('Demo wallet (simulated) · no real money moves')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Change saved places' })).toHaveAttribute('href', '#/onboarding/places')
  expect(screen.getByText('Show me the options and let me confirm')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Change booking preference' })).toHaveAttribute('href', '#/onboarding/accessibility')
  expect(sent(calls, 'POST', '/onboarding/finish')).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Yes, finish setup' }))
  expect(await screen.findByRole('heading', { name: 'You are all set, Meera' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Try a demo ride' })).toHaveAttribute('href', '#/request/ride')
  expect(sent(calls, 'POST', '/onboarding/finish')).toEqual([{ confirmed: true }])
})

test('review and completion reflect automatic booking rather than promising another confirmation', async () => {
  const profile = { ...makeState().profile, name: 'Meera', show_options: false }
  const ready = fresh({ profile, onboarding: { ...progress(6), review: { ...progress(6).review, show_options: false, missing: [] } } })
  stubApi({ 'POST /onboarding/finish': () => makeState({ profile }) }, ready)
  window.location.hash = '#/onboarding/review'
  render(<App />)
  expect(await screen.findByText('Let Saathi choose the best option and book it for me')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Yes, finish setup' }))
  expect(await screen.findByText(/Saathi will choose and book app rides and meals for you/)).toBeInTheDocument()
  expect(screen.queryByText(/check with you before every booking/)).not.toBeInTheDocument()
})

test('finishing is blocked while a required step is missing', async () => {
  stubApi({}, fresh({ onboarding: progress(5) }))
  window.location.hash = '#/onboarding/review'
  render(<App />)
  expect(await screen.findByText('Still to do: Payment (simulated).')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Yes, finish setup' })).toBeDisabled()
})

test('save and exit keeps progress and Home offers to continue, with services marked as needing setup', async () => {
  const calls = stubApi({ 'POST /onboarding/steps/places': () => fail(422, { detail: 'Add at least one place, such as your home.' }) }, fresh({ onboarding: progress(2) }))
  window.location.hash = '#/onboarding/places'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Save and exit' }))
  expect(await screen.findByRole('heading', { name: 'Finish setting up Saathi' })).toBeInTheDocument()
  expect(window.location.hash).toBe('#/')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText(/2 of 7 steps done\. Next: Saved places\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '#/onboarding')
  expect(screen.getByRole('link', { name: /Book a ride\s*Setup required: connect the Demo Ride Provider/ })).toBeInTheDocument()
  expect(sent(calls, 'POST', '/onboarding/steps/places')).toEqual([{}])
})

test('a finished setup can be edited later from Profile', async () => {
  stubApi()
  window.location.hash = '#/profile'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Your setup' })).toBeInTheDocument()
  expect(screen.getByText(/2 saved, usual pickup: Home/)).toBeInTheDocument()
  expect(screen.getByText(/Demo wallet \(simulated\)/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review everything' })).toHaveAttribute('href', '#/onboarding/review')
  expect(window.location.hash).toBe('#/profile')
})
