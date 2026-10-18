import { useState } from 'react'
import { statusLabel } from '../hub'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'
import { careEventTitle } from '../locales/care'
import { UpcomingPlans } from '../components/Plans'
import { allowed } from './careHub'
import type { CareHub } from './careHub'

const WEEK = 7 * 86_400

export default function Overview({ hub }: { hub: CareHub }) {
  const { t, text, formatWhen } = useI18n()
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
      <p className="eyebrow">{t('CARE CIRCLE', 'देखभाल मंडली')}</p>
      <h1 className="page-title">{t('Supporting {{name}}', '{{name}} की सहायता', { name })}</h1>
      <p className="muted">{t('You see what {{name}} chose to share with you as {{role}}. Everything booked here is simulated.', '{{role}} के रूप में आप केवल वही देखते हैं जो {{name}} ने आपके साथ साझा किया है। यहाँ सभी बुकिंग केवल डेमो हैं।', { name, role: text(state.grant.role) })}</p>

      <section className="card overview attention" aria-labelledby="attention-title">
        <h2 id="attention-title">{t('Needs your attention', 'आपके ध्यान की ज़रूरत है')}</h2>
        {attention ? (
          <ul className="plain-list">
            {approvals.length ? <li><a href="#/approvals">{t('{{count}} request{{plural}} waiting for your approval', '{{count}} अनुरोध आपकी मंज़ूरी की प्रतीक्षा में हैं', { count: approvals.length, plural: approvals.length > 1 ? 's' : '' })}</a></li> : null}
            {alerts.length ? <li><a href="#/safety">{t('{{count}} alert{{plural}} to review', '{{count}} सूचनाओं की समीक्षा करें', { count: alerts.length, plural: alerts.length > 1 ? 's' : '' })}</a></li> : null}
            {missed.map((reminder) => <li key={reminder.id}>{t('Missed reminder: {{title}} (follow up; this does not mean anything was or was not done)', 'छूटा हुआ रिमाइंडर: {{title}} (पूछकर पुष्टि करें; इसका मतलब यह नहीं है कि काम हुआ या नहीं हुआ)', { title: reminder.title })}</li>)}
          </ul>
        ) : <p>{t('Nothing right now.', 'अभी कुछ नहीं है।')}</p>}
      </section>

      <section className="card overview" aria-labelledby="upcoming-title">
        <h2 id="upcoming-title">{t('Upcoming', 'आगामी')}</h2>
        {upcoming.length ? (
          <ul className="plain-list">
            {upcoming.map((a) => (
              <li key={a.id}><strong>{a.title}</strong> · {formatWhen(a.starts_at)} · {a.place}
                {a.ride_request_id ? <> · <a href={`#/activity/${a.ride_request_id}`}>{t('ride arranged (simulated)', 'सवारी की व्यवस्था हुई (डेमो)')}</a></> : t(' · no ride booked yet', ' · अभी सवारी बुक नहीं हुई')}
              </li>
            ))}
          </ul>
        ) : <p className="muted">{allowed(hub, 'view_activity') ? t('No appointments in the next week.', 'अगले सप्ताह कोई अपॉइंटमेंट नहीं है।') : t('Appointments are not shared with you.', 'अपॉइंटमेंट आपके साथ साझा नहीं किए गए हैं।')}</p>}
      </section>

      <section className="card overview" aria-labelledby="orders-title">
        <h2 id="orders-title">{t('Active rides and orders', 'जारी सवारियाँ और ऑर्डर')}</h2>
        {active.length ? (
          <ul className="plain-list">
            {active.map((item) => <li key={item.id}><a href={`#/activity/${item.id}`}>{bookingCopy(item.title, t, text)}</a> · {text(statusLabel[item.booking_status])}</li>)}
          </ul>
        ) : <p className="muted">{allowed(hub, 'view_activity') ? t('Nothing active.', 'अभी कुछ जारी नहीं है।') : t('Activity is not shared with you.', 'गतिविधि आपके साथ साझा नहीं की गई है।')}</p>}
      </section>

      <section className="card overview" aria-labelledby="updates-title">
        <h2 id="updates-title">{t('New updates', 'नई जानकारी')}</h2>
        {updates.length ? (
          <ul className="plain-list">
            {updates.map((event) => <li key={event.id}>{careEventTitle(event, t, text)}{event.certainty === 'suspected' ? t(' (suspected, not confirmed)', ' (संदेह है, पुष्टि नहीं हुई)') : ''} <small className="muted">· {formatWhen(event.at)}</small></li>)}
          </ul>
        ) : <p className="muted">{t('No updates you can see yet.', 'अभी आपके लिए कोई नई जानकारी नहीं है।')}</p>}
      </section>

      {allowed(hub, 'manage_reminders') ? (
        <UpcomingPlans runner={hub} appointments={state.appointments} reminders={state.reminders} canEdit canMarkDone={false} canMedicine={allowed(hub, 'view_medication')} title={t('Manage appointments and reminders', 'अपॉइंटमेंट और रिमाइंडर प्रबंधित करें')} />
      ) : null}
    </>
  )
}
