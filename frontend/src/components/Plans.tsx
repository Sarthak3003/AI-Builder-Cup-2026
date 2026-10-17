import { useState } from 'react'
import { api } from '../hub'
import { useI18n } from '../i18n'
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
  const { t, text, formatWhen } = useI18n()
  const { busy, run, refresh } = runner
  const [now] = useState(() => Date.now())
  const soon = appointments.filter((a) => a.starts_at * 1000 > now - 3_600_000)
  const open = reminders.filter((r) => r.status !== 'done')
  const call = (path: string, method: string) => void run(async () => { await api(path, method); await refresh() })
  return (
    <section className="card plans" aria-labelledby="plans-title">
      <h2 id="plans-title">{text(title)}</h2>
      {soon.length || open.length ? null : <p className="muted">{t('No appointments or reminders yet.', 'अभी कोई अपॉइंटमेंट या रिमाइंडर नहीं है।')}</p>}
      <ul className="plan-list">
        {soon.map((a) => (
          <li key={a.id} className="plan appointment">
            <strong>{a.title}</strong>
            <span>{formatWhen(a.starts_at)} · {a.place}</span>
            {a.ride_request_id ? <a href={`#/activity/${a.ride_request_id}`}>{t('Ride arranged (simulated)', 'सवारी की व्यवस्था हुई (डेमो)')}</a> : <span className="muted">{t('No ride booked', 'सवारी बुक नहीं हुई')}</span>}
            {canEdit ? <button className="secondary small" aria-label={t('Remove appointment: {{title}}', 'अपॉइंटमेंट हटाएँ: {{title}}', { title: a.title })} disabled={busy} onClick={() => call(`/appointments/${a.id}`, 'DELETE')}>{t('Remove', 'हटाएँ')}</button> : null}
          </li>
        ))}
        {open.map((r) => (
          <li key={r.id} className={`plan reminder ${r.status}`}>
            <strong>{r.title}</strong>
            <span>{formatWhen(r.due_at)} · <span className={`chip ${r.status}`}>{text(reminderLabel[r.status])}</span></span>
            {r.kind === 'medicine' ? <small className="muted">{t('A reminder is not proof that a medicine was taken.', 'रिमाइंडर इस बात का प्रमाण नहीं है कि दवा ली गई।')}</small> : null}
            <div className="actions">
              {canMarkDone ? <button className="secondary small" aria-label={t("I've done this: {{title}}", 'मैंने यह कर लिया है: {{title}}', { title: r.title })} disabled={busy} onClick={() => call(`/reminders/${r.id}/done`, 'POST')}>{t("I've done this", 'मैंने यह कर लिया है')}</button> : null}
              {canEdit && (r.kind !== 'medicine' || canMedicine) ? <button className="secondary small" aria-label={t('Remove reminder: {{title}}', 'रिमाइंडर हटाएँ: {{title}}', { title: r.title })} disabled={busy} onClick={() => call(`/reminders/${r.id}`, 'DELETE')}>{t('Remove', 'हटाएँ')}</button> : null}
            </div>
          </li>
        ))}
      </ul>
      {canEdit ? <PlanForms runner={runner} canMedicine={canMedicine} /> : null}
    </section>
  )
}

function PlanForms({ runner, canMedicine }: { runner: Runner; canMedicine: boolean }) {
  const { t, language } = useI18n()
  const { busy, run, refresh } = runner
  const [tomorrow] = useState(() => toLocalInput(Date.now() / 1000 + 86_400))
  const [appointment, setAppointment] = useState({ title: '', with_whom: '', place: '', when: tomorrow })
  const [reminder, setReminder] = useState({ title: '', kind: 'other', when: tomorrow })
  return (
    <>
      <details className="more" name="plan-editor">
        <summary>{t('Add an appointment', 'अपॉइंटमेंट जोड़ें')}</summary>
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            const { when, ...rest } = appointment
            await api('/appointments', 'POST', { ...rest, starts_at: toEpoch(when) })
            setAppointment({ title: '', with_whom: '', place: '', when: tomorrow })
            await refresh()
          })
        }}>
          <label className="field"><span>{t('What', 'क्या')}</span><input required maxLength={80} value={appointment.title} placeholder={t('Check-up with Dr Mehta', 'डॉ. मेहता से जाँच')} onChange={(e) => setAppointment({ ...appointment, title: e.target.value })} /></label>
          <label className="field"><span>{t('With (optional)', 'किसके साथ (वैकल्पिक)')}</span><input maxLength={60} value={appointment.with_whom} onChange={(e) => setAppointment({ ...appointment, with_whom: e.target.value })} /></label>
          <label className="field"><span>{t('Where', 'कहाँ')}</span><input required maxLength={150} value={appointment.place} placeholder={t('Sunrise Clinic', 'सनराइज़ क्लिनिक')} onChange={(e) => setAppointment({ ...appointment, place: e.target.value })} /></label>
          <label className="field"><span>{t('When', 'कब')}</span><input required type="datetime-local" lang={language} value={appointment.when} onChange={(e) => setAppointment({ ...appointment, when: e.target.value })} /></label>
          <button className="primary wide" disabled={busy}>{t('Save appointment', 'अपॉइंटमेंट सहेजें')}</button>
        </form>
      </details>
      <details className="more" name="plan-editor">
        <summary>{t('Add a reminder', 'रिमाइंडर जोड़ें')}</summary>
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await api('/reminders', 'POST', { title: reminder.title, kind: reminder.kind, due_at: toEpoch(reminder.when) })
            setReminder({ title: '', kind: 'other', when: tomorrow })
            await refresh()
          })
        }}>
          <label className="field"><span>{t('Reminder', 'रिमाइंडर')}</span><input required maxLength={80} value={reminder.title} placeholder={t('Call the clinic', 'क्लिनिक को फ़ोन करें')} onChange={(e) => setReminder({ ...reminder, title: e.target.value })} /></label>
          <label className="field"><span>{t('Kind', 'प्रकार')}</span>
            <select value={reminder.kind} onChange={(e) => setReminder({ ...reminder, kind: e.target.value })}>
              <option value="other">{t('Everyday', 'रोज़मर्रा')}</option><option value="appointment">{t('Appointment', 'अपॉइंटमेंट')}</option>
              {canMedicine ? <option value="medicine">{t('Medicine refill', 'दवा फिर से मँगवाना')}</option> : null}
            </select>
          </label>
          <label className="field"><span>{t('When', 'कब')}</span><input required type="datetime-local" lang={language} value={reminder.when} onChange={(e) => setReminder({ ...reminder, when: e.target.value })} /></label>
          <button className="primary wide" disabled={busy}>{t('Save reminder', 'रिमाइंडर सहेजें')}</button>
        </form>
      </details>
    </>
  )
}
