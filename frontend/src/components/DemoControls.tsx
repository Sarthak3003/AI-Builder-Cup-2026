import { useState } from 'react'
import { api, inviteLink } from '../hub'
import type { HubState } from '../hub'
import type { Hub } from '../screens/hubType'

type Seeded = { state: HubState; invites: { name: string; role: string; code: string }[] }

// Only shown when the server allows demo controls (local, test, or SAATHI_DEMO_CONTROLS=1).
export default function DemoControls({ hub }: { hub: Hub }) {
  const { busy, run, setState, notify } = hub
  const [confirming, setConfirming] = useState(false)
  const [invites, setInvites] = useState<Seeded['invites']>([])
  return (
    <section className="card demo-note" aria-labelledby="demo-controls-title">
      <h2 id="demo-controls-title">Demo controls</h2>
      <p>For judging and testing only. Everything stays simulated.</p>
      {confirming ? (
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => void run(async () => {
            const seeded = await api<Seeded>('/demo/seed', 'POST')
            setState(seeded.state); setInvites(seeded.invites); setConfirming(false)
            notify("Meera's demo is loaded.")
          })}>Yes, replace my demo data</button>
          <button className="secondary" onClick={() => setConfirming(false)}>Keep my data</button>
        </div>
      ) : (
        <button className="secondary wide" disabled={busy} onClick={() => setConfirming(true)}>Load Meera's demo (replaces this demo's data)</button>
      )}
      <button className="secondary wide" disabled={busy} onClick={() => void run(async () => { await api('/demo/fail-next', 'POST'); notify('The next booking you confirm will fail, so you can see the failure path.') })}>
        Make the next booking fail
      </button>
      {invites.length ? (
        <div className="invite-box">
          <p><strong>To use Saathi as Asha or Ravi in this browser,</strong> tap their name under Switch account at the top of this page.</p>
          <p>To show two people side by side, open a link below in a private window or on another device:</p>
          {invites.map((invite) => (
            <label key={invite.code} className="field"><span>{invite.name} ({invite.role})</span>
              <input readOnly value={inviteLink(invite.code)} onFocus={(event) => event.target.select()} />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  )
}
