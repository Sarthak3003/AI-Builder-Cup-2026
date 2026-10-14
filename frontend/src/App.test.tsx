import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { Activity, Option, Proposal, Service } from './hub'
import { makeState, stubApi, swiggyMeal, uberRide } from './test-utils'

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

const rapidoRide = { id: 'rapido-auto', provider: 'rapido', provider_name: 'Rapido', name: 'Rapido Auto', price: 90, eta_min: 3, simulated: true, detail: 'Demo home to Clinic · Sample fare' }
const olaRide = { id: 'ola-mini', provider: 'ola', provider_name: 'Ola', name: 'Ola Mini', price: 165, eta_min: 5, simulated: true, detail: 'Demo home to Clinic · Sample fare' }

function proposalOf(service: Service, options: Option[]): Proposal {
  return { id: '11111111-1111-4111-8111-111111111111', service, channel: 'app', options, clarification: '', summary: `${service} options within ₹200`, status: 'proposed', expires_at: Date.now() / 1000 + 900 }
}
function orderOf(option: Option, service: Service = 'ride', status = 'simulated_confirmed'): Activity {
  return { id: '11111111-1111-4111-8111-111111111111', service, channel: 'app', option, reference: 'SIM-11111111', simulated: true, status, created_at: 1 }
}
const confirmCalls = (calls: ReturnType<typeof stubApi>) => calls.filter((call) => call.url.endsWith('/confirm'))

test('home greets the user, shows which apps each card compares, and the live status', async () => {
  stubApi()
  render(<App />)
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Book a ride\s*Uber · Ola · Rapido \(demo\)/ })).toHaveAttribute('href', '#/request/ride')
  expect(screen.getByRole('link', { name: /Order food\s*Uber Eats · Swiggy · Zomato \(demo\)/ })).toHaveAttribute('href', '#/request/food')
  expect(screen.getByRole('link', { name: /Medicine request/ })).toHaveAttribute('href', '#/request/medicine')
  expect(screen.getByText(/no need to call family/i)).toBeInTheDocument()
  expect(await screen.findByText('Backend connected · v0.1.0')).toBeInTheDocument()
})

test('apps the user turned off disappear from the home cards', async () => {
  const state = makeState()
  state.profile.enabled_providers = state.profile.enabled_providers.filter((id) => id !== 'uber')
  stubApi({}, state)
  render(<App />)
  expect(await screen.findByRole('link', { name: /Book a ride\s*Ola · Rapido \(demo\)/ })).toBeInTheDocument()
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
const routedRide: Proposal = {
  id: '22222222-2222-4222-8222-222222222222', service: 'ride', channel: 'voice', options: [rapidoRide, olaRide, uberRide],
  clarification: '', summary: 'Ride options within ₹200', status: 'proposed', expires_at: Date.now() / 1000 + 900,
  input: { message: spoken, destination: "Dr Mehta's clinic" },
}
const askedBack = (service: Service | null, clarification: string) => ({
  id: '33333333-3333-4333-8333-333333333333', service, channel: 'app', options: [], clarification,
  summary: 'More details needed', status: 'needs_details', expires_at: 0, understood_by: 'keywords',
})

test('one tap on the big microphone: Saathi hears the request, works out the service and opens the options', async () => {
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  const calls = stubApi({
    'POST /ask': () => ({ ...routedRide, understood_by: 'keywords' }),
    'GET /state': () => makeState({ requests: [routedRide] }),
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

  expect(await screen.findByRole('heading', { name: 'Ride options within ₹200' })).toBeInTheDocument()
  expect(window.location.hash).toBe(`#/request/ride/${routedRide.id}`)
  expect(screen.getByText(`You asked: “${spoken}”`)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose Uber Go from Uber' })).toBeInTheDocument()
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
  const heardRide: Proposal = { ...routedRide, input: { message: said, destination: 'क्लिनिक' } }
  const calls = stubApi({
    'POST /ask/voice': () => ({ ...heardRide, understood_by: 'gemini', transcript: said }),
    'GET /state': () => makeState({ gemini: true, requests: [heardRide] }),
  }, makeState({ gemini: true }))
  render(<App />)
  expect(await screen.findByText(/Gemini listens · your recording is sent to Google/)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Tap and speak' }))
  expect(FakeRecorder.last?.state).toBe('recording')
  await userEvent.click(await screen.findByRole('button', { name: 'Listening… tap to stop' }))

  expect(await screen.findByRole('heading', { name: 'Ride options within ₹200' })).toBeInTheDocument()
  expect(screen.getByText(`You asked: “${said}”`)).toBeInTheDocument()
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
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Activity', 'Apps', 'Family', 'Profile'])
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
  expect(await screen.findByRole('textbox', { name: 'Where to?' })).toBeInTheDocument()
  expect(screen.getByText('Uber, Ola, Rapido')).toBeInTheDocument()
  window.location.hash = '#/request/medicine'
  expect(await screen.findByRole('combobox', { name: 'Saved medicine' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Where to?' })).not.toBeInTheDocument()
  window.location.hash = '#/request/food'
  expect(await screen.findByText('Uber Eats, Swiggy, Zomato')).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Saved medicine' })).not.toBeInTheDocument()
})

test('a ride compares apps, needs an explicit review, and books only after the user confirms', async () => {
  const proposal = proposalOf('ride', [rapidoRide, olaRide, uberRide])
  const calls = stubApi({ 'POST /requests': () => proposal, 'POST /requests/*/confirm': () => orderOf(uberRide) })
  window.location.hash = '#/request/ride'
  render(<App />)

  await userEvent.type(await screen.findByRole('textbox', { name: 'Where to?' }), 'Clinic')
  await userEvent.click(screen.getByRole('button', { name: 'Show options' }))
  expect(await screen.findByRole('heading', { name: 'ride options within ₹200' })).toHaveFocus()
  for (const name of ['Choose Rapido Auto from Rapido', 'Choose Ola Mini from Ola', 'Choose Uber Go from Uber']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
  expect(screen.getAllByText('Demo').length).toBeGreaterThanOrEqual(3)

  await userEvent.click(screen.getByRole('button', { name: 'Choose Uber Go from Uber' }))
  expect(await screen.findByRole('heading', { name: 'Review your request' })).toBeInTheDocument()
  expect(screen.getByText(/Saathi will book this with Uber for you/)).toBeInTheDocument()
  expect(screen.getByText(/no real ride is placed and nothing is charged/)).toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(0)

  await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
  expect(screen.queryByRole('button', { name: 'Book with Uber' })).not.toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(0)

  await userEvent.click(screen.getByRole('button', { name: 'Choose Uber Go from Uber' }))
  await userEvent.click(screen.getByRole('button', { name: 'Book with Uber' }))
  expect(await screen.findByRole('heading', { name: 'All done' })).toBeInTheDocument()
  expect(confirmCalls(calls)).toHaveLength(1)
  expect(confirmCalls(calls)[0].body).toEqual({ option_id: 'uber-go', confirmed: true })
  expect(screen.getByText('Saathi booked Uber Go with Uber for you.')).toBeInTheDocument()
  expect(screen.getByText('SIM-11111111')).toBeInTheDocument()
  expect(screen.getByText(/Simulated booking\. No real ride was placed and nothing was charged\./)).toBeInTheDocument()
  expect(screen.getByText(/no need to call anyone/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See my activity' })).toHaveAttribute('href', '#/activity')
})

test('a booking that needs caregiver approval says so instead of claiming it is booked', async () => {
  const state = makeState()
  state.profile.caregiver_enabled = true
  const proposal = proposalOf('ride', [uberRide])
  stubApi({ 'POST /requests': () => proposal, 'POST /requests/*/confirm': () => orderOf(uberRide, 'ride', 'awaiting_approval') }, state)
  window.location.hash = '#/request/ride'
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'Where to?' }), 'Clinic')
  await userEvent.click(screen.getByRole('button', { name: 'Show options' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Choose Uber Go from Uber' }))
  expect(screen.getByText('Your caregiver must approve this request first.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Book with Uber' }))
  expect(await screen.findByRole('heading', { name: 'Sent for approval' })).toBeInTheDocument()
  expect(screen.queryByText(/Saathi booked/)).not.toBeInTheDocument()
})

test('a meal compares the food apps and names the kitchen and delivery time', async () => {
  const proposal = proposalOf('food', [swiggyMeal])
  stubApi({ 'POST /requests': () => proposal })
  window.location.hash = '#/request/food'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Show options' }))
  expect(await screen.findByRole('button', { name: 'Choose Vegetable khichdi from Swiggy' })).toBeInTheDocument()
  expect(screen.getByText('About 25 min')).toBeInTheDocument()
  expect(screen.getByText(/From Demo Home Kitchen/)).toBeInTheDocument()
})

test('turning an app off saves the choice, and the page is honest that these are demos', async () => {
  const calls = stubApi({ 'PUT /profile': (body) => makeState({ profile: { ...makeState().profile, ...(body as object) } }) })
  window.location.hash = '#/apps'
  render(<App />)
  expect(await screen.findByText(/not connected to the real services/)).toBeInTheDocument()
  const uber = await screen.findByRole('switch', { name: 'Use Uber' })
  expect(uber).toBeChecked()
  await userEvent.click(uber)
  const save = calls.find((call) => call.method === 'PUT' && call.url.endsWith('/profile'))
  expect(save, 'the profile was never saved').toBeDefined()
  const sent = (save!.body as { enabled_providers: string[] }).enabled_providers
  expect(sent).not.toContain('uber')
  expect(sent).toEqual(expect.arrayContaining(['ola', 'rapido', 'ubereats', 'swiggy', 'zomato', 'pharmacy']))
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Use Uber' })).not.toBeChecked())
})

test('a caregiver cannot make requests and can approve from the Family tab', async () => {
  const waiting = orderOf(swiggyMeal, 'food', 'awaiting_approval')
  const calls = stubApi({ 'POST /activity/*/decision': () => ({ ...waiting, status: 'simulated_confirmed' }) }, makeState({ role: 'caregiver', activity: [waiting] }))
  window.location.hash = '#/request/ride'
  render(<App />)
  const review = await screen.findByRole('link', { name: 'Review approvals' })
  expect(screen.queryByRole('textbox', { name: 'Where to?' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Show options' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Family, 1 waiting for approval' })).toBeInTheDocument()
  await userEvent.click(review)
  expect(await screen.findByRole('heading', { name: 'Caregiver approvals' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
  expect(calls.some((call) => call.url.endsWith('/decision') && (call.body as { action: string }).action === 'approve')).toBe(true)
})

test('caregivers see the apps but cannot change them', async () => {
  stubApi({}, makeState({ role: 'caregiver' }))
  window.location.hash = '#/apps'
  render(<App />)
  expect(await screen.findByRole('switch', { name: 'Use Uber' })).toBeDisabled()
  expect(screen.getByText('Only the account owner can change these.')).toBeInTheDocument()
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

test('the skip link moves focus to the content without changing the screen', async () => {
  stubApi()
  window.location.hash = '#/activity'
  render(<App />)
  await screen.findByRole('heading', { name: 'Your activity' })
  await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
  expect(screen.getByRole('main')).toHaveFocus()
  expect(window.location.hash).toBe('#/activity')
})
