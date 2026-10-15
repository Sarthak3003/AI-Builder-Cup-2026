import { formatWhen } from '../hub'
import type { CareEvent } from '../hub'

// Confirmed events and suspicions look different, so a guess is never read as a fact.
export default function AlertList({ events, busy, onResolve }: { events: CareEvent[]; busy: boolean; onResolve?: (event: CareEvent) => void }) {
  const open = events.filter((event) => event.status === 'open')
  if (!open.length) return <p className="muted">Nothing needs attention.</p>
  return (
    <ul className="alert-list">
      {open.map((event) => (
        <li key={event.id} className={`alert ${event.certainty}`}>
          <div className="alert-head">
            <strong>{event.title}</strong>
            <span className={`chip ${event.certainty}`}>{event.certainty === 'suspected' ? 'Suspected · not confirmed' : 'Confirmed event'}</span>
          </div>
          {event.detail ? <p>{event.detail}</p> : null}
          <small className="muted">{formatWhen(event.at)}</small>
          <div className="actions">
            {event.ref ? <a className="secondary small" href={`#/activity/${event.ref}`}>Open activity</a> : null}
            {onResolve && event.kind !== 'approval_needed' ? <button className="secondary small" disabled={busy} onClick={() => onResolve(event)}>Mark as handled</button> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
