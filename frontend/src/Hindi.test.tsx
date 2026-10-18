import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { HubState, Profile } from './hub'
import { booking, demoServices, fail, makeCareState, makeState, mealQuote, progress, rideQuote, stubApi } from './test-utils'
import { translateText } from './i18n'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const hindi = (overrides: Partial<HubState> = {}) => makeState({ ...overrides, profile: { ...makeState().profile, language: 'hi-IN', ...overrides.profile } })
const hi = (text: string) => translateText(text, 'hi-IN')

test('selecting Hindi in setup immediately translates the page and saves it through reload', async () => {
  let saved = makeState({ onboarding: progress(0), services: demoServices('SETUP_REQUIRED') })
  const calls = stubApi({
    'POST /session': () => saved,
    'PATCH /onboarding/profile': body => {
      saved = { ...saved, profile: { ...saved.profile, ...(body as Partial<Profile>) }, onboarding: progress(1) }
      return saved
    },
  }, saved)
  window.location.hash = '#/onboarding/welcome'
  const { unmount } = render(<App />)
  await userEvent.clear(await screen.findByRole('textbox', { name: 'What should Saathi call you?' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'What should Saathi call you?' }), 'Home')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Preferred language' }), 'hi-IN')
  expect(screen.getByRole('button', { name: 'आगे बढ़ें' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'साथी आपको किस नाम से बुलाए?' })).toHaveValue('Home')
  expect(document.documentElement.lang).toBe('hi')
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'आगे बढ़ें' }))
  expect(await screen.findByRole('heading', { name: 'सुविधा और सुलभता' })).toBeInTheDocument()
  expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({ step: 'welcome', name: 'Home', language: 'hi-IN' })
  unmount()
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'सुविधा और सुलभता' })).toBeInTheDocument()
  expect(document.title).toBe('साथी का सेटअप करें · साथी')
})

test('Profile switches both ways immediately, preserves input, and persists the saved language', async () => {
  let saved = hindi()
  stubApi({ 'POST /session': () => saved, 'PUT /profile': body => { saved = { ...saved, profile: body as Profile }; return saved } }, saved)
  window.location.hash = '#/profile'
  const { unmount } = render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /निजी जानकारी/ }))
  await userEvent.clear(await screen.findByRole('textbox', { name: 'आपका नाम' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'आपका नाम' }), 'Doctor')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'पसंदीदा भाषा' }), 'en-IN')
  expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Doctor')
  expect(screen.getByRole('button', { name: 'Save preferences' })).toBeInTheDocument()
  expect(document.documentElement.lang).toBe('en')
  await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  unmount()
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /Personal details/ }))
  expect(await screen.findByRole('textbox', { name: 'Your name' })).toHaveValue('Doctor')
  expect(saved.profile.language).toBe('en-IN')
})

test.each([
  ['onboarding/welcome', 'स्वागत है'], ['onboarding/accessibility', 'सुविधा और सुलभता'],
  ['onboarding/places', 'सहेजी गई जगहें'], ['onboarding/care_circle', 'देखभाल समूह'],
  ['onboarding/services', 'डेमो सेवाएँ'], ['onboarding/payment', 'भुगतान (सिम्युलेटेड)'],
  ['onboarding/review', 'जाँचें और पूरा करें'],
])('Hindi setup route %s has translated headings and actions', async (route, heading) => {
  stubApi({}, hindi())
  window.location.hash = '#/' + route
  render(<App />)
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save and exit' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'सहेजें और बाहर जाएँ' })).toBeInTheDocument()
})

test('Hindi home, services and request forms keep personal names and addresses intact', async () => {
  stubApi({}, hindi({ profile: { ...makeState().profile, language: 'hi-IN', name: 'Home' } }))
  render(<App />)
  expect(await screen.findByText('नमस्ते, Home।')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'मुख्य नेविगेशन' })).toBeInTheDocument()
  await act(async () => { window.location.hash = '#/services' })
  await userEvent.click(await screen.findByText('सवारी', { selector: 'summary' }))
  expect(await screen.findByRole('switch', { name: 'Uber इस्तेमाल करें' })).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: 'डेमो सवारी प्रदाता इस्तेमाल करें' })).toBeInTheDocument()
  await act(async () => { window.location.hash = '#/request/ride' })
  expect(await screen.findByRole('combobox', { name: 'मुझे यहाँ से लें' })).toHaveDisplayValue('Home')
  expect(screen.getByRole('combobox', { name: 'कहाँ जाना है?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: hi('See prices') })).toBeInTheDocument()
  await act(async () => { window.location.hash = '#/request/food' })
  expect(await screen.findByRole('combobox', { name: 'रसोई' })).toBeInTheDocument()
  expect(screen.getByText('सब्ज़ियों की खिचड़ी')).toBeInTheDocument()
})

test('Hindi quote confirmation, receipt and reference remain accurate', async () => {
  const quote = rideQuote()
  stubApi({ 'POST /quotes/*/confirm': () => booking(quote) }, hindi({ quotes: [quote] }))
  window.location.hash = '#/request/ride/r-1'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: hi('Confirm booking') }))
  expect(await screen.findByRole('heading', { name: hi('Demo booking confirmed') })).toBeInTheDocument()
  expect(screen.getByText('DEMO-RIDE-1042')).toBeInTheDocument()
  expect(screen.getByText(hi('Paid (simulated) · no money charged'))).toBeInTheDocument()
  expect(screen.queryByText('Demo booking confirmed')).not.toBeInTheDocument()
})

test('Hindi payment-success dialog and payment statuses follow the saved language', async () => {
  const item = booking(mealQuote({ payment_method: 'PAY_ON_COMPLETION' }), 'COMPLETED_SIMULATED')
  const paid = { ...item, payment: { ...item.payment!, status: 'SUCCEEDED_SIMULATED' as const } }
  stubApi({ 'POST /bookings/*/payment/complete': () => paid, 'GET /state': () => hindi({ demo_controls: true, activity: [paid] }) }, hindi({ demo_controls: true, activity: [item] }))
  window.location.hash = '#/activity/' + item.id
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: hi('Demo: mark simulated payment complete') }))
  const dialog = await screen.findByRole('dialog', { name: 'भुगतान सफल हुआ' })
  expect(within(dialog).getByText('₹110')).toBeInTheDocument()
  expect(dialog).toHaveAccessibleDescription(hi('Simulated payment only. No real money was charged.'))
  await userEvent.click(within(dialog).getByRole('button', { name: hi('Back to booking') }))
  expect(screen.getByText(`भुगतान: ${hi('Paid (simulated) · no money charged')}`)).toBeInTheDocument()
})

test('known server errors and permission failures are presented in Hindi', async () => {
  stubApi({ 'POST /quotes': () => fail(409, { detail: 'Connect the Demo Ride Provider first, in Services.' }) }, hindi())
  window.location.hash = '#/request/ride'
  render(<App />)
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'कहाँ जाना है?' }), 'Doctor')
  await userEvent.click(screen.getByRole('button', { name: hi('See prices') }))
  expect(await screen.findByRole('alert')).toHaveTextContent(hi('Connect the Demo Ride Provider first, in Services.'))
})

test.each(['', 'activity', 'approvals', 'conversations', 'safety', 'circle'])('caretaker route %s uses the owner’s Hindi language', async (route) => {
  const state = makeCareState(['view_activity', 'approve', 'view_summaries', 'receive_alerts', 'manage_circle'])
  state.owner = { name: 'Home', language: 'hi-IN' }
  state.profile.language = 'hi-IN'
  stubApi({}, state)
  window.location.hash = '#/' + route
  render(<App />)
  await waitFor(() => expect(document.documentElement.lang).toBe('hi'))
  const nav = await screen.findByRole('navigation', { name: 'मुख्य नेविगेशन' })
  const main = screen.getByRole('main')
  expect(within(main).getAllByRole('heading')[0]).toHaveTextContent(/[\u0900-\u097f]/)
  for (const link of within(nav).getAllByRole('link')) expect(link).toHaveTextContent(/[\u0900-\u097f]/)
})

test('Hindi microphone fallback stays translated without altering typed requests', async () => {
  stubApi({}, hindi())
  render(<App />)
  const input = await screen.findByRole('textbox', { name: 'या यहाँ लिखें' })
  fireEvent.change(input, { target: { value: 'Home to Doctor' } })
  await userEvent.click(screen.getByRole('button', { name: 'दबाएँ और बोलें' }))
  expect(screen.getByText('इस ब्राउज़र में बोलकर पूछने की सुविधा नहीं है। कृपया नीचे अपना अनुरोध लिखें।')).toBeInTheDocument()
  expect(input).toHaveValue('Home to Doctor')
})
