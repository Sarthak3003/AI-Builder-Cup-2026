import type { ReactNode } from 'react'
import { formatWhen, waitText } from '../hub'
import type { Activity, Appointment, CareEvent, Conversation } from '../hub'
import ProviderBadge from './ProviderBadge'
import StatusChips from './StatusChips'
import SummaryView from './SummaryView'

type Props = { item: Activity; events: CareEvent[]; conversation?: Conversation; appointment?: Appointment; actions?: ReactNode; extra?: ReactNode }

export default function ActivityDetailView({ item, events, conversation, appointment, actions, extra }: Props) {
  const timeline = events.filter((event) => event.ref === item.id).slice().reverse()
  return (
    <>
      <a className="back" href="#/activity">Back to activity</a>
      <h1 className="page-title">{item.option.name}</h1>
      <section className="card">
        {item.option.provider && item.option.provider_name ? <ProviderBadge id={item.option.provider} name={item.option.provider_name} /> : null}
        <StatusChips item={item} />
        <dl className="receipt-details">
          <div><dt>Price</dt><dd>₹{item.option.price}</dd></div>
          {item.option.eta_min ? <div><dt>Time</dt><dd>{waitText(item.service, item.option.eta_min)}</dd></div> : null}
          {item.reference ? <div><dt>Reference</dt><dd>{item.reference} (simulated)</dd></div> : null}
          <div><dt>Asked</dt><dd>{formatWhen(item.created_at)} · {item.channel}</dd></div>
          {appointment ? <div><dt>For</dt><dd>{appointment.title}, {formatWhen(appointment.starts_at)}</dd></div> : null}
          {item.approval_reason ? <div><dt>Why approval</dt><dd>{item.approval_reason}</dd></div> : null}
          {item.decision ? <div><dt>Decision</dt><dd>{item.decision.action === 'approve' ? 'Approved' : 'Declined'} by {item.decision.name}{item.decision.note ? `: “${item.decision.note}”` : ''}</dd></div> : null}
        </dl>
        {item.failure ? <p className="inline-note">{item.failure}</p> : null}
        <p className="muted">Simulated: no real driver, order or payment exists.</p>
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
