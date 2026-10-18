import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { formatINR } from '../hub'
import type { Activity } from '../hub'
import { bookingCopy } from '../locales/booking'
import ProviderBadge from './ProviderBadge'
import ServiceIcon from './ServiceIcon'
import StatusChips from './StatusChips'

type Props = { items: Activity[]; empty: ReactNode; simple?: boolean; actions?: (item: Activity) => ReactNode }

export default function ActivityList({ items, empty, simple = false, actions }: Props) {
  const { t, text, formatWhen } = useI18n()
  if (!items.length) return <div className="empty card">{empty}</div>
  return (
    <ul className="activity-list">
      {items.map((item) => (
        <li key={item.id}>
          <article className={`activity card${item.booking_status === 'FAILED' ? ' failed' : ''}`}>
            <div className="activity-head">
              <ServiceIcon service={item.service} />
              <div className="activity-title">
                {simple ? null : <small className="muted">{text(item.service.toUpperCase())} · {text(item.channel)}{item.shared === false ? t(' · not shared', ' · साझा नहीं किया गया') : ''}</small>}
                <h3>{bookingCopy(item.title, t, text)}</h3>
              </div>
              <strong className="price">{formatINR(item.amount_minor)}</strong>
            </div>
            <ProviderBadge id={item.app_id ?? item.provider_type} name={item.app_name ?? item.provider_label} />
            {simple ? null : <p className="muted">{t('Simulated by the {{provider}}', '{{provider}} द्वारा डेमो', { provider: text(item.provider_label) })}</p>}
            <StatusChips item={item} />
            {item.failure ? <p className="inline-note">{bookingCopy(item.failure, t, text)}</p> : null}
            {item.questions?.length ? <p className="clarify">{t('{{name}} asked: “{{question}}”', '{{name}} ने पूछा: “{{question}}”', { name: item.questions.at(-1)?.by ?? '', question: item.questions.at(-1)?.text ?? '' })}</p> : null}
            {simple ? null : (
              <div className="activity-meta">
                <small className="muted">{item.provider_booking_id ? `${item.provider_booking_id} · ` : ''}{formatWhen(item.created_at)}</small>
                <a href={`#/activity/${item.id}`} aria-label={t('Details: {{booking}}', 'विवरण: {{booking}}', { booking: bookingCopy(item.title, t, text) })}>{t('Details', 'विवरण')}</a>
              </div>
            )}
            {actions ? <div className="actions">{actions(item)}</div> : null}
          </article>
        </li>
      ))}
    </ul>
  )
}
