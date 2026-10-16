import { useI18n } from '../i18n'
import type { CareEvent } from '../hub'
import { careEventDetail, careEventTitle } from '../locales/care'

// One event list kept by the server. A caretaker's copy already leaves out what is not shared.
export default function ActivityTimeline({ events, limit = 8 }: { events: CareEvent[]; limit?: number }) {
  const { t, text, formatWhen } = useI18n()
  const shown = events.slice(0, limit)
  if (!shown.length) return <p className="muted">{t('No updates yet.', 'अभी कोई नई जानकारी नहीं है।')}</p>
  return (
    <ol className="timeline">
      {shown.map((event) => (
        <li key={event.id}>
          <strong>{careEventTitle(event, t, text)}</strong>
          {event.certainty === 'suspected' ? t(' (suspected, not confirmed)', ' (संदेह है, पुष्टि नहीं हुई)') : ''}
          {event.detail ? ` · ${careEventDetail(event, t, text)}` : ''}
          <small className="muted"> · {formatWhen(event.at)}</small>
        </li>
      ))}
    </ol>
  )
}
