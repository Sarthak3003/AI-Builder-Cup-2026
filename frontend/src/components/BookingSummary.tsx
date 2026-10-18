import type { ReactNode } from 'react'
import { formatINR, paymentMethodLabel } from '../hub'
import type { Activity } from '../hub'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'
import PriceLines from './PriceLines'
import ProviderBadge from './ProviderBadge'

type Props = { item: Activity; title: string; breakdown: string; actions?: ReactNode; children?: ReactNode }

// The money and reference card shared by the ride and food pages.
export default function BookingSummary({ item, title, breakdown, actions, children }: Props) {
  const { t, text } = useI18n()
  return (
    <section className="card fare-card" aria-labelledby="summary-title">
      <div className="fare-head">
        <h2 id="summary-title">{text(title)}</h2>
        <strong className="fare-total">{formatINR(item.amount_minor)}</strong>
      </div>
      <ProviderBadge id={item.app_id ?? item.provider_type} name={item.app_name ?? item.provider_label} />
      {children}
      <p className="muted">{item.payment ? t('{{method}} · no money moves', '{{method}} · कोई वास्तविक लेन-देन नहीं होता', { method: text(paymentMethodLabel[item.payment.method]) }) : text('Payment details are not shared with you.')}</p>
      {item.line_items?.length ? (
        <details className="more">
          <summary>{text(breakdown)}</summary>
          <PriceLines lines={item.line_items} total={item.amount_minor} />
        </details>
      ) : null}
      <dl className="receipt-details">
        {item.provider_booking_id ? <div><dt>{text('Booking reference')}</dt><dd>{t('{{id}} (simulated)', '{{id}} (सिम्युलेटेड)', { id: item.provider_booking_id })}</dd></div> : null}
        <div><dt>{text('Provider')}</dt><dd>{t('{{provider}} (simulated)', '{{provider}} (सिम्युलेटेड)', { provider: text(item.provider_label) })}</dd></div>
        {item.approval_reason ? <div><dt>{text('Why approval')}</dt><dd>{bookingCopy(item.approval_reason, t, text)}</dd></div> : null}
        {item.decision ? <div><dt>{text('Decision')}</dt><dd>{item.decision.action === 'approve' ? t('Approved by {{name}}', '{{name}} ने मंज़ूरी दी', { name: item.decision.name }) : t('Declined by {{name}}', '{{name}} ने मना किया', { name: item.decision.name })}{item.decision.note ? `: “${item.decision.note}”` : ''}</dd></div> : null}
      </dl>
      <p className="muted">{text(item.notice)} {text('No money moves.')}</p>
      {actions ? <div className="actions">{actions}</div> : null}
    </section>
  )
}
