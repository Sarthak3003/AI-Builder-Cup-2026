import { useSpeech } from './useSpeech'

export default function VoiceInput({ language, onText, disabled }: { language: string; onText: (text: string) => void; disabled: boolean }) {
  const speech = useSpeech(language)
  return <div className="voice-input">
    <button type="button" className="secondary" disabled={disabled || !speech.supported} onClick={() => {
      if (speech.listening) speech.stop()
      else speech.start(onText)
    }}>{speech.listening ? 'Stop listening' : 'Use microphone'}</button>
    <small>{speech.supported ? 'Optional browser speech recognition. Your browser may process audio online.' : 'Voice input is unavailable in this browser. Typing works normally.'}</small>
    {speech.error ? <p role="status">{speech.error}</p> : null}
  </div>
}
