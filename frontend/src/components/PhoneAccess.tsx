import { useEffect, useState } from 'react'
import { api } from '../hub'
import type { Hub } from '../screens/hubType'

type Pairing = { code: string; expires_at: number; single_use: boolean }

export default function PhoneAccess({ hub }: { hub: Hub }) {
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
  if (!phone) return null
  const generate = () => void hub.run(async () => {
    setPairing(await api<Pairing>('/phone/pairing-codes', 'POST', { retain_transcript: retain }))
    setNow(Date.now() / 1000)
  })
  return (
    <section className="card" aria-labelledby="phone-access-title">
      <h2 id="phone-access-title">Call Saathi</h2>
      <p>Call from a telephone and enter a one-use code to connect to this profile. Caller ID alone never gives access.</p>
      {phone.enabled ? (
        <>
          {phone.number ? <a className="primary wide" href={`tel:${phone.number}`}>Call {phone.number}</a> : <p className="inline-note">Ask the organiser for the configured Twilio number.</p>}
          <label className="check-row"><input type="checkbox" checked={retain} onChange={(event) => setRetain(event.target.checked)} />Save a redacted text transcript for this call</label>
          <p className="muted">Twilio processes your speech, and Gemini may interpret it. Saathi does not record audio. Phone bookings always ask for your confirmation.</p>
          <button type="button" className="secondary wide" disabled={hub.busy} onClick={generate}>Generate pairing code</button>
          {pairing ? (
            <div className="phone-pairing" role="status">
              <p>Enter this code on the telephone keypad, then press #.</p>
              <strong className="phone-pairing-code" aria-label={`Pairing code ${pairing.code.split('').join(' ')}`}>{pairing.code.slice(0, 4)} {pairing.code.slice(4)}</strong>
              <p>Single use · expires in {Math.max(0, Math.ceil((pairing.expires_at - now) / 60))} minutes.</p>
              <p className="muted">Keep it private. It gives this call access to your saved places and demo bookings.</p>
            </div>
          ) : null}
        </>
      ) : <p className="inline-note">Telephone calling is not enabled on this server yet. Twilio credentials and a configured number are needed. This is not a call simulator.</p>}
      <button type="button" className="secondary wide" disabled={hub.busy} onClick={() => void hub.run(async () => {
        await api('/phone/revoke', 'POST', {})
        setPairing(null)
        hub.notify('Phone access and unused pairing codes revoked. Pair again for a new call.')
      })}>Revoke phone access</button>
      <a href="#/activity">See phone calls in Activity</a>
    </section>
  )
}