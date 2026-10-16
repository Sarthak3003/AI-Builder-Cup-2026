import { useState } from 'react'
import { useI18n } from '../i18n'
import { api, inviteLink, roleBlurb, roleLabel } from '../hub'
import type { CareEvent, Contact, Grant, HubState, Role, Sharing } from '../hub'
import AlertList from '../components/AlertList'
import type { Hub } from './hubType'

const roles: Role[] = ['viewer', 'assistant', 'approver', 'administrator']
const optional = ['view_summaries', 'receive_alerts']
const sensitive = ['view_medication', 'view_transcripts', 'view_payments', 'manage_contacts']
const shareLabels: Record<keyof Sharing, string> = { ride: 'Rides', food: 'Food orders', medicine: 'Medicine requests', appointments: 'Appointments and reminders' }
const defaultSharing: Sharing = { ride: true, food: true, medicine: true, appointments: true }

function AccessPicker({ permissions, role, extras, onRole, onExtras }: {
  permissions: Record<string, string>; role: Role; extras: string[]; onRole: (role: Role) => void; onExtras: (extras: string[]) => void
}) {
  const { t, text } = useI18n()
  const toggle = (key: string, on: boolean) => onExtras(on ? [...extras, key] : extras.filter((item) => item !== key))
  return (
    <>
      <fieldset className="choice-group">
        <legend>{t('Role', 'भूमिका')}</legend>
        {roles.map((value) => (
          <label key={value} className="check-row">
            <input type="radio" name="role" checked={role === value} onChange={() => onRole(value)} />
            <span><strong>{text(roleLabel[value])}</strong> · {text(roleBlurb[value])}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="choice-group">
        <legend>{t('Also allow', 'यह अनुमति भी दें')}</legend>
        {optional.map((key) => (
          <label key={key} className="check-row"><input type="checkbox" checked={extras.includes(key)} onChange={(e) => toggle(key, e.target.checked)} />{text(permissions[key])}</label>
        ))}
      </fieldset>
      <fieldset className="choice-group sensitive">
        <legend>{t('Sensitive: only if you are sure', 'संवेदनशील: केवल पूरी तरह आश्वस्त होने पर')}</legend>
        {sensitive.map((key) => (
          <label key={key} className="check-row"><input type="checkbox" checked={extras.includes(key)} onChange={(e) => toggle(key, e.target.checked)} />{text(permissions[key])}</label>
        ))}
      </fieldset>
    </>
  )
}

function InviteBox({ code }: { code: string }) {
  const { t } = useI18n()
  const link = inviteLink(code)
  return (
    <div className="invite-box">
      <label className="field"><span>{t('Private invitation link (one use, 24 hours)', 'निजी निमंत्रण लिंक (एक बार उपयोग, 24 घंटे)')}</span>
        <input readOnly value={link} onFocus={(event) => event.target.select()} />
      </label>
      <button type="button" className="secondary small" onClick={() => void navigator.clipboard?.writeText(link)}>{t('Copy link', 'लिंक कॉपी करें')}</button>
      <p className="muted">{t('Send it only to this person. To try it yourself, open it in a private window or another device: this browser stays as you.', 'इसे केवल इसी व्यक्ति को भेजें। खुद आज़माने के लिए निजी विंडो या दूसरे उपकरण में खोलें: इस ब्राउज़र में आपकी पहचान बनी रहेगी।')}</p>
    </div>
  )
}

function Member({ hub, grant }: { hub: Hub; grant: Grant }) {
  const { t, text } = useI18n()
  const { state, busy, run, refresh } = hub
  const permissions = state.permissions ?? {}
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('')
  const baseline = new Set(state.roles?.[grant.role] ?? [])
  const [role, setRole] = useState<Role>(grant.role)
  const [extras, setExtras] = useState(grant.permissions.filter((p) => !baseline.has(p)))
  return (
    <li className="card member">
      <div className="member-head">
        <strong>{grant.name}</strong>
        <span className="chip">{text(roleLabel[grant.role])}</span>
        <span className={`chip ${grant.status}`}>{grant.status === 'active' ? t('Active', 'सक्रिय') : t('Invited', 'आमंत्रित')}</span>
      </div>
      {grant.relationship ? <p className="muted">{grant.relationship}</p> : null}
      <ul className="perm-list">{grant.permissions.map((p) => <li key={p}>{text(permissions[p] ?? p)}</li>)}</ul>
      {code ? <InviteBox code={code} /> : null}
      {editing ? (
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => { await api(`/care-circle/${grant.id}`, 'PUT', { role, extras }); await refresh(); setEditing(false) })
        }}>
          <AccessPicker permissions={permissions} role={role} extras={extras} onRole={setRole} onExtras={setExtras} />
          <button className="primary wide" disabled={busy}>{t('Save access', 'अनुमतियाँ सहेजें')}</button>
        </form>
      ) : null}
      <div className="actions">
        {grant.status === 'invited' ? (
          <button className="secondary small" disabled={busy} onClick={() => void run(async () => setCode((await api<{ code: string }>(`/care-circle/${grant.id}/invite`, 'POST')).code))}>{t('New invitation link', 'नया निमंत्रण लिंक')}</button>
        ) : null}
        <button className="secondary small" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? t('Close', 'बंद करें') : t('Change access', 'अनुमतियाँ बदलें')}</button>
        <button className="secondary small" aria-label={t('Remove {{name}} from the Care Circle', '{{name}} को देखभाल मंडली से हटाएँ', { name: grant.name })} disabled={busy} onClick={() => void run(async () => { await api(`/care-circle/${grant.id}`, 'DELETE'); await refresh(); hub.notify(t('{{name}} no longer has access.', '{{name}} के पास अब अनुमति नहीं है।', { name: grant.name })) })}>{t('Remove', 'हटाएँ')}</button>
      </div>
    </li>
  )
}

export default function CareScreen({ hub }: { hub: Hub }) {
  const { t, text } = useI18n()
  const { state, busy, run, refresh, setState, notify } = hub
  const permissions = state.permissions ?? {}
  const circle = (state.care_circle ?? []).filter((grant) => grant.status !== 'revoked')
  const [form, setForm] = useState({ name: '', relationship: '' })
  const [role, setRole] = useState<Role>('viewer')
  const [extras, setExtras] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' })
  const sharing = state.profile.sharing ?? defaultSharing
  const saveProfile = (changes: Partial<HubState['profile']>) => void run(async () => { setState(await api<HubState>('/profile', 'PUT', { ...state.profile, ...changes })) })
  const resolve = (event: CareEvent) => void run(async () => { await api(`/events/${event.id}/resolve`, 'POST', {}); await refresh() })

  return (
    <>
      <p className="eyebrow">{t('YOU STAY IN CONTROL', 'नियंत्रण आपके हाथ में है')}</p>
      <h1 className="page-title">{t('Your Care Circle', 'आपकी देखभाल मंडली')}</h1>
      <p>{t('People you trust see only what you switch on here. Nobody gets everything just because they were invited, and you can remove anyone at any time.', 'आपके भरोसेमंद लोग केवल वही देख सकते हैं जिसकी अनुमति आप यहाँ देते हैं। केवल आमंत्रित होने से किसी को पूरी जानकारी नहीं मिलती, और आप कभी भी किसी को हटा सकते हैं।')}</p>

      <section className="card" aria-labelledby="alerts-title">
        <h2 id="alerts-title">{t('Needs attention', 'ध्यान देने की ज़रूरत है')}</h2>
        <AlertList events={state.events ?? []} busy={busy} onResolve={resolve} />
        <button className="primary wide" disabled={busy} onClick={() => void run(async () => { await api('/help', 'POST', { kind: 'help' }); await refresh(); notify(t('Your Care Circle was told you would like help.', 'आपकी देखभाल मंडली को बताया गया है कि आपको मदद चाहिए।')) })}>
          {t('Ask my Care Circle for help', 'अपनी देखभाल मंडली से मदद माँगें')}
        </button>
      </section>

      <section aria-labelledby="circle-title">
        <h2 id="circle-title" className="section-title">{t('People', 'लोग')}</h2>
        {circle.length ? <ul className="member-list">{circle.map((grant) => <Member key={`${grant.id}-${grant.role}-${grant.permissions.join()}`} hub={hub} grant={grant} />)}</ul> : <p className="muted">{t('No one yet.', 'अभी कोई नहीं है।')}</p>}
      </section>

      <section className="card" aria-labelledby="add-title">
        <h2 id="add-title">{t('Add someone', 'किसी को जोड़ें')}</h2>
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            const result = await api<{ code: string }>('/care-circle', 'POST', { ...form, role, extras })
            setCode(result.code); setForm({ name: '', relationship: '' }); setRole('viewer'); setExtras([])
            await refresh()
          })
        }}>
          <label className="field"><span>{t('Name', 'नाम')}</span><input required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>{t('Relationship (optional)', 'रिश्ता (वैकल्पिक)')}</span><input maxLength={40} value={form.relationship} placeholder={t('Daughter, neighbour, nurse…', 'बेटी, पड़ोसी, नर्स…')} onChange={(e) => setForm({ ...form, relationship: e.target.value })} /></label>
          <AccessPicker permissions={permissions} role={role} extras={extras} onRole={setRole} onExtras={setExtras} />
          <button className="primary wide" disabled={busy}>{t('Create invitation', 'निमंत्रण बनाएँ')}</button>
        </form>
        {code ? <InviteBox code={code} /> : null}
      </section>

      <section className="card" aria-labelledby="share-title">
        <h2 id="share-title">{t('What you share', 'आप क्या साझा करते हैं')}</h2>
        {(Object.keys(shareLabels) as (keyof Sharing)[]).map((key) => (
          <label key={key} className="check-row">
            <input type="checkbox" checked={sharing[key]} disabled={busy} onChange={(e) => saveProfile({ sharing: { ...sharing, [key]: e.target.checked } })} />
            {text(shareLabels[key])}
          </label>
        ))}
        <p className="muted">{t('You can also hide a single booking from its details page.', 'आप किसी एक बुकिंग को उसके विवरण पृष्ठ से भी छिपा सकते हैं।')}</p>
        <label className="check-row">
          <input type="checkbox" checked={state.profile.caregiver_enabled} disabled={busy} onChange={(e) => saveProfile({ caregiver_enabled: e.target.checked })} />
          {t('Ask an approver before booking above ₹{{limit}}, and for every medicine request', '₹{{limit}} से अधिक की बुकिंग और हर दवा अनुरोध से पहले मंज़ूरी लें', { limit: state.profile.approval_limit })}
        </label>
      </section>

      <section className="card" aria-labelledby="contacts-title">
        <h2 id="contacts-title">{t('Trusted contacts', 'भरोसेमंद संपर्क')}</h2>
        {(state.contacts ?? []).length ? (
          <ul className="plain-list">
            {(state.contacts ?? []).map((person: Contact) => (
              <li key={person.id}>
                <strong>{person.name}</strong>{person.relationship ? ` (${person.relationship})` : ''}{person.phone ? ` · ${person.phone}` : ''}{person.primary ? t(' · primary', ' · मुख्य') : ''}
                <button className="link-button" aria-label={t('Remove contact: {{name}}', 'संपर्क हटाएँ: {{name}}', { name: person.name })} disabled={busy} onClick={() => void run(async () => { await api(`/contacts/${person.id}`, 'DELETE'); await refresh() })}>{t('Remove', 'हटाएँ')}</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('No trusted contacts yet.', 'अभी कोई भरोसेमंद संपर्क नहीं है।')}</p>}
        <form className="inline-form" onSubmit={(event) => {
          event.preventDefault()
          void run(async () => { await api('/contacts', 'POST', { ...contact, primary: !(state.contacts ?? []).length }); setContact({ name: '', relationship: '', phone: '' }); await refresh() })
        }}>
          <label className="field"><span>{t('Name', 'नाम')}</span><input required maxLength={60} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
          <label className="field"><span>{t('Relationship', 'रिश्ता')}</span><input maxLength={40} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} /></label>
          <label className="field"><span>{t('Phone', 'फ़ोन')}</span><input maxLength={30} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
          <button className="secondary wide" disabled={busy}>{t('Add contact', 'संपर्क जोड़ें')}</button>
        </form>
      </section>
    </>
  )
}
