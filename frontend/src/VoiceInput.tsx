import { useSpeech } from './useSpeech'
import { useI18n } from './i18n'

export default function VoiceInput({ onText, disabled }: { language: string; onText: (text: string) => void; disabled: boolean }) {
  const { language, t, text } = useI18n()
  const speech = useSpeech(language)
  function speechError(value: string) {
    switch (value) {
      case 'Microphone permission was refused. Allow it in the browser, or type instead.':
        return t('Microphone permission was refused. Allow it in the browser, or type instead.', 'माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र में अनुमति दें या टाइप करें।')
      case 'I did not hear anything. Tap the microphone and try again.':
        return t('I did not hear anything. Tap the microphone and try again.', 'कुछ सुनाई नहीं दिया। माइक्रोफ़ोन दबाकर फिर कोशिश करें।')
      case 'Microphone unavailable. You can type your request instead.':
        return t('Microphone unavailable. You can type your request instead.', 'माइक्रोफ़ोन उपलब्ध नहीं है। आप अपना अनुरोध टाइप कर सकते हैं।')
      case 'Voice could not start. Please type instead.':
        return t('Voice could not start. Please type instead.', 'आवाज़ से इनपुट शुरू नहीं हो सका। कृपया टाइप करें।')
      default: return text(value)
    }
  }
  return <div className="voice-input">
    <button type="button" className="secondary" disabled={disabled || !speech.supported} onClick={() => {
      if (speech.listening) speech.stop()
      else speech.start(onText)
    }}>{speech.listening ? t('Stop listening', 'सुनना बंद करें') : t('Use microphone', 'माइक्रोफ़ोन इस्तेमाल करें')}</button>
    <small>{speech.supported ? t('Optional browser speech recognition. Your browser may process audio online.', 'ब्राउज़र की आवाज़ पहचान सुविधा वैकल्पिक है। आपका ब्राउज़र ऑडियो को ऑनलाइन संसाधित कर सकता है।') : t('Voice input is unavailable in this browser. Typing works normally.', 'इस ब्राउज़र में आवाज़ से इनपुट उपलब्ध नहीं है। आप सामान्य रूप से टाइप कर सकते हैं।')}</small>
    {speech.error ? <p role="status">{speechError(speech.error)}</p> : null}
  </div>
}
