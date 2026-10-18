import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { Conversation } from '../hub'

const channelName: Record<string, string> = { app: 'In the app', voice: 'In-app voice', message: 'Message', call: 'Call', phone: 'Phone call' }

// Confirmed lines come from stored records; suggestions are ideas, never things that happened.
export default function SummaryView({ conversation, children }: { conversation: Conversation; children?: ReactNode }) {
  const { t, text, formatWhen } = useI18n()
  const { summary } = conversation
  return (
    <article className="card conversation">
      <p className="muted">
        {text(channelName[conversation.channel] ?? conversation.channel)} · {formatWhen(conversation.at)}
        {conversation.seeded ? t(' · sample from the demo seed', ' · डेमो डेटा का नमूना') : ''}
      </p>
      {conversation.channel === 'phone' ? (
        <p className="muted">{conversation.call_status === 'ACTIVE' ? t('Call in progress', 'कॉल जारी है') : conversation.call_status === 'EXPIRED' ? t('Call expired', 'कॉल की अवधि समाप्त हुई') : t('Call ended', 'कॉल समाप्त हुई')} · {t('{{count}} seconds', '{{count}} सेकंड', { count: conversation.duration_seconds ?? 0 })} · {text(conversation.workflow_state?.replaceAll('_', ' ').toLowerCase())}</p>
      ) : null}
      {/* AI prose can quote personal content; only rule-generated copy is a translation key. */}
      <p>{summary.by === 'gemini' ? summary.text : text(summary.text)}</p>
      {summary.confirmed.length ? (
        <div className="summary-block confirmed">
          <h3>{t('Confirmed', 'पुष्टि हुई')}</h3>
          <ul>{summary.confirmed.map((line) => <li key={line}>{text(line)}</li>)}</ul>
        </div>
      ) : <p className="muted">{t('Nothing was booked from this conversation.', 'इस बातचीत से कोई बुकिंग नहीं हुई।')}</p>}
      {summary.suggestions.length ? (
        <div className="summary-block suggested">
          <h3>{t('Suggestions (not done)', 'सुझाव (अभी किए नहीं गए)')}</h3>
          <ul>{summary.suggestions.map((line) => <li key={line}>{summary.by === 'gemini' ? line : text(line)}</li>)}</ul>
        </div>
      ) : null}
      <p className="chip">{summary.by === 'gemini' ? t('Summary written by Gemini (AI)', 'Gemini (एआई) द्वारा लिखा गया सारांश') : t('Automatic summary (not AI)', 'स्वचालित सारांश (एआई नहीं)')}</p>
      {conversation.safety === 'suspected_scam' ? <p className="inline-note">{t('Possible scam: a suspicion from word matching, not confirmed.', 'संभावित धोखाधड़ी: शब्दों के मिलान से संदेह हुआ है, पुष्टि नहीं हुई।')}</p> : null}
      {children}
    </article>
  )
}
