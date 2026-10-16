import { useRef, useState } from 'react'
import { api, bookedNotice, serviceNames } from '../hub'
import type { AskResult } from '../hub'
import { wordsFor } from '../copy'
import { newId } from '../id'
import { MicIcon } from '../icons'
import { useRecorder } from '../useRecorder'
import { useSpeech } from '../useSpeech'
import { toBase64, toWav } from '../wav'
import type { Hub } from '../screens/hubType'

// One place to ask for anything: Saathi works out ride, food or medicine and opens the options to review.
export default function AskSaathi({ hub, simple = false }: { hub: Hub; simple?: boolean }) {
  const { state, busy, run, refresh } = hub
  const words = wordsFor(state.profile.language)
  const speech = useSpeech(state.profile.language)
  const recorder = useRecorder()
  const gemini = Boolean(state.gemini) && recorder.supported
  const listening = gemini ? recorder.recording : speech.listening
  const [typed, setTyped] = useState('')
  const [asked, setAsked] = useState('')
  const [reply, setReply] = useState<AskResult | null>(null)
  const [hint, setHint] = useState('')
  const field = useRef<HTMLInputElement>(null)

  async function show(result: AskResult) {
    if (result.booking) {
      await refresh()
      hub.notify(bookedNotice(result.booking))
      window.location.hash = `#/activity/${result.booking.id}`
      return
    }
    if (result.service && result.quotes.length && result.request_id) {
      await refresh()
      window.location.hash = `#/request/${result.service}/${result.request_id}`
      return
    }
    setReply(result)
  }

  function ask(text: string, channel: 'voice' | 'app') {
    const message = text.trim()
    setReply(null)
    if (message.length < 3) { setHint('Please say or type a little more.'); return }
    setAsked(message); setHint('')
    void run(async () => show(await api<AskResult>('/ask', 'POST', { id: newId(), message, channel })))
  }

  function hear(clip: Blob) {
    void run(async () => {
      const audio = toBase64(await toWav(clip))
      const result = await api<AskResult>('/ask/voice', 'POST', { id: newId(), audio })
      setAsked(result.transcript ?? '')
      await show(result)
    })
  }

  function talk() {
    if (listening) { if (gemini) recorder.stop(); else speech.stop(); return }
    setReply(null); setAsked('')
    if (gemini) { setHint(''); void recorder.start(hear); return }
    if (!speech.supported) {
      setHint('Voice is not available in this browser. Please type your request below.')
      field.current?.focus()
      return
    }
    setHint('')
    speech.start((text) => ask(text, 'voice'))
  }

  const problem = hint || (gemini ? recorder.error : speech.error)
  const showTyping = !simple || (!gemini && !speech.supported) || Boolean(problem)
  return (
    <section className={`card ask${simple ? ' bare' : ''}`} aria-labelledby="ask-title">
      <h2 id="ask-title" className={simple ? 'sr-only' : 'ask-title'}>{words.askTitle}</h2>
      <button type="button" className={`mic${listening ? ' listening' : ''}`} disabled={busy} aria-describedby={simple ? undefined : 'ask-example'} onClick={talk}>
        <span className="mic-circle"><MicIcon /></span>
        <span className="mic-label">{listening ? words.listening : words.speak}</span>
      </button>
      {simple ? null : <p id="ask-example" className="muted">{words.askExample} {state.profile.show_options === false ? 'Saathi books the best ride or meal for you; medicine always asks first.' : 'You always check before anything is booked.'}</p>}
      {gemini ? <p className="chip gemini">{simple ? 'Recording goes to Google' : 'Gemini listens · your recording is sent to Google to understand it'}</p> : null}

      <div className="ask-live" aria-live="polite">
        {listening && !gemini && speech.heard ? <p className="heard">“{speech.heard}”</p> : null}
        {!listening && asked ? <p className="heard">You asked: “{asked}”</p> : null}
        {reply ? (
          <p className="clarify">
            {reply.clarification}{' '}
            {reply.clarification.includes('Services') ? <a href="#/services">Open Services</a> : reply.service ? <a href={`#/request/${reply.service}`}>Open {serviceNames[reply.service]}</a> : null}
          </p>
        ) : null}
        {problem ? <p className="inline-note">{problem}</p> : null}
      </div>

      {showTyping ? (
        <form className="ask-type" onSubmit={(event) => { event.preventDefault(); ask(typed, 'app') }}>
          <label className="field"><span>{words.typeIt}</span>
            <input ref={field} value={typed} maxLength={1000} enterKeyHint="send" placeholder="e.g. Book a cab to the market"
              onChange={(event) => setTyped(event.target.value)} />
          </label>
          <button className="secondary" disabled={busy}>{words.askButton}</button>
        </form>
      ) : null}
    </section>
  )
}
