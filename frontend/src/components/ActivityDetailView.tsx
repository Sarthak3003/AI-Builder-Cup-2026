import type { ReactNode } from 'react'
import { formatINR, paymentMethodLabel } from '../hub'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'
import { careEventDetail, careEventTitle } from '../locales/care'
import type { Activity, Appointment, CareEvent, Conversation, PlaceSnapshot } from '../hub'
import FoodTrip from './FoodTrip'
import PriceLines from './PriceLines'
import ProviderBadge from './ProviderBadge'
import RideTrip from './RideTrip'
import StatusChips from './StatusChips'
import SummaryView from './SummaryView'

type Props = {
  item: Activity; events: CareEvent[]; conversation?: Conversation; appointment?: Appointment; actions?: ReactNode; extra?: ReactNode
  headerAction?: ReactNode; deliverTo?: PlaceSnapshot
}

function OrderCard({ item, appointment, actions }: Pick<Props, 'item' | 'appointment' | 'actions'>) {
  const { t, text, formatWhen } = useI18n()
  return (
    <>
      <h1 className="page-title">{bookingCopy(item.title, t, text)}</h1>
      <section className="card">
        <ProviderBadge id={item.app_id ?? item.provider_type} name={item.app_name ?? item.provider_label} />
        <StatusChips item={item} />
        <dl className="receipt-details">
          {item.provider_booking_id ? <div><dt>{text('Booking reference')}</dt><dd>{t('{{id}} (simulated)', '{{id}} (सिम्युलेटेड)', { id: item.provider_booking_id })}</dd></div> : null}
          <div><dt>{text('Provider')}</dt><dd>{t('{{provider}} (simulated)', '{{provider}} (सिम्युलेटेड)', { provider: text(item.provider_label) })}</dd></div>
          {item.details?.items?.map((line) => <div key={line.name}><dt>{text('Item')}</dt><dd>{text(line.name)} × {line.quantity}</dd></div>)}
          <div><dt>{text('Total')}</dt><dd>{formatINR(item.amount_minor)}</dd></div>
          {item.delivery_min ? <div><dt>{text('Delivery')}</dt><dd>{t('About {{minutes}} min', 'लगभग {{minutes}} मिनट', { minutes: item.delivery_min })}</dd></div> : null}
          {item.payment ? <div><dt>{text('Payment method')}</dt><dd>{text(paymentMethodLabel[item.payment.method])}</dd></div> : null}
          <div><dt>{text('Asked')}</dt><dd>{formatWhen(item.created_at)} · {text(item.channel)}</dd></div>
          {appointment ? <div><dt>{text('For')}</dt><dd>{appointment.title}, {formatWhen(appointment.starts_at)}</dd></div> : null}
          {item.approval_reason ? <div><dt>{text('Why approval')}</dt><dd>{bookingCopy(item.approval_reason, t, text)}</dd></div> : null}
          {item.decision ? <div><dt>{text('Decision')}</dt><dd>{item.decision.action === 'approve' ? t('Approved by {{name}}', '{{name}} ने मंज़ूरी दी', { name: item.decision.name }) : t('Declined by {{name}}', '{{name}} ने मना किया', { name: item.decision.name })}{item.decision.note ? `: “${item.decision.note}”` : ''}</dd></div> : null}
        </dl>
        {item.line_items?.length ? <PriceLines lines={item.line_items} total={item.amount_minor} /> : null}
        {item.failure ? <p className="inline-note">{bookingCopy(item.failure, t, text)}</p> : null}
        <p className="muted">{text(item.notice)} {text('No money moves.')}</p>
        {actions ? <div className="actions">{actions}</div> : null}
      </section>
    </>
  )
}

export default function ActivityDetailView({ item, events, conversation, appointment, actions, extra, headerAction, deliverTo }: Props) {
  const { t, text, formatWhen } = useI18n()
  const timeline = events.filter((event) => event.ref === item.id).slice().reverse()
  return (
    <>
      <a className="back" href="#/activity">{text('Back to activity')}</a>
      {item.service === 'ride'
        ? <RideTrip item={item} appointment={appointment} actions={actions} headerAction={headerAction} />
        : item.service === 'food'
          ? <FoodTrip item={item} deliverTo={deliverTo} actions={actions} headerAction={headerAction} />
          : <OrderCard item={item} appointment={appointment} actions={actions} />}
      {item.questions?.length ? (
        <section className="card">
          <h2>{text('Questions from the Care Circle')}</h2>
          <ul className="plain-list">{item.questions.map((q, index) => <li key={index}><strong>{q.by}:</strong> {q.text}</li>)}</ul>
        </section>
      ) : null}
      {conversation ? <SummaryView conversation={conversation} /> : null}
      {extra}
      <section className="card">
        <h2>{text('What happened')}</h2>
        {timeline.length ? (
          <ol className="timeline">
            {timeline.map((event) => <li key={event.id}><strong>{careEventTitle(event, t, text)}</strong>{event.detail ? ` · ${careEventDetail(event, t, text)}` : ''}<small className="muted"> · {formatWhen(event.at)}</small></li>)}
          </ol>
        ) : <p className="muted">{text('No updates yet.')}</p>}
      </section>
    </>
  )
}
