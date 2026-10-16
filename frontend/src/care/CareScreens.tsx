import { useState } from 'react'
import { useI18n } from '../i18n'
import { api, roleLabel } from '../hub'
import type { Line } from '../hub'
import AlertList from '../components/AlertList'
import PersonSwitcher from '../components/PersonSwitcher'
import SummaryView from '../components/SummaryView'
import { NotShared } from './CareActivity'
import { allowed } from './careHub'
import type { CareHub } from './careHub'

export function Conversations({ hub }: { hub: CareHub }) {
  const { t } = useI18n()
  const { state, busy, run } = hub
  const [open, setOpen] = useState<Record<string, Line[]>>({})
  if (!allowed(hub, 'view_summaries')) return <NotShared what="conversation summaries" name={state.owner.name} />
  const transcripts = allowed(hub, 'view_transcripts')
  return (
    <>
      <h1 className="page-title">{t('Conversations', 'बातचीत')}</h1>
      <p className="muted">{t('Summaries of requests {{name}} shared with you, across app, voice and messages.', 'ऐप, आवाज़ और संदेशों से आए उन अनुरोधों के सारांश जो {{name}} ने आपके साथ साझा किए हैं।', { name: state.owner.name })} {transcripts ? t('You may open full transcripts; each opening is recorded.', 'आप पूरी बातचीत का पाठ खोल सकते हैं; हर बार खोलने का रिकॉर्ड रखा जाता है।') : t('Full transcripts are not shared with you.', 'पूरी बातचीत का पाठ आपके साथ साझा नहीं किया गया है।')}</p>
      {state.conversations.length ? state.conversations.map((conversation) => (
        <SummaryView key={conversation.id} conversation={conversation}>
          {transcripts ? (
            open[conversation.id] ? (
              <ol className="transcript">{open[conversation.id].map((line, index) => <li key={index}><strong>{line.role === 'user' ? state.owner.name : t('Saathi', 'साथी')}:</strong> {line.text}</li>)}</ol>
            ) : (
              <button className="secondary small" disabled={busy} onClick={() => void run(async () => {
                const result = await api<{ transcript: Line[] }>(`/conversations/${conversation.id}/transcript`)
                setOpen((current) => ({ ...current, [conversation.id]: result.transcript }))
              })}>{t('Show transcript', 'बातचीत का पाठ दिखाएँ')}</button>
            )
          ) : null}
        </SummaryView>
      )) : <p className="muted">{t('No shared conversations yet.', 'अभी कोई बातचीत साझा नहीं की गई है।')}</p>}
    </>
  )
}

export function Safety({ hub }: { hub: CareHub }) {
  const { t } = useI18n()
  const { state, busy, run, refresh } = hub
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' })
  const alerts = allowed(hub, 'receive_alerts')
  const contacts = allowed(hub, 'manage_contacts')
  if (!alerts && !contacts) return <NotShared what="safety alerts or trusted contacts" name={state.owner.name} />
  return (
    <>
      <h1 className="page-title">{t('Safety', 'सुरक्षा')}</h1>
      {alerts ? (
        <section className="card">
          <h2>{t('Alerts', 'सचेत करने वाली सूचनाएँ')}</h2>
          <p className="muted">{t('Confirmed events are marked separately from suspicions. Saathi never guesses about health or safety from everyday use.', 'पुष्टि की गई घटनाएँ और संदेह अलग-अलग दिखाए जाते हैं। साथी रोज़मर्रा के इस्तेमाल से स्वास्थ्य या सुरक्षा का अनुमान नहीं लगाता।')}</p>
          <AlertList
            events={state.events.filter((event) => event.permission === 'receive_alerts' || event.severity === 'attention')}
            busy={busy}
            onResolve={(event) => void run(async () => { await api(`/events/${event.id}/resolve`, 'POST', {}); await refresh() })}
          />
        </section>
      ) : null}
      {contacts ? (
        <section className="card">
          <h2>{t('Trusted contacts', 'भरोसेमंद संपर्क')}</h2>
          <ul className="plain-list">
            {state.contacts.map((person) => (
              <li key={person.id}>
                <strong>{person.name}</strong>{person.relationship ? ` (${person.relationship})` : ''}{person.phone ? ` · ${person.phone}` : ''}{person.primary ? t(' · primary', ' · मुख्य') : ''}
                <button className="link-button" aria-label={t('Remove contact: {{name}}', 'संपर्क हटाएँ: {{name}}', { name: person.name })} disabled={busy} onClick={() => void run(async () => { await api(`/contacts/${person.id}`, 'DELETE'); await refresh() })}>{t('Remove', 'हटाएँ')}</button>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={(event) => {
            event.preventDefault()
            void run(async () => { await api('/contacts', 'POST', contact); setContact({ name: '', relationship: '', phone: '' }); await refresh() })
          }}>
            <label className="field"><span>{t('Name', 'नाम')}</span><input required maxLength={60} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
            <label className="field"><span>{t('Relationship', 'रिश्ता')}</span><input maxLength={40} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} /></label>
            <label className="field"><span>{t('Phone', 'फ़ोन')}</span><input maxLength={30} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
            <button className="secondary wide" disabled={busy}>{t('Add contact', 'संपर्क जोड़ें')}</button>
          </form>
        </section>
      ) : null}
    </>
  )
}

export function CircleSettings({ hub, onLeave, onSwitch }: { hub: CareHub; onLeave: () => void; onSwitch: (id: string) => void }) {
  const { t, text } = useI18n()
  const { state, busy, run, refresh, notify } = hub
  const [home, setHome] = useState(state.profile.home)
  const [invite, setInvite] = useState({ name: '', role: 'viewer' })
  const [code, setCode] = useState('')
  const granted = new Set(state.grant.permissions)
  return (
    <>
      <h1 className="page-title">{t('Care Circle & settings', 'देखभाल मंडली और सेटिंग्स')}</h1>
      <PersonSwitcher people={state.demo_people} current={state.demo_person} busy={busy} onSwitch={onSwitch} />
      <section className="card">
        <h2>{t('Your access', 'आपकी अनुमतियाँ')}</h2>
        <p>{t('{{name}} added you as', '{{name}} ने आपको इस भूमिका में जोड़ा है:', { name: state.owner.name })} <strong>{text(roleLabel[state.grant.role])}</strong>{t('. They can change or remove this at any time.', '। वे इसे कभी भी बदल या हटा सकते हैं।')}</p>
        <ul className="perm-check">
          {Object.entries(state.permissions).map(([key, label]) => (
            <li key={key} className={granted.has(key) ? 'yes' : 'no'}><span aria-hidden="true">{granted.has(key) ? '✓' : '✕'}</span> {text(label)}<span className="sr-only">{granted.has(key) ? t(': allowed', ': अनुमति है') : t(': not allowed', ': अनुमति नहीं है')}</span></li>
          ))}
        </ul>
        <p className="muted">{t('Notifications appear in this dashboard only. Saathi does not send texts or emails in this demo.', 'सूचनाएँ केवल इस डैशबोर्ड पर दिखाई देती हैं। इस डेमो में साथी संदेश या ईमेल नहीं भेजता।')}</p>
      </section>
      {allowed(hub, 'edit_profile') ? (
        <section className="card">
          <h2>{t('Pickup address', 'लेने आने का पता')}</h2>
          <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api('/profile/home', 'PUT', { home }); await refresh(); notify(t('Address saved.', 'पता सहेजा गया।')) }) }}>
            <label className="field"><span>{t('Home address', 'घर का पता')}</span><input required maxLength={150} value={home} onChange={(e) => setHome(e.target.value)} /></label>
            <button className="secondary wide" disabled={busy}>{t('Save address', 'पता सहेजें')}</button>
          </form>
        </section>
      ) : null}
      {allowed(hub, 'manage_circle') ? (
        <section className="card">
          <h2>{t('People', 'लोग')}</h2>
          <ul className="plain-list">{state.circle.map((person) => <li key={person.id}>{person.name} · {text(roleLabel[person.role])} · {text(person.status)}</li>)}</ul>
          <form onSubmit={(event) => {
            event.preventDefault()
            void run(async () => { setCode((await api<{ code: string }>('/care-circle', 'POST', { ...invite, extras: [] })).code); setInvite({ name: '', role: 'viewer' }); await refresh() })
          }}>
            <label className="field"><span>{t('Invite someone', 'किसी को आमंत्रित करें')}</span><input required maxLength={60} value={invite.name} placeholder={t('Name', 'नाम')} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></label>
            <label className="field"><span>{t('As', 'भूमिका')}</span>
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                <option value="viewer">{text('Viewer')}</option><option value="assistant">{text('Assistant')}</option>
              </select>
            </label>
            <p className="muted">{t('Only {{name}} can give approval, admin or sensitive permissions.', 'केवल {{name}} मंज़ूरी, प्रशासन या संवेदनशील जानकारी की अनुमति दे सकते हैं।', { name: state.owner.name })}</p>
            <button className="secondary wide" disabled={busy}>{t('Create invitation', 'निमंत्रण बनाएँ')}</button>
          </form>
          {code ? <label className="field"><span>{t('Invitation link', 'निमंत्रण लिंक')}</span><input readOnly value={`${window.location.origin}${window.location.pathname}#/join/${code}`} onFocus={(e) => e.target.select()} /></label> : null}
        </section>
      ) : null}
      <button className="secondary wide" disabled={busy} onClick={onLeave}>{t('Leave the caretaker view on this browser', 'इस ब्राउज़र पर देखभालकर्ता दृश्य से बाहर निकलें')}</button>
    </>
  )
}
