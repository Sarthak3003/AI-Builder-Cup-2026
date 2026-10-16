import type { Conversation } from '../hub'
import SummaryView from './SummaryView'

export default function PhoneHistory({ conversations }: { conversations: Conversation[] }) {
  const calls = conversations.filter((conversation) => conversation.channel === 'phone')
  if (!calls.length) return null
  return (
    <section className="phone-history" aria-labelledby="phone-history-title">
      <h2 id="phone-history-title" className="section-title">Phone calls</h2>
      <p className="muted">Calls linked to this profile. Updates appear automatically while this page is open.</p>
      {calls.map((call) => (
        <SummaryView key={call.id} conversation={call}>
          {call.booking_id ? <a className="secondary" href={`#/activity/${call.booking_id}`}>Open booking from this call</a> : null}
          {call.transcript_retained && call.transcript?.length ? (
            <details className="more">
              <summary>Phone transcript</summary>
              <ol className="transcript">{call.transcript.map((line, index) => <li key={index}><strong>{line.role === 'user' ? 'You' : 'Saathi'}:</strong> {line.text}</li>)}</ol>
            </details>
          ) : <p className="muted">Text transcript was not saved. No audio recording is stored by Saathi.</p>}
        </SummaryView>
      ))}
    </section>
  )
}