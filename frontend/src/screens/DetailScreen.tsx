import { api, live } from '../hub'
import type { Activity } from '../hub'
import ActivityDetailView from '../components/ActivityDetailView'
import type { Hub } from './hubType'

export default function DetailScreen({ hub, id }: { hub: Hub; id: string }) {
  const { state, busy, run, refresh } = hub
  const item = state.activity.find((entry) => entry.id === id)
  if (!item) return <><a className="back" href="#/activity">Back to activity</a><p>That activity is not available.</p></>
  const call = (path: string, method = 'POST', body?: unknown) => void run(async () => { await api<Activity>(path, method, body); await refresh() })
  const conversation = state.conversations?.find((entry) => entry.request_id && entry.request_id === item.request_id)
  const appointment = state.appointments?.find((entry) => entry.id === item.appointment_id)
  const pending = item.payment?.status === 'PENDING_SIMULATED' && ['CONFIRMED_SIMULATED', 'COMPLETED_SIMULATED'].includes(item.booking_status)
  return (
    <ActivityDetailView
      item={item}
      events={state.events ?? []}
      conversation={conversation}
      appointment={appointment}
      actions={
        <>
          {live(item) ? <button className="secondary" disabled={busy} onClick={() => call(`/bookings/${id}/cancel`)}>Cancel booking</button> : null}
          {state.demo_controls && item.booking_status === 'CONFIRMED_SIMULATED' ? <button className="secondary" disabled={busy} onClick={() => call(`/bookings/${id}/complete`)}>Demo: mark trip or delivery completed</button> : null}
          {state.demo_controls && pending ? <button className="secondary" disabled={busy} onClick={() => call(`/bookings/${id}/payment/complete`)}>Demo: mark simulated payment complete</button> : null}
        </>
      }
      extra={
        <section className="card">
          <h2>Sharing</h2>
          <label className="check-row">
            <input type="checkbox" checked={item.shared !== false} disabled={busy} onChange={(event) => call(`/bookings/${id}/sharing`, 'PUT', { shared: event.target.checked })} />
            Share this with my Care Circle
          </label>
          <p className="muted">Only people you have given activity access can see it, and never your addresses or payment details unless you allow that.</p>
        </section>
      }
    />
  )
}
