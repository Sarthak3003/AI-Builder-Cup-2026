import type { ReactNode } from 'react'
import type { Activity } from '../hub'
import ProviderBadge from './ProviderBadge'
import ServiceIcon from './ServiceIcon'
import StatusChips from './StatusChips'

type Props = { items: Activity[]; empty: ReactNode; simple?: boolean; actions?: (item: Activity) => ReactNode }

export default function ActivityList({ items, empty, simple = false, actions }: Props) {
  if (!items.length) return <div className="empty card">{empty}</div>
  return (
    <ul className="activity-list">
      {items.map((item) => (
        <li key={item.id}>
          <article className={`activity card${item.status === 'failed' ? ' failed' : ''}`}>
            <div className="activity-head">
              <ServiceIcon service={item.service} />
              <div className="activity-title">
                {simple ? null : <small className="muted">{item.service.toUpperCase()} · {item.channel}{item.shared === false ? ' · not shared' : ''}</small>}
                <h3>{item.option.name}</h3>
              </div>
              <strong className="price">₹{item.option.price}</strong>
            </div>
            {item.option.provider && item.option.provider_name ? <ProviderBadge id={item.option.provider} name={item.option.provider_name} /> : null}
            {simple ? null : <p className="muted">{item.option.detail}</p>}
            <StatusChips item={item} />
            {item.failure ? <p className="inline-note">{item.failure}</p> : null}
            {item.questions?.length ? <p className="clarify">{item.questions.at(-1)?.by} asked: “{item.questions.at(-1)?.text}”</p> : null}
            {simple ? null : (
              <div className="activity-meta">
                <small className="muted">{item.reference ? `${item.reference} · ` : ''}{new Date(item.created_at * 1000).toLocaleString()}</small>
                <a href={`#/activity/${item.id}`}>Details</a>
              </div>
            )}
            {actions ? <div className="actions">{actions(item)}</div> : null}
          </article>
        </li>
      ))}
    </ul>
  )
}
