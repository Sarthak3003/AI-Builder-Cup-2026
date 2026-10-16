import { useRef, useState } from 'react'
import { api, bookedNotice, serviceNames } from '../hub'
import type { AskResult } from '../hub'
import { wordsFor } from '../copy'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'
import { newId } from '../id'
import { MicIcon } from '../icons'
import { useRecorder } from '../useRecorder'
import { useSpeech } from '../useSpeech'
import { toBase64, toWav } from '../wav'
import type { Hub } from '../screens/hubType'

// Keep state/errors in their original form so an existing hint switches language too.
const problemHindi: Record<string, string> = {
  'Please say or type a little more.': 'कृपया थोड़ा और बोलें या लिखें।',
  'Voice is not available in this browser. Please type your request below.': 'इस ब्राउज़र में बोलकर पूछने की सुविधा नहीं है। कृपया नीचे अपना अनुरोध लिखें।',
  'Microphone permission was refused. Allow it in the browser, or type instead.': 'माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र में अनुमति दें, या लिखकर पूछें।',
  'I did not hear anything. Tap the microphone and try again.': 'कुछ सुनाई नहीं दिया। माइक्रोफ़ोन दबाएँ और फिर कोशिश करें।',
  'Microphone unavailable. You can type your request instead.': 'माइक्रोफ़ोन उपलब्ध नहीं है। आप अपना अनुरोध लिख सकते हैं।',
  'Voice could not start. Please type instead.': 'बोलकर पूछने की सुविधा शुरू नहीं हो सकी। कृपया लिखकर पूछें।',
}

// One place to ask for anything: Saathi works out ride, food or medicine and opens the options to review.
export default function AskSaathi({ hub, simple = false }: { hub: Hub; simple?: boolean }) {
  const { state, busy, run, refresh } = hub
  const { language, t, text } = useI18n()
  const words = wordsFor(language)
  const speech = useSpeech(language)
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
      hub.notify(bookingCopy(bookedNotice(result.booking), t, text))
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
      {simple ? null : <p id="ask-example" className="muted">{words.askExample} {state.profile.show_options === false
        ? t('Saathi books the best ride or meal for you; medicine always asks first.', 'साथी आपके लिए सबसे अच्छी सवारी या भोजन बुक करता है; दवा के लिए हमेशा पहले आपसे पूछा जाता है।')
        : t('You always check before anything is booked.', 'कुछ भी बुक होने से पहले हमेशा आप जाँचते हैं।')}</p>}
      {gemini ? <p className="chip gemini">{simple
        ? t('Recording goes to Google', 'रिकॉर्डिंग Google को भेजी जाती है')
        : t('Gemini listens · your recording is sent to Google to understand it', 'Gemini सुनता है · आपका अनुरोध समझने के लिए रिकॉर्डिंग Google को भेजी जाती है')}</p> : null}

      <div className="ask-live" aria-live="polite">
        {listening && !gemini && speech.heard ? <p className="heard">“{speech.heard}”</p> : null}
        {!listening && asked ? <p className="heard">{t('You asked: “{{message}}”', 'आपने पूछा: “{{message}}”', { message: asked })}</p> : null}
        {reply ? (
          <p className="clarify">
            {text(reply.clarification)}{' '}
            {reply.clarification.includes('Services') ? <a href="#/services">{t('Open Services', 'सेवाएँ खोलें')}</a> : reply.service ? <a href={`#/request/${reply.service}`}>{t('Open {{service}}', '{{service}} खोलें', { service: text(serviceNames[reply.service]) })}</a> : null}
          </p>
        ) : null}
        {problem ? <p className="inline-note">{t(problem, problemHindi[problem] ?? text(problem))}</p> : null}
      </div>

      {showTyping ? (
        <form className="ask-type" onSubmit={(event) => { event.preventDefault(); ask(typed, 'app') }}>
          <label className="field"><span>{words.typeIt}</span>
            <input ref={field} value={typed} maxLength={1000} enterKeyHint="send" placeholder={t('e.g. Book a cab to the market', 'जैसे, बाज़ार जाने के लिए टैक्सी बुक करें')}
              onChange={(event) => setTyped(event.target.value)} />
          </label>
          <button className="secondary" disabled={busy}>{words.askButton}</button>
        </form>
      ) : null}
    </section>
  )
}
