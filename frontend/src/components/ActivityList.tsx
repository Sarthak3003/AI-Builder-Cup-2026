import type { ReactNode } from 'react'
import { api, statusLabel } from '../hub'
import type { Activity } from '../hub'
import type { Hub } from '../screens/hubType'
import ProviderBadge from './ProviderBadge'
import ServiceIcon from './ServiceIcon'

export default function ActivityList({ hub, items, empty }: { hub: Hub; items: Activity[]; empty: ReactNode }) {
  const { state, busy, run, refresh } = hub
  if (!items.length) return <div className="empty card">{empty}</div>

  const act = (item: Activity, path: string, body: unknown) => void run(async () => { await api(`/activity/${item.id}/${path}`, 'POST', body); await refresh() })

  return (
    <ul className="activity-list">
      {items.map((item) => (
        <li key={item.id}>
          <article className="activity card">
            <div className="activity-head">
              <ServiceIcon service={item.service} />
              <div className="activity-title">
                <small className="muted">{item.service.toUpperCase()} · {item.channel}</small>
                <h3>{item.option.name}</h3>
              </div>
              <strong className="price">₹{item.option.price}</strong>
            </div>
            {item.option.provider && item.option.provider_name ? <ProviderBadge id={item.option.provider} name={item.option.provider_name} /> : null}
            <p className="muted">{item.option.detail}</p>
            <div className="activity-meta">
              <span className={`status ${item.status}`}>{statusLabel[item.status]}</span>
              <small className="muted">{item.reference ? `${item.reference} · ` : ''}{new Date(item.created_at * 1000).toLocaleString()}</small>
            </div>
            <div className="actions">
              {state.role === 'owner' && ['awaiting_approval', 'simulated_confirmed'].includes(item.status) ? (
                <button className="secondary" disabled={busy} onClick={() => act(item, 'cancel', {})}>Cancel request</button>
              ) : null}
              {state.role === 'caregiver' && item.status === 'awaiting_approval' ? (
                <>
                  <button className="primary" disabled={busy} onClick={() => act(item, 'decision', { action: 'approve' })}>Approve</button>
                  <button className="secondary" disabled={busy} onClick={() => act(item, 'decision', { action: 'reject' })}>Decline</button>
                </>
              ) : null}
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}
