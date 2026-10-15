import { useState } from 'react'
import { api, live } from '../hub'
import type { Activity } from '../hub'
import { applyFilters, noFilters } from '../filters'
import ActivityFilters from '../components/ActivityFilters'
import ActivityList from '../components/ActivityList'
import { UpcomingPlans } from '../components/Plans'
import type { Hub } from './hubType'

export default function ActivityScreen({ hub, simple = false }: { hub: Hub; simple?: boolean }) {
  const { state, busy, run, refresh } = hub
  const [filters, setFilters] = useState(noFilters)
  const cancel = (item: Activity) => live(item) ? (
    <button className="secondary" disabled={busy} onClick={() => void run(async () => { await api(`/bookings/${item.id}/cancel`, 'POST'); await refresh() })}>Cancel booking</button>
  ) : null
  if (simple) {
    return (
      <>
        <h1 className="page-title">Your activity</h1>
        <ActivityList items={state.activity} simple actions={cancel} empty={<p>Nothing yet.</p>} />
      </>
    )
  }
  const shown = applyFilters(state.activity, filters)
  return (
    <>
      <h1 className="page-title">Your activity</h1>
      <p className="muted">Rides, meals, medicine requests and plans, whichever way you ask. All bookings and payments are simulated.</p>
      <UpcomingPlans runner={hub} appointments={state.appointments ?? []} reminders={state.reminders ?? []} canEdit canMarkDone canMedicine />
      <h2 className="section-title">History</h2>
      <ActivityFilters filters={filters} onChange={setFilters} />
      <ActivityList
        items={shown}
        actions={cancel}
        empty={state.activity.length ? <p>Nothing matches these filters.</p> : <><h2>A fresh start</h2><p>Your first request will appear here.</p><a className="primary" href="#/">Explore services</a></>}
      />
      <details className="audit">
        <summary>Who did what</summary>
        <ul>
          {state.audit.slice().reverse().map((event, index) => (
            <li key={index}>{event.event.replaceAll('_', ' ')}{event.actor && event.actor !== 'owner' ? ` · by ${event.actor}` : ''} · {new Date(event.at * 1000).toLocaleTimeString()}</li>
          ))}
        </ul>
      </details>
    </>
  )
}
