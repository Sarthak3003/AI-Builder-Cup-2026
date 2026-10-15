import { api } from '../hub'
import type { Activity } from '../hub'
import ActivityDetailView from '../components/ActivityDetailView'
import type { Hub } from './hubType'

export default function DetailScreen({ hub, id }: { hub: Hub; id: string }) {
  const { state, busy, run, refresh } = hub
  const item = state.activity.find((entry) => entry.id === id)
  if (!item) return <><a className="back" href="#/activity">Back to activity</a><p>That activity is not available.</p></>
  const call = (path: string, method = 'POST', body?: unknown) => void run(async () => { await api<Activity>(path, method, body); await refresh() })
  const conversation = state.conversations?.find((entry) => entry.request_id === id)
  const appointment = state.appointments?.find((entry) => entry.id === item.appointment_id)
  return (
    <ActivityDetailView
      item={item}
      events={state.events ?? []}
      conversation={conversation}
      appointment={appointment}
      actions={
        <>
          {['awaiting_approval', 'simulated_confirmed'].includes(item.status) ? <button className="secondary" disabled={busy} onClick={() => call(`/activity/${id}/cancel`, 'POST', {})}>Cancel request</button> : null}
          {state.demo_controls && item.status === 'simulated_confirmed' ? <button className="secondary" disabled={busy} onClick={() => call(`/activity/${id}/complete`)}>Demo: mark completed</button> : null}
        </>
      }
      extra={
        <section className="card">
          <h2>Sharing</h2>
          <label className="check-row">
            <input type="checkbox" checked={item.shared !== false} disabled={busy} onChange={(event) => call(`/activity/${id}/sharing`, 'PUT', { shared: event.target.checked })} />
            Share this with my Care Circle
          </label>
          <p className="muted">Only people you have given activity access can see it.</p>
        </section>
      }
    />
  )
}
