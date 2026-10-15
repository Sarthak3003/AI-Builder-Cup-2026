import type { Filters } from '../filters'

export default function ActivityFilters({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  return (
    <fieldset className="filters">
      <legend className="sr-only">Filter activity</legend>
      <label className="field"><span>Type</span>
        <select value={filters.service} onChange={(event) => onChange({ ...filters, service: event.target.value as Filters['service'] })}>
          <option value="all">All</option><option value="ride">Rides</option><option value="food">Food</option><option value="medicine">Medicine</option>
        </select>
      </label>
      <label className="field"><span>Status</span>
        <select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as Filters['status'] })}>
          <option value="all">All</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option><option value="failed">Failed</option><option value="cancelled">Cancelled or declined</option>
        </select>
      </label>
      <label className="field"><span>When</span>
        <select value={filters.range} onChange={(event) => onChange({ ...filters, range: event.target.value as Filters['range'] })}>
          <option value="all">Any time</option><option value="today">Today</option><option value="week">Last 7 days</option>
        </select>
      </label>
    </fieldset>
  )
}
