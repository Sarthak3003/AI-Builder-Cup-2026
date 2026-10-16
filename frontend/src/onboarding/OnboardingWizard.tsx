import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, paymentMethodLabel } from '../hub'
import type { Channel, HubState, PaymentMethod, StepId } from '../hub'
import { setupSteps } from '../route'
import ServiceOptions from '../components/ServiceOptions'
import PlacesEditor from '../components/PlacesEditor'
import BookingPreference from '../components/BookingPreference'
import type { Hub } from '../screens/hubType'

type Nav = { next: () => void; back?: () => void; exit: () => void }
type StepProps = { hub: Hub; nav: Nav }

const saveStep = async (hub: Hub, path: string, method: string, body: unknown) => {
  hub.setState(await api<HubState>(path, method, body))
}

// Continue saves this step and moves on. Save and exit keeps whatever is complete and goes home.
function Actions({ hub, nav, step, onContinue, skippable = false, exitSave, last = false }: StepProps & {
  step: StepId; onContinue?: () => Promise<void>; skippable?: boolean; exitSave?: () => Promise<void>; last?: boolean
}) {
  const { busy, run } = hub
  const skip = () => void run(async () => { await saveStep(hub, `/onboarding/steps/${step}`, 'POST', { skip: true }); nav.next() })
  const exit = () => void run(async () => {
    try { await exitSave?.() } catch { /* An unfinished step stays open; earlier answers are already saved. */ }
    nav.exit()
  })
  return (
    <div className="wizard-actions">
      {last ? null : onContinue ? (
        <button type="button" className="primary wide" disabled={busy} onClick={() => void run(async () => { await onContinue(); nav.next() })}>Continue</button>
      ) : (
        <button type="submit" className="primary wide" disabled={busy}>Continue</button>
      )}
      {skippable ? <button type="button" className="secondary wide" disabled={busy} onClick={skip}>Skip for now</button> : null}
      <div className="wizard-links">
        {nav.back ? <button type="button" className="secondary" disabled={busy} onClick={nav.back}>Back</button> : null}
        <button type="button" className="secondary" disabled={busy} onClick={exit}>Save and exit</button>
      </div>
    </div>
  )
}

function submitter(hub: Hub, nav: Nav, save: () => Promise<void>) {
  return (event: FormEvent) => { event.preventDefault(); void hub.run(async () => { await save(); nav.next() }) }
}

function WelcomeStep({ hub, nav }: StepProps) {
  const profile = hub.state.profile
  const [name, setName] = useState(profile.name === 'Friend' ? '' : profile.name)
  const [language, setLanguage] = useState(profile.language)
  const save = () => saveStep(hub, '/onboarding/profile', 'PATCH', { step: 'welcome', name, language })
  return (
    <form onSubmit={submitter(hub, nav, save)}>
      <p className="lead">Saathi helps you get a ride, a meal or everyday pharmacy items by asking in your own words. During setup, choose whether to compare ride and meal prices yourself or let Saathi choose and book for you.</p>
      <div className="card demo-note">
        <h2>This is a demo</h2>
        <p>Every provider, booking and payment here is simulated. No real driver, order or money is involved.</p>
      </div>
      <p className="muted">No sign-in is needed for this demo. Each answer is saved to this browser&rsquo;s demo session as you go, so you can stop and come back later.</p>
      <label className="field"><span>What should Saathi call you?</span>
        <input required maxLength={60} autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field"><span>Preferred language</span>
        <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
          <option value="en-IN">English (India)</option>
          <option value="hi-IN">हिन्दी (Hindi)</option>
        </select>
      </label>
      <Actions hub={hub} nav={nav} step="welcome" exitSave={save} />
    </form>
  )
}

const comfortChoices = [
  ['large_text', 'Larger text'],
  ['high_contrast', 'High contrast'],
  ['simple', 'Simple language and fewer choices'],
  ['read_aloud', 'Read prices and confirmations aloud'],
] as const
const channels: [Channel, string][] = [['voice', 'Speaking'], ['app', 'Tapping and typing'], ['message', 'Writing messages (in-app preview)']]

function AccessibilityStep({ hub, nav }: StepProps) {
  const profile = hub.state.profile
  const [prefs, setPrefs] = useState({
    large_text: profile.large_text, high_contrast: profile.high_contrast, simple: Boolean(profile.simple),
    read_aloud: Boolean(profile.read_aloud), offer_help: profile.offer_help ?? true, channel: profile.channel ?? 'app',
    show_options: profile.show_options !== false,
  })
  const save = () => saveStep(hub, '/onboarding/profile', 'PATCH', { step: 'accessibility', ...prefs })
  return (
    <form onSubmit={submitter(hub, nav, save)}>
      <fieldset className="choice-group">
        <legend>Make Saathi easier to use</legend>
        {comfortChoices.map(([key, label]) => (
          <label key={key} className="check-row"><input type="checkbox" checked={prefs[key]} onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })} />{label}</label>
        ))}
      </fieldset>
      <fieldset className="choice-group">
        <legend>How do you prefer to ask Saathi?</legend>
        {channels.map(([value, label]) => (
          <label key={value} className="check-row"><input type="radio" name="channel" checked={prefs.channel === value} onChange={() => setPrefs({ ...prefs, channel: value })} />{label}</label>
        ))}
      </fieldset>
      <fieldset className="choice-group">
        <legend>Extra help</legend>
        <label className="check-row"><input type="checkbox" checked={prefs.offer_help} onChange={(event) => setPrefs({ ...prefs, offer_help: event.target.checked })} />If something goes wrong, offer to ask my Care Circle for help</label>
      </fieldset>
      <BookingPreference showOptions={prefs.show_options} onChange={(value) => setPrefs({ ...prefs, show_options: value })} disabled={hub.busy} />
      <p className="muted">These start with safe settings. You can change them any time in Profile.</p>
      <Actions hub={hub} nav={nav} step="accessibility" exitSave={save} />
    </form>
  )
}

function PlacesStep({ hub, nav }: StepProps) {
  const save = () => saveStep(hub, '/onboarding/steps/places', 'POST', {})
  return (
    <>
      <p className="lead">Add your home, and any place you often go, such as your doctor. Saathi uses your usual pickup when you ask for a ride.</p>
      <p className="muted">Use clearly fake addresses in this demo.</p>
      <PlacesEditor hub={hub} />
      <Actions hub={hub} nav={nav} step="places" onContinue={save} exitSave={save} />
    </>
  )
}

function CareCircleStep({ hub, nav }: StepProps) {
  const { state, busy, run, setState } = hub
  const members = (state.care_circle ?? []).filter((grant) => grant.status !== 'revoked')
  const [form, setForm] = useState({ name: '', relationship: '', can_approve: false })
  const [invite, setInvite] = useState<{ name: string; code: string } | null>(null)
  const [rule, setRule] = useState({ on: state.profile.caregiver_enabled, limit: state.profile.approval_limit })
  const approver = members.some((grant) => grant.permissions.includes('approve'))
  const save = () => saveStep(hub, '/onboarding/profile', 'PATCH', { step: 'care_circle', caregiver_enabled: approver && rule.on, approval_limit: rule.limit })
  const link = invite ? `${window.location.origin}${window.location.pathname}#/join/${invite.code}` : ''
  return (
    <>
      <p className="lead">You can add someone you trust, such as a family member. This is optional, and they only see what you allow.</p>
      <section className="share-box" aria-labelledby="shared-title">
        <h2 id="shared-title">Exactly what is shared</h2>
        <p><strong>They will see</strong> the rides, meals and pharmacy orders you share: what, when, the status and the price.</p>
        <p><strong>They will not see</strong> your saved addresses, payment details, full conversations or medicine names, and they cannot book or pay for you.</p>
        <p className="muted">You can change or remove their access at any time in Family.</p>
      </section>
      {members.length ? (
        <ul className="plain-list" aria-label="People in your Care Circle">
          {members.map((grant) => <li key={grant.id}><strong>{grant.name}</strong>: {grant.permissions.includes('approve') ? 'can see shared activity and approve bookings' : 'can see shared activity (view only)'}</li>)}
        </ul>
      ) : null}
      <form className="inline-form" aria-labelledby="add-person-title" onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          const result = await api<{ code: string; state: HubState }>('/onboarding/caretaker-grants', 'POST', form)
          setState(result.state); setInvite({ name: form.name, code: result.code }); setForm({ name: '', relationship: '', can_approve: false })
        })
      }}>
        <h2 id="add-person-title" className="section-title">Add a person</h2>
        <label className="field"><span>Their name</span><input required maxLength={60} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field"><span>How you know them (optional)</span><input maxLength={40} placeholder="Daughter, son, neighbour…" value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} /></label>
        <fieldset className="choice-group">
          <legend>What can they do?</legend>
          <label className="check-row"><input type="radio" name="access" checked={!form.can_approve} onChange={() => setForm({ ...form, can_approve: false })} />See my shared activity (view only)</label>
          <label className="check-row"><input type="radio" name="access" checked={form.can_approve} onChange={() => setForm({ ...form, can_approve: true })} />See my shared activity and approve bookings</label>
        </fieldset>
        <button className="secondary wide" disabled={busy}>Add to my Care Circle</button>
      </form>
      {invite ? (
        <div className="invite-box" role="status">
          <p><strong>{invite.name} was added.</strong> Send them this private link (one use, 24 hours). Nothing is sent automatically.</p>
          <label className="field"><span>Invitation link for {invite.name}</span><input readOnly value={link} onFocus={(event) => event.target.select()} /></label>
        </div>
      ) : null}
      {approver ? (
        <fieldset className="choice-group">
          <legend>Approvals</legend>
          <label className="check-row"><input type="checkbox" checked={rule.on} onChange={(event) => setRule({ ...rule, on: event.target.checked })} />Ask my approver before bookings above the limit, and for every pharmacy order</label>
          <label className="field"><span>Approval limit (₹)</span><input type="number" inputMode="numeric" min={0} max={10000} value={rule.limit} onChange={(event) => setRule({ ...rule, limit: Number(event.target.value) })} /></label>
        </fieldset>
      ) : null}
      <Actions hub={hub} nav={nav} step="care_circle" onContinue={save} exitSave={save} skippable={!members.length} />
    </>
  )
}

function ServicesStep({ hub, nav }: StepProps) {
  const save = () => saveStep(hub, '/onboarding/steps/services', 'POST', {})
  const services = hub.state.services ?? []
  return (
    <>
      <p className="lead">Choose the services Saathi can use for you.</p>
      <p className="muted service-disclaimer">All options are simulated. No real bookings, deliveries or payments.</p>
      {services.map((service) => <ServiceOptions key={service.service_type} hub={hub} service={service} />)}
      <p className="muted">You can change these choices later in Services.</p>
      <Actions hub={hub} nav={nav} step="services" onContinue={save} exitSave={save} skippable={!services.some((s) => s.status === 'CONNECTED')} />
    </>
  )
}

const methodNotes: Record<PaymentMethod, string> = {
  DEMO_WALLET: 'A confirmed demo booking is marked as paid straight away. There is no real balance and no money moves.',
  PAY_ON_COMPLETION: 'The payment stays pending until the demo trip or delivery is marked complete. No money moves.',
}

function PaymentStep({ hub, nav }: StepProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(hub.state.profile.payment_method ?? null)
  const save = () => saveStep(hub, '/onboarding/profile', 'PATCH', { step: 'payment', payment_method: method })
  return (
    <form onSubmit={submitter(hub, nav, save)}>
      <fieldset className="choice-group">
        <legend>How should simulated payments work?</legend>
        {(Object.keys(methodNotes) as PaymentMethod[]).map((value) => (
          <label key={value} className="check-row payment-choice">
            <input type="radio" name="payment" required checked={method === value} onChange={() => setMethod(value)} />
            <span><strong>{paymentMethodLabel[value]}</strong><br /><small className="muted">{methodNotes[value]}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="card demo-note">
        <h2>No real money moves</h2>
        <p>Saathi never asks for card numbers, UPI PINs, OTPs or bank logins. If anyone asks you for these, it may be a scam: do not share them.</p>
      </div>
      <Actions hub={hub} nav={nav} step="payment" exitSave={method ? save : undefined} />
    </form>
  )
}

const roleText = (permissions: string[]) => (permissions.includes('approve') ? 'can see shared activity and approve bookings' : 'can see shared activity (view only)')

function ReviewStep({ hub, nav, onFinish }: StepProps & { onFinish: () => void }) {
  const { state, busy, run } = hub
  const progress = state.onboarding!
  const review = progress.review
  const change = (step: StepId, what: string) => <a href={`#/onboarding/${step}`} aria-label={`Change ${what}`}>Change</a>
  const finish = () => void run(async () => { await saveStep(hub, '/onboarding/finish', 'POST', { confirmed: true }); onFinish() })
  return (
    <>
      <p className="lead">Check your answers. You can change any of them now or later.</p>
      <dl className="review-list">
        <div><dt>About you</dt><dd>{review.name || 'No name yet'} · {review.language === 'hi-IN' ? 'Hindi' : 'English'}</dd>{change('welcome', 'your name and language')}</div>
        <div><dt>Comfort</dt><dd>{review.comfort.length ? review.comfort.join(', ') : 'Standard settings'} · Prefers {review.channel.toLowerCase()}</dd>{change('accessibility', 'comfort settings')}</div>
        <div><dt>Ride and meal bookings</dt><dd>{review.show_options === false ? 'Let Saathi choose the best option and book it for me' : 'Show me the options and let me confirm'}</dd>{change('accessibility', 'booking preference')}</div>
        <div><dt>Places</dt><dd>{review.places.length ? `${review.places.join(', ')} · usual pickup: ${review.pickup}` : 'None yet'}</dd>{change('places', 'saved places')}</div>
        <div><dt>Care Circle</dt><dd>{review.care_circle.length ? review.care_circle.map((p) => `${p.name} ${roleText(p.permissions)}`).join('; ') : 'No one added'}{review.approval_rule ? `. ${review.approval_rule}` : ''}</dd>{change('care_circle', 'Care Circle')}</div>
        <div><dt>Demo services</dt><dd>{review.services.map((s) => `${s.provider_label}: ${s.status === 'CONNECTED' ? 'connected' : 'not connected'}`).join('; ')}</dd>{change('services', 'demo services')}</div>
        <div><dt>Payment</dt><dd>{review.payment ?? 'Not chosen'} · no real money moves</dd>{change('payment', 'payment')}</div>
      </dl>
      {review.missing.length ? <p className="inline-note">Still to do: {review.missing.join(', ')}.</p> : null}
      <p className="muted">Everything in this demo is simulated: no real driver, order or payment.</p>
      {progress.completed ? (
        <a className="primary wide" href="#/profile">Done</a>
      ) : (
        <button type="button" className="primary wide" disabled={busy || review.missing.length > 0} onClick={finish}>Yes, finish setup</button>
      )}
      <Actions hub={hub} nav={nav} step="review" last />
    </>
  )
}

function Finished({ hub }: { hub: Hub }) {
  const name = hub.state.profile.name
  const ride = hub.state.services?.find((service) => service.service_type === 'RIDE')
  return (
    <section className="receipt card" aria-labelledby="finished-title">
      <h2 id="finished-title" className="step-title">You are all set, {name}</h2>
      <p className="lead">Your setup is saved. {hub.state.profile.show_options === false ? 'Saathi will choose and book app rides and meals for you. Medicine requests and telephone calls still ask first.' : 'Saathi will check with you before every booking.'} Everything stays simulated.</p>
      {ride?.status === 'CONNECTED' ? <a className="primary wide" href="#/request/ride">Try a demo ride</a> : <a className="primary wide" href="#/services">Connect a demo service</a>}
      <a className="secondary wide" href="#/">Go to Home</a>
    </section>
  )
}

export default function OnboardingWizard({ hub, step }: { hub: Hub; step?: StepId }) {
  const progress = hub.state.onboarding
  const [finished, setFinished] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const current: StepId = step ?? progress?.current ?? 'welcome'
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    heading.current?.focus()
  }, [current, finished])
  if (!progress) return null

  const index = setupSteps.indexOf(current)
  const info = progress.steps[index]
  const go = (target: StepId) => { window.location.hash = `#/onboarding/${target}` }
  const nav: Nav = {
    next: () => go(progress.completed ? 'review' : setupSteps[Math.min(index + 1, setupSteps.length - 1)]),
    back: index > 0 ? () => go(setupSteps[index - 1]) : undefined,
    exit: () => { window.location.hash = '#/' },
  }
  const firstOpen = progress.steps.find((s) => s.status === null)?.id
  const bodies: Record<StepId, ReactNode> = {
    welcome: <WelcomeStep hub={hub} nav={nav} />,
    accessibility: <AccessibilityStep hub={hub} nav={nav} />,
    places: <PlacesStep hub={hub} nav={nav} />,
    care_circle: <CareCircleStep hub={hub} nav={nav} />,
    services: <ServicesStep hub={hub} nav={nav} />,
    payment: <PaymentStep hub={hub} nav={nav} />,
    review: <ReviewStep hub={hub} nav={nav} onFinish={() => setFinished(true)} />,
  }

  if (finished) {
    return (
      <>
        <h1 className="page-title" tabIndex={-1} ref={heading}>Setup finished</h1>
        <Finished hub={hub} />
      </>
    )
  }
  return (
    <>
      <p className="eyebrow">SET UP SAATHI</p>
      <nav className="stepper" aria-label="Setup steps">
        <p className="stepper-count">Step {index + 1} of {setupSteps.length}</p>
        <div className="progress-track" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={setupSteps.length} aria-valuenow={index + 1}>
          <span style={{ width: `${((index + 1) / setupSteps.length) * 100}%` }} />
        </div>
        <details>
          <summary>All steps</summary>
          <ol className="step-list">
            {progress.steps.map((item) => {
              const reachable = item.status !== null || item.id === firstOpen || item.id === current
              const mark = item.status === 'done' ? ' (done)' : item.status === 'skipped' ? ' (skipped)' : ''
              return (
                <li key={item.id} className={item.id === current ? 'current' : item.status ?? 'open'}>
                  {reachable ? <a href={`#/onboarding/${item.id}`} aria-current={item.id === current ? 'step' : undefined}>{item.title}{mark}</a> : <span>{item.title}</span>}
                </li>
              )
            })}
          </ol>
        </details>
      </nav>
      <section className="card wizard" aria-labelledby="wizard-title">
        <h1 id="wizard-title" className="step-title" tabIndex={-1} ref={heading}>{info.title}</h1>
        {bodies[current]}
      </section>
    </>
  )
}
