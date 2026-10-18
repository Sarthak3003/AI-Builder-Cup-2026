import { useState } from 'react'
import { useI18n } from '../i18n'
import { api } from '../hub'
import type { Activity } from '../hub'
import { bookingCopy } from '../locales/booking'
import { applyFilters, noFilters } from '../filters'
import ActivityDetailView from '../components/ActivityDetailView'
import ActivityFilters from '../components/ActivityFilters'
import ActivityList from '../components/ActivityList'
import ActivityTimeline from '../components/ActivityTimeline'
import { allowed } from './careHub'
import type { CareHub } from './careHub'

export function CareActivity({ hub }: { hub: CareHub }) {
  const { t } = useI18n()
  const [filters, setFilters] = useState(noFilters)
  if (!allowed(hub, 'view_activity')) return <NotShared what="rides, orders and appointments" name={hub.state.owner.name} />
  return (
    <>
      <h1 className="page-title">{t("{{name}}'s activity", '{{name}} की गतिविधि', { name: hub.state.owner.name })}</h1>
      <p className="muted">{t('Only what {{name}} shares. All bookings and payments are simulated.', 'केवल वही जो {{name}} साझा करते हैं। सभी बुकिंग और भुगतान केवल डेमो हैं।', { name: hub.state.owner.name })}</p>
      <ActivityFilters filters={filters} onChange={setFilters} />
      <ActivityList items={applyFilters(hub.state.activity, filters)} empty={<p>{t('Nothing shared yet.', 'अभी कुछ साझा नहीं किया गया है।')}</p>} />
      <section className="card" aria-labelledby="care-timeline-title">
        <h2 id="care-timeline-title">{t('Timeline', 'घटनाक्रम')}</h2>
        <ActivityTimeline events={hub.state.events} />
      </section>
    </>
  )
}

// Demo only: send a request this caretaker is not allowed to make, and show the server's refusal.
function PermissionCheck({ hub, item }: { hub: CareHub; item: Activity }) {
  const { t, text } = useI18n()
  const [answer, setAnswer] = useState<{ allowed: boolean; error?: string } | null>(null)
  const attempt = async (path: string, body?: unknown) => {
    try {
      await api(path, 'POST', body)
      setAnswer({ allowed: true })
    } catch (failure) {
      setAnswer({ allowed: false, error: failure instanceof Error ? failure.message : 'not allowed' })
    }
  }
  return (
    <section className="card demo-note" aria-labelledby="permission-check-title">
      <h2 id="permission-check-title">{t('Demo: test the permission check', 'डेमो: अनुमति की जाँच करके देखें')}</h2>
      <p>{t('These buttons send real requests as {{name}}. The server refuses anything this access does not allow; hiding buttons is not the only protection.', 'ये बटन {{name}} के रूप में वास्तविक अनुरोध भेजते हैं। सर्वर बिना अनुमति वाले अनुरोध अस्वीकार करता है; केवल बटन छिपाना ही सुरक्षा नहीं है।', { name: hub.state.grant.name })}</p>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => void attempt(`/bookings/${item.id}/cancel`)}>{t('Try to cancel this booking', 'यह बुकिंग रद्द करने का प्रयास करें')}</button>
        {allowed(hub, 'approve') ? null : <button type="button" className="secondary" onClick={() => void attempt(`/bookings/${item.id}/decision`, { action: 'approve' })}>{t('Try to approve this booking', 'यह बुकिंग मंज़ूर करने का प्रयास करें')}</button>}
      </div>
      {answer ? <p className="inline-note" role="status">{answer.allowed ? t('The server allowed this.', 'सर्वर ने इसकी अनुमति दी।') : t('Refused by the server: {{error}}', 'सर्वर ने अस्वीकार किया: {{error}}', { error: text(answer.error) })}</p> : null}
    </section>
  )
}

export function NotShared({ what, name }: { what: string; name: string }) {
  const { t, text } = useI18n()
  return (
    <section className="card">
      <h1 className="page-title">{t('Not shared with you', 'आपके साथ साझा नहीं किया गया')}</h1>
      <p>{t('{{name}} has not given you access to {{what}}. Only {{name}} can change that.', '{{name}} ने आपको {{what}} की अनुमति नहीं दी है। केवल {{name}} इसे बदल सकते हैं।', { name, what: text(what) })}</p>
    </section>
  )
}

export function DecisionButtons({ hub, item }: { hub: CareHub; item: Activity }) {
  const { t, text } = useI18n()
  const { busy, run, refresh, notify } = hub
  const [question, setQuestion] = useState('')
  const decide = (action: string, note = '') => void run(async () => {
    await api(`/bookings/${item.id}/decision`, 'POST', { action, note })
    await refresh()
    notify(text(action === 'approve' ? 'Approved. The demo provider was asked to book it (simulated).' : action === 'reject' ? 'Declined. Nothing was booked.' : 'Your question was sent.'))
  })
  return (
    <>
      <button className="primary" disabled={busy} onClick={() => decide('approve')}>{t('Approve', 'मंज़ूर करें')}</button>
      <button className="secondary" disabled={busy} onClick={() => decide('reject')}>{t('Decline', 'अस्वीकार करें')}</button>
      <form className="inline-form" onSubmit={(event) => { event.preventDefault(); decide('ask', question); setQuestion('') }}>
        <label className="field"><span>{t('Ask a question first', 'पहले सवाल पूछें')}</span>
          <input maxLength={300} value={question} placeholder={t("Is this for tomorrow's check-up?", 'क्या यह कल की जाँच के लिए है?')} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button className="secondary" disabled={busy}>{t('Send question', 'सवाल भेजें')}</button>
      </form>
    </>
  )
}

export function CareDetail({ hub, id }: { hub: CareHub; id: string }) {
  const { t } = useI18n()
  const { state } = hub
  const item = state.approvals.find((entry) => entry.id === id) ?? state.activity.find((entry) => entry.id === id)
  if (!item) return <><a className="back" href="#/activity">{t('Back to activity', 'गतिविधि पर वापस जाएँ')}</a><p>{t('That activity is not shared with you.', 'वह गतिविधि आपके साथ साझा नहीं की गई है।')}</p></>
  const pending = item.booking_status === 'AWAITING_APPROVAL' && allowed(hub, 'approve')
  return (
    <ActivityDetailView
      item={item}
      events={state.events}
      conversation={state.conversations.find((conv) => conv.request_id && conv.request_id === item.request_id)}
      appointment={state.appointments.find((a) => a.id === item.appointment_id)}
      actions={pending ? <DecisionButtons hub={hub} item={item} /> : null}
      extra={state.demo_controls ? <PermissionCheck hub={hub} item={item} /> : null}
    />
  )
}

export function Approvals({ hub }: { hub: CareHub }) {
  const { t, text } = useI18n()
  const { state } = hub
  if (!allowed(hub, 'approve')) return <NotShared what="approving requests" name={state.owner.name} />
  return (
    <>
      <h1 className="page-title">{t('Approvals', 'मंज़ूरियाँ')}</h1>
      <p className="muted">{t('{{name}} asked to check these before they are booked. Approving sends it to the demo provider as a simulated booking; nothing real is booked or charged.', '{{name}} ने बुकिंग से पहले इन्हें जाँचने को कहा है। मंज़ूरी देने पर डेमो प्रदाता को केवल डेमो बुकिंग भेजी जाती है; कोई वास्तविक बुकिंग या भुगतान नहीं होता।', { name: state.owner.name })}</p>
      <ActivityList
        items={state.approvals}
        empty={<p>{t('Nothing is waiting for you.', 'आपकी मंज़ूरी के लिए अभी कुछ नहीं है।')}</p>}
        actions={(item) => (
          <>
            {item.approval_reason ? <p className="clarify">{t('Why: {{reason}}', 'कारण: {{reason}}', { reason: bookingCopy(item.approval_reason, t, text) })}</p> : null}
            <DecisionButtons hub={hub} item={item} />
          </>
        )}
      />
    </>
  )
}
