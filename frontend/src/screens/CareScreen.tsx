import { useState } from 'react'
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
  const toggle = (key: string, on: boolean) => onExtras(on ? [...extras, key] : extras.filter((item) => item !== key))
  return (
    <>
      <fieldset className="choice-group">
        <legend>Role</legend>
        {roles.map((value) => (
          <label key={value} className="check-row">
            <input type="radio" name="role" checked={role === value} onChange={() => onRole(value)} />
            <span><strong>{roleLabel[value]}</strong> · {roleBlurb[value]}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="choice-group">
        <legend>Also allow</legend>
        {optional.map((key) => (
          <label key={key} className="check-row"><input type="checkbox" checked={extras.includes(key)} onChange={(e) => toggle(key, e.target.checked)} />{permissions[key]}</label>
        ))}
      </fieldset>
      <fieldset className="choice-group sensitive">
        <legend>Sensitive: only if you are sure</legend>
        {sensitive.map((key) => (
          <label key={key} className="check-row"><input type="checkbox" checked={extras.includes(key)} onChange={(e) => toggle(key, e.target.checked)} />{permissions[key]}</label>
        ))}
      </fieldset>
    </>
  )
}

function InviteBox({ code }: { code: string }) {
  const link = inviteLink(code)
  return (
    <div className="invite-box">
      <label className="field"><span>Private invitation link (one use, 24 hours)</span>
        <input readOnly value={link} onFocus={(event) => event.target.select()} />
      </label>
      <button type="button" className="secondary small" onClick={() => void navigator.clipboard?.writeText(link)}>Copy link</button>
      <p className="muted">Send it only to this person. To try it yourself, open it in a private window or another device: this browser stays as you.</p>
    </div>
  )
}

function Member({ hub, grant }: { hub: Hub; grant: Grant }) {
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
        <span className="chip">{roleLabel[grant.role]}</span>
        <span className={`chip ${grant.status}`}>{grant.status === 'active' ? 'Active' : 'Invited'}</span>
      </div>
      {grant.relationship ? <p className="muted">{grant.relationship}</p> : null}
      <ul className="perm-list">{grant.permissions.map((p) => <li key={p}>{permissions[p] ?? p}</li>)}</ul>
      {code ? <InviteBox code={code} /> : null}
      {editing ? (
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => { await api(`/care-circle/${grant.id}`, 'PUT', { role, extras }); await refresh(); setEditing(false) })
        }}>
          <AccessPicker permissions={permissions} role={role} extras={extras} onRole={setRole} onExtras={setExtras} />
          <button className="primary wide" disabled={busy}>Save access</button>
        </form>
      ) : null}
      <div className="actions">
        {grant.status === 'invited' ? (
          <button className="secondary small" disabled={busy} onClick={() => void run(async () => setCode((await api<{ code: string }>(`/care-circle/${grant.id}/invite`, 'POST')).code))}>New invitation link</button>
        ) : null}
        <button className="secondary small" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Change access'}</button>
        <button className="secondary small" disabled={busy} onClick={() => void run(async () => { await api(`/care-circle/${grant.id}`, 'DELETE'); await refresh(); hub.notify(`${grant.name} no longer has access.`) })}>Remove</button>
      </div>
    </li>
  )
}

export default function CareScreen({ hub }: { hub: Hub }) {
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
      <p className="eyebrow">YOU STAY IN CONTROL</p>
      <h1 className="page-title">Your Care Circle</h1>
      <p>People you trust see only what you switch on here. Nobody gets everything just because they were invited, and you can remove anyone at any time.</p>

      <section className="card" aria-labelledby="alerts-title">
        <h2 id="alerts-title">Needs attention</h2>
        <AlertList events={state.events ?? []} busy={busy} onResolve={resolve} />
        <button className="primary wide" disabled={busy} onClick={() => void run(async () => { await api('/help', 'POST', { kind: 'help' }); await refresh(); notify('Your Care Circle was told you would like help.') })}>
          Ask my Care Circle for help
        </button>
      </section>

      <section aria-labelledby="circle-title">
        <h2 id="circle-title" className="section-title">People</h2>
        {circle.length ? <ul className="member-list">{circle.map((grant) => <Member key={`${grant.id}-${grant.role}-${grant.permissions.join()}`} hub={hub} grant={grant} />)}</ul> : <p className="muted">No one yet.</p>}
      </section>

      <section className="card" aria-labelledby="add-title">
        <h2 id="add-title">Add someone</h2>
        <form onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            const result = await api<{ code: string }>('/care-circle', 'POST', { ...form, role, extras })
            setCode(result.code); setForm({ name: '', relationship: '' }); setRole('viewer'); setExtras([])
            await refresh()
          })
        }}>
          <label className="field"><span>Name</span><input required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Relationship (optional)</span><input maxLength={40} value={form.relationship} placeholder="Daughter, neighbour, nurse…" onChange={(e) => setForm({ ...form, relationship: e.target.value })} /></label>
          <AccessPicker permissions={permissions} role={role} extras={extras} onRole={setRole} onExtras={setExtras} />
          <button className="primary wide" disabled={busy}>Create invitation</button>
        </form>
        {code ? <InviteBox code={code} /> : null}
      </section>

      <section className="card" aria-labelledby="share-title">
        <h2 id="share-title">What you share</h2>
        {(Object.keys(shareLabels) as (keyof Sharing)[]).map((key) => (
          <label key={key} className="check-row">
            <input type="checkbox" checked={sharing[key]} disabled={busy} onChange={(e) => saveProfile({ sharing: { ...sharing, [key]: e.target.checked } })} />
            {shareLabels[key]}
          </label>
        ))}
        <p className="muted">You can also hide a single booking from its details page.</p>
        <label className="check-row">
          <input type="checkbox" checked={state.profile.caregiver_enabled} disabled={busy} onChange={(e) => saveProfile({ caregiver_enabled: e.target.checked })} />
          Ask an approver before booking above ₹{state.profile.approval_limit}, and for every medicine request
        </label>
      </section>

      <section className="card" aria-labelledby="contacts-title">
        <h2 id="contacts-title">Trusted contacts</h2>
        {(state.contacts ?? []).length ? (
          <ul className="plain-list">
            {(state.contacts ?? []).map((person: Contact) => (
              <li key={person.id}>
                <strong>{person.name}</strong>{person.relationship ? ` (${person.relationship})` : ''}{person.phone ? ` · ${person.phone}` : ''}{person.primary ? ' · primary' : ''}
                <button className="link-button" disabled={busy} onClick={() => void run(async () => { await api(`/contacts/${person.id}`, 'DELETE'); await refresh() })}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No trusted contacts yet.</p>}
        <form className="inline-form" onSubmit={(event) => {
          event.preventDefault()
          void run(async () => { await api('/contacts', 'POST', { ...contact, primary: !(state.contacts ?? []).length }); setContact({ name: '', relationship: '', phone: '' }); await refresh() })
        }}>
          <label className="field"><span>Name</span><input required maxLength={60} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
          <label className="field"><span>Relationship</span><input maxLength={40} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} /></label>
          <label className="field"><span>Phone</span><input maxLength={30} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
          <button className="secondary wide" disabled={busy}>Add contact</button>
        </form>
      </section>
    </>
  )
}
