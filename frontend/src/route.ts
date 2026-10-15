import { useCallback, useEffect, useState } from 'react'
import type { Service, StepId } from './hub'

export type Route =
  | { page: 'home' }
  | { page: 'request'; service: Service; proposal?: string }
  | { page: 'detail'; id: string }
  | { page: 'join'; code: string }
  | { page: 'onboarding'; step?: StepId }
  | { page: PlainPage }

export const services: Service[] = ['ride', 'food', 'medicine']
export const setupSteps: StepId[] = ['welcome', 'accessibility', 'places', 'care_circle', 'services', 'payment', 'review']
export type TabPage = 'home' | 'activity' | 'services' | 'family' | 'profile' | 'approvals' | 'conversations' | 'safety'
export const tabHref = (page: TabPage) => (page === 'home' ? '#/' : `#/${page}`)
const plainPages = ['activity', 'services', 'family', 'profile', 'about', 'approvals', 'conversations', 'safety', 'circle'] as const
type PlainPage = (typeof plainPages)[number]

export function parseRoute(hash: string): Route {
  const [page, argument, proposal] = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (page === 'request' && services.includes(argument as Service)) return proposal ? { page, service: argument as Service, proposal } : { page, service: argument as Service }
  if (page === 'activity' && argument) return { page: 'detail', id: argument }
  if (page === 'join' && argument) return { page: 'join', code: argument }
  if (page === 'onboarding') return setupSteps.includes(argument as StepId) ? { page, step: argument as StepId } : { page }
  if (page === 'apps') return { page: 'services' }
  const plain = plainPages.find((name) => name === page)
  return plain ? { page: plain } : { page: 'home' }
}

export function routeHref(route: Route): string {
  if (route.page === 'home') return '#/'
  if (route.page === 'request') return `#/request/${route.service}${route.proposal ? `/${route.proposal}` : ''}`
  if (route.page === 'detail') return `#/activity/${route.id}`
  if (route.page === 'join') return `#/join/${route.code}`
  if (route.page === 'onboarding') return `#/onboarding${route.step ? `/${route.step}` : ''}`
  return `#/${route.page}`
}

export function useRoute(): [Route, (route: Route) => void] {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const go = useCallback((route: Route) => {
    window.location.hash = routeHref(route)
  }, [])
  return [parseRoute(hash), go]
}

// A home-screen shortcut opens /?service=ride; turn it into a normal screen once, then tidy the address.
export function applyShortcut(go: (route: Route) => void) {
  const params = new URLSearchParams(window.location.search)
  const service = params.get('service') as Service | null
  if (service && services.includes(service) && !window.location.hash) go({ page: 'request', service })
  if (params.has('service') || params.has('source')) {
    params.delete('service')
    params.delete('source')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }
}
