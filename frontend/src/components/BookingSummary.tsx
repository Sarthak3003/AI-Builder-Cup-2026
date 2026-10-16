import type { ReactNode } from 'react'
import { formatINR, paymentMethodLabel } from '../hub'
import type { Activity } from '../hub'
import PriceLines from './PriceLines'
import ProviderBadge from './ProviderBadge'

type Props = { item: Activity; title: string; breakdown: string; actions?: ReactNode; children?: ReactNode }

// The money and reference card shared by the ride and food pages.
export default function BookingSummary({ item, title, breakdown, actions, children }: Props) {
  return (
    <section className="card fare-card" aria-labelledby="summary-title">
      <div className="fare-head">
        <h2 id="summary-title">{title}</h2>
        <strong className="fare-total">{formatINR(item.amount_minor)}</strong>
      </div>
      <ProviderBadge id={item.app_id ?? item.provider_type} name={item.app_name ?? item.provider_label} />
      {children}
      <p className="muted">{item.payment ? `${paymentMethodLabel[item.payment.method]} · no money moves` : 'Payment details are not shared with you.'}</p>
      {item.line_items?.length ? (
        <details className="more">
          <summary>{breakdown}</summary>
          <PriceLines lines={item.line_items} total={item.amount_minor} />
        </details>
      ) : null}
      <dl className="receipt-details">
        {item.provider_booking_id ? <div><dt>Booking reference</dt><dd>{item.provider_booking_id} (simulated)</dd></div> : null}
        <div><dt>Provider</dt><dd>{item.provider_label} (simulated)</dd></div>
        {item.approval_reason ? <div><dt>Why approval</dt><dd>{item.approval_reason}</dd></div> : null}
        {item.decision ? <div><dt>Decision</dt><dd>{item.decision.action === 'approve' ? 'Approved' : 'Declined'} by {item.decision.name}{item.decision.note ? `: “${item.decision.note}”` : ''}</dd></div> : null}
      </dl>
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
  )
}
