import type { Conversation } from '../hub'
import { useI18n } from '../i18n'
import SummaryView from './SummaryView'

export default function PhoneHistory({ conversations }: { conversations: Conversation[] }) {
  const { t } = useI18n()
  const calls = conversations.filter((conversation) => conversation.channel === 'phone')
  if (!calls.length) return null
  return (
    <section className="phone-history" aria-labelledby="phone-history-title">
      <h2 id="phone-history-title" className="section-title">{t('Phone calls', 'फ़ोन कॉल')}</h2>
      <p className="muted">{t('Calls linked to this profile. Updates appear automatically while this page is open.', 'इस प्रोफ़ाइल से जुड़ी कॉल। यह पृष्ठ खुला रहने पर नई जानकारी अपने आप दिखाई देती है।')}</p>
      {calls.map((call) => (
        <SummaryView key={call.id} conversation={call}>
          {call.booking_id ? <a className="secondary" href={`#/activity/${call.booking_id}`}>{t('Open booking from this call', 'इस कॉल की बुकिंग खोलें')}</a> : null}
          {call.transcript_retained && call.transcript?.length ? (
            <details className="more">
              <summary>{t('Phone transcript', 'फ़ोन बातचीत का पाठ')}</summary>
              <ol className="transcript">{call.transcript.map((line, index) => <li key={index}><strong>{line.role === 'user' ? t('You', 'आप') : t('Saathi', 'साथी')}:</strong> {line.text}</li>)}</ol>
            </details>
          ) : <p className="muted">{t('Text transcript was not saved. No audio recording is stored by Saathi.', 'बातचीत का पाठ सहेजा नहीं गया था। साथी कोई ऑडियो रिकॉर्डिंग नहीं रखता।')}</p>}
        </SummaryView>
      ))}
    </section>
  )
}