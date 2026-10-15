import { useState } from 'react'
import { api } from '../hub'
import type { Activity } from '../hub'
import { applyFilters, noFilters } from '../filters'
import ActivityDetailView from '../components/ActivityDetailView'
import ActivityFilters from '../components/ActivityFilters'
import ActivityList from '../components/ActivityList'
import { allowed } from './careHub'
import type { CareHub } from './careHub'

export function CareActivity({ hub }: { hub: CareHub }) {
  const [filters, setFilters] = useState(noFilters)
  if (!allowed(hub, 'view_activity')) return <NotShared what="rides, orders and appointments" name={hub.state.owner.name} />
  return (
    <>
      <h1 className="page-title">{hub.state.owner.name}'s activity</h1>
      <p className="muted">Only what {hub.state.owner.name} shares. All bookings and payments are simulated.</p>
      <ActivityFilters filters={filters} onChange={setFilters} />
      <ActivityList items={applyFilters(hub.state.activity, filters)} empty={<p>Nothing shared yet.</p>} />
    </>
  )
}

export function NotShared({ what, name }: { what: string; name: string }) {
  return (
    <section className="card">
      <h1 className="page-title">Not shared with you</h1>
      <p>{name} has not given you access to {what}. Only {name} can change that.</p>
    </section>
  )
}

export function DecisionButtons({ hub, item }: { hub: CareHub; item: Activity }) {
  const { busy, run, refresh, notify } = hub
  const [question, setQuestion] = useState('')
  const decide = (action: string, note = '') => void run(async () => {
    await api(`/bookings/${item.id}/decision`, 'POST', { action, note })
    await refresh()
    notify(action === 'approve' ? 'Approved. The demo provider was asked to book it (simulated).' : action === 'reject' ? 'Declined. Nothing was booked.' : 'Your question was sent.')
  })
  return (
    <>
      <button className="primary" disabled={busy} onClick={() => decide('approve')}>Approve</button>
      <button className="secondary" disabled={busy} onClick={() => decide('reject')}>Decline</button>
      <form className="inline-form" onSubmit={(event) => { event.preventDefault(); decide('ask', question); setQuestion('') }}>
        <label className="field"><span>Ask a question first</span>
          <input maxLength={300} value={question} placeholder="Is this for tomorrow's check-up?" onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button className="secondary" disabled={busy}>Send question</button>
      </form>
    </>
  )
}

export function CareDetail({ hub, id }: { hub: CareHub; id: string }) {
  const { state } = hub
  const item = state.approvals.find((entry) => entry.id === id) ?? state.activity.find((entry) => entry.id === id)
  if (!item) return <><a className="back" href="#/activity">Back to activity</a><p>That activity is not shared with you.</p></>
  const pending = item.booking_status === 'AWAITING_APPROVAL' && allowed(hub, 'approve')
  return (
    <ActivityDetailView
      item={item}
      events={state.events}
      conversation={state.conversations.find((conv) => conv.request_id && conv.request_id === item.request_id)}
      appointment={state.appointments.find((a) => a.id === item.appointment_id)}
      actions={pending ? <DecisionButtons hub={hub} item={item} /> : null}
    />
  )
}

export function Approvals({ hub }: { hub: CareHub }) {
  const { state } = hub
  if (!allowed(hub, 'approve')) return <NotShared what="approving requests" name={state.owner.name} />
  return (
    <>
      <h1 className="page-title">Approvals</h1>
      <p className="muted">{state.owner.name} asked to check these before they are booked. Approving sends it to the demo provider as a simulated booking; nothing real is booked or charged.</p>
      <ActivityList
        items={state.approvals}
        empty={<p>Nothing is waiting for you.</p>}
        actions={(item) => (
          <>
            {item.approval_reason ? <p className="clarify">Why: {item.approval_reason}</p> : null}
            <DecisionButtons hub={hub} item={item} />
          </>
        )}
      />
    </>
  )
}
