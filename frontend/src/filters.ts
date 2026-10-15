import type { Activity, Service } from './hub'

export type Filters = { service: Service | 'all'; status: 'all' | 'pending' | 'confirmed' | 'completed' | 'failed' | 'cancelled'; range: 'all' | 'today' | 'week' }
export const noFilters: Filters = { service: 'all', status: 'all', range: 'all' }

const groups: Record<Exclude<Filters['status'], 'all'>, string[]> = {
  pending: ['awaiting_approval'],
  confirmed: ['simulated_confirmed'],
  completed: ['completed'],
  failed: ['failed'],
  cancelled: ['cancelled', 'rejected'],
}

export function applyFilters(items: Activity[], filters: Filters, now = Date.now()): Activity[] {
  const since = filters.range === 'today' ? new Date(now).setHours(0, 0, 0, 0) : filters.range === 'week' ? now - 7 * 86_400_000 : 0
  return items.filter((item) =>
    (filters.service === 'all' || item.service === filters.service) &&
    (filters.status === 'all' || groups[filters.status].includes(item.status)) &&
    item.created_at * 1000 >= since)
}

// datetime-local works in local time without seconds; the API stores epoch seconds.
export const toEpoch = (local: string) => new Date(local).getTime() / 1000
export function toLocalInput(seconds: number) {
  const date = new Date(seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
