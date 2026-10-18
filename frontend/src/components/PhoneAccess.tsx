import { useEffect, useState } from 'react'
import { api } from '../hub'
import type { Hub } from '../screens/hubType'
import { useI18n } from '../i18n'

type Pairing = { code: string; expires_at: number; single_use: boolean }

export default function PhoneAccess({ hub }: { hub: Hub }) {
  const { t } = useI18n()
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [retain, setRetain] = useState(false)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const phone = hub.state.phone
  useEffect(() => {
    if (!pairing) return
    const timer = window.setInterval(() => {
      const at = Date.now() / 1000
      setNow(at)
      if (at >= pairing.expires_at) setPairing(null)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [pairing])
  const generate = () => void hub.run(async () => {
    setPairing(await api<Pairing>('/phone/pairing-codes', 'POST', { retain_transcript: retain }))
    setNow(Date.now() / 1000)
  })
  return (
    <section className="card" aria-labelledby="phone-access-title">
      <h2 id="phone-access-title">{t('Call Saathi', 'साथी को कॉल करें')}</h2>
      <p>{t('Call from a telephone and enter a one-use code to connect to this profile. Caller ID alone never gives access.', 'इस प्रोफ़ाइल से जुड़ने के लिए फ़ोन से कॉल करें और एक बार इस्तेमाल होने वाला कोड डालें। केवल कॉलर आईडी से कभी पहुँच नहीं मिलती।')}</p>
      {phone?.enabled ? (
        <>
          {phone.number ? <a className="primary wide" href={`tel:${phone.number}`}>{t('Call {{number}}', '{{number}} पर कॉल करें', { number: phone.number })}</a> : <p className="inline-note">{t('Ask the organiser for the configured Twilio number.', 'तय किया गया Twilio नंबर आयोजक से पूछें।')}</p>}
          <label className="check-row"><input type="checkbox" checked={retain} onChange={(event) => setRetain(event.target.checked)} />{t('Save a redacted text transcript for this call', 'इस कॉल की लिखित बातचीत संवेदनशील जानकारी हटाकर सहेजें')}</label>
          <p className="muted">{t('Twilio processes your speech, and Gemini may interpret it. Saathi does not record audio. Phone bookings always ask for your confirmation.', 'Twilio आपकी बोली को प्रोसेस करता है और Gemini उसका अर्थ समझ सकता है। साथी ऑडियो रिकॉर्ड नहीं करता। फ़ोन बुकिंग में हमेशा आपकी पुष्टि माँगी जाती है।')}</p>
          <button type="button" className="secondary wide" disabled={hub.busy} onClick={generate}>{t('Generate pairing code', 'जोड़ने का कोड बनाएँ')}</button>
          {pairing ? (
            <div className="phone-pairing" role="status">
              <p>{t('Enter this code on the telephone keypad, then press #.', 'फ़ोन के कीपैड पर यह कोड डालें, फिर # दबाएँ।')}</p>
              <strong className="phone-pairing-code" aria-label={t('Pairing code {{code}}', 'जोड़ने का कोड {{code}}', { code: pairing.code.split('').join(' ') })}>{pairing.code.slice(0, 4)} {pairing.code.slice(4)}</strong>
              <p>{t('Single use · expires in {{minutes}} minutes.', 'एक बार इस्तेमाल करें · {{minutes}} मिनट में समाप्त होगा।', { minutes: Math.max(0, Math.ceil((pairing.expires_at - now) / 60)) })}</p>
              <p className="muted">{t('Keep it private. It gives this call access to your saved places and demo bookings.', 'इसे निजी रखें। इससे इस कॉल को आपकी सहेजी हुई जगहों और डेमो बुकिंग तक पहुँच मिलती है।')}</p>
            </div>
          ) : null}
        </>
      ) : <p className="inline-note">{t('Telephone calling is not enabled on this server yet. Twilio credentials and a configured number are needed.', 'इस सर्वर पर फ़ोन कॉल अभी चालू नहीं है। Twilio के क्रेडेंशियल और एक कॉन्फ़िगर किया हुआ नंबर चाहिए।')}</p>}
      <button type="button" className="secondary wide" disabled={hub.busy} onClick={() => void hub.run(async () => {
        await api('/phone/revoke', 'POST', {})
        setPairing(null)
        hub.notify(t('Phone access and unused pairing codes revoked. Pair again for a new call.', 'फ़ोन की पहुँच और इस्तेमाल न हुए कोड रद्द कर दिए गए हैं। नई कॉल के लिए फिर से जोड़ें।'))
      })}>{t('Revoke phone access', 'फ़ोन की पहुँच रद्द करें')}</button>
      <a href="#/activity">{t('See phone calls in Activity', 'गतिविधि में फ़ोन कॉल देखें')}</a>
    </section>
  )
}
