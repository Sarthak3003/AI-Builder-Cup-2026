import { useCallback, useEffect, useRef, useState } from 'react'
import { api, statusLabel } from './hub'
import type { HubState, Option, Proposal, Service } from './hub'
import ProfileEditor from './ProfileEditor'
import VoiceInput from './VoiceInput'
import FoodDemo from './FoodDemo'
import ConnectionStatus from './ConnectionStatus'
import { signIn, firebaseConfigured } from './firebase'
import './App.css'

type Page = 'home' | 'activity' | 'profile' | 'caregiver' | 'about'
const serviceNames = { food: 'Find a meal', ride: 'Go somewhere', medicine: 'Medicine request' }
const serviceIcons = { food: '◒', ride: '↗', medicine: '+' }

export default function App() {
  const [state, setState] = useState<HubState | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [service, setService] = useState<Service>('food')
  const [channel, setChannel] = useState('app')
  const [engine, setEngine] = useState('offline')
  const [message, setMessage] = useState('')
  const [destination, setDestination] = useState('')
  const [medicine, setMedicine] = useState('')
  const [budget, setBudget] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [selection, setSelection] = useState<Option | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invite, setInvite] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [resetPending, setResetPending] = useState(false)
  const inFlight = useRef(false)
  const requestKey = useRef(crypto.randomUUID())
  const refresh = useCallback(async () => setState(await api<HubState>('/state')), [])

  const start = useCallback(async () => {
    try { setState(await api<HubState>('/session', 'POST', {})); setError('') } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot connect to Saathi.')
    }
  }, [])
  const boot = useRef<Promise<HubState> | null>(null)
  useEffect(() => {
    let active = true
    boot.current ??= api<HubState>('/session', 'POST', {})
    void boot.current.then(data => { if (active) setState(data) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cannot connect to Saathi.') })
    return () => { active = false }
  }, [])

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  function changeRequest() { requestKey.current = crypto.randomUUID(); setProposal(null); setSelection(null) }
  function readAloud(text: string) {
    if (!('speechSynthesis' in window)) { setNotice('Read aloud is unavailable in this browser.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = state?.profile.language ?? 'en-IN'
    window.speechSynthesis.speak(utterance)
  }
  const pending = state?.activity.filter(item => item.status === 'awaiting_approval').length ?? 0
  const hi = state?.profile.language === 'hi-IN'
  return <div className={`app ${state?.profile.large_text ? 'large-text' : ''} ${state?.profile.high_contrast ? 'high-contrast' : ''}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="shell">
      <header><a className="brand" href="/" aria-label="Saathi home"><span className="brand-mark">s</span>saathi<span className="brand-dot">.</span></a>
        <span className="demo-label">PROTOTYPE · NO REAL PURCHASES</span>
        <button className="secondary" disabled={busy || !firebaseConfigured} onClick={() => { void run(async () => { setState(await signIn()); changeRequest(); setPage('home') }) }}>Sign in with Google</button>
        <button className="avatar" onClick={() => setPage('profile')} aria-label="Open profile">{state?.profile.name.slice(0, 1) ?? 'S'}</button>
      </header>
      <div className="layout"><nav aria-label="Main navigation">
        {([['home', hi ? 'साथी' : 'My Saathi', '⌂'], ['activity', hi ? 'गतिविधि' : 'Activity', '◷'], ['profile', hi ? 'प्रोफ़ाइल' : 'My profile', '○'], ['caregiver', hi ? 'देखभाल' : 'Care circle', '♡'], ['about', 'About this demo', 'i']] as const).map(([id, title, icon]) => <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}><span aria-hidden="true">{icon}</span>{title}{id === 'caregiver' && pending > 0 ? <b>{pending}</b> : null}</button>)}
        <div className="nav-note"><strong>One familiar place.</strong><p>Your preferences and activity stay together.</p></div>
      </nav>
      <main id="main" aria-busy={busy}>
        {error ? <div className="error" role="alert">{error}<button className="secondary" onClick={() => { void run(refresh) }}>Retry connection</button><button className="secondary" onClick={() => { void run(async () => { await api('/session', 'DELETE'); setState(null); await start() }) }}>Start a new demo session</button></div> : null}
        {notice ? <p className="notice" role="status">{notice}</p> : null}
        {busy ? <p role="status">Saving your request…</p> : null}
        {!state ? <section><h1>Your everyday companion</h1><p>Connecting to your local Saathi profile…</p><button className="primary" onClick={() => { void start() }}>Connect</button></section> : <>
        {page === 'home' ? <>
          <div className="eyebrow">{state.role === 'caregiver' ? 'CAREGIVER VIEW' : 'YOUR EVERYDAY COMPANION'}</div>
          <h1>{hi ? `नमस्ते, ${state.profile.name}।` : `Hello, ${state.profile.name}.`}<br/><span>{hi ? 'आज क्या मदद चाहिए?' : 'A little help with your day.'}</span></h1>
          <p className="intro">Food, rides and essentials. One profile. You stay in control.</p>
          {state.role === 'owner' ? <>
          <div className="service-tabs" role="group" aria-label="Choose a service">{(['food', 'ride', 'medicine'] as Service[]).map(item => <button key={item} aria-pressed={service === item} onClick={() => { setService(item); changeRequest() }}><span aria-hidden="true">{serviceIcons[item]}</span><strong>{serviceNames[item]}</strong><small>{item === 'food' ? 'Meals for your preferences' : item === 'ride' ? 'Start from your saved pickup' : 'Use your saved medicine list'}</small></button>)}</div>
          <section className="request-panel"><div className="panel-heading"><div><div className="section-label">LET’S MAKE IT SIMPLE</div><h2>{serviceNames[service]}</h2></div><span className="tag">{engine === 'offline' ? 'Offline demo' : 'Gemini · unverified'}</span></div>
            <p className="muted">{engine === 'offline' ? 'This mode uses your form and saved preferences, not AI interpretation.' : 'Gemini drafts a request from your words. Review every option before confirming. Live testing is deferred.'} All providers and prices are simulated.</p>
            <form onSubmit={e => { e.preventDefault(); void run(async () => {
              setSelection(null)
              const result = engine === 'gemini' ? await api<Proposal>('/assistant', 'POST', { id: requestKey.current, channel, message }) : await api<Proposal>('/requests', 'POST', { id: requestKey.current, service, channel, message, destination, medicine: medicine || state.profile.medicines[0] || '', budget: budget === '' ? null : Number(budget) })
              setProposal(result); await refresh()
            }) }}>
              <label>Assistant mode<select value={engine} onChange={e => { setEngine(e.target.value); changeRequest() }}><option value="offline">Offline demo (no AI)</option><option value="gemini">Gemini (requires configuration)</option></select></label>
              <div className="form-grid"><label>Interaction mode<select value={channel} onChange={e => { setChannel(e.target.value); changeRequest() }}><option value="app">App</option><option value="message">Message preview</option><option value="voice">Voice in this browser</option></select></label>
              <label>Budget (₹)<input type="number" min={0} max={10000} placeholder={String(state.profile.budget)} value={budget} onChange={e => { setBudget(e.target.value); changeRequest() }} /></label></div>
              {engine === 'offline' && service === 'ride' ? <label>Destination<input required maxLength={150} value={destination} placeholder="e.g. Community centre" onChange={e => { setDestination(e.target.value); changeRequest() }} /></label> : null}
              {engine === 'offline' && service === 'medicine' ? <label>Saved medicine<select value={medicine || state.profile.medicines[0] || ''} onChange={e => { setMedicine(e.target.value); changeRequest() }}>{state.profile.medicines.length ? state.profile.medicines.map(name => <option key={name}>{name}</option>) : <option value="">Add a label in My profile</option>}</select></label> : null}
              <label htmlFor="request-message">{channel === 'message' ? 'Your message (local preview, no message is sent)' : 'A note for your request (optional)'}</label>
              <textarea id="request-message" required={engine === 'gemini'} minLength={engine === 'gemini' ? 3 : undefined} rows={2} maxLength={1000} value={message} placeholder="Tell us what would make your day easier…" onChange={e => { setMessage(e.target.value); changeRequest() }} />
              {channel === 'voice' ? <VoiceInput language={state.profile.language} disabled={busy} onText={text => { setMessage(text); changeRequest() }} /> : null}
              <div className="form-actions"><button className="primary" disabled={busy}>Show options</button><span>{service === 'food' ? `${state.profile.vegetarian ? 'Vegetarian' : 'Any diet'} · ${state.profile.mild ? 'Mild spice' : 'Any spice'}` : service === 'ride' ? `Pickup: ${state.profile.home}` : 'Request only. No medical advice.'}</span></div>
            </form>
          </section>
          {proposal ? <section className="results" aria-live="polite"><div className="panel-heading"><h2>{proposal.summary}</h2><button className="secondary" onClick={() => readAloud(proposal.clarification || proposal.summary)}>Read aloud</button></div>
            {proposal.clarification ? <p>{proposal.clarification}</p> : <p>Choose an option, then review before anything is saved. Options expire after 15 minutes.</p>}
            <div className="options">{proposal.options.map(option => <article key={option.id}><h3>{option.name}</h3><p>{option.detail}</p><strong className="price">₹{option.price}</strong><button className="secondary" disabled={busy} onClick={() => setSelection(option)}>Choose {option.name}</button></article>)}</div>
          </section> : null}
          {selection && proposal ? <section className="confirmation" aria-labelledby="review-title"><div className="section-label">YOU HAVE THE FINAL SAY</div><h2 id="review-title">Review your request</h2><p><strong>{selection.name} · ₹{selection.price}</strong></p><p>{selection.detail}</p><p>This creates a simulated request. No payment or real booking takes place.</p>{state.profile.caregiver_enabled && (selection.price > state.profile.approval_limit || proposal.service === 'medicine') ? <p>Your caregiver must approve this request.</p> : null}
            <button className="primary" disabled={busy} onClick={() => { void run(async () => { await api(`/requests/${proposal.id}/confirm`, 'POST', { option_id: selection.id, confirmed: true }); setSelection(null); setProposal(null); requestKey.current = crypto.randomUUID(); await refresh(); setPage('activity'); setNotice('Your demo request is saved. No real booking was made.') }) }}>Confirm demo request</button>{' '}<button className="secondary" disabled={busy} onClick={() => setSelection(null)}>Go back</button>
          </section> : null}
          </> : <section className="request-panel"><h2>Help with a decision</h2><p>You can review shared activity and approve pending requests. Only the account owner can change preferences or make requests.</p><button className="primary" onClick={() => setPage('caregiver')}>Review approvals</button></section>}
          {state.requests.some(item => item.status === 'proposed' && item.expires_at * 1000 > Date.now()) && !proposal && state.role === 'owner' ? <button className="secondary" onClick={() => { const latest = [...state.requests].reverse().find(item => item.status === 'proposed' && item.expires_at * 1000 > Date.now()); if (latest) { setProposal(latest); setSelection(null) } }}>Resume latest unfinished request</button> : null}
          <section className="recent"><div className="panel-heading"><h2>One conversation, every service</h2><span className="muted">Shared local history</span></div>{state.messages.length ? state.messages.slice(-6).map((item, i) => <div className={`message ${item.role}`} key={i}><small>{item.role === 'user' ? 'You' : 'Saathi demo'} · {item.channel}</small><p>{item.text}</p></div>) : <p className="muted">Your requests will appear here, whichever interaction mode you use.</p>}</section>
        </> : null}
        {page === 'activity' || (page === 'caregiver' && state.role === 'caregiver') ? <section><div className="eyebrow">EVERYTHING IN ONE PLACE</div><h1>{page === 'caregiver' ? 'Caregiver approvals' : 'Your activity'}</h1><p>Food, rides and medicine requests share this history. All confirmations are simulated.</p><button className="secondary" disabled={busy} onClick={() => { void run(refresh) }}>Refresh activity</button>
          <div className="activity-list">{state.activity.length ? state.activity.filter(item => page !== 'caregiver' || item.status === 'awaiting_approval').map(item => <article key={item.id}><div className="activity-icon" aria-hidden="true">{serviceIcons[item.service]}</div><div className="activity-content"><small>{item.service.toUpperCase()} · {item.channel}</small><h3>{item.option.name}</h3><p>{item.option.detail}</p><span className={`status ${item.status}`}>{statusLabel[item.status]}</span><small>{new Date(item.created_at * 1000).toLocaleString()}</small></div><div className="activity-actions"><strong>₹{item.option.price}</strong>{state.role === 'owner' && ['awaiting_approval', 'simulated_confirmed'].includes(item.status) ? <button className="secondary" disabled={busy} onClick={() => { void run(async () => { await api(`/activity/${item.id}/cancel`, 'POST', {}); await refresh() }) }}>Cancel request</button> : null}{state.role === 'caregiver' && item.status === 'awaiting_approval' ? <><button className="primary" disabled={busy} onClick={() => { void run(async () => { await api(`/activity/${item.id}/decision`, 'POST', { action: 'approve' }); await refresh() }) }}>Approve</button><button className="secondary" disabled={busy} onClick={() => { void run(async () => { await api(`/activity/${item.id}/decision`, 'POST', { action: 'reject' }); await refresh() }) }}>Decline</button></> : null}</div></article>) : <div className="empty"><h2>A fresh start</h2><p>Your first request will appear here.</p><button className="primary" onClick={() => setPage('home')}>Explore services</button></div>}</div>
          {page === 'caregiver' && !pending ? <p>No requests are waiting for approval.</p> : null}
          <details><summary>Activity audit</summary><ul>{state.audit.slice().reverse().map((event, i) => <li key={i}>{event.event.replaceAll('_', ' ')} · {new Date(event.at * 1000).toLocaleTimeString()}</li>)}</ul></details>
        </section> : null}
        {page === 'profile' ? state.role === 'owner' ? <ProfileEditor key={JSON.stringify(state.profile)} initial={state.profile} busy={busy} save={profile => { void run(async () => { setState(await api<HubState>('/profile', 'PUT', profile)); changeRequest(); setNotice('Preferences saved for every service.') }) }} /> : <p>Only the owner can edit this shared profile.</p> : null}
        {page === 'caregiver' && state.role === 'owner' ? <section><div className="eyebrow">SUPPORT, WITH PERMISSION</div><h1>Your care circle</h1><p>A linked caregiver can see your profile and activity, and approve requests. They cannot place requests or edit your profile.</p><div className="request-panel"><h2>Invite a caregiver</h2><p>Enable caregiver approvals in My profile, then create a one-use code. It expires in 10 minutes. Open this app in a separate browser profile or private window to try the caregiver role.</p><button className="primary" disabled={busy || !state.profile.caregiver_enabled} onClick={() => { void run(async () => { const result = await api<{ code: string }>('/caregiver/invite', 'POST', {}); setInvite(result.code) }) }}>Create invitation</button>{invite ? <label>Private invitation code<textarea readOnly value={invite} rows={4} onFocus={e => e.target.select()} /></label> : null}<p><button className="secondary" disabled={busy} onClick={() => { void run(async () => { setState(await api<HubState>('/caregiver', 'DELETE')); setInvite(''); setNotice('Previous caregiver access and invitations are revoked.') }) }}>Revoke caregiver access</button></p></div></section> : null}
        {page === 'caregiver' ? <section className="request-panel"><h2>Join with an invitation</h2><p>This switches this browser session to the linked caregiver account. Use a separate browser profile to keep your owner session open.</p><form onSubmit={e => { e.preventDefault(); void run(async () => { setState(await api<HubState>('/caregiver/join', 'POST', { code: joinCode })); setJoinCode(''); setInvite(''); setProposal(null); setSelection(null) }) }}><label>Invitation code<input required value={joinCode} onChange={e => setJoinCode(e.target.value)} /></label><button className="primary" disabled={busy}>Join as caregiver</button></form></section> : null}
        {page === 'about' ? <section><div className="eyebrow">GIT SET GO</div><h1>One app.<br/><span>Your everyday companion.</span></h1><p>Built for people who find separate service apps difficult to navigate. Team leader: Lokita Varma. Team members: Lokita Varma and Sarthak Bhan.</p><h2>What works locally</h2><p>Shared preferences, three simulated services, explicit confirmation, activity, caregiver permissions, browser voice support, read aloud and accessibility settings.</p><h2>What is still an integration</h2><p>Live Gemini testing and cloud deployment testing are deferred. Actual providers, phone calls, WhatsApp and SMS are not connected. Message mode is an in-app preview. Firebase Google sign-in is implemented but needs project configuration. Without it, these are local demo sessions.</p><p>Storage: <strong>{state.storage}</strong>. Default local storage persists on this computer. Firestore emulator mode is available.</p><details><summary>Optional Gemini food integration</summary><p>This separate adapter requires a server API key and Firestore emulator. Its live behavior has not been tested.</p><FoodDemo /></details><h2>Your demo data</h2><button className="secondary" onClick={() => { const blob = new Blob([JSON.stringify({ profile: state.profile, activity: state.activity, audit: state.audit }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'saathi-demo-data.json'; a.click(); URL.revokeObjectURL(url) }}>Export my demo data</button>{' '}{state.role === 'owner' ? <button className="secondary" onClick={() => setResetPending(true)}>Reset demo data</button> : null}{resetPending ? <div className="confirmation"><p>Clear this profile, activity and caregiver access?</p><button className="primary" disabled={busy} onClick={() => { void run(async () => { setState(await api<HubState>('/data', 'DELETE')); setResetPending(false); setInvite(''); changeRequest(); setNotice('Demo data reset.') }) }}>Yes, reset my demo</button>{' '}<button className="secondary" onClick={() => setResetPending(false)}>Keep my data</button></div> : null}</section> : null}
        </>}
      </main></div><footer><span>Technology that adapts to you.</span><ConnectionStatus /><span>Saathi cannot respond to emergencies. Contact local emergency services directly.</span></footer>
    </div>
  </div>
}

