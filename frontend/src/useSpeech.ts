import { useEffect, useRef, useState } from 'react'

type Result = { isFinal?: boolean; 0: { transcript: string } }
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<Result> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }

const problems: Record<string, string> = {
  'not-allowed': 'Microphone permission was refused. Allow it in the browser, or type instead.',
  'service-not-allowed': 'Microphone permission was refused. Allow it in the browser, or type instead.',
  'no-speech': 'I did not hear anything. Tap the microphone and try again.',
}

// Browser speech recognition. Chrome and Safari may send the audio to their own servers to transcribe it.
export function useSpeech(language: string) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [error, setError] = useState('')
  const engine = useRef<Recognition | null>(null)
  const browser = window as SpeechWindow
  const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
  useEffect(() => () => engine.current?.stop(), [])

  function start(onFinal: (text: string) => void) {
    if (!Constructor) return
    const recognition = new Constructor(); engine.current = recognition
    recognition.lang = language; recognition.continuous = false; recognition.interimResults = true
    let finished = false
    let latest = ''
    recognition.onresult = (event) => {
      const results = Array.from(event.results)
      const text = results.map((result) => result[0].transcript).join('').trim()
      latest = text
      setHeard(text)
      if (!finished && results.at(-1)?.isFinal !== false && text) { finished = true; onFinal(text) }
    }
    recognition.onerror = (event) => {
      finished = true
      setError(problems[event.error ?? ''] ?? 'Microphone unavailable. You can type your request instead.')
      setListening(false)
    }
    recognition.onend = () => {
      if (!finished) {
        finished = true
        if (latest) onFinal(latest)
        else setError(problems['no-speech'])
      }
      setListening(false)
    }
    try { recognition.start(); setListening(true); setError(''); setHeard('') } catch { setError('Voice could not start. Please type instead.') }
  }
  function stop() { engine.current?.stop() }

  return { supported: Boolean(Constructor), listening, heard, error, start, stop }
}
