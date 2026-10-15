import { useState } from 'react'
import { formatWhen, statusLabel } from '../hub'
import { UpcomingPlans } from '../components/Plans'
import { allowed } from './careHub'
import type { CareHub } from './careHub'

const WEEK = 7 * 86_400

export default function Overview({ hub }: { hub: CareHub }) {
  const { state } = hub
  const name = state.owner.name
  const [now] = useState(() => Date.now() / 1000)
  const approvals = state.approvals
  const alerts = state.events.filter((event) => event.status === 'open' && event.kind !== 'approval_needed')
  const missed = state.reminders.filter((reminder) => reminder.status === 'missed')
  const attention = approvals.length + alerts.length + missed.length
  const upcoming = state.appointments.filter((a) => a.starts_at > now - 3600 && a.starts_at < now + WEEK)
  const active = state.activity.filter((item) => ['AWAITING_APPROVAL', 'CONFIRMED_SIMULATED', 'FAILED'].includes(item.booking_status))
  const updates = state.events.slice(0, 5)

  return (
    <>
      <p className="eyebrow">CARE CIRCLE</p>
      <h1 className="page-title">Supporting {name}</h1>
      <p className="muted">You see what {name} chose to share with you as {state.grant.role}. Everything booked here is simulated.</p>

      <section className="card overview attention" aria-labelledby="attention-title">
        <h2 id="attention-title">Needs your attention</h2>
        {attention ? (
          <ul className="plain-list">
            {approvals.length ? <li><a href="#/approvals">{approvals.length} request{approvals.length > 1 ? 's' : ''} waiting for your approval</a></li> : null}
            {alerts.length ? <li><a href="#/safety">{alerts.length} alert{alerts.length > 1 ? 's' : ''} to review</a></li> : null}
            {missed.map((reminder) => <li key={reminder.id}>Missed reminder: {reminder.title} (follow up; this does not mean anything was or was not done)</li>)}
          </ul>
        ) : <p>Nothing right now.</p>}
      </section>

      <section className="card overview" aria-labelledby="upcoming-title">
        <h2 id="upcoming-title">Upcoming</h2>
        {upcoming.length ? (
          <ul className="plain-list">
            {upcoming.map((a) => (
              <li key={a.id}><strong>{a.title}</strong> · {formatWhen(a.starts_at)} · {a.place}
                {a.ride_request_id ? <> · <a href={`#/activity/${a.ride_request_id}`}>ride arranged (simulated)</a></> : ' · no ride booked yet'}
              </li>
            ))}
          </ul>
        ) : <p className="muted">{allowed(hub, 'view_activity') ? 'No appointments in the next week.' : 'Appointments are not shared with you.'}</p>}
      </section>

      <section className="card overview" aria-labelledby="orders-title">
        <h2 id="orders-title">Active rides and orders</h2>
        {active.length ? (
          <ul className="plain-list">
            {active.map((item) => <li key={item.id}><a href={`#/activity/${item.id}`}>{item.title}</a> · {statusLabel[item.booking_status]}</li>)}
          </ul>
        ) : <p className="muted">{allowed(hub, 'view_activity') ? 'Nothing active.' : 'Activity is not shared with you.'}</p>}
      </section>

      <section className="card overview" aria-labelledby="updates-title">
        <h2 id="updates-title">New updates</h2>
        {updates.length ? (
          <ul className="plain-list">
            {updates.map((event) => <li key={event.id}>{event.title}{event.certainty === 'suspected' ? ' (suspected, not confirmed)' : ''} <small className="muted">· {formatWhen(event.at)}</small></li>)}
          </ul>
        ) : <p className="muted">No updates you can see yet.</p>}
      </section>

      {allowed(hub, 'manage_reminders') ? (
        <UpcomingPlans runner={hub} appointments={state.appointments} reminders={state.reminders} canEdit canMarkDone={false} canMedicine={allowed(hub, 'view_medication')} title="Manage appointments and reminders" />
      ) : null}
    </>
  )
}
