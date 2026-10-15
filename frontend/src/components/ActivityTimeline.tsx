import { formatWhen } from '../hub'
import type { CareEvent } from '../hub'

// One event list kept by the server. A caretaker's copy already leaves out what is not shared.
export default function ActivityTimeline({ events, limit = 8 }: { events: CareEvent[]; limit?: number }) {
  const shown = events.slice(0, limit)
  if (!shown.length) return <p className="muted">No updates yet.</p>
  return (
    <ol className="timeline">
      {shown.map((event) => (
        <li key={event.id}>
          <strong>{event.title}</strong>
          {event.certainty === 'suspected' ? ' (suspected, not confirmed)' : ''}
          {event.detail ? ` · ${event.detail}` : ''}
          <small className="muted"> · {formatWhen(event.at)}</small>
        </li>
      ))}
    </ol>
  )
}
