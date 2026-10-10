import { useEffect, useRef, useState } from 'react'

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }

export default function VoiceInput({ language, onText, disabled }: { language: string; onText: (text: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recognition = useRef<Recognition | null>(null)
  const browser = window as SpeechWindow
  const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
  useEffect(() => () => recognition.current?.stop(), [])
  return <div className="voice-input">
    <button type="button" className="secondary" disabled={disabled || !Constructor} onClick={() => {
      if (listening) { recognition.current?.stop(); return }
      if (!Constructor) return
      const engine = new Constructor(); recognition.current = engine
      engine.lang = language; engine.continuous = false; engine.interimResults = false
      engine.onresult = event => onText(event.results[0][0].transcript)
      engine.onerror = () => { setError('Microphone unavailable. You can type your request instead.'); setListening(false) }
      engine.onend = () => setListening(false)
      try { engine.start(); setListening(true); setError('') } catch { setError('Voice could not start. Please type instead.') }
    }}>{listening ? 'Stop listening' : 'Use microphone'}</button>
    <small>{Constructor ? 'Optional browser speech recognition. Your browser may process audio online.' : 'Voice input is unavailable in this browser. Typing works normally.'}</small>
    {error ? <p role="status">{error}</p> : null}
  </div>
}
