import { useState } from 'react'
import { api, roleLabel } from '../hub'
import type { Line } from '../hub'
import AlertList from '../components/AlertList'
import PersonSwitcher from '../components/PersonSwitcher'
import SummaryView from '../components/SummaryView'
import { NotShared } from './CareActivity'
import { allowed } from './careHub'
import type { CareHub } from './careHub'

export function Conversations({ hub }: { hub: CareHub }) {
  const { state, busy, run } = hub
  const [open, setOpen] = useState<Record<string, Line[]>>({})
  if (!allowed(hub, 'view_summaries')) return <NotShared what="conversation summaries" name={state.owner.name} />
  const transcripts = allowed(hub, 'view_transcripts')
  return (
    <>
      <h1 className="page-title">Conversations</h1>
      <p className="muted">Summaries of requests {state.owner.name} shared with you, across app, voice and messages. {transcripts ? 'You may open full transcripts; each opening is recorded.' : 'Full transcripts are not shared with you.'}</p>
      {state.conversations.length ? state.conversations.map((conversation) => (
        <SummaryView key={conversation.id} conversation={conversation}>
          {transcripts ? (
            open[conversation.id] ? (
              <ol className="transcript">{open[conversation.id].map((line, index) => <li key={index}><strong>{line.role === 'user' ? state.owner.name : 'Saathi'}:</strong> {line.text}</li>)}</ol>
            ) : (
              <button className="secondary small" disabled={busy} onClick={() => void run(async () => {
                const result = await api<{ transcript: Line[] }>(`/conversations/${conversation.id}/transcript`)
                setOpen((current) => ({ ...current, [conversation.id]: result.transcript }))
              })}>Show transcript</button>
            )
          ) : null}
        </SummaryView>
      )) : <p className="muted">No shared conversations yet.</p>}
    </>
  )
}

export function Safety({ hub }: { hub: CareHub }) {
  const { state, busy, run, refresh } = hub
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' })
  const alerts = allowed(hub, 'receive_alerts')
  const contacts = allowed(hub, 'manage_contacts')
  if (!alerts && !contacts) return <NotShared what="safety alerts or trusted contacts" name={state.owner.name} />
  return (
    <>
      <h1 className="page-title">Safety</h1>
      {alerts ? (
        <section className="card">
          <h2>Alerts</h2>
          <p className="muted">Confirmed events are marked separately from suspicions. Saathi never guesses about health or safety from everyday use.</p>
          <AlertList
            events={state.events.filter((event) => event.permission === 'receive_alerts' || event.severity === 'attention')}
            busy={busy}
            onResolve={(event) => void run(async () => { await api(`/events/${event.id}/resolve`, 'POST', {}); await refresh() })}
          />
        </section>
      ) : null}
      {contacts ? (
        <section className="card">
          <h2>Trusted contacts</h2>
          <ul className="plain-list">
            {state.contacts.map((person) => (
              <li key={person.id}>
                <strong>{person.name}</strong>{person.relationship ? ` (${person.relationship})` : ''}{person.phone ? ` · ${person.phone}` : ''}{person.primary ? ' · primary' : ''}
                <button className="link-button" disabled={busy} onClick={() => void run(async () => { await api(`/contacts/${person.id}`, 'DELETE'); await refresh() })}>Remove</button>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={(event) => {
            event.preventDefault()
            void run(async () => { await api('/contacts', 'POST', contact); setContact({ name: '', relationship: '', phone: '' }); await refresh() })
          }}>
            <label className="field"><span>Name</span><input required maxLength={60} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
            <label className="field"><span>Relationship</span><input maxLength={40} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} /></label>
            <label className="field"><span>Phone</span><input maxLength={30} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
            <button className="secondary wide" disabled={busy}>Add contact</button>
          </form>
        </section>
      ) : null}
    </>
  )
}

export function CircleSettings({ hub, onLeave, onSwitch }: { hub: CareHub; onLeave: () => void; onSwitch: (id: string) => void }) {
  const { state, busy, run, refresh, notify } = hub
  const [home, setHome] = useState(state.profile.home)
  const [invite, setInvite] = useState({ name: '', role: 'viewer' })
  const [code, setCode] = useState('')
  const granted = new Set(state.grant.permissions)
  return (
    <>
      <h1 className="page-title">Care Circle & settings</h1>
      <PersonSwitcher people={state.demo_people} current={state.demo_person} busy={busy} onSwitch={onSwitch} />
      <section className="card">
        <h2>Your access</h2>
        <p>{state.owner.name} added you as <strong>{roleLabel[state.grant.role]}</strong>. They can change or remove this at any time.</p>
        <ul className="perm-check">
          {Object.entries(state.permissions).map(([key, label]) => (
            <li key={key} className={granted.has(key) ? 'yes' : 'no'}><span aria-hidden="true">{granted.has(key) ? '✓' : '✕'}</span> {label}<span className="sr-only">{granted.has(key) ? ': allowed' : ': not allowed'}</span></li>
          ))}
        </ul>
        <p className="muted">Notifications appear in this dashboard only. Saathi does not send texts or emails in this demo.</p>
      </section>
      {allowed(hub, 'edit_profile') ? (
        <section className="card">
          <h2>Pickup address</h2>
          <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api('/profile/home', 'PUT', { home }); await refresh(); notify('Address saved.') }) }}>
            <label className="field"><span>Home address</span><input required maxLength={150} value={home} onChange={(e) => setHome(e.target.value)} /></label>
            <button className="secondary wide" disabled={busy}>Save address</button>
          </form>
        </section>
      ) : null}
      {allowed(hub, 'manage_circle') ? (
        <section className="card">
          <h2>People</h2>
          <ul className="plain-list">{state.circle.map((person) => <li key={person.id}>{person.name} · {roleLabel[person.role]} · {person.status}</li>)}</ul>
          <form onSubmit={(event) => {
            event.preventDefault()
            void run(async () => { setCode((await api<{ code: string }>('/care-circle', 'POST', { ...invite, extras: [] })).code); setInvite({ name: '', role: 'viewer' }); await refresh() })
          }}>
            <label className="field"><span>Invite someone</span><input required maxLength={60} value={invite.name} placeholder="Name" onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></label>
            <label className="field"><span>As</span>
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                <option value="viewer">Viewer</option><option value="assistant">Assistant</option>
              </select>
            </label>
            <p className="muted">Only {state.owner.name} can give approval, admin or sensitive permissions.</p>
            <button className="secondary wide" disabled={busy}>Create invitation</button>
          </form>
          {code ? <label className="field"><span>Invitation link</span><input readOnly value={`${window.location.origin}${window.location.pathname}#/join/${code}`} onFocus={(e) => e.target.select()} /></label> : null}
        </section>
      ) : null}
      <button className="secondary wide" disabled={busy} onClick={onLeave}>Leave the caretaker view on this browser</button>
    </>
  )
}
