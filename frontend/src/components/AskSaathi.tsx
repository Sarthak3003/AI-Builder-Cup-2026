import { useRef, useState } from 'react'
import { api, serviceNames } from '../hub'
import type { AskResult } from '../hub'
import { wordsFor } from '../copy'
import { newId } from '../id'
import { MicIcon } from '../icons'
import { useSpeech } from '../useSpeech'
import type { Hub } from '../screens/hubType'

// One place to ask for anything: Saathi works out ride, food or medicine and opens the options to review.
export default function AskSaathi({ hub }: { hub: Hub }) {
  const { state, busy, run, refresh } = hub
  const words = wordsFor(state.profile.language)
  const speech = useSpeech(state.profile.language)
  const [typed, setTyped] = useState('')
  const [asked, setAsked] = useState('')
  const [reply, setReply] = useState<AskResult | null>(null)
  const [hint, setHint] = useState('')
  const field = useRef<HTMLInputElement>(null)

  function ask(text: string, channel: 'voice' | 'app') {
    const message = text.trim()
    setReply(null)
    if (message.length < 3) { setHint('Please say or type a little more.'); return }
    setAsked(message); setHint('')
    void run(async () => {
      const result = await api<AskResult>('/ask', 'POST', { id: newId(), message, channel })
      if (result.service && result.options.length) {
        await refresh()
        window.location.hash = `#/request/${result.service}/${result.id}`
        return
      }
      setReply(result)
    })
  }

  function talk() {
    if (speech.listening) { speech.stop(); return }
    setReply(null); setAsked('')
    if (!speech.supported) {
      setHint('Voice is not available in this browser. Please type your request below.')
      field.current?.focus()
      return
    }
    setHint('')
    speech.start((text) => ask(text, 'voice'))
  }

  const problem = hint || speech.error
  return (
    <section className="card ask" aria-labelledby="ask-title">
      <h2 id="ask-title" className="ask-title">{words.askTitle}</h2>
      <button type="button" className={`mic${speech.listening ? ' listening' : ''}`} disabled={busy} aria-describedby="ask-example" onClick={talk}>
        <span className="mic-circle"><MicIcon /></span>
        <span className="mic-label">{speech.listening ? words.listening : words.speak}</span>
      </button>
      <p id="ask-example" className="muted">{words.askExample} You always check before anything is booked.</p>

      <div className="ask-live" aria-live="polite">
        {speech.listening && speech.heard ? <p className="heard">“{speech.heard}”</p> : null}
        {!speech.listening && asked ? <p className="heard">You asked: “{asked}”</p> : null}
        {reply ? (
          <p className="clarify">
            {reply.clarification}{' '}
            {reply.service ? <a href={`#/request/${reply.service}`}>Open {serviceNames[reply.service]}</a> : null}
          </p>
        ) : null}
        {problem ? <p className="inline-note">{problem}</p> : null}
      </div>

      <form className="ask-type" onSubmit={(event) => { event.preventDefault(); ask(typed, 'app') }}>
        <label className="field"><span>{words.typeIt}</span>
          <input ref={field} value={typed} maxLength={1000} enterKeyHint="send" placeholder="e.g. Book a cab to the market"
            onChange={(event) => setTyped(event.target.value)} />
        </label>
        <button className="secondary" disabled={busy}>{words.askButton}</button>
      </form>
    </section>
  )
}
