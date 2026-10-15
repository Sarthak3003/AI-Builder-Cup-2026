import { vi } from 'vitest'
import type { CareState, CatalogueApp, HubState } from './hub'

export const catalogue: CatalogueApp[] = [
  { id: 'uber', name: 'Uber', service: 'ride', blurb: 'Cabs', simulated: true },
  { id: 'ola', name: 'Ola', service: 'ride', blurb: 'Cabs', simulated: true },
  { id: 'rapido', name: 'Rapido', service: 'ride', blurb: 'Autos and bikes', simulated: true },
  { id: 'ubereats', name: 'Uber Eats', service: 'food', blurb: 'Meals delivered to your door', simulated: true },
  { id: 'swiggy', name: 'Swiggy', service: 'food', blurb: 'Meals delivered to your door', simulated: true },
  { id: 'zomato', name: 'Zomato', service: 'food', blurb: 'Meals delivered to your door', simulated: true },
  { id: 'pharmacy', name: 'Demo pharmacy', service: 'medicine', blurb: 'Medicines saved in your profile', simulated: true },
]

export function makeState(overrides: Partial<HubState> = {}): HubState {
  return {
    profile: {
      name: 'Friend', language: 'en-IN', large_text: false, high_contrast: false, simple: false, vegetarian: true, mild: true, budget: 200,
      home: 'Demo home', caregiver_name: '', approval_limit: 150, caregiver_enabled: false, medicines: ['Saved medicine A'],
      enabled_providers: catalogue.map((app) => app.id),
    },
    role: 'owner', storage: 'local-sqlite', catalogue, activity: [], requests: [], messages: [], audit: [],
    care_circle: [], events: [], appointments: [], reminders: [], contacts: [], conversations: [],
    permissions: permissionLabels, sensitive: ['manage_contacts', 'view_medication', 'view_payments', 'view_transcripts'], demo_controls: false,
    roles: { viewer: ['view_activity'], assistant: ['view_activity', 'manage_reminders', 'edit_profile'], approver: ['view_activity', 'approve'], administrator: ['view_activity', 'manage_circle'] },
    ...overrides,
  }
}

export const swiggyMeal = { id: 'swiggy-khichdi', provider: 'swiggy', provider_name: 'Swiggy', name: 'Vegetable khichdi', price: 110, eta_min: 25, simulated: true, detail: 'From Demo Home Kitchen · Vegetarian, mild · Price includes delivery' }
export const uberRide = { id: 'uber-go', provider: 'uber', provider_name: 'Uber', name: 'Uber Go', price: 180, eta_min: 6, simulated: true, detail: 'Demo home to Clinic · Sample fare' }

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
    if (path === '/session' || path === '/state') return respond(initial)
    return respond(fail(404, { detail: 'Not found' }))
  }))
  return calls
}
