import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { AskResult, Profile, Quote } from './hub'
import { booking, demoRideQuote, fail, makeCareState, makeState, mealQuote, olaQuote, rapidoQuote, rideQuote, stubApi } from './test-utils'

// jsdom cannot decode audio; the real conversion is covered in lib.test.ts.
vi.mock('./wav', async (original) => ({ ...(await original<typeof import('./wav')>()), toWav: async () => new TextEncoder().encode('RIFF').buffer }))

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

const rides = () => [demoRideQuote(), rapidoQuote(), olaQuote(), rideQuote()]
const quoted = (quotes: Quote[]) => ({ request_id: quotes[0].request_id, service_type: quotes[0].service_type, quotes })
const confirmCalls = (calls: ReturnType<typeof stubApi>) => calls.filter((call) => call.url.endsWith('/confirm'))
const quoteCalls = (calls: ReturnType<typeof stubApi>) => calls.filter((call) => call.method === 'POST' && call.url.endsWith('/quotes'))

test('home greets the user, shows which apps each card compares, and the live status', async () => {
  stubApi()
  render(<App />)
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Book a ride\s*Demo Ride Provider · Uber · Ola · Rapido \(demo\)/ })).toHaveAttribute('href', '#/request/ride')
  expect(screen.getByRole('link', { name: /Order food\s*Demo Food Provider · Uber Eats · Swiggy · Zomato \(demo\)/ })).toHaveAttribute('href', '#/request/food')
  expect(screen.getByRole('link', { name: /Medicine request/ })).toHaveAttribute('href', '#/request/medicine')
  expect(screen.getByText(/no need to call family/i)).toBeInTheDocument()
  expect(await screen.findByText('Backend connected · v0.1.0')).toBeInTheDocument()
})

test('apps the user turned off disappear from the home cards', async () => {
  const state = makeState()
  state.profile.enabled_providers = state.profile.enabled_providers.filter((id) => id !== 'uber')
  stubApi({}, state)
  render(<App />)
  expect(await screen.findByRole('link', { name: /Book a ride\s*Demo Ride Provider · Ola · Rapido \(demo\)/ })).toBeInTheDocument()
})

type Heard = { results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }> }
class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = true
  interimResults = false
  onresult: ((event: Heard) => void) | null = null
  onerror: ((event: { error?: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  constructor() { FakeRecognition.last = this }
}
const spoken = "Take me to Dr Mehta's clinic"
const routedRide: AskResult = {
  id: '22222222-2222-4222-8222-222222222222', service: 'ride', channel: 'voice', status: 'quoted', summary: 'Rides to Doctor', clarification: '',
  request_id: 'r-1', quotes: rides(), appointment_id: null, input: { message: spoken, destination: "Dr Mehta's clinic" }, understood_by: 'keywords',
}
const askedBack = (service: AskResult['service'], clarification: string): AskResult => ({
  id: '33333333-3333-4333-8333-333333333333', service, channel: 'app', status: 'needs_details', summary: 'More details needed', clarification,
  request_id: null, quotes: [], appointment_id: null, understood_by: 'keywords',
})

test('one tap on the big microphone: Saathi hears the request, works out the service and opens the quotes', async () => {
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  const calls = stubApi({
    'POST /ask': () => routedRide,
    'GET /state': () => makeState({ quotes: rides() }),
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Just tell Saathi what you need' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Tap and speak' }))
  act(() => FakeRecognition.last?.onend?.())
  expect(screen.getByText('I did not hear anything. Tap the microphone and try again.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Tap and speak' }))
  const engine = FakeRecognition.last
  expect(engine?.lang).toBe('en-IN')
  expect(engine?.start).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Listening… tap to stop' })).toBeInTheDocument()
  act(() => engine?.onresult?.({ results: [{ isFinal: false, 0: { transcript: 'Take me to' } }] }))
  expect(screen.getByText('“Take me to”')).toBeInTheDocument()
  expect(calls.some((call) => call.url.endsWith('/ask'))).toBe(false)
  act(() => engine?.onresult?.({ results: [{ isFinal: true, 0: { transcript: spoken } }] }))

  expect(await screen.findByRole('heading', { name: '4 demo prices' })).toBeInTheDocument()
  expect(window.location.hash).toBe('#/request/ride/r-1')
  expect(screen.getByRole('button', { name: 'Choose Demo Ride from Demo Ride Provider' })).toBeInTheDocument()
  expect(calls.filter((call) => call.url.endsWith('/ask')).map((call) => call.body)).toEqual([expect.objectContaining({ message: spoken, channel: 'voice' })])
  expect(confirmCalls(calls)).toHaveLength(0)
})

test('typing works too, and an unclear request is asked back instead of guessed', async () => {
  const replies = [askedBack(null, 'Do you need a ride, food or medicine?'), askedBack('ride', 'Where would you like to go?')]
  const calls = stubApi({ 'POST /ask': () => replies.shift() })
  render(<App />)
  const box = await screen.findByRole('textbox', { name: 'Or type it here' })
  await userEvent.type(box, 'hello there{Enter}')
  expect(await screen.findByText(/Do you need a ride, food or medicine\?/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /^Open (Book|Order|Medicine)/ })).not.toBeInTheDocument()

  await userEvent.clear(box)
  await userEvent.type(box, 'book a taxi')
  await userEvent.click(screen.getByRole('button', { name: 'Ask Saathi' }))
  expect(await screen.findByText(/Where would you like to go\?/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Book a ride' })).toHaveAttribute('href', '#/request/ride')
  expect(window.location.hash).toBe('')
  expect(calls.filter((call) => call.url.endsWith('/ask')).map((call) => (call.body as { channel: string }).channel)).toEqual(['app', 'app'])
})

test('without voice in the browser, the microphone points to typing instead of failing silently', async () => {
  stubApi()
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Tap and speak' }))
  expect(screen.getByText(/Voice is not available in this browser/)).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Or type it here' })).toHaveFocus()
})

test('the microphone speaks Hindi when the profile does', async () => {
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  const state = makeState()
  state.profile.language = 'hi-IN'
  stubApi({}, state)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'दबाएँ और बोलें' }))
  expect(FakeRecognition.last?.lang).toBe('hi-IN')
})

class FakeRecorder {
  static last: FakeRecorder | null = null
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor() { FakeRecorder.last = this }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice']) }); this.onstop?.() }
}
function fakeMicrophone(allowed = true) {
  const release = vi.fn()
  FakeRecorder.last = null
  const getUserMedia = vi.fn(async () => {
    if (!allowed) throw new DOMException('denied', 'NotAllowedError')
    return { getTracks: () => [{ stop: release }] }
  })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  return release
}

test('with Gemini on, the microphone records, Gemini hears and routes it, and nothing is booked yet', async () => {
  const release = fakeMicrophone()
  const said = 'मुझे क्लिनिक जाना है'
  const calls = stubApi({
    'POST /ask/voice': () => ({ ...routedRide, understood_by: 'gemini', transcript: said, input: { message: said, destination: 'क्लिनिक' } }),
    'GET /state': () => makeState({ gemini: true, quotes: rides() }),
  }, makeState({ gemini: true }))
  render(<App />)
  expect(await screen.findByText(/Gemini listens · your recording is sent to Google/)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Tap and speak' }))
  expect(FakeRecorder.last?.state).toBe('recording')
  await userEvent.click(await screen.findByRole('button', { name: 'Listening… tap to stop' }))

  expect(await screen.findByRole('heading', { name: '4 demo prices' })).toBeInTheDocument()
  expect(release).toHaveBeenCalled()
  const voice = calls.filter((call) => call.url.endsWith('/ask/voice'))
  expect(voice.map((call) => call.body)).toEqual([{ id: expect.any(String), audio: 'UklGRg==' }])
  expect(calls.some((call) => call.url.endsWith('/hub/ask'))).toBe(false)
  expect(confirmCalls(calls)).toHaveLength(0)
})

test('with Gemini on, a refused microphone says so and nothing is sent', async () => {
  fakeMicrophone(false)
  const calls = stubApi({}, makeState({ gemini: true }))
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Tap and speak' }))
  expect(await screen.findByText(/Microphone permission was refused/)).toBeInTheDocument()
  expect(calls.some((call) => call.url.includes('/ask'))).toBe(false)
})

test('without Gemini the microphone keeps using the browser and says nothing about Google', async () => {
  fakeMicrophone()
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  stubApi()
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Tap and speak' }))
  expect(FakeRecognition.last?.start).toHaveBeenCalled()
  expect(FakeRecorder.last).toBeNull()
  expect(screen.queryByText(/Gemini listens/)).not.toBeInTheDocument()
})

test('bottom navigation has five tabs and marks the current page', async () => {
  stubApi()
  render(<App />)
  const nav = await screen.findByRole('navigation', { name: 'Main navigation' })
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Activity', 'Services', 'Family', 'Profile'])
  expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(within(nav).getByRole('link', { name: 'Activity' }))
  expect(await screen.findByRole('heading', { name: 'Your activity' })).toBeInTheDocument()
  expect(within(nav).getByRole('link', { name: 'Activity' })).toHaveAttribute('aria-current', 'page')
  expect(document.title).toBe('Activity · Saathi')
})

test('each service has its own form', async () => {
  stubApi()
  window.location.hash = '#/request/ride'
  render(<App />)
  expect(await screen.findByRole('combobox', { name: 'Where to?' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Pick me up from' })).toHaveValue('place-home')
  window.location.hash = '#/request/medicine'
  expect(await screen.findByText(/Sample non-prescription items only/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'More: ORS sachets, pack of 5 (sample)' })).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Where to?' })).not.toBeInTheDocument()
  window.location.hash = '#/request/food'
  expect(await screen.findByRole('combobox', { name: 'Kitchen' })).toHaveDisplayValue('Saathi Demo Kitchen · Demo Food Provider')
  expect(screen.getByRole('button', { name: 'Get demo price' })).toBeDisabled()
})

test('a ride gets server prices, needs an explicit confirmation and books once with a retry key', async () => {
  const calls = stubApi({ 'POST /quotes': () => quoted(rides()), 'POST /quotes/*/confirm': () => booking(rideQuote()) })
  window.location.hash = '#/request/ride'
  render(<App />)

  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Where to?' }), 'Doctor')
  await userEvent.click(screen.getByRole('button', { name: 'Get demo prices' }))
  expect(await screen.findByRole('heading', { name: '4 demo prices' })).toHaveFocus()
  expect(quoteCalls(calls).map((call) => call.body)).toEqual([{ service_type: 'RIDE', pickup_place_id: 'place-home', destination_place_id: 'place-doctor' }])
  for (const name of ['Choose Demo Ride from Demo Ride Provider', 'Choose Rapido Auto from Rapido', 'Choose Ola Mini from Ola', 'Choose Uber Go from Uber']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
  expect(screen.getByText('Saathi’s own demo service')).toBeInTheDocument()
  expect(screen.getAllByText('Simulated by the Demo Ride Provider')).toHaveLength(3)

  await userEvent.click(screen.getByRole('button', { name: 'Choose Uber Go from Uber' }))
  expect(await screen.findByRole('heading', { name: 'Check and confirm' })).toBeInTheDocument()
  expect(screen.getByText('Home → Doctor')).toBeInTheDocument()
  expect(screen.getByText('Demo ride — no real driver will arrive.')).toBeInTheDocument()
  expect(screen.getByText('Demo wallet (simulated) · no money will be charged')).toBeInTheDocument()
  expect(screen.getByText('Distance, 5.3 km at ₹16/km')).toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(0)

  await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
  expect(screen.queryByRole('button', { name: 'Confirm demo booking' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Choose Uber Go from Uber' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm demo booking' }))
  expect(await screen.findByRole('heading', { name: 'Demo booking confirmed' })).toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(1)
  expect(confirmCalls(calls)[0].url).toBe('/api/hub/quotes/q-uber/confirm')
  expect(confirmCalls(calls)[0].body).toEqual({ idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/), confirmed: true })
  expect(screen.getByText('DEMO-RIDE-1042')).toBeInTheDocument()
  expect(screen.getByText('Booked · simulated')).toBeInTheDocument()
  expect(screen.getByText('Paid (simulated) · no money charged')).toBeInTheDocument()
  expect(screen.getByText(/No money charged\. Demo ride — no real driver will arrive\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Track your demo ride' })).toHaveAttribute('href', '#/activity/b-uber-go-confirmed_simulated')
})

test('a lost reply is retried with the same key, so the server can return the same booking', async () => {
  let attempts = 0
  const calls = stubApi({
    'POST /quotes': () => quoted([rideQuote()]),
    'POST /quotes/*/confirm': () => (++attempts === 1 ? fail(503, { detail: 'Could not save your changes. Please retry.' }) : booking(rideQuote())),
  })
  window.location.hash = '#/request/ride'
  render(<App />)
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Where to?' }), 'Doctor')
  await userEvent.click(screen.getByRole('button', { name: 'Get demo prices' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm demo booking' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your changes. Please retry.')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm demo booking' }))
  expect(await screen.findByRole('heading', { name: 'Demo booking confirmed' })).toBeInTheDocument()
  const keys = confirmCalls(calls).map((call) => (call.body as { idempotency_key: string }).idempotency_key)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
})

test('a service that is not connected explains how to connect its demo provider', async () => {
  const state = makeState()
  state.services = state.services!.map((s) => (s.service_type === 'RIDE' ? { ...s, status: 'SETUP_REQUIRED', consent_at: null } : s))
  const calls = stubApi({ 'POST /services/RIDE/connect-demo': () => makeState() }, state)
  window.location.hash = '#/request/ride'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Connect the Demo Ride Provider first' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Services' })).toHaveAttribute('href', '#/services')
  expect(screen.queryByRole('button', { name: 'Get demo prices' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Connect Demo Ride Provider' }))
  expect(calls.find((call) => call.url.endsWith('/connect-demo'))?.body).toEqual({ consent: true })
  expect(await screen.findByRole('button', { name: 'Get demo prices' })).toBeInTheDocument()
})

test('a booking that needs caregiver approval says so instead of claiming it is booked', async () => {
  const waiting = rideQuote({ approval: { required: true, reason: 'Above the ₹100 approval limit.' } })
  stubApi({ 'POST /quotes': () => quoted([waiting]), 'POST /quotes/*/confirm': () => booking(waiting, 'AWAITING_APPROVAL', { approval_reason: 'Above the ₹100 approval limit.' }) })
  window.location.hash = '#/request/ride'
  render(<App />)
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Where to?' }), 'Doctor')
  await userEvent.click(screen.getByRole('button', { name: 'Get demo prices' }))
  expect(await screen.findByText(/Someone in your Care Circle must approve this first\. Above the ₹100 approval limit\./)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm demo booking' }))
  expect(await screen.findByRole('heading', { name: 'Sent for approval' })).toBeInTheDocument()
  expect(screen.getByText('Not charged (simulated)')).toBeInTheDocument()
  expect(screen.queryByText(/Saathi booked/)).not.toBeInTheDocument()
  expect(screen.queryByText('DEMO-RIDE-1042')).not.toBeInTheDocument()
})

test('a meal is chosen from a kitchen menu and priced by the server with a demo delivery fee', async () => {
  const calls = stubApi({ 'POST /quotes': () => quoted([mealQuote({ amount_minor: 19500, line_items: [{ label: 'Vegetable khichdi × 2', amount_minor: 17000 }, { label: 'Delivery fee (demo)', amount_minor: 2500 }] })]) })
  window.location.hash = '#/request/food'
  render(<App />)
  const more = await screen.findByRole('button', { name: 'More: Vegetable khichdi' })
  await userEvent.click(more)
  await userEvent.click(more)
  await userEvent.click(screen.getByRole('button', { name: 'Get demo price' }))
  expect(quoteCalls(calls)[0].body).toEqual({ service_type: 'FOOD', option_id: 'demo-kitchen', items: [{ item_id: 'khichdi', quantity: 2 }] })
  expect(await screen.findByRole('heading', { name: 'Check and confirm' })).toBeInTheDocument()
  expect(screen.getByText('Vegetable khichdi × 2')).toBeInTheDocument()
  expect(screen.getByText('Delivery fee (demo)')).toBeInTheDocument()
  expect(screen.getByText('Demo order — no real food will be delivered.')).toBeInTheDocument()
})

test('the profile can let Saathi choose and book rides and meals', async () => {
  const calls = stubApi({ 'PUT /profile': (body) => makeState({ profile: body as Profile }) })
  window.location.hash = '#/profile'
  render(<App />)
  expect(await screen.findByRole('radio', { name: 'Show me the options and let me confirm' })).toBeChecked()
  expect(screen.getByText(/books rides and meals straight away without asking.*Medicine requests always ask first/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: 'Let Saathi choose the best option and book it for me' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  const saved = calls.find((call) => call.method === 'PUT' && call.url.endsWith('/profile'))?.body as Profile
  expect(saved.show_options).toBe(false)
})

const chosen = { reason: 'Lowest price and shortest wait: ₹83, about 3 min away.', by: 'rules' } as const
function bookingForMe(booked = booking(rapidoQuote(), 'CONFIRMED_SIMULATED', { chosen_by: chosen })) {
  const before = makeState()
  before.profile.show_options = false
  const after = makeState({ activity: [booked] })
  after.profile.show_options = false
  let done = false
  const state = () => (done ? after : before)
  return { booked, before, finish: <T,>(value: T) => { done = true; return value }, state }
}

test('when Saathi books for me, one tap goes straight to the ride page with no confirm step', async () => {
  const { booked, before, finish, state } = bookingForMe()
  const calls = stubApi({
    'POST /quotes': () => finish({ ...quoted([{ ...rapidoQuote(), recommended: chosen }, demoRideQuote()]), booking: booked }),
    'GET /state': state,
  }, before)
  window.location.hash = '#/request/ride'
  render(<App />)
  expect(await screen.findByText(/book it for you straight away \(simulated\)/)).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Where to?' }), 'Doctor')
  await userEvent.click(screen.getByRole('button', { name: 'Book the best demo ride' }))

  expect(await screen.findByRole('heading', { name: 'Demo driver on the way' })).toBeInTheDocument()
  expect(window.location.hash).toBe(`#/activity/${booked.id}`)
  expect(screen.getByText('Demo booking confirmed: DEMO-RIDE-1042. No real driver will come and no money moves.')).toBeInTheDocument()
  expect(screen.getByText('Booked for you by Saathi')).toBeInTheDocument()
  expect(screen.getByText('Chosen by Saathi’s price-and-wait rule (not AI).')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirm demo booking' })).not.toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(0)
  expect(quoteCalls(calls)[0].body).toEqual({ service_type: 'RIDE', pickup_place_id: 'place-home', destination_place_id: 'place-doctor', idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) })
})

test('asking Saathi for a ride books it end to end when Saathi books for me', async () => {
  const { booked, before, finish, state } = bookingForMe()
  stubApi({ 'POST /ask': () => finish({ ...routedRide, service: 'ride', booking: booked }), 'GET /state': state }, before)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'Or type it here' }), 'Take me to my doctor')
  await userEvent.click(screen.getByRole('button', { name: 'Ask Saathi' }))
  expect(await screen.findByRole('heading', { name: 'Demo driver on the way' })).toBeInTheDocument()
  expect(window.location.hash).toBe(`#/activity/${booked.id}`)
  expect(screen.getByText('Booked for you by Saathi')).toBeInTheDocument()
})

test('meals too: Order now places the order at once, and asking Saathi orders its pick', async () => {
  const meal = booking(mealQuote(), 'CONFIRMED_SIMULATED', { chosen_by: { reason: 'Lowest price and shortest wait: ₹105, delivered in about 25 min.', by: 'rules' } })
  const { booked, before, finish, state } = bookingForMe(meal)
  const calls = stubApi({
    'POST /quotes': () => finish({ ...quoted([mealQuote()]), booking: booked }),
    'POST /ask': () => finish({ ...routedRide, service: 'food', booking: booked }),
    'GET /state': state,
  }, before)
  window.location.hash = '#/request/food'
  const { unmount } = render(<App />)
  expect(await screen.findByText(/Saathi will order what you choose straight away \(simulated\)/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'More: Vegetable khichdi' }))
  await userEvent.click(screen.getByRole('button', { name: 'Order now' }))
  expect(await screen.findByText('Demo order placed: DEMO-FOOD-1042. No real food will come and no money moves.')).toBeInTheDocument()
  expect(window.location.hash).toBe(`#/activity/${booked.id}`)
  expect(quoteCalls(calls)[0].body).toEqual({ service_type: 'FOOD', option_id: 'demo-kitchen', items: [{ item_id: 'khichdi', quantity: 1 }], idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  expect(confirmCalls(calls)).toHaveLength(0)
  unmount()

  window.location.hash = '#/'
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'Or type it here' }), 'I am hungry, something light')
  await userEvent.click(screen.getByRole('button', { name: 'Ask Saathi' }))
  expect(await screen.findByText('Ordered for you by Saathi')).toBeInTheDocument()
  expect(screen.getByText(/Lowest price and shortest wait: ₹105, delivered in about 25 min\./)).toBeInTheDocument()
  expect(window.location.hash).toBe(`#/activity/${booked.id}`)
})

test('turning an option off saves the choice, and the page is honest that these are demos', async () => {
  const calls = stubApi({ 'PUT /profile': (body) => makeState({ profile: { ...makeState().profile, ...(body as object) } }) })
  window.location.hash = '#/apps'
  render(<App />)
  expect(await screen.findByText(/not\s+connected to those companies/)).toBeInTheDocument()
  expect(screen.getAllByText('Simulated provider — no real order or dispatch.')).toHaveLength(3)
  const uber = await screen.findByRole('switch', { name: 'Use Uber' })
  expect(uber).toBeChecked()
  await userEvent.click(uber)
  const save = calls.find((call) => call.method === 'PUT' && call.url.endsWith('/profile'))
  expect(save, 'the profile was never saved').toBeDefined()
  const sent = (save!.body as { enabled_providers: string[] }).enabled_providers
  expect(sent).not.toContain('uber')
  expect(sent).toEqual(['ola', 'rapido', 'ubereats', 'swiggy', 'zomato'])
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Use Uber' })).not.toBeChecked())
})

test('a caretaker gets the Care Circle dashboard, never the request screens', async () => {
  stubApi({}, makeCareState(['view_activity', 'approve']))
  window.location.hash = '#/request/ride'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Supporting Meera' })).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Where to?' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Get demo prices' })).not.toBeInTheDocument()
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Overview', 'Activity', 'Approvals', 'Chats', 'Safety'])
})

test('connection failures stay visible and can be retried', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Backend offline')))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Backend offline')
  stubApi()
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
})

test('tells the user when they are offline and clears the message when they are back', async () => {
  stubApi()
  render(<App />)
  await screen.findByText('Hello, Friend.')
  expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument()
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  act(() => { window.dispatchEvent(new Event('offline')) })
  expect(await screen.findByText(/You are offline.*cannot book anything/)).toBeInTheDocument()
  online.mockReturnValue(true)
  act(() => { window.dispatchEvent(new Event('online')) })
  await waitFor(() => expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument())
})

test('offers to install the app when the browser allows it', async () => {
  stubApi()
  render(<App />)
  await screen.findByText('Hello, Friend.')
  expect(screen.queryByRole('button', { name: 'Install Saathi' })).not.toBeInTheDocument()
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
  act(() => { window.dispatchEvent(event) })
  await userEvent.click(await screen.findByRole('button', { name: 'Install Saathi' }))
  expect(prompt).toHaveBeenCalledOnce()
  expect(event.defaultPrevented).toBe(true)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Install Saathi' })).not.toBeInTheDocument())
})

test('iPhone users get written steps because Safari has no install prompt', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
  stubApi()
  render(<App />)
  expect(await screen.findByText(/Tap the Share button in Safari, then choose Add to Home Screen/)).toBeInTheDocument()
})

test('a home-screen shortcut opens its service and tidies the address', async () => {
  stubApi()
  window.history.replaceState(null, '', '/?service=food&source=shortcut')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Order food', level: 1 })).toBeInTheDocument()
  expect(window.location.search).toBe('')
  expect(window.location.hash).toBe('#/request/food')
})

test('Hindi labels, larger text and high contrast follow the saved profile', async () => {
  const state = makeState()
  Object.assign(state.profile, { language: 'hi-IN', large_text: true, high_contrast: true })
  stubApi({}, state)
  render(<App />)
  expect(await screen.findByRole('link', { name: 'गतिविधि' })).toBeInTheDocument()
  expect(screen.getByText('नमस्ते, Friend।')).toBeInTheDocument()
  expect(document.documentElement.lang).toBe('hi')
  expect(document.querySelector('.app')).toHaveClass('large-text', 'high-contrast')
})

test('the simplified view switch strips Home down to the mic, three tiles and a way back', async () => {
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  const calls = stubApi({ 'PUT /profile': (body) => makeState({ profile: body as Profile }) })
  render(<App />)
  const toggle = await screen.findByRole('switch', { name: 'Enable simplified view' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(toggle)

  expect(await screen.findByRole('link', { name: 'Ride' })).toHaveAttribute('href', '#/request/ride')
  expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute('href', '#/request/food')
  expect(screen.getByRole('link', { name: 'Medicine' })).toHaveAttribute('href', '#/request/medicine')
  expect(screen.getByRole('button', { name: 'Tap and speak' })).toBeInTheDocument()
  for (const gone of [/Or choose one/, /A prototype, clearly marked/, /One conversation/, /For example/, /About this demo/]) {
    expect(screen.queryByText(gone)).not.toBeInTheDocument()
  }
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Open profile' })).not.toBeInTheDocument()
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Activity'])
  expect(screen.getByText('Not for emergencies.')).toBeInTheDocument()
  expect(screen.getByText('Prototype')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Show full view' }))
  expect(await screen.findByRole('switch', { name: 'Enable simplified view' })).toHaveAttribute('aria-checked', 'false')
  const saves = calls.filter((call) => call.method === 'PUT').map((call) => (call.body as Profile).simple)
  expect(saves).toEqual([true, false])
})

test('in simplified view a booking is one choice, big buttons, "Book this?" and Done, still marked as demo', async () => {
  const state = makeState()
  state.profile.simple = true
  const calls = stubApi({ 'POST /quotes': () => quoted([rapidoQuote(), rideQuote()]), 'POST /quotes/*/confirm': () => booking(rideQuote()) }, state)
  window.location.hash = '#/request/ride'
  render(<App />)
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Where to?' }), 'Doctor')
  expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: 'Get demo prices' }))

  expect(await screen.findByRole('heading', { name: 'Pick one' })).toBeInTheDocument()
  expect(screen.queryByText(/Simulated by the/)).not.toBeInTheDocument()
  expect(screen.getAllByText('Demo').length).toBeGreaterThanOrEqual(2)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Uber Go from Uber' }))
  expect(await screen.findByRole('heading', { name: 'Book this?' })).toBeInTheDocument()
  expect(screen.getByText('Demo ride — no real driver will arrive.')).toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: 'Confirm demo booking' }))

  expect(await screen.findByRole('heading', { name: 'Demo booking confirmed' })).toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '#/')
})

test('simplified Activity shows only what was booked, its status and Cancel', async () => {
  const state = makeState({ activity: [booking(rideQuote())] })
  state.profile.simple = true
  stubApi({}, state)
  window.location.hash = '#/activity'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Uber Go to Doctor' })).toBeInTheDocument()
  expect(screen.getByText('Booked · simulated')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
  for (const gone of [/Activity audit/, /DEMO-RIDE-1042/, /Simulated by the/, /whichever way you ask/]) {
    expect(screen.queryByText(gone)).not.toBeInTheDocument()
  }
})

test('the skip link moves focus to the content without changing the screen', async () => {
  stubApi()
  window.location.hash = '#/activity'
  render(<App />)
  await screen.findByRole('heading', { name: 'Your activity' })
  await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
  expect(screen.getByRole('main')).toHaveFocus()
  expect(window.location.hash).toBe('#/activity')
})
