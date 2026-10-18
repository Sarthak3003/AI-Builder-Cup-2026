import { useState } from 'react'
import { useI18n } from './i18n'

type Meal = { id: string; name: string; price: number; spice: string }
type Proposal = { id: string; summary: string; clarification: string; options: Meal[] }
type Order = { id: string; item: Meal; status: string }

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/demo${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check your request and try again.')
  return data as T
}

export default function FoodDemo() {
  const { t, text } = useI18n()
  // Translate the untouched example without changing its API value or any user edits.
  const defaultMessage = 'I would like a mild vegetarian lunch under 150 rupees.'
  const [editedMessage, setMessage] = useState<string | null>(null)
  const message = editedMessage ?? defaultMessage
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [selection, setSelection] = useState<Meal | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<'empty' | 'loaded' | ''>('')

  function errorMessage(value: string) {
    switch (value) {
      case 'Please check your request and try again.':
        return t('Please check your request and try again.', 'कृपया अपना अनुरोध जाँचें और फिर कोशिश करें।')
      case 'Something went wrong. Please try again.':
        return t('Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।')
      case 'Gemini is not configured yet. Add the API key on the server.':
        return t('Gemini is not configured yet. Add the API key on the server.', 'Gemini अभी कॉन्फ़िगर नहीं है। सर्वर पर API कुंजी जोड़ें।')
      case 'Invalid Gemini model configuration.':
        return t('Invalid Gemini model configuration.', 'Gemini मॉडल का कॉन्फ़िगरेशन मान्य नहीं है।')
      case 'Gemini could not respond. Please try again.':
        return t('Gemini could not respond. Please try again.', 'Gemini जवाब नहीं दे सका। कृपया फिर कोशिश करें।')
      case 'Start the local Firestore emulator to use this demo.':
        return t('Start the local Firestore emulator to use this demo.', 'यह डेमो इस्तेमाल करने के लिए स्थानीय Firestore एमुलेटर शुरू करें।')
      case 'Firestore configuration changed. Restart the server.':
        return t('Firestore configuration changed. Restart the server.', 'Firestore का कॉन्फ़िगरेशन बदल गया है। सर्वर फिर शुरू करें।')
      case 'Start a new demo session first.':
        return t('Start a new demo session first.', 'पहले नया डेमो सत्र शुरू करें।')
      case 'Activity storage is unavailable. Please retry.':
        return t('Activity storage is unavailable. Please retry.', 'गतिविधि सहेजने की सुविधा उपलब्ध नहीं है। कृपया फिर कोशिश करें।')
      case 'Request not found in this session.':
        return t('Request not found in this session.', 'इस सत्र में अनुरोध नहीं मिला।')
      case 'Choose an option offered for this request.':
        return t('Choose an option offered for this request.', 'इस अनुरोध के लिए दिए गए विकल्पों में से एक चुनें।')
      case 'This request already has a different confirmed meal.':
        return t('This request already has a different confirmed meal.', 'इस अनुरोध में किसी दूसरे भोजन की पुष्टि पहले ही हो चुकी है।')
      case 'No confirmed activity found for this request.':
        return t('No confirmed activity found for this request.', 'इस अनुरोध के लिए कोई पुष्ट गतिविधि नहीं मिली।')
      default: {
        const translated = text(value)
        // Unstructured browser/server errors have no stable code to translate.
        return translated !== value ? translated : t(value, 'अनुरोध पूरा नहीं हो सका। कृपया फिर कोशिश करें।')
      }
    }
  }

  function mealName(value: string) {
    if (value === 'Paneer meal') return t('Paneer meal', 'पनीर का भोजन')
    if (value === 'Chicken and rice') return t('Chicken and rice', 'चिकन और चावल')
    return text(value)
  }

  function spiceLabel(value: string) {
    if (value === 'medium') return t('medium', 'मध्यम')
    return text(value)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  return <section className="food-demo" aria-labelledby="food-title" aria-busy={busy}>
    <div className="section-label">{t('TRY THE FOOD DEMO', 'भोजन का डेमो आज़माएँ')}</div>
    <h2 id="food-title">{t('What would you like to eat?', 'आप क्या खाना चाहेंगे?')}</h2>
    <p>{t('Simulated meals and prices. No payment, delivery or real order. Please don’t enter personal or medical information.', 'भोजन और कीमतें केवल डेमो हैं। कोई भुगतान, डिलीवरी या वास्तविक ऑर्डर नहीं होगा। कृपया निजी या स्वास्थ्य संबंधी जानकारी न डालें।')}</p>
    <form onSubmit={e => { e.preventDefault(); void run(async () => {
      setProposal(null); setSelection(null); setOrder(null)
      await api('/session', {})
      setProposal(await api<Proposal>('/requests', { message }))
    }) }}>
      <label htmlFor="food-message">{t('Tell Saathi your meal preferences and budget', 'Saathi को अपनी भोजन की पसंद और बजट बताएँ')}</label>
      <textarea id="food-message" value={editedMessage ?? t('I would like a mild vegetarian lunch under 150 rupees.', 'मुझे 150 रुपये से कम में, कम मसाले वाला शाकाहारी दोपहर का भोजन चाहिए।')} maxLength={1000} minLength={3} required disabled={busy}
        onChange={e => setMessage(e.target.value)} />
      <button className="talk" disabled={busy || message.trim().length < 3}>{t('Find meals', 'भोजन ढूँढें')}</button>
    </form>
    {busy ? <p role="status">{t('Working on your request…', 'आपके अनुरोध पर काम हो रहा है…')}</p> : null}
    {error ? <p role="alert">{errorMessage(error)}</p> : null}
    {proposal ? <div aria-live="polite">
      <h3>{t('Your preferences', 'आपकी पसंद')}</h3><p>{proposal.summary}</p>
      {proposal.clarification ? <p>{proposal.clarification === 'No demo meals match. Try a different budget or preference.' ? t('No demo meals match. Try a different budget or preference.', 'कोई डेमो भोजन आपकी पसंद से मेल नहीं खाता। दूसरा बजट या पसंद आज़माएँ।') : proposal.clarification}</p> : null}
      <div className="services">{proposal.options.map(meal => <article key={meal.id}>
        <h3>{mealName(meal.name)}</h3><p>{t('₹{{price}} · {{spice}} spice', '₹{{price}} · मसाला: {{spice}}', { price: meal.price, spice: spiceLabel(meal.spice) })}</p>
        <button className="secondary" disabled={busy || !!order} onClick={() => setSelection(meal)}>{t('Choose {{meal}}', '{{meal}} चुनें', { meal: mealName(meal.name) })}</button>
      </article>)}</div>
    </div> : null}
    {selection && proposal && !order ? <div className="confirmation">
      <h3>{t('Review before confirming', 'पुष्टि करने से पहले जाँचें')}</h3>
      <p>{t('{{meal}} for ₹{{price}}. This saves a simulated order only.', '{{meal}} ₹{{price}} में। इससे केवल डेमो ऑर्डर सहेजा जाएगा।', { meal: mealName(selection.name), price: selection.price })}</p>
      <button className="talk" disabled={busy} onClick={() => { void run(async () => {
        const saved = await api<Order>(`/requests/${proposal.id}/confirm`, { option_id: selection.id, confirmed: true })
        localStorage.setItem('saathi.lastDemoOrder', saved.id)
        setOrder(saved); setSelection(null)
      }) }}>{t('Confirm simulated order', 'डेमो ऑर्डर की पुष्टि करें')}</button>{' '}
      <button className="secondary" disabled={busy} onClick={() => setSelection(null)}>{t('Cancel selection', 'चयन रद्द करें')}</button>
    </div> : null}
    <h3>{t('Your demo activity', 'आपकी डेमो गतिविधि')}</h3>
    <button className="secondary" disabled={busy} onClick={() => { void run(async () => {
      const id = localStorage.getItem('saathi.lastDemoOrder')
      if (!id) { setNotice('empty'); return }
      setOrder(await api<Order>(`/activity/${encodeURIComponent(id)}`))
      setNotice('loaded')
    }) }}>{t('Load saved activity', 'सहेजी हुई गतिविधि देखें')}</button>
    {order ? <p role="status">{t('Saved simulated order: {{meal}} · ₹{{price}}. No delivery will take place.', 'सहेजा हुआ डेमो ऑर्डर: {{meal}} · ₹{{price}}। कोई डिलीवरी नहीं होगी।', { meal: mealName(order.item.name), price: order.item.price })}</p> : null}
    {notice ? <p role="status">{notice === 'empty' ? t('No saved demo order in this browser yet.', 'इस ब्राउज़र में अभी कोई डेमो ऑर्डर सहेजा नहीं गया है।') : t('Activity loaded from Firestore.', 'गतिविधि Firestore से लोड हो गई है।')}</p> : null}
  </section>
}
