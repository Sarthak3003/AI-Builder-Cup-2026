import { useEffect, useRef, useState } from 'react'
import { api, serviceNames, waitText } from '../hub'
import type { Activity, Option, Proposal, Service } from '../hub'
import { newId } from '../id'
import { BackIcon, CheckIcon } from '../icons'
import VoiceInput from '../VoiceInput'
import OptionCard from '../components/OptionCard'
import ProviderBadge from '../components/ProviderBadge'
import type { Hub } from './hubType'

type Channel = 'app' | 'message' | 'voice'
type Step = 'form' | 'options' | 'review' | 'done'
const nouns: Record<Service, string> = { ride: 'ride', food: 'order', medicine: 'request' }

export default function RequestScreen({ hub, service, proposalId }: { hub: Hub; service: Service; proposalId?: string }) {
  const { state, busy, run, refresh } = hub
  const profile = state.profile
  const [handedOver] = useState(() => state.requests.find((item) => item.id === proposalId && item.service === service && item.status === 'proposed' && item.expires_at * 1000 > Date.now()) ?? null)
  const [engine, setEngine] = useState<'offline' | 'gemini'>('offline')
  const [channel, setChannel] = useState<Channel>(handedOver?.channel === 'voice' ? 'voice' : 'app')
  const [message, setMessage] = useState(handedOver?.input?.message ?? '')
  const [destination, setDestination] = useState(handedOver?.input?.destination ?? '')
  const [medicine, setMedicine] = useState('')
  const [budget, setBudget] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(handedOver)
  const [selection, setSelection] = useState<Option | null>(null)
  const [receipt, setReceipt] = useState<Activity | null>(null)
  const [now] = useState(() => Date.now())
  const requestKey = useRef(newId())
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const step: Step = receipt ? 'done' : selection && proposal ? 'review' : proposal ? 'options' : 'form'
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    heading.current?.focus()
  }, [step])

  const apps = state.catalogue.filter((app) => app.service === service && profile.enabled_providers.includes(app.id))
  const unfinished = [...state.requests].reverse().find((item) => item.service === service && item.status === 'proposed' && item.expires_at * 1000 > now)

  function changeRequest() { requestKey.current = newId(); setProposal(null); setSelection(null); setReceipt(null) }
  function startAgain() { changeRequest(); setMessage(''); setDestination(''); setBudget('') }

  function readAloud(text: string) {
    if (!('speechSynthesis' in window)) { hub.notify('Read aloud is unavailable in this browser.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = profile.language
    window.speechSynthesis.speak(utterance)
  }

  function submit() {
    void run(async () => {
      setSelection(null)
      const result = engine === 'gemini'
        ? await api<Proposal>('/assistant', 'POST', { id: requestKey.current, channel, message })
        : await api<Proposal>('/requests', 'POST', {
            id: requestKey.current, service, channel, message, destination,
            medicine: medicine || profile.medicines[0] || '', budget: budget === '' ? null : Number(budget),
          })
      setProposal(result)
      await refresh()
    })
  }

  function confirm() {
    if (!selection || !proposal) return
    void run(async () => {
      const order = await api<Activity>(`/requests/${proposal.id}/confirm`, 'POST', { option_id: selection.id, confirmed: true })
      setReceipt(order); setSelection(null); setProposal(null)
      requestKey.current = newId()
      await refresh()
    })
  }

  const needsApproval = selection && proposal ? profile.caregiver_enabled && (selection.price > profile.approval_limit || proposal.service === 'medicine') : false
  const noteLabel = engine === 'gemini' ? 'Tell Saathi what you need' : channel === 'message' ? 'Your message (local preview, no message is sent)' : 'Anything else we should know? (optional)'

  return (
    <>
      <a className="back" href="#/"><BackIcon /> Home</a>
      <h1 className="page-title">{serviceNames[service]}</h1>

      {step === 'form' ? (
        <section className="card" aria-labelledby="form-title">
          <h2 id="form-title" tabIndex={-1} ref={heading} className="step-title">What would you like?</h2>
          <p className="muted apps-line">
            {apps.length ? <>Saathi will compare: <strong>{apps.map((app) => app.name).join(', ')}</strong> (demo apps). </> : <>No app is turned on for this. </>}
            <a href="#/apps">Change in Apps</a>
          </p>
          {unfinished ? <button className="secondary wide" onClick={() => setProposal(unfinished)}>Continue your unfinished request</button> : null}
          <form onSubmit={(event) => { event.preventDefault(); submit() }}>
            {engine === 'offline' && service === 'ride' ? (
              <label className="field"><span>Where to?</span>
                <input required maxLength={150} value={destination} placeholder="e.g. Dr Mehta's clinic" onChange={(event) => { setDestination(event.target.value); changeRequest() }} />
              </label>
            ) : null}
            {engine === 'offline' && service === 'medicine' ? (
              <label className="field"><span>Saved medicine</span>
                <select value={medicine || profile.medicines[0] || ''} onChange={(event) => { setMedicine(event.target.value); changeRequest() }}>
                  {profile.medicines.length ? profile.medicines.map((name) => <option key={name}>{name}</option>) : <option value="">Add a label in your profile</option>}
                </select>
              </label>
            ) : null}
            <label className="field"><span>{noteLabel}</span>
              <textarea required={engine === 'gemini'} minLength={engine === 'gemini' ? 3 : undefined} rows={3} maxLength={1000} value={message}
                placeholder={service === 'food' ? 'e.g. Something light, no spice' : 'Tell us what would make your day easier…'}
                onChange={(event) => { setMessage(event.target.value); changeRequest() }} />
            </label>
            <VoiceInput language={profile.language} disabled={busy} onText={(text) => { setMessage(text); setChannel('voice'); changeRequest() }} />
            <details className="more">
              <summary>More options</summary>
              <label className="field"><span>Budget (₹)</span>
                <input type="number" inputMode="numeric" min={0} max={10000} placeholder={String(profile.budget)} value={budget} onChange={(event) => { setBudget(event.target.value); changeRequest() }} />
              </label>
              <label className="field"><span>Assistant mode</span>
                <select value={engine} onChange={(event) => { setEngine(event.target.value as 'offline' | 'gemini'); changeRequest() }}>
                  <option value="offline">Offline demo (no AI)</option>
                  <option value="gemini">Gemini (requires configuration)</option>
                </select>
              </label>
              <label className="field"><span>How are you asking?</span>
                <select value={channel} onChange={(event) => { setChannel(event.target.value as Channel); changeRequest() }}>
                  <option value="app">App</option>
                  <option value="message">Message preview</option>
                  <option value="voice">Voice in this browser</option>
                </select>
              </label>
              <p className="muted">{engine === 'offline' ? 'Offline demo uses your answers and saved preferences, not AI.' : 'Gemini drafts a request from your words. Live testing is deferred.'}</p>
            </details>
            <button className="primary wide" disabled={busy}>Show options</button>
            <p className="muted prefs">
              {service === 'food' ? `${profile.vegetarian ? 'Vegetarian' : 'Any diet'} · ${profile.mild ? 'Mild spice' : 'Any spice'} · up to ₹${profile.budget}` : service === 'ride' ? `Pickup: ${profile.home}` : 'Request only. No medical advice.'}
            </p>
          </form>
        </section>
      ) : null}

      {step === 'options' && proposal ? (
        <section className="results" aria-labelledby="results-title" aria-live="polite">
          <div className="section-row">
            <h2 id="results-title" tabIndex={-1} ref={heading} className="step-title">{proposal.summary}</h2>
            <button className="secondary small" onClick={() => readAloud(proposal.clarification || proposal.summary)}>Read aloud</button>
          </div>
          {proposal.input?.message ? <p className="heard">You asked: “{proposal.input.message}”</p> : null}
          {proposal.clarification ? (
            <p className="clarify">{proposal.clarification} {proposal.clarification.startsWith('Turn on') ? <a href="#/apps">Open Apps</a> : null}</p>
          ) : (
            <p className="muted">Pick the one you like. You review it before anything is booked. Options expire after 15 minutes.</p>
          )}
          <div className="options">
            {proposal.options.map((option) => (
              <OptionCard key={option.id} option={option} service={proposal.service} busy={busy} onChoose={() => setSelection(option)} />
            ))}
          </div>
          <button className="secondary wide" disabled={busy} onClick={() => setProposal(null)}>Change my request</button>
        </section>
      ) : null}

      {step === 'review' && selection && proposal ? (
        <section className="review card" aria-labelledby="review-title">
          <p className="eyebrow">YOU HAVE THE FINAL SAY</p>
          <h2 id="review-title" tabIndex={-1} ref={heading} className="step-title">Review your request</h2>
          {selection.provider && selection.provider_name ? <ProviderBadge id={selection.provider} name={selection.provider_name} /> : null}
          <p className="review-name">{selection.name}</p>
          <p className="review-price">₹{selection.price}</p>
          <p className="muted">{selection.detail}</p>
          {selection.eta_min ? <p>{waitText(proposal.service, selection.eta_min)}</p> : null}
          <p>
            {selection.provider_name ? `Saathi will book this with ${selection.provider_name} for you. ` : 'Saathi will save this request for you. '}
            This is a simulated booking: no real {nouns[proposal.service]} is placed and nothing is charged.
          </p>
          {needsApproval ? <p className="inline-note">Your caregiver must approve this request first.</p> : null}
          <button className="primary wide" disabled={busy} onClick={confirm}>{selection.provider_name ? `Book with ${selection.provider_name}` : 'Confirm request'}</button>
          <button className="secondary wide" disabled={busy} onClick={() => setSelection(null)}>Go back</button>
        </section>
      ) : null}

      {step === 'done' && receipt ? (
        <section className="receipt card" aria-labelledby="receipt-title">
          <span className="receipt-check"><CheckIcon /></span>
          <h2 id="receipt-title" tabIndex={-1} ref={heading} className="step-title">{receipt.status === 'awaiting_approval' ? 'Sent for approval' : 'All done'}</h2>
          <p className="lead">
            {receipt.status === 'awaiting_approval'
              ? 'Your caregiver will be asked to approve this before Saathi books it.'
              : `Saathi booked ${receipt.option.name}${receipt.option.provider_name ? ` with ${receipt.option.provider_name}` : ''} for you.`}
          </p>
          <dl className="receipt-details">
            {receipt.option.provider_name ? <div><dt>App</dt><dd>{receipt.option.provider_name} (demo)</dd></div> : null}
            <div><dt>Price</dt><dd>₹{receipt.option.price}</dd></div>
            {receipt.option.eta_min ? <div><dt>Time</dt><dd>{waitText(receipt.service, receipt.option.eta_min)}</dd></div> : null}
            {receipt.reference ? <div><dt>Reference</dt><dd>{receipt.reference}</dd></div> : null}
          </dl>
          <p className="muted">Simulated booking. No real {nouns[receipt.service]} was placed and nothing was charged.</p>
          <p className="reassure">{receipt.status === 'awaiting_approval' ? 'No need to call anyone.' : 'That is it. There was no need to call anyone.'}</p>
          <a className="primary wide" href="#/activity">See my activity</a>
          <button className="secondary wide" onClick={startAgain}>Book something else</button>
        </section>
      ) : null}
    </>
  )
}
