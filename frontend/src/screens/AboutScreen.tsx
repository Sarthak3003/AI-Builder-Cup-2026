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
          <li>Set up Saathi once: your name, comfort settings, saved places, Care Circle, demo services and how simulated payments work.</li>
          <li>Ask for a ride, a meal or everyday pharmacy items, by typing or speaking, instead of calling family.</li>
          <li>See a server price with every line explained, then confirm. Saathi books only after your clear yes, or, if you choose it in Profile, picks and books the best ride or meal for you.</li>
          <li>Book with Saathi&rsquo;s own Demo Ride or Saathi Demo Kitchen, or compare example options shown under familiar names: Uber, Ola and Rapido for rides; Uber Eats, Swiggy and Zomato for food.</li>
          <li>Invite a family member who can see shared activity, or also approve larger bookings. They cannot book or pay for you.</li>
          <li>Larger text, high contrast, read aloud, Hindi labels, and install on your home screen.</li>
        </ul>
      </section>

      <section className="card demo-note">
        <h2>What is simulated</h2>
        <p>Every booking is made by one of Saathi&rsquo;s demo providers: the Demo Ride Provider, the Demo Food Provider or the Demo Pharmacy Provider. Prices, times and booking references such as DEMO-RIDE-1042 are samples. No driver comes, no food or medicine is delivered and no money moves.</p>
        <p>Names such as Uber or Swiggy are only labels on demo options. No account with those companies is used and Saathi has no link to them. The demo pharmacy has sample non-prescription items only.</p>
        <p>Saathi never asks for card numbers, UPI PINs, OTPs or bank logins.</p>
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
        {state.role === 'owner' ? <button className="secondary wide" onClick={() => setResetPending(true)}>Delete my data</button> : null}
        {resetPending ? (
          <div className="confirmation">
            <p>Delete this profile, its activity and everyone&rsquo;s Care Circle access? This cannot be undone.</p>
            <button className="primary wide" disabled={busy}
              onClick={() => void run(async () => { setState(await api<HubState>('/data', 'DELETE')); setResetPending(false); notify('Your data was deleted.') })}>
              Yes, delete my data
            </button>
            <button className="secondary wide" onClick={() => setResetPending(false)}>Keep my data</button>
          </div>
        ) : null}
      </section>
    </>
  )
}
