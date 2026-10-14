import { vi } from 'vitest'
import type { CatalogueApp, HubState } from './hub'

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
    ...overrides,
  }
}

export const swiggyMeal = { id: 'swiggy-khichdi', provider: 'swiggy', provider_name: 'Swiggy', name: 'Vegetable khichdi', price: 110, eta_min: 25, simulated: true, detail: 'From Demo Home Kitchen · Vegetarian, mild · Price includes delivery' }
export const uberRide = { id: 'uber-go', provider: 'uber', provider_name: 'Uber', name: 'Uber Go', price: 180, eta_min: 6, simulated: true, detail: 'Demo home to Clinic · Sample fare' }

export type Call = { method: string; url: string; body: unknown }
const failureMark = Symbol('failure')
type Failure = { [failureMark]: true; status: number; body: unknown }
export const fail = (status: number, body: unknown): Failure => ({ [failureMark]: true, status, body })
type Route = (body: unknown) => unknown

// Stands in for the backend. Route keys look like "POST /requests" or "POST /requests/*/confirm" (paths under /api/hub).
export function stubApi(routes: Record<string, Route> = {}, initial: HubState = makeState()) {
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
