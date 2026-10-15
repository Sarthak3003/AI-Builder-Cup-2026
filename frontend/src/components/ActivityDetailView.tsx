import type { ReactNode } from 'react'
import { formatINR, formatWhen, paymentMethodLabel } from '../hub'
import type { Activity, Appointment, CareEvent, Conversation, PlaceSnapshot } from '../hub'
import PriceLines from './PriceLines'
import ProviderBadge from './ProviderBadge'
import StatusChips from './StatusChips'
import SummaryView from './SummaryView'

type Props = { item: Activity; events: CareEvent[]; conversation?: Conversation; appointment?: Appointment; actions?: ReactNode; extra?: ReactNode }

const place = (snapshot: PlaceSnapshot) => (snapshot.address && snapshot.address !== snapshot.label ? `${snapshot.label}, ${snapshot.address}` : snapshot.label)

export default function ActivityDetailView({ item, events, conversation, appointment, actions, extra }: Props) {
  const timeline = events.filter((event) => event.ref === item.id).slice().reverse()
  const { pickup, destination, items } = item.details ?? {}
  return (
    <>
      <a className="back" href="#/activity">Back to activity</a>
      <h1 className="page-title">{item.title}</h1>
      <section className="card">
        <ProviderBadge id={item.app_id ?? item.provider_type} name={item.app_name ?? item.provider_label} />
        <StatusChips item={item} />
        <dl className="receipt-details">
          {item.provider_booking_id ? <div><dt>Booking reference</dt><dd>{item.provider_booking_id} (simulated)</dd></div> : null}
          <div><dt>Provider</dt><dd>{item.provider_label} (simulated)</dd></div>
          {pickup ? <div><dt>From</dt><dd>{place(pickup)}</dd></div> : null}
          {destination ? <div><dt>To</dt><dd>{place(destination)}</dd></div> : null}
          {items?.map((line) => <div key={line.name}><dt>Item</dt><dd>{line.name} × {line.quantity}</dd></div>)}
          <div><dt>Total</dt><dd>{formatINR(item.amount_minor)}</dd></div>
          {item.pickup_eta_min ? <div><dt>Pickup</dt><dd>About {item.pickup_eta_min} min (estimate)</dd></div> : null}
          {item.duration_min ? <div><dt>Trip time</dt><dd>About {item.duration_min} min</dd></div> : null}
          {item.delivery_min ? <div><dt>Delivery</dt><dd>About {item.delivery_min} min</dd></div> : null}
          {item.payment ? <div><dt>Payment method</dt><dd>{paymentMethodLabel[item.payment.method]}</dd></div> : null}
          <div><dt>Asked</dt><dd>{formatWhen(item.created_at)} · {item.channel}</dd></div>
          {appointment ? <div><dt>For</dt><dd>{appointment.title}, {formatWhen(appointment.starts_at)}</dd></div> : null}
          {item.approval_reason ? <div><dt>Why approval</dt><dd>{item.approval_reason}</dd></div> : null}
          {item.decision ? <div><dt>Decision</dt><dd>{item.decision.action === 'approve' ? 'Approved' : 'Declined'} by {item.decision.name}{item.decision.note ? `: “${item.decision.note}”` : ''}</dd></div> : null}
        </dl>
        {item.line_items?.length ? <PriceLines lines={item.line_items} total={item.amount_minor} /> : null}
        {item.failure ? <p className="inline-note">{item.failure}</p> : null}
        <p className="muted">{item.notice} No money moves.</p>
        <details className="more">
          <summary>Demo details</summary>
          <dl className="receipt-details codes">
            <div><dt>Booking status</dt><dd><code>{item.booking_status}</code></dd></div>
            <div><dt>Payment status</dt><dd><code>{item.payment?.status ?? 'not shared with you'}</code></dd></div>
            <div><dt>Provider type</dt><dd><code>{item.provider_type}</code></dd></div>
          </dl>
        </details>
        {actions ? <div className="actions">{actions}</div> : null}
      </section>
      {item.questions?.length ? (
        <section className="card">
          <h2>Questions from the Care Circle</h2>
          <ul className="plain-list">{item.questions.map((q, index) => <li key={index}><strong>{q.by}:</strong> {q.text}</li>)}</ul>
        </section>
      ) : null}
      {conversation ? <SummaryView conversation={conversation} /> : null}
      {extra}
      <section className="card">
        <h2>What happened</h2>
        {timeline.length ? (
          <ol className="timeline">
            {timeline.map((event) => <li key={event.id}><strong>{event.title}</strong>{event.detail ? ` · ${event.detail}` : ''}<small className="muted"> · {formatWhen(event.at)}</small></li>)}
          </ol>
        ) : <p className="muted">No updates yet.</p>}
      </section>
    </>
  )
}
