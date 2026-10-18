import { vi } from 'vitest'
import type { Activity, BookingStatus, CareState, CatalogueApp, ConnectionStatus, DemoService, HubState, PaymentStatus, Place, Progress, Quote, StepId } from './hub'

export const catalogue: CatalogueApp[] = [
  { id: 'uber', name: 'Uber', service: 'ride', service_type: 'RIDE', simulated: true },
  { id: 'ola', name: 'Ola', service: 'ride', service_type: 'RIDE', simulated: true },
  { id: 'rapido', name: 'Rapido', service: 'ride', service_type: 'RIDE', simulated: true },
  { id: 'ubereats', name: 'Uber Eats', service: 'food', service_type: 'FOOD', simulated: true },
  { id: 'swiggy', name: 'Swiggy', service: 'food', service_type: 'FOOD', simulated: true },
  { id: 'zomato', name: 'Zomato', service: 'food', service_type: 'FOOD', simulated: true },
]

export function makeState(overrides: Partial<HubState> = {}): HubState {
  return {
    profile: {
      name: 'Friend', language: 'en-IN', large_text: false, high_contrast: false, simple: false, vegetarian: true, mild: true, budget: 200,
      home: 'Demo home', caregiver_name: '', approval_limit: 150, caregiver_enabled: false, medicines: ['Saved medicine A'],
      enabled_providers: catalogue.map((app) => app.id), channel: 'app', read_aloud: false, offer_help: true, payment_method: 'DEMO_WALLET',
    },
    role: 'owner', storage: 'local-sqlite', catalogue, activity: [], quotes: [], messages: [], audit: [],
    care_circle: [], events: [], appointments: [], reminders: [], contacts: [], conversations: [],
    permissions: permissionLabels, sensitive: ['manage_contacts', 'view_medication', 'view_payments', 'view_transcripts'], demo_controls: false,
    roles: { viewer: ['view_activity'], assistant: ['view_activity', 'manage_reminders', 'edit_profile'], approver: ['view_activity', 'approve'], administrator: ['view_activity', 'manage_circle'] },
    onboarding: progress('done'), places, services: demoServices(), sample_places: samplePlaces,
    payment_methods: { DEMO_WALLET: 'Demo wallet (simulated)', PAY_ON_COMPLETION: 'Pay on completion (simulated)' },
    ...overrides,
  }
}

export const places: Place[] = [
  { id: 'place-home', label: 'Home', address: '12 Sample Lane, Demo Nagar (sample address)', notes: 'Gate 2', is_default_pickup: true },
  { id: 'place-doctor', label: 'Doctor', address: 'Sunrise Clinic, 4 Example Road (sample address)', notes: 'Dr Mehta', is_default_pickup: false },
]
export const samplePlaces = [
  { label: 'Home', address: '12 Sample Lane, Demo Nagar (sample address)', notes: 'Gate 2, ground floor' },
  { label: 'Doctor', address: 'Sunrise Clinic, 4 Example Road (sample address)', notes: 'Dr Mehta' },
]
const stepTitles: [StepId, string][] = [
  ['welcome', 'Welcome'], ['accessibility', 'Comfort and accessibility'], ['places', 'Saved places'], ['care_circle', 'Care Circle'],
  ['services', 'Demo services'], ['payment', 'Payment (simulated)'], ['review', 'Review and finish'],
]

// 'done' is a finished setup; a number is how many steps are already done, in order.
export function progress(done: 'done' | number = 'done'): Progress {
  const count = done === 'done' ? stepTitles.length : done
  const steps = stepTitles.map(([id, title], index) => ({ id, title, status: index < count ? ('done' as const) : null }))
  return {
    steps, current: steps.find((step) => step.status === null)?.id ?? 'review', completed: done === 'done',
    completed_at: done === 'done' ? 1 : null, started_at: count ? 1 : null,
    review: {
      name: 'Meera', language: 'en-IN', channel: 'Tapping in the app', comfort: ['Larger text'], places: ['Home', 'Doctor'], pickup: 'Home',
      show_options: true,
      services: demoServices().map((s) => ({ service_type: s.service_type, provider_label: s.provider_label, status: s.status })),
      payment: 'Demo wallet (simulated)', care_circle: [{ name: 'Ravi', role: 'viewer', permissions: ['view_activity'] }], approval_rule: '',
      missing: done === 'done' ? [] : ['Payment (simulated)'],
    },
  }
}

export function demoServices(status: ConnectionStatus = 'CONNECTED'): DemoService[] {
  const on = status === 'CONNECTED'
  const base = { connection_mode: 'SIMULATED' as const, status, consent_at: on ? 1_760_000_000 : null, updated_at: null, notice: 'Simulated provider — no real order or dispatch.' }
  return [
    { ...base, service_type: 'RIDE', provider_type: 'DEMO_RIDE', provider_label: 'Demo Ride Provider', description: 'Simulated rides. Options appear under familiar names (Uber, Ola, Rapido) as examples only.',
      granted_capabilities: on ? ['quote_rides', 'book_rides', 'cancel_rides'] : [], capabilities: [{ id: 'quote_rides', label: 'Get sample ride fares' }, { id: 'book_rides', label: 'Make simulated ride bookings' }],
      catalogue: { options: [
        { id: 'demo-ride', name: 'Demo Ride', app_id: null, app_name: null, pickup_min: 4, enabled: true },
        { id: 'rapido-auto', name: 'Rapido Auto', app_id: 'rapido', app_name: 'Rapido', pickup_min: 3, enabled: true },
        { id: 'ola-mini', name: 'Ola Mini', app_id: 'ola', app_name: 'Ola', pickup_min: 5, enabled: true },
        { id: 'uber-go', name: 'Uber Go', app_id: 'uber', app_name: 'Uber', pickup_min: 6, enabled: true },
      ] } },
    { ...base, service_type: 'FOOD', provider_type: 'DEMO_FOOD', provider_label: 'Demo Food Provider', description: 'Simulated meals from fictional demo kitchens.',
      granted_capabilities: on ? ['quote_orders', 'place_orders', 'cancel_orders'] : [], capabilities: [{ id: 'quote_orders', label: 'Get sample prices' }],
      catalogue: { delivery_fee_minor: 2500, kitchens: [
        { id: 'demo-kitchen', name: 'Saathi Demo Kitchen', app_name: null, enabled: true, items: [
          { id: 'khichdi', name: 'Vegetable khichdi', price_minor: 8000, vegetarian: true, mild: true, minutes: 25 },
          { id: 'dal', name: 'Dal and rice', price_minor: 9500, vegetarian: true, mild: true, minutes: 30 },
        ] },
        { id: 'swiggy', name: 'Demo Home Kitchen', app_name: 'Swiggy', enabled: true, items: [
          { id: 'khichdi', name: 'Vegetable khichdi', price_minor: 8500, vegetarian: true, mild: true, minutes: 25 },
          { id: 'roti', name: 'Two rotis', price_minor: 2000, vegetarian: true, mild: true, minutes: 15 },
        ] },
      ] } },
    { ...base, service_type: 'PHARMACY', provider_type: 'DEMO_PHARMACY', provider_label: 'Demo Pharmacy Provider', description: 'Simulated orders of sample non-prescription items.',
      granted_capabilities: on ? ['quote_orders', 'place_orders', 'cancel_orders'] : [], capabilities: [{ id: 'quote_orders', label: 'Get sample prices' }],
      catalogue: { delivery_fee_minor: 2000, items: [
        { id: 'ors', name: 'ORS sachets, pack of 5 (sample)', price_minor: 6000 },
        { id: 'bandage', name: 'Crepe bandage, 10 cm (sample)', price_minor: 12000 },
      ] } },
  ]
}

const nowSeconds = () => Date.now() / 1000
const home = { label: 'Home', address: '12 Sample Lane, Demo Nagar (sample address)', place_id: 'place-home' }
const doctor = { label: 'Doctor', address: 'Sunrise Clinic, 4 Example Road (sample address)', place_id: 'place-doctor' }

export function rideQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'q-uber', request_id: 'r-1', service: 'ride', service_type: 'RIDE', provider_type: 'DEMO_RIDE', provider_label: 'Demo Ride Provider',
    option_id: 'uber-go', option_name: 'Uber Go', app_id: 'uber', app_name: 'Uber', title: 'Uber Go to Doctor',
    line_items: [{ label: 'Base fare', amount_minor: 5000 }, { label: 'Distance, 5.3 km at ₹16/km', amount_minor: 8500 }],
    amount_minor: 13500, currency: 'INR', pickup_eta_min: 6, duration_min: 21, delivery_min: null,
    details: { pickup: home, destination: doctor, distance_km: 5.3 }, notice: 'Demo ride — no real driver will arrive.', simulated: true,
    payment_method: 'DEMO_WALLET', approval: { required: false, reason: '' }, channel: 'app', appointment_id: null, status: 'ACTIVE',
    created_at: nowSeconds(), expires_at: nowSeconds() + 900, ...overrides,
  }
}
export const rapidoQuote = () => rideQuote({
  id: 'q-rapido', option_id: 'rapido-auto', option_name: 'Rapido Auto', app_id: 'rapido', app_name: 'Rapido', title: 'Rapido Auto to Doctor',
  line_items: [{ label: 'Base fare', amount_minor: 2500 }, { label: 'Distance, 5.3 km at ₹11/km', amount_minor: 5800 }], amount_minor: 8300, pickup_eta_min: 3,
})
export const demoRideQuote = () => rideQuote({
  id: 'q-demo-ride', option_id: 'demo-ride', option_name: 'Demo Ride', app_id: null, app_name: null, title: 'Demo Ride to Doctor',
  line_items: [{ label: 'Base fare', amount_minor: 3000 }, { label: 'Distance, 5.3 km at ₹12/km', amount_minor: 6400 }], amount_minor: 9400, pickup_eta_min: 4,
})
export const olaQuote = () => rideQuote({
  id: 'q-ola', option_id: 'ola-mini', option_name: 'Ola Mini', app_id: 'ola', app_name: 'Ola', title: 'Ola Mini to Doctor',
  line_items: [{ label: 'Base fare', amount_minor: 4500 }, { label: 'Distance, 5.3 km at ₹15/km', amount_minor: 8000 }], amount_minor: 12500, pickup_eta_min: 5,
})
export function mealQuote(overrides: Partial<Quote> = {}): Quote {
  return rideQuote({
    id: 'q-meal', request_id: 'r-2', service: 'food', service_type: 'FOOD', provider_type: 'DEMO_FOOD', provider_label: 'Demo Food Provider',
    option_id: 'swiggy', option_name: 'Demo Home Kitchen', app_id: 'swiggy', app_name: 'Swiggy', title: 'Vegetable khichdi from Demo Home Kitchen',
    line_items: [{ label: 'Vegetable khichdi × 1', amount_minor: 8500 }, { label: 'Delivery fee (demo)', amount_minor: 2500 }], amount_minor: 11000,
    pickup_eta_min: null, duration_min: null, delivery_min: 25, notice: 'Demo order — no real food will be delivered.',
    details: { kitchen: 'Demo Home Kitchen', items: [{ item_id: 'khichdi', name: 'Vegetable khichdi', quantity: 1, unit_minor: 8500, vegetarian: true, mild: true }] },
    ...overrides,
  })
}

// A booking made from a quote, with the payment the backend would record for that status.
export function booking(quote: Quote, status: BookingStatus = 'CONFIRMED_SIMULATED', overrides: Partial<Activity> = {}): Activity {
  const made = status === 'CONFIRMED_SIMULATED' || status === 'COMPLETED_SIMULATED'
  const paid: PaymentStatus = made ? (quote.payment_method === 'DEMO_WALLET' ? 'SUCCEEDED_SIMULATED' : 'PENDING_SIMULATED') : 'NOT_CHARGED_SIMULATED'
  return {
    service: quote.service, service_type: quote.service_type, provider_type: quote.provider_type, provider_label: quote.provider_label,
    option_id: quote.option_id, option_name: quote.option_name, app_id: quote.app_id, app_name: quote.app_name, title: quote.title,
    line_items: quote.line_items, amount_minor: quote.amount_minor, currency: 'INR', pickup_eta_min: quote.pickup_eta_min,
    duration_min: quote.duration_min, delivery_min: quote.delivery_min, details: quote.details, notice: quote.notice, simulated: true,
    id: `b-${quote.option_id}-${status.toLowerCase()}`, quote_id: quote.id, request_id: quote.request_id, channel: 'app', booking_status: status,
    provider_booking_id: made ? `${quote.service_type === 'RIDE' ? 'DEMO-RIDE' : 'DEMO-FOOD'}-1042` : null,
    payment: { method: quote.payment_method, status: paid, amount_minor: quote.amount_minor, currency: 'INR', simulated: true, refund: null },
    shared: true, approval_reason: '', appointment_id: quote.appointment_id, decision: null, questions: [], failure: '',
    trip: made && quote.service_type === 'RIDE' ? { vehicle: 'Hatchback', plate: 'DEMO 1042', pin: '2957' } : null,
    created_at: nowSeconds() - 60, ...overrides,
  }
}

export const permissionLabels: Record<string, string> = {
  view_activity: 'See shared rides, orders and appointments', manage_reminders: 'Add and change reminders and appointments',
  edit_profile: 'Help edit saved addresses', approve: 'Approve or decline requests sent for approval', view_summaries: 'Read conversation summaries',
  receive_alerts: 'Receive safety alerts', manage_circle: 'Invite and remove other caretakers', view_medication: 'See saved medicine details',
  view_transcripts: 'Read full conversation transcripts', view_payments: 'See simulated payment status', manage_contacts: 'Change emergency contacts',
}

export function makeCareState(permissions: string[] = ['view_activity'], overrides: Partial<CareState> = {}): CareState {
  return {
    role: 'caregiver',
    grant: { id: 'grant-asha', name: 'Asha', relationship: 'Daughter', role: permissions.includes('approve') ? 'approver' : 'viewer', permissions },
    owner: { name: 'Meera', language: 'en-IN' },
    profile: { name: 'Meera', language: 'en-IN', home: '', medicines: [], approval_limit: 150, large_text: false, high_contrast: false },
    activity: [], approvals: [], appointments: [], reminders: [], contacts: [], events: [], circle: [], conversations: [],
    permissions: permissionLabels, storage: 'local-sqlite', catalogue,
    ...overrides,
  }
}

export type Call = { method: string; url: string; body: unknown }
const failureMark = Symbol('failure')
type Failure = { [failureMark]: true; status: number; body: unknown }
export const fail = (status: number, body: unknown): Failure => ({ [failureMark]: true, status, body })
type Route = (body: unknown) => unknown

// Stands in for the backend. Route keys look like "POST /requests" or "POST /requests/*/confirm" (paths under /api/hub).
export function stubApi(routes: Record<string, Route> = {}, initial: HubState | CareState = makeState()) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })
    const respond = (value: unknown) => {
      const failure = typeof value === 'object' && value !== null && failureMark in value ? (value as Failure) : null
      return { ok: !failure, status: failure?.status ?? 200, json: async () => (failure ? failure.body : value) }
    }
    if (url === '/api/health') return respond({ status: 'ok', service: 'saathi-api' })
    if (url === '/api/version') return respond({ version: '0.1.0', environment: 'test' })
    const path = url.replace('/api/hub', '')
    for (const [key, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = key.split(' ')
      const pattern = new RegExp(`^${routePath.replace(/\*/g, '[^/]+')}$`)
      if (routeMethod === method && pattern.test(path)) return respond(handler(body))
    }
    if (path === '/session' || path === '/state' || path === '/snapshot') return respond(initial)
    return respond(fail(404, { detail: 'Not found' }))
  }))
  return calls
}
