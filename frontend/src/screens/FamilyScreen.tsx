import { useState } from 'react'
import { api } from '../hub'
import type { HubState } from '../hub'
import ActivityList from '../components/ActivityList'
import type { Hub } from './hubType'

export default function FamilyScreen({ hub }: { hub: Hub }) {
  const { state, busy, run, setState, notify } = hub
  const [invite, setInvite] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const pending = state.activity.filter((item) => item.status === 'awaiting_approval')

  const joinForm = (
    <section className="card" aria-labelledby="join-title">
      <h2 id="join-title">Join with an invitation</h2>
      <p>This switches this browser session to the linked caregiver account. Use a separate browser profile to keep your owner session open.</p>
      <form onSubmit={(event) => {
        event.preventDefault()
        void run(async () => { setState(await api<HubState>('/caregiver/join', 'POST', { code: joinCode })); setJoinCode(''); setInvite('') })
      }}>
        <label className="field"><span>Invitation code</span>
          <input required value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
        </label>
        <button className="primary wide" disabled={busy}>Join as caregiver</button>
      </form>
    </section>
  )

  if (state.role === 'caregiver') {
    return (
      <>
        <h1 className="page-title">Caregiver approvals</h1>
        <p className="muted">Requests that need your OK appear here. All confirmations are simulated.</p>
        <button className="secondary" disabled={busy} onClick={() => void run(hub.refresh)}>Refresh activity</button>
        <ActivityList hub={hub} items={pending} empty={<p>No requests are waiting for approval.</p>} />
      </>
    )
  }

  return (
    <>
      <p className="eyebrow">SUPPORT, WITH PERMISSION</p>
      <h1 className="page-title">Your care circle</h1>
      <p>A linked caregiver can see your profile and activity, and approve requests. They cannot place requests or edit your profile.</p>

      <section className="card" aria-labelledby="invite-title">
        <h2 id="invite-title">Invite a caregiver</h2>
        <p>Enable caregiver approvals in your profile, then create a one-use code. It expires in 10 minutes. Open this app in a separate browser profile or private window to try the caregiver role.</p>
        <button className="primary wide" disabled={busy || !state.profile.caregiver_enabled}
          onClick={() => void run(async () => { setInvite((await api<{ code: string }>('/caregiver/invite', 'POST', {})).code) })}>
          Create invitation
        </button>
        {invite ? <label className="field"><span>Private invitation code</span><textarea readOnly value={invite} rows={4} onFocus={(event) => event.target.select()} /></label> : null}
        <button className="secondary wide" disabled={busy}
          onClick={() => void run(async () => { setState(await api<HubState>('/caregiver', 'DELETE')); setInvite(''); notify('Previous caregiver access and invitations are revoked.') })}>
          Revoke caregiver access
        </button>
      </section>

      {joinForm}
    </>
  )
}
