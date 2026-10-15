import { useState } from 'react'
import { api } from '../hub'
import type { HubState } from '../hub'
import FoodDemo from '../FoodDemo'
import type { Hub } from './hubType'

export default function AboutScreen({ hub }: { hub: Hub }) {
  const { state, busy, run, setState, notify } = hub
  const [resetPending, setResetPending] = useState(false)

  function exportData() {
    const blob = new Blob([JSON.stringify({ profile: state.profile, activity: state.activity, audit: state.audit }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'saathi-demo-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <p className="eyebrow">GIT SET GO</p>
      <h1 className="page-title">About this demo</h1>
      <p>Built for people who find separate service apps difficult to navigate. Team leader: Lokita Varma. Team members: Lokita Varma and Sarthak Bhan.</p>

      <section className="card">
        <h2>What you can try</h2>
        <ul className="plain-list">
          <li>Ask for a ride or a meal, by typing or speaking, instead of calling family.</li>
          <li>Compare demo apps: Uber, Ola and Rapido for rides; Uber Eats, Swiggy and Zomato for food.</li>
          <li>Review and confirm. Saathi books only after your OK and saves a reference in Activity.</li>
          <li>Turn apps on or off in Apps. Saathi only compares the ones you keep on.</li>
          <li>Invite a family caregiver who can approve larger requests. They cannot book for you.</li>
          <li>Larger text, high contrast, read aloud, Hindi labels, and install on your home screen.</li>
        </ul>
      </section>

      <section className="card demo-note">
        <h2>What is simulated</h2>
        <p>Every app, price, delivery time and booking here is simulated. No Uber, Ola, Rapido, Uber Eats, Swiggy or Zomato account is used, nothing is charged, and the names are only examples with no link to those companies.</p>
        <p>Real connections need each company&rsquo;s approval and your own sign-in, so they are not built yet.</p>
      </section>

      <section className="card">
        <h2>What is still an integration</h2>
        <p>Phone calls, WhatsApp and SMS are not connected. Message mode is an in-app preview. No sign-in is required: each browser gets a separate demo session.</p>
        <p>Understanding requests: <strong>{state.gemini ? 'Gemini. Microphone recordings are sent to Google to be understood.' : 'simple word matching on this server (not AI). Speech is turned into text by your browser.'}</strong></p>
        <p>Storage: <strong>{state.storage}</strong>. Default local storage persists on this computer. Firestore emulator mode is available.</p>
        <details>
          <summary>Optional Gemini food integration</summary>
          <p>This separate adapter requires a server API key and Firestore emulator. Its live behaviour has not been tested.</p>
          <FoodDemo />
        </details>
      </section>

      <section className="card">
        <h2>Your demo data</h2>
        <button className="secondary wide" onClick={exportData}>Export my demo data</button>
        {state.role === 'owner' ? <button className="secondary wide" onClick={() => setResetPending(true)}>Reset demo data</button> : null}
        {resetPending ? (
          <div className="confirmation">
            <p>Clear this profile, activity and caregiver access?</p>
            <button className="primary wide" disabled={busy}
              onClick={() => void run(async () => { setState(await api<HubState>('/data', 'DELETE')); setResetPending(false); notify('Demo data reset.') })}>
              Yes, reset my demo
            </button>
            <button className="secondary wide" onClick={() => setResetPending(false)}>Keep my data</button>
          </div>
        ) : null}
      </section>
    </>
  )
}
