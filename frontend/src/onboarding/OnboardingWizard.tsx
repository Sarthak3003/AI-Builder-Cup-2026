import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, paymentMethodLabel } from '../hub'
import type { Channel, HubState, PaymentMethod, StepId } from '../hub'
import { setupSteps } from '../route'
import ServiceOptions from '../components/ServiceOptions'
import PlacesEditor from '../components/PlacesEditor'
import BookingPreference from '../components/BookingPreference'
import type { Hub } from '../screens/hubType'
import { useI18n } from '../i18n'
import type { Translate } from '../i18n'

type Nav = { next: () => void; back?: () => void; exit: () => void }
type StepProps = { hub: Hub; nav: Nav }

const saveStep = async (hub: Hub, path: string, method: string, body: unknown) => {
  hub.setState(await api<HubState>(path, method, body))
}

// Continue saves this step and moves on. Save and exit keeps whatever is complete and goes home.
function Actions({ hub, nav, step, onContinue, skippable = false, exitSave, last = false }: StepProps & {
  step: StepId; onContinue?: () => Promise<void>; skippable?: boolean; exitSave?: () => Promise<void>; last?: boolean
}) {
  const { t } = useI18n()
  const { busy, run } = hub
  const skip = () => void run(async () => { await saveStep(hub, `/onboarding/steps/${step}`, 'POST', { skip: true }); nav.next() })
  const exit = () => void run(async () => {
    try { await exitSave?.() } catch { /* An unfinished step stays open; earlier answers are already saved. */ }
    nav.exit()
  })
  return (
    <div className="wizard-actions">
      {last ? null : onContinue ? (
        <button type="button" className="primary wide" disabled={busy} onClick={() => void run(async () => { await onContinue(); nav.next() })}>{t('Continue', 'आगे बढ़ें')}</button>
      ) : (
        <button type="submit" className="primary wide" disabled={busy}>{t('Continue', 'आगे बढ़ें')}</button>
      )}
      {skippable ? <button type="button" className="secondary wide" disabled={busy} onClick={skip}>{t('Skip for now', 'अभी छोड़ें')}</button> : null}
      <div className="wizard-links">
        {nav.back ? <button type="button" className="secondary" disabled={busy} onClick={nav.back}>{t('Back', 'पीछे जाएँ')}</button> : null}
        <button type="button" className="secondary" disabled={busy} onClick={exit}>{t('Save and exit', 'सहेजें और बाहर जाएँ')}</button>
      </div>
    </div>
  )
}

function submitter(hub: Hub, nav: Nav, save: () => Promise<void>) {
  return (event: FormEvent) => { event.preventDefault(); void hub.run(async () => { await save(); nav.next() }) }
}

function WelcomeStep({ hub, nav }: StepProps) {
  const { t, setLanguage } = useI18n()
  const profile = hub.state.profile
  const [name, setName] = useState(profile.name === 'Friend' ? '' : profile.name)
  const [language, setDraftLanguage] = useState(profile.language)
  const save = () => saveStep(hub, '/onboarding/profile', 'PATCH', { step: 'welcome', name, language })
  return (
    <form onSubmit={submitter(hub, nav, save)}>
      <p className="lead">{t('A few details to make Saathi yours.', 'साथी को अपना बनाने के लिए कुछ जानकारी दें।')}</p>
      <label className="field"><span>{t('What should Saathi call you?', 'साथी आपको किस नाम से बुलाए?')}</span>
        <input required maxLength={60} autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field"><span>{t('Preferred language', 'पसंदीदा भाषा')}</span>
        <select value={language} onChange={(event) => { const value = event.target.value as typeof language; setDraftLanguage(value); setLanguage(value) }}>
          <option value="en-IN">English (India)</option>
          <option value="hi-IN">हिन्दी (भारत)</option>
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
  const { t, text } = useI18n()
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
        <legend>{t('Make Saathi easier to use', 'साथी का इस्तेमाल आसान बनाएँ')}</legend>
        {comfortChoices.map(([key, label]) => (
          <label key={key} className="check-row"><input type="checkbox" checked={prefs[key]} onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })} />{text(label)}</label>
        ))}
      </fieldset>
      <fieldset className="choice-group">
        <legend>{t('How do you prefer to ask Saathi?', 'आप साथी से कैसे कहना पसंद करते हैं?')}</legend>
        {channels.map(([value, label]) => (
          <label key={value} className="check-row"><input type="radio" name="channel" checked={prefs.channel === value} onChange={() => setPrefs({ ...prefs, channel: value })} />{text(label)}</label>
        ))}
      </fieldset>
      <fieldset className="choice-group">
        <legend>{t('Extra help', 'अतिरिक्त मदद')}</legend>
        <label className="check-row"><input type="checkbox" checked={prefs.offer_help} onChange={(event) => setPrefs({ ...prefs, offer_help: event.target.checked })} />{t('If something goes wrong, offer to ask my Care Circle for help', 'कुछ गड़बड़ होने पर मेरे देखभाल समूह से मदद माँगने का विकल्प दें')}</label>
      </fieldset>
      <BookingPreference showOptions={prefs.show_options} onChange={(value) => setPrefs({ ...prefs, show_options: value })} disabled={hub.busy} />
      <p className="muted">{t('These start with safe settings. You can change them any time in Profile.', 'ये सुरक्षित सेटिंग से शुरू होते हैं। आप इन्हें प्रोफ़ाइल में कभी भी बदल सकते हैं।')}</p>
      <Actions hub={hub} nav={nav} step="accessibility" exitSave={save} />
    </form>
  )
}

function PlacesStep({ hub, nav }: StepProps) {
  const { t } = useI18n()
  const save = () => saveStep(hub, '/onboarding/steps/places', 'POST', {})
  return (
    <>
      <p className="lead">{t('Add your home, and any place you often go, such as your doctor. Saathi uses your usual pickup when you ask for a ride.', 'अपना घर और वे जगहें जोड़ें जहाँ आप अक्सर जाते हैं, जैसे डॉक्टर का क्लिनिक। सवारी माँगने पर साथी आपके सामान्य पिकअप का इस्तेमाल करता है।')}</p>
      <p className="muted">{t('Use clearly fake addresses in this demo.', 'इस डेमो में स्पष्ट रूप से काल्पनिक पते इस्तेमाल करें।')}</p>
      <PlacesEditor hub={hub} />
      <Actions hub={hub} nav={nav} step="places" onContinue={save} exitSave={save} />
    </>
  )
}

function CareCircleStep({ hub, nav }: StepProps) {
  const { t } = useI18n()
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
      <p className="lead">{t('You can add someone you trust, such as a family member. This is optional, and they only see what you allow.', 'आप किसी भरोसेमंद व्यक्ति, जैसे परिवार के सदस्य को जोड़ सकते हैं। यह वैकल्पिक है और वे केवल वही देखेंगे जिसकी आप अनुमति देंगे।')}</p>
      <section className="share-box" aria-labelledby="shared-title">
        <h2 id="shared-title">{t('Exactly what is shared', 'ठीक क्या साझा होता है')}</h2>
        <p><strong>{t('They will see', 'वे देख पाएँगे')}</strong> {t('the rides, meals and pharmacy orders you share: what, when, the status and the price.', 'आपके साझा किए सवारी, भोजन और फ़ार्मेसी ऑर्डर: क्या, कब, स्थिति और कीमत।')}</p>
        <p><strong>{t('They will not see', 'वे नहीं देख पाएँगे')}</strong> {t('your saved addresses, payment details, full conversations or medicine names, and they cannot book or pay for you.', 'आपके सहेजे पते, भुगतान की जानकारी, पूरी बातचीत या दवा के नाम। वे आपके लिए बुकिंग या भुगतान भी नहीं कर सकते।')}</p>
        <p className="muted">{t('You can change or remove their access at any time in Family.', 'आप परिवार में उनकी पहुँच कभी भी बदल या हटा सकते हैं।')}</p>
      </section>
      {members.length ? (
        <ul className="plain-list" aria-label={t('People in your Care Circle', 'आपके देखभाल समूह के लोग')}>
          {members.map((grant) => <li key={grant.id}><strong>{grant.name}</strong>: {roleText(grant.permissions, t)}</li>)}
        </ul>
      ) : null}
      <form className="inline-form" aria-labelledby="add-person-title" onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          const result = await api<{ code: string; state: HubState }>('/onboarding/caretaker-grants', 'POST', form)
          setState(result.state); setInvite({ name: form.name, code: result.code }); setForm({ name: '', relationship: '', can_approve: false })
        })
      }}>
        <h2 id="add-person-title" className="section-title">{t('Add a person', 'किसी व्यक्ति को जोड़ें')}</h2>
        <label className="field"><span>{t('Their name', 'उनका नाम')}</span><input required maxLength={60} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field"><span>{t('How you know them (optional)', 'उनसे आपका रिश्ता (वैकल्पिक)')}</span><input maxLength={40} placeholder={t('Daughter, son, neighbour…', 'बेटी, बेटा, पड़ोसी…')} value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} /></label>
        <fieldset className="choice-group">
          <legend>{t('What can they do?', 'वे क्या कर सकते हैं?')}</legend>
          <label className="check-row"><input type="radio" name="access" checked={!form.can_approve} onChange={() => setForm({ ...form, can_approve: false })} />{t('See my shared activity (view only)', 'मेरी साझा गतिविधि देखें (केवल देख सकते हैं)')}</label>
          <label className="check-row"><input type="radio" name="access" checked={form.can_approve} onChange={() => setForm({ ...form, can_approve: true })} />{t('See my shared activity and approve bookings', 'मेरी साझा गतिविधि देखें और बुकिंग को मंज़ूरी दें')}</label>
        </fieldset>
        <button className="secondary wide" disabled={busy}>{t('Add to my Care Circle', 'मेरे देखभाल समूह में जोड़ें')}</button>
      </form>
      {invite ? (
        <div className="invite-box" role="status">
          <p><strong>{t('{{name}} was added.', '{{name}} को जोड़ दिया गया है।', { name: invite.name })}</strong> {t('Send them this private link (one use, 24 hours). Nothing is sent automatically.', 'उन्हें यह निजी लिंक भेजें (एक बार इस्तेमाल, 24 घंटे)। कुछ भी अपने आप नहीं भेजा जाता।')}</p>
          <label className="field"><span>{t('Invitation link for {{name}}', '{{name}} के लिए आमंत्रण लिंक', { name: invite.name })}</span><input readOnly value={link} onFocus={(event) => event.target.select()} /></label>
        </div>
      ) : null}
      {approver ? (
        <fieldset className="choice-group">
          <legend>{t('Approvals', 'मंज़ूरी')}</legend>
          <label className="check-row"><input type="checkbox" checked={rule.on} onChange={(event) => setRule({ ...rule, on: event.target.checked })} />{t('Ask my approver before bookings above the limit, and for every pharmacy order', 'सीमा से अधिक की बुकिंग और हर फ़ार्मेसी ऑर्डर से पहले मेरे मंज़ूरी देने वाले से पूछें')}</label>
          <label className="field"><span>{t('Approval limit (₹)', 'मंज़ूरी की सीमा (₹)')}</span><input type="number" inputMode="numeric" min={0} max={10000} value={rule.limit} onChange={(event) => setRule({ ...rule, limit: Number(event.target.value) })} /></label>
        </fieldset>
      ) : null}
      <Actions hub={hub} nav={nav} step="care_circle" onContinue={save} exitSave={save} skippable={!members.length} />
    </>
  )
}

function ServicesStep({ hub, nav }: StepProps) {
  const { t } = useI18n()
  const save = () => saveStep(hub, '/onboarding/steps/services', 'POST', {})
  const services = hub.state.services ?? []
  return (
    <>
      <p className="lead">{t('Choose the services Saathi can use for you.', 'वे सेवाएँ चुनें जिनका साथी आपके लिए इस्तेमाल कर सकता है।')}</p>
      <p className="muted service-disclaimer">{t('All options are simulated. No real bookings, deliveries or payments.', 'सभी विकल्प सिम्युलेटेड हैं। कोई असली बुकिंग, डिलीवरी या भुगतान नहीं होता।')}</p>
      {services.map((service) => <ServiceOptions key={service.service_type} hub={hub} service={service} />)}
      <p className="muted">{t('You can change these choices later in Services.', 'आप इन विकल्पों को बाद में सेवाएँ में बदल सकते हैं।')}</p>
      <Actions hub={hub} nav={nav} step="services" onContinue={save} exitSave={save} skippable={!services.some((s) => s.status === 'CONNECTED')} />
    </>
  )
}

const methodNotes: Record<PaymentMethod, string> = {
  DEMO_WALLET: 'A confirmed demo booking is marked as paid straight away. There is no real balance and no money moves.',
  PAY_ON_COMPLETION: 'The payment stays pending until you mark the simulated payment complete separately. Completing the demo trip or delivery does not complete payment. No money moves.',
}

function PaymentStep({ hub, nav }: StepProps) {
  const { t, text } = useI18n()
  const [method, setMethod] = useState<PaymentMethod | null>(hub.state.profile.payment_method ?? null)
  const save = () => saveStep(hub, '/onboarding/profile', 'PATCH', { step: 'payment', payment_method: method })
  return (
    <form onSubmit={submitter(hub, nav, save)}>
      <fieldset className="choice-group">
        <legend>{t('How should simulated payments work?', 'सिम्युलेटेड भुगतान कैसे काम करें?')}</legend>
        {(Object.keys(methodNotes) as PaymentMethod[]).map((value) => (
          <label key={value} className="check-row payment-choice">
            <input type="radio" name="payment" required checked={method === value} onChange={() => setMethod(value)} />
            <span><strong>{text(paymentMethodLabel[value])}</strong><br /><small className="muted">{text(methodNotes[value])}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="card demo-note">
        <h2>{t('No real money moves', 'कोई असली पैसा नहीं भेजा जाता')}</h2>
        <p>{t('Saathi never asks for card numbers, UPI PINs, OTPs or bank logins. If anyone asks you for these, it may be a scam: do not share them.', 'साथी कभी कार्ड नंबर, UPI पिन, OTP या बैंक लॉगिन नहीं माँगता। अगर कोई ये माँगे, तो यह धोखाधड़ी हो सकती है: इन्हें साझा न करें।')}</p>
      </div>
      <Actions hub={hub} nav={nav} step="payment" exitSave={method ? save : undefined} />
    </form>
  )
}

const roleText = (permissions: string[], t: Translate) => (permissions.includes('approve')
  ? t('can see shared activity and approve bookings', 'साझा गतिविधि देख सकते हैं और बुकिंग को मंज़ूरी दे सकते हैं')
  : t('can see shared activity (view only)', 'साझा गतिविधि देख सकते हैं (केवल देख सकते हैं)'))

// This is a server-generated sentence, not user text. Translate only its known shape.
function approvalRuleText(rule: string, t: Translate) {
  const match = /^An approver must agree to bookings above ₹(\d+) and to every pharmacy order\.$/.exec(rule)
  return match ? t('An approver must agree to bookings above ₹{{limit}} and to every pharmacy order.', '₹{{limit}} से अधिक की बुकिंग और हर फ़ार्मेसी ऑर्डर के लिए मंज़ूरी देने वाले की सहमति ज़रूरी है।', { limit: match[1] }) : rule
}

function ReviewStep({ hub, nav, onFinish }: StepProps & { onFinish: () => void }) {
  const { t, text } = useI18n()
  const { state, busy, run } = hub
  const progress = state.onboarding!
  const review = progress.review
  const change = (step: StepId, what: string, hindi: string) => <a href={`#/onboarding/${step}`} aria-label={t('Change {{what}}', '{{what}} बदलें', { what: t(what, hindi) })}>{t('Change', 'बदलें')}</a>
  const finish = () => void run(async () => { await saveStep(hub, '/onboarding/finish', 'POST', { confirmed: true }); onFinish() })
  return (
    <>
      <p className="lead">{t('Check your answers. You can change any of them now or later.', 'अपने जवाब जाँचें। आप इनमें से कोई भी अभी या बाद में बदल सकते हैं।')}</p>
      <dl className="review-list">
        <div><dt>{t('About you', 'आपके बारे में')}</dt><dd>{review.name || t('No name yet', 'अभी नाम नहीं है')} · {review.language === 'hi-IN' ? t('Hindi', 'हिन्दी') : t('English', 'अंग्रेज़ी')}</dd>{change('welcome', 'your name and language', 'अपना नाम और भाषा')}</div>
        <div><dt>{t('Comfort', 'सुविधा')}</dt><dd>{review.comfort.length ? review.comfort.map((label) => text(label)).join(', ') : t('Standard settings', 'सामान्य सेटिंग')} · {t('Prefers {{channel}}', 'पसंद: {{channel}}', { channel: text(review.channel.toLowerCase()) })}</dd>{change('accessibility', 'comfort settings', 'सुविधा की सेटिंग')}</div>
        <div><dt>{t('Ride and meal bookings', 'सवारी और भोजन की बुकिंग')}</dt><dd>{review.show_options === false ? t('Let Saathi choose the best option and book it for me', 'साथी मेरे लिए सबसे अच्छा विकल्प चुने और बुक करे') : t('Show me the options and let me confirm', 'मुझे विकल्प दिखाएँ और पुष्टि मुझसे करवाएँ')}</dd>{change('accessibility', 'booking preference', 'बुकिंग की पसंद')}</div>
        <div><dt>{t('Places', 'जगहें')}</dt><dd>{review.places.length ? t('{{places}} · usual pickup: {{pickup}}', '{{places}} · सामान्य पिकअप: {{pickup}}', { places: review.places.join(', '), pickup: String(review.pickup) }) : t('None yet', 'अभी कोई नहीं')}</dd>{change('places', 'saved places', 'सहेजी गई जगहें')}</div>
        <div><dt>{t('Care Circle', 'देखभाल समूह')}</dt><dd>{review.care_circle.length ? review.care_circle.map((p) => `${p.name} ${roleText(p.permissions, t)}`).join('; ') : t('No one added', 'कोई नहीं जोड़ा गया')}{review.approval_rule ? `. ${approvalRuleText(review.approval_rule, t)}` : ''}</dd>{change('care_circle', 'Care Circle', 'देखभाल समूह')}</div>
        <div><dt>{t('Demo services', 'डेमो सेवाएँ')}</dt><dd>{review.services.map((s) => `${text(s.provider_label)}: ${s.status === 'CONNECTED' ? t('connected', 'जुड़ा हुआ') : t('not connected', 'नहीं जुड़ा')}`).join('; ')}</dd>{change('services', 'demo services', 'डेमो सेवाएँ')}</div>
        <div><dt>{t('Payment', 'भुगतान')}</dt><dd>{review.payment ? text(review.payment) : t('Not chosen', 'नहीं चुना गया')} · {t('no real money moves', 'कोई असली पैसा नहीं भेजा जाता')}</dd>{change('payment', 'payment', 'भुगतान')}</div>
      </dl>
      {review.missing.length ? <p className="inline-note">{t('Still to do: {{steps}}.', 'अभी बाकी है: {{steps}}।', { steps: review.missing.map((title) => text(title)).join(', ') })}</p> : null}
      <p className="muted">{t('Everything in this demo is simulated: no real driver, order or payment.', 'इस डेमो में सब कुछ सिम्युलेटेड है: कोई असली ड्राइवर, ऑर्डर या भुगतान नहीं है।')}</p>
      {progress.completed ? (
        <a className="primary wide" href="#/profile">{t('Done', 'हो गया')}</a>
      ) : (
        <button type="button" className="primary wide" disabled={busy || review.missing.length > 0} onClick={finish}>{t('Yes, finish setup', 'हाँ, सेटअप पूरा करें')}</button>
      )}
      <Actions hub={hub} nav={nav} step="review" last />
    </>
  )
}

function Finished({ hub }: { hub: Hub }) {
  const { t } = useI18n()
  const name = hub.state.profile.name
  const ride = hub.state.services?.find((service) => service.service_type === 'RIDE')
  return (
    <section className="receipt card" aria-labelledby="finished-title">
      <h2 id="finished-title" className="step-title">{t('You are all set, {{name}}', '{{name}}, आपका सेटअप पूरा है', { name })}</h2>
      <p className="lead">{t('Your setup is saved.', 'आपका सेटअप सहेज दिया गया है।')} {hub.state.profile.show_options === false ? t('Saathi will choose and book app rides and meals for you. Medicine requests and telephone calls still ask first.', 'साथी ऐप में आपके लिए सवारी और भोजन चुनेगा और बुक करेगा। दवा के अनुरोध और फ़ोन कॉल पर फिर भी पहले पूछा जाएगा।') : t('Saathi will check with you before every booking.', 'हर बुकिंग से पहले साथी आपसे पूछेगा।')}</p>
      {ride?.status === 'CONNECTED' ? <a className="primary wide" href="#/request/ride">{t('Try a demo ride', 'डेमो सवारी आज़माएँ')}</a> : <a className="primary wide" href="#/services">{t('Connect a demo service', 'डेमो सेवा जोड़ें')}</a>}
      <a className="secondary wide" href="#/">{t('Go to Home', 'होम पर जाएँ')}</a>
    </section>
  )
}

export default function OnboardingWizard({ hub, step }: { hub: Hub; step?: StepId }) {
  const { t, text } = useI18n()
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
        <h1 className="page-title" tabIndex={-1} ref={heading}>{t('Setup finished', 'सेटअप पूरा हो गया')}</h1>
        <Finished hub={hub} />
      </>
    )
  }
  return (
    <>
      <p className="eyebrow">{t('SET UP SAATHI', 'साथी का सेटअप करें')}</p>
      <nav className="stepper" aria-label={t('Setup steps', 'सेटअप के चरण')}>
        <p className="stepper-count">{t('Step {{current}} of {{total}}', '{{total}} में से चरण {{current}}', { current: index + 1, total: setupSteps.length })}</p>
        <div className="progress-track" role="progressbar" aria-label={t('Setup progress', 'सेटअप की प्रगति')} aria-valuemin={1} aria-valuemax={setupSteps.length} aria-valuenow={index + 1}>
          <span style={{ width: `${((index + 1) / setupSteps.length) * 100}%` }} />
        </div>
        <details>
          <summary>{t('All steps', 'सभी चरण')}</summary>
          <ol className="step-list">
            {progress.steps.map((item) => {
              const reachable = item.status !== null || item.id === firstOpen || item.id === current
              const mark = item.status === 'done' ? t(' (done)', ' (पूरा)') : item.status === 'skipped' ? t(' (skipped)', ' (छोड़ा गया)') : ''
              return (
                <li key={item.id} className={item.id === current ? 'current' : item.status ?? 'open'}>
                  {reachable ? <a href={`#/onboarding/${item.id}`} aria-current={item.id === current ? 'step' : undefined}>{text(item.title)}{mark}</a> : <span>{text(item.title)}</span>}
                </li>
              )
            })}
          </ol>
        </details>
      </nav>
      <section className="card wizard" aria-labelledby="wizard-title">
        <h1 id="wizard-title" className="step-title" tabIndex={-1} ref={heading}>{text(info.title)}</h1>
        {bodies[current]}
      </section>
    </>
  )
}
