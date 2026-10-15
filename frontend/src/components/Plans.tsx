import { useState } from 'react'
import { api, formatWhen } from '../hub'
import type { Appointment, Reminder } from '../hub'
import { toEpoch, toLocalInput } from '../filters'

export type Runner = { busy: boolean; run: (action: () => Promise<void>) => Promise<void>; refresh: () => Promise<void> }

const reminderLabel = { upcoming: 'Upcoming', missed: 'Missed · follow up', done: 'Done' } as const

type PlansProps = {
  runner: Runner
  appointments: Appointment[]
  reminders: Reminder[]
  canEdit: boolean
  canMarkDone: boolean
  canMedicine: boolean
  title?: string
}

export function UpcomingPlans({ runner, appointments, reminders, canEdit, canMarkDone, canMedicine, title = 'Upcoming' }: PlansProps) {
  const { busy, run, refresh } = runner
  const [now] = useState(() => Date.now())
  const soon = appointments.filter((a) => a.starts_at * 1000 > now - 3_600_000)
  const open = reminders.filter((r) => r.status !== 'done')
  const call = (path: string, method: string) => void run(async () => { await api(path, method); await refresh() })
  return (
    <section className="card plans" aria-labelledby="plans-title">
      <h2 id="plans-title">{title}</h2>
      {soon.length || open.length ? null : <p className="muted">No appointments or reminders yet.</p>}
      <ul className="plan-list">
        {soon.map((a) => (
          <li key={a.id} className="plan appointment">
            <strong>{a.title}</strong>
            <span>{formatWhen(a.starts_at)} · {a.place}</span>
            {a.ride_request_id ? <a href={`#/activity/${a.ride_request_id}`}>Ride arranged (simulated)</a> : <span className="muted">No ride booked</span>}
            {canEdit ? <button className="secondary small" disabled={busy} onClick={() => call(`/appointments/${a.id}`, 'DELETE')}>Remove</button> : null}
          </li>
        ))}
        {open.map((r) => (
          <li key={r.id} className={`plan reminder ${r.status}`}>
            <strong>{r.title}</strong>
            <span>{formatWhen(r.due_at)} · <span className={`chip ${r.status}`}>{reminderLabel[r.status]}</span></span>
            {r.kind === 'medicine' ? <small className="muted">A reminder is not proof that a medicine was taken.</small> : null}
            <div className="actions">
              {canMarkDone ? <button className="secondary small" disabled={busy} onClick={() => call(`/reminders/${r.id}/done`, 'POST')}>I've done this</button> : null}
              {canEdit && (r.kind !== 'medicine' || canMedicine) ? <button className="secondary small" disabled={busy} onClick={() => call(`/reminders/${r.id}`, 'DELETE')}>Remove</button> : null}
            </div>
          </li>
        ))}
      </ul>
      {canEdit ? <PlanForms runner={runner} canMedicine={canMedicine} /> : null}
    </section>
  )
}

function PlanForms({ runner, canMedicine }: { runner: Runner; canMedicine: boolean }) {
  const { busy, run, refresh } = runner
  const [tomorrow] = useState(() => toLocalInput(Date.now() / 1000 + 86_400))
  const [appointment, setAppointment] = useState({ title: '', with_whom: '', place: '', when: tomorrow })
  const [reminder, setReminder] = useState({ title: '', kind: 'other', when: tomorrow })
  return (
    <>
      <details className="more">
        <summary>Add an appointment</summary>
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            const { when, ...rest } = appointment
            await api('/appointments', 'POST', { ...rest, starts_at: toEpoch(when) })
            setAppointment({ title: '', with_whom: '', place: '', when: tomorrow })
            await refresh()
          })
        }}>
          <label className="field"><span>What</span><input required maxLength={80} value={appointment.title} placeholder="Check-up with Dr Mehta" onChange={(e) => setAppointment({ ...appointment, title: e.target.value })} /></label>
          <label className="field"><span>With (optional)</span><input maxLength={60} value={appointment.with_whom} onChange={(e) => setAppointment({ ...appointment, with_whom: e.target.value })} /></label>
          <label className="field"><span>Where</span><input required maxLength={150} value={appointment.place} placeholder="Sunrise Clinic" onChange={(e) => setAppointment({ ...appointment, place: e.target.value })} /></label>
          <label className="field"><span>When</span><input required type="datetime-local" value={appointment.when} onChange={(e) => setAppointment({ ...appointment, when: e.target.value })} /></label>
          <button className="primary wide" disabled={busy}>Save appointment</button>
        </form>
      </details>
      <details className="more">
        <summary>Add a reminder</summary>
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await api('/reminders', 'POST', { title: reminder.title, kind: reminder.kind, due_at: toEpoch(reminder.when) })
            setReminder({ title: '', kind: 'other', when: tomorrow })
            await refresh()
          })
        }}>
          <label className="field"><span>Reminder</span><input required maxLength={80} value={reminder.title} placeholder="Call the clinic" onChange={(e) => setReminder({ ...reminder, title: e.target.value })} /></label>
          <label className="field"><span>Kind</span>
            <select value={reminder.kind} onChange={(e) => setReminder({ ...reminder, kind: e.target.value })}>
              <option value="other">Everyday</option><option value="appointment">Appointment</option>
              {canMedicine ? <option value="medicine">Medicine refill</option> : null}
            </select>
          </label>
          <label className="field"><span>When</span><input required type="datetime-local" value={reminder.when} onChange={(e) => setReminder({ ...reminder, when: e.target.value })} /></label>
          <button className="primary wide" disabled={busy}>Save reminder</button>
        </form>
      </details>
    </>
  )
}
