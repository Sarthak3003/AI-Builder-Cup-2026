import type { ReactNode } from 'react'
import { formatWhen } from '../hub'
import type { Conversation } from '../hub'

const channelName: Record<string, string> = { app: 'In the app', voice: 'Voice', message: 'Message', call: 'Call' }

// Confirmed lines come from stored records; suggestions are ideas, never things that happened.
export default function SummaryView({ conversation, children }: { conversation: Conversation; children?: ReactNode }) {
  const { summary } = conversation
  return (
    <article className="card conversation">
      <p className="muted">
        {channelName[conversation.channel] ?? conversation.channel} · {formatWhen(conversation.at)}
        {conversation.seeded ? ' · sample from the demo seed' : ''}
      </p>
      <p>{summary.text}</p>
      {summary.confirmed.length ? (
        <div className="summary-block confirmed">
          <h3>Confirmed</h3>
          <ul>{summary.confirmed.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      ) : <p className="muted">Nothing was booked from this conversation.</p>}
      {summary.suggestions.length ? (
        <div className="summary-block suggested">
          <h3>Suggestions (not done)</h3>
          <ul>{summary.suggestions.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      ) : null}
      <p className="chip">{summary.by === 'gemini' ? 'Summary written by Gemini (AI)' : 'Automatic summary (not AI)'}</p>
      {conversation.safety === 'suspected_scam' ? <p className="inline-note">Possible scam: a suspicion from word matching, not confirmed.</p> : null}
      {children}
    </article>
  )
}
