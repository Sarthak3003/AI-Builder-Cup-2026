import { useI18n } from '../i18n'
import type { CareEvent } from '../hub'
import { careEventDetail, careEventTitle } from '../locales/care'

// Confirmed events and suspicions look different, so a guess is never read as a fact.
export default function AlertList({ events, busy, onResolve }: { events: CareEvent[]; busy: boolean; onResolve?: (event: CareEvent) => void }) {
  const { t, text, formatWhen } = useI18n()
  const open = events.filter((event) => event.status === 'open')
  if (!open.length) return <p className="muted">{t('Nothing needs attention.', 'अभी किसी बात पर ध्यान देने की ज़रूरत नहीं है।')}</p>
  return (
    <ul className="alert-list">
      {open.map((event) => (
        <li key={event.id} className={`alert ${event.certainty}`}>
          <div className="alert-head">
            <strong>{careEventTitle(event, t, text)}</strong>
            <span className={`chip ${event.certainty}`}>{event.certainty === 'suspected' ? t('Suspected · not confirmed', 'संदेह · पुष्टि नहीं हुई') : t('Confirmed event', 'पुष्टि की गई घटना')}</span>
          </div>
          {event.detail ? <p>{careEventDetail(event, t, text)}</p> : null}
          <small className="muted">{formatWhen(event.at)}</small>
          <div className="actions">
            {event.ref ? <a className="secondary small" href={`#/activity/${event.ref}`}>{t('Open activity', 'गतिविधि खोलें')}</a> : null}
            {onResolve && event.kind !== 'approval_needed' ? <button className="secondary small" disabled={busy} onClick={() => onResolve(event)}>{t('Mark as handled', 'निपटाया गया चिह्नित करें')}</button> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
