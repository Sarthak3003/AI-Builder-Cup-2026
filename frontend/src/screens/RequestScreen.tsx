import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, bookedNotice, bookingStatusLabel, formatINR, paymentLabel, paymentMethodLabel, serviceNames, serviceTypeOf } from '../hub'
import { useI18n } from '../i18n'
import type { Translate } from '../i18n'
import { bookingAction, bookingCopy } from '../locales/booking'
import type { Activity, HubState, MenuItem, Quote, QuoteResult, Service } from '../hub'
import { newId } from '../id'
import { BackIcon, CheckIcon } from '../icons'
import PickNote from '../components/PickNote'
import PriceLines from '../components/PriceLines'
import ProviderBadge from '../components/ProviderBadge'
import type { Hub } from './hubType'

type Step = 'form' | 'choose' | 'review' | 'done'
const MAX_QUANTITY = 5

function Stepper({ item, value, onChange }: { item: MenuItem; value: number; onChange: (next: number) => void }) {
  const { t, text } = useI18n()
  return (
    <div className="stepper-control" role="group" aria-label={t('How many: {{item}}', 'कितने: {{item}}', { item: text(item.name) })}>
      <button type="button" className="secondary small" aria-label={t('Fewer: {{item}}', 'कम करें: {{item}}', { item: text(item.name) })} disabled={value === 0} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" className="secondary small" aria-label={t('More: {{item}}', 'बढ़ाएँ: {{item}}', { item: text(item.name) })} disabled={value === MAX_QUANTITY} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

function Menu({ items, counts, onChange }: { items: MenuItem[]; counts: Record<string, number>; onChange: (id: string, value: number) => void }) {
  const { t, text } = useI18n()
  return (
    <ul className="menu-list">
      {items.map((item) => (
        <li key={item.id} className="menu-row">
          <div>
            <strong>{text(item.name)}</strong>
            <small className="muted">
              {formatINR(item.price_minor)}
              {item.vegetarian === undefined ? '' : item.vegetarian ? t(' · vegetarian', ' · शाकाहारी') : t(' · non-vegetarian', ' · मांसाहारी')}
              {item.mild === undefined ? '' : item.mild ? t(', mild', ', कम मसालेदार') : t(', some spice', ', थोड़ा मसालेदार')}
            </small>
          </div>
          <Stepper item={item} value={counts[item.id] ?? 0} onChange={(value) => onChange(item.id, value)} />
        </li>
      ))}
    </ul>
  )
}

const optionLabel = (quote: Quote, t: Translate, text: (value: string) => string) => (quote.service === 'ride'
  ? t('{{option}} from {{provider}}', '{{provider}} से {{option}}', { option: text(quote.option_name), provider: text(quote.app_name ?? quote.provider_label) })
  : bookingCopy(quote.title, t, text))

export default function RequestScreen({ hub, service, proposalId, simple = false }: { hub: Hub; service: Service; proposalId?: string; simple?: boolean }) {
  const { language, t, text, formatWhen, formatTime } = useI18n()
  const { state, busy, run: runAction, refresh, setState } = hub
  const run = (action: () => Promise<void>) => runAction(() => bookingAction(action, t, text))
  const profile = state.profile
  const serviceType = serviceTypeOf[service]
  const provider = state.services?.find((item) => item.service_type === serviceType)
  const places = state.places ?? []
  // With the list switched off, Saathi books rides and meals itself; medicine always asks first.
  const autoPick = service !== 'medicine' && profile.show_options === false
  const firstPick = (offered: Quote[]) => (offered.length === 1 ? offered[0] : autoPick ? offered.find((q) => q.recommended) ?? null : null)
  const [handedOver] = useState(() => (state.quotes ?? []).filter((q) => q.request_id === proposalId && q.service === service && q.status === 'ACTIVE'))
  const [quotes, setQuotes] = useState<Quote[]>(handedOver)
  const [selected, setSelected] = useState<Quote | null>(() => firstPick(handedOver))
  const [receipt, setReceipt] = useState<Activity | null>(null)
  const [pickupId, setPickupId] = useState(() => places.find((p) => p.is_default_pickup)?.id ?? places[0]?.id ?? '')
  const [destinationId, setDestinationId] = useState('')
  const [destinationText, setDestinationText] = useState('')
  const kitchens = (provider?.catalogue.kitchens ?? []).filter((kitchen) => kitchen.enabled)
  const [kitchenId, setKitchenId] = useState(kitchens[0]?.id ?? '')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [now] = useState(() => Date.now() / 1000)
  const keys = useRef<Record<string, string>>({})
  // Kept until Saathi's booking arrives, so retrying after a lost reply cannot book twice.
  const autoKey = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const step: Step = receipt ? 'done' : selected ? 'review' : quotes.length ? 'choose' : 'form'
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    heading.current?.focus()
  }, [step])

  function speak(message: string) {
    if (!('speechSynthesis' in window)) { hub.notify(text('Read aloud is unavailable in this browser.')); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = language
    window.speechSynthesis.speak(utterance)
  }
  const spoken = selected ? t('{{title}}. {{amount}}. {{notice}} {{payment}}.', '{{title}}। {{amount}}। {{notice}} {{payment}}।', { title: bookingCopy(selected.title, t, text), amount: formatINR(selected.amount_minor), notice: text(selected.notice), payment: text(paymentMethodLabel[selected.payment_method]) }) : ''
  useEffect(() => {
    if (profile.read_aloud && spoken && 'speechSynthesis' in window) speak(spoken)
    // Read each new quote once when it opens, only if the person asked for read-aloud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken])

  function startAgain() { setQuotes([]); setSelected(null); setReceipt(null); setCounts({}) }

  function getQuotes(event: FormEvent) {
    event.preventDefault()
    const items = Object.entries(counts).filter(([, quantity]) => quantity > 0).map(([item_id, quantity]) => ({ item_id, quantity }))
    const key = autoPick ? { idempotency_key: (autoKey.current ??= newId()) } : {}
    const body = service === 'ride'
      ? { service_type: 'RIDE', pickup_place_id: pickupId || null, ...(destinationId === 'other' ? { destination_text: destinationText } : { destination_place_id: destinationId }), ...key }
      : service === 'food' ? { service_type: 'FOOD', option_id: kitchenId, items, ...key } : { service_type: 'PHARMACY', items }
    void run(async () => {
      const result = await api<QuoteResult>('/quotes', 'POST', body)
      if (result.booking) { autoKey.current = null; await openBooking(result.booking); return }
      setQuotes(result.quotes)
      setSelected(firstPick(result.quotes))
      await refresh()
    })
  }

  async function openBooking(booking: Activity) {
    await refresh()
    hub.notify(bookingCopy(bookedNotice(booking), t, text))
    window.location.hash = `#/activity/${booking.id}`
  }

  function confirm() {
    if (!selected) return
    // One key per quote: a double tap or a retry after a lost reply cannot book twice.
    const key = (keys.current[selected.id] ??= newId())
    void run(async () => {
      const booked = await api<Activity>(`/quotes/${selected.id}/confirm`, 'POST', { idempotency_key: key, confirmed: true })
      if (autoPick && booked.booking_status !== 'FAILED') { await openBooking(booked); return }
      await refresh()
      setReceipt(booked)
    })
  }

  const connect = () => void run(async () => { setState(await api<HubState>(`/services/${serviceType}/connect-demo`, 'POST', { consent: true })) })
  const appointmentId = (selected ?? quotes[0])?.appointment_id
  const appointment = appointmentId ? state.appointments?.find((a) => a.id === appointmentId) : undefined
  const unfinished = (state.quotes ?? []).filter((q) => q.service === service && q.status === 'ACTIVE' && q.expires_at > now)
  const lastGroup = unfinished.length ? unfinished.filter((q) => q.request_id === unfinished.at(-1)!.request_id) : []
  const chosenItems = Object.values(counts).reduce((sum, quantity) => sum + quantity, 0)
  const expired = selected ? selected.expires_at <= now : false

  return (
    <>
      <a className="back" href="#/"><BackIcon /> {text('Home')}</a>
      <h1 className="page-title">{text(serviceNames[service])}</h1>

      {step === 'form' && provider && provider.status !== 'CONNECTED' ? (
        <section className="card" aria-labelledby="connect-title">
          <h2 id="connect-title" className="step-title">{t('Connect the {{provider}} first', 'पहले {{provider}} जोड़ें', { provider: text(provider.provider_label) })}</h2>
          <p>{text(provider.notice)} {t('Connect it to get sample prices here. There is no sign-in and nothing real is booked.', 'यहाँ नमूना कीमतें पाने के लिए इसे जोड़ें। साइन-इन की ज़रूरत नहीं है और कोई वास्तविक बुकिंग नहीं होती।')}</p>
          <button type="button" className="primary wide" disabled={busy} onClick={connect}>{t('Connect {{provider}}', '{{provider}} जोड़ें', { provider: text(provider.provider_label) })}</button>
          <a className="secondary wide" href="#/services">{text('Open Services')}</a>
        </section>
      ) : null}

      {step === 'form' && (!provider || provider.status === 'CONNECTED') ? (
        <section className="card" aria-labelledby="form-title">
          <h2 id="form-title" tabIndex={-1} ref={heading} className={simple ? 'sr-only' : 'step-title'}>{text('What would you like?')}</h2>
          {simple ? null : <p className="muted">{!autoPick ? t('Prices come from the {{provider}}. Nothing is booked until you confirm.', 'कीमतें {{provider}} से आती हैं। आपकी पुष्टि तक कुछ बुक नहीं होगा।', { provider: text(provider?.provider_label ?? 'demo provider') }) : service === 'ride' ? t('Saathi will pick the ride with the best price and pickup time and book it for you straight away (simulated). You can cancel it on the ride page.', 'साथी कीमत और पिकअप समय के हिसाब से सबसे अच्छी सवारी चुनकर तुरंत बुक करेगा (सिम्युलेटेड)। आप इसे सवारी वाले पेज पर रद्द कर सकते हैं।') : t('Saathi will order what you choose straight away (simulated). You can cancel it on the order page.', 'साथी आपके चुने हुए भोजन का तुरंत ऑर्डर देगा (सिम्युलेटेड)। आप इसे ऑर्डर वाले पेज पर रद्द कर सकते हैं।')}</p>}
          {lastGroup.length ? <button type="button" className="secondary wide" onClick={() => { setQuotes(lastGroup); setSelected(firstPick(lastGroup)) }}>{text('Continue where you left off')}</button> : null}
          {service === 'ride' && !places.length ? (
            <p className="clarify">{t('Add your home in setup first, so Saathi knows where to pick you up.', 'पहले सेटअप में अपना घर जोड़ें, ताकि साथी को पता हो कि आपको कहाँ से लेना है।')} <a href="#/onboarding/places">{text('Add a place')}</a></p>
          ) : null}
          <form onSubmit={getQuotes}>
            {service === 'ride' ? (
              <>
                <label className="field"><span>{text('Pick me up from')}</span>
                  <select required value={pickupId} onChange={(event) => setPickupId(event.target.value)}>
                    {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
                  </select>
                </label>
                <label className="field"><span>{text('Where to?')}</span>
                  <select required value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                    <option value="">{text('Choose a place')}</option>
                    {places.filter((place) => place.id !== pickupId).map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
                    <option value="other">{text('Somewhere else…')}</option>
                  </select>
                </label>
                {destinationId === 'other' ? (
                  <label className="field"><span>{text('Place name or address')}</span>
                    <input required maxLength={150} value={destinationText} placeholder={text('e.g. Central market')} onChange={(event) => setDestinationText(event.target.value)} />
                  </label>
                ) : null}
              </>
            ) : null}
            {service === 'food' ? (
              kitchens.length ? (
                <>
                  <label className="field"><span>{text('Kitchen')}</span>
                    <select value={kitchenId} onChange={(event) => { setKitchenId(event.target.value); setCounts({}) }}>
                      {kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.app_name ? t('{{kitchen}} · listed on {{app}} (demo)', '{{kitchen}} · {{app}} पर उपलब्ध (डेमो)', { kitchen: text(kitchen.name), app: text(kitchen.app_name) }) : `${text(kitchen.name)} · ${text(provider?.provider_label)}`}</option>)}
                    </select>
                  </label>
                  <Menu items={kitchens.find((k) => k.id === kitchenId)?.items ?? []} counts={counts} onChange={(id, value) => setCounts({ ...counts, [id]: value })} />
                  {simple ? null : <p className="muted">{t('Fictional demo kitchens. Your usual choice: {{diet}}, {{spice}}, up to ₹{{budget}}.', 'काल्पनिक डेमो रसोइयाँ। आपकी सामान्य पसंद: {{diet}}, {{spice}}, ₹{{budget}} तक।', { diet: text(profile.vegetarian ? 'vegetarian' : 'any diet'), spice: text(profile.mild ? 'mild' : 'any spice'), budget: profile.budget })}</p>}
                </>
              ) : <p className="clarify">{t('Switch on a food option in ', 'पहले भोजन का विकल्प चालू करें: ')}<a href="#/services">{text('Services')}</a>{t(' first.', '।')}</p>
            ) : null}
            {service === 'medicine' ? (
              <>
                <p className="inline-note">{text('Sample non-prescription items only. This is not medical advice and not a real pharmacy order.')}</p>
                <Menu items={provider?.catalogue.items ?? []} counts={counts} onChange={(id, value) => setCounts({ ...counts, [id]: value })} />
              </>
            ) : null}
            <button className="primary wide" disabled={busy || (service !== 'ride' && !chosenItems) || (service === 'ride' && !places.length)}>
              {text(service === 'ride' ? (autoPick ? 'Book the best demo ride' : 'Get demo prices') : autoPick ? 'Order now' : 'Get demo price')}
            </button>
          </form>
        </section>
      ) : null}

      {step === 'choose' ? (
        <section className="results" aria-labelledby="results-title" aria-live="polite">
          <h2 id="results-title" tabIndex={-1} ref={heading} className="step-title">{simple ? text('Pick one') : t('{{count}} demo prices', '{{count}} डेमो कीमतें', { count: quotes.length })}</h2>
          {appointment ? <p className="inline-note appointment-note">{t('For your appointment:', 'आपकी अपॉइंटमेंट के लिए:')} <strong>{appointment.title}</strong>{t(', {{when}}, at {{place}}.', ', {{when}}, स्थान: {{place}}।', { when: formatWhen(appointment.starts_at), place: appointment.place })}</p> : null}
          {simple ? null : <p className="muted">{text('Pick one to see the full price. Nothing is booked until you confirm, and prices are held for 15 minutes.')}</p>}
          <div className="options">
            {quotes.map((quote) => (
              <article key={quote.id} className="option card">
                <ProviderBadge id={quote.app_id ?? quote.provider_type} name={quote.app_name ?? quote.provider_label} />
                <h3>{service === 'ride' ? text(quote.option_name) : bookingCopy(quote.title, t, text)}</h3>
                {simple ? null : <p className="muted">{quote.app_name ? t('Simulated by the {{provider}}', '{{provider}} द्वारा सिम्युलेटेड', { provider: text(quote.provider_label) }) : text('Saathi’s own demo service')}</p>}
                <div className="option-foot">
                  <div>
                    <strong className="price">{formatINR(quote.amount_minor)}</strong>
                    {quote.pickup_eta_min ? <span className="eta">{t('{{minutes}} min away', '{{minutes}} मिनट दूर', { minutes: quote.pickup_eta_min })}</span> : quote.delivery_min ? <span className="eta">{t('About {{minutes}} min', 'लगभग {{minutes}} मिनट', { minutes: quote.delivery_min })}</span> : null}
                  </div>
                  <button type="button" className="secondary" disabled={busy} aria-label={t('Choose {{option}}', '{{option}} चुनें', { option: optionLabel(quote, t, text) })} onClick={() => setSelected(quote)}>{text('Choose')}</button>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="secondary wide" disabled={busy} onClick={startAgain}>{text(simple ? 'Back' : 'Change my request')}</button>
        </section>
      ) : null}

      {step === 'review' && selected ? (
        <section className="review card" aria-labelledby="review-title">
          {simple ? null : <p className="eyebrow">{text('YOU HAVE THE FINAL SAY')}</p>}
          <h2 id="review-title" tabIndex={-1} ref={heading} className="step-title">{text(simple ? 'Book this?' : 'Check and confirm')}</h2>
          {autoPick && selected.recommended ? <PickNote pick={selected.recommended} title="Saathi’s pick" /> : null}
          <ProviderBadge id={selected.app_id ?? selected.provider_type} name={selected.app_name ?? selected.provider_label} />
          <p className="review-name">{bookingCopy(selected.title, t, text)}</p>
          {selected.details?.pickup && selected.details.destination ? <p>{selected.details.pickup.label} → {selected.details.destination.label}</p> : null}
          {appointment ? <p className="inline-note appointment-note">{t('For your appointment:', 'आपकी अपॉइंटमेंट के लिए:')} <strong>{appointment.title}</strong>{t(', {{when}}.', ', {{when}}।', { when: formatWhen(appointment.starts_at) })}</p> : null}
          <p className="review-price">{formatINR(selected.amount_minor)}</p>
          {simple ? null : <PriceLines lines={selected.line_items ?? []} total={selected.amount_minor} />}
          <dl className="receipt-details">
            {selected.pickup_eta_min ? <div><dt>{text('Pickup')}</dt><dd>{t('About {{minutes}} min (estimate)', 'लगभग {{minutes}} मिनट (अनुमान)', { minutes: selected.pickup_eta_min })}</dd></div> : null}
            {selected.duration_min ? <div><dt>{text('Trip time')}</dt><dd>{t('About {{minutes}} min', 'लगभग {{minutes}} मिनट', { minutes: selected.duration_min })}</dd></div> : null}
            {selected.delivery_min ? <div><dt>{text('Delivery')}</dt><dd>{t('About {{minutes}} min', 'लगभग {{minutes}} मिनट', { minutes: selected.delivery_min })}</dd></div> : null}
            <div><dt>{text('Provider')}</dt><dd>{t('{{provider}} (simulated)', '{{provider}} (सिम्युलेटेड)', { provider: text(selected.provider_label) })}</dd></div>
            <div><dt>{text('Payment')}</dt><dd>{t('{{method}} · no money will be charged', '{{method}} · कोई राशि नहीं ली जाएगी', { method: text(paymentMethodLabel[selected.payment_method]) })}</dd></div>
            {simple ? null : <div><dt>{text('Price held until')}</dt><dd>{formatTime(selected.expires_at)}</dd></div>}
          </dl>
          <p className="simulation-warning">{text(selected.notice)}</p>
          {selected.approval.required ? <p className="inline-note">{t('Someone in your Care Circle must approve this first.', 'पहले आपके केयर सर्कल में किसी को इसकी मंज़ूरी देनी होगी।')} {bookingCopy(selected.approval.reason, t, text)}</p> : null}
          {expired ? <p className="inline-note">{text('This price has expired. Please get a new one.')}</p> : null}
          <button type="button" className="primary wide" disabled={busy || expired} onClick={confirm}>{text('Confirm demo booking')}</button>
          {autoPick && quotes.length > 1 ? <button type="button" className="secondary wide" disabled={busy} onClick={() => setSelected(null)}>{text('Compare all options')}</button> : null}
          <button type="button" className="secondary wide" disabled={busy} onClick={() => (quotes.length > 1 && !autoPick ? setSelected(null) : startAgain())}>{text('Go back')}</button>
          {simple ? null : <button type="button" className="secondary wide" onClick={() => speak(spoken)}>{text('Read aloud')}</button>}
        </section>
      ) : null}

      {step === 'done' && receipt ? <Receipt hub={hub} receipt={receipt} simple={simple} onAgain={startAgain} /> : null}
    </>
  )
}

function Receipt({ hub, receipt, simple, onAgain }: { hub: Hub; receipt: Activity; simple: boolean; onAgain: () => void }) {
  const { t, text } = useI18n()
  const { state, busy, run: runAction } = hub
  const run = (action: () => Promise<void>) => runAction(() => bookingAction(action, t, text))
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const appointment = receipt.appointment_id ? state.appointments?.find((a) => a.id === receipt.appointment_id) : undefined
  const status = receipt.booking_status
  const payment = receipt.payment!

  if (status === 'FAILED') {
    return (
      <section className="receipt card failed" aria-labelledby="receipt-title">
        <h2 id="receipt-title" tabIndex={-1} ref={heading} className="step-title">{text('Booking failed')}</h2>
        <p className="lead">{t('The {{provider}} could not take this booking. Nothing was booked and nothing was charged.', '{{provider}} यह बुकिंग नहीं ले सका। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।', { provider: text(receipt.provider_label) })}</p>
        <dl className="receipt-details">
          <div><dt>{text('Booking')}</dt><dd>{text(bookingStatusLabel[status])}</dd></div>
          <div><dt>{text('Payment')}</dt><dd>{text(paymentLabel[payment.status])}</dd></div>
        </dl>
        <p className="muted">{text('This is a simulated failure, so the demo can show what happens when a service fails.')}</p>
        <button type="button" className="primary wide" onClick={onAgain}>{text('Try again')}</button>
        {state.profile.offer_help !== false ? (
          <button type="button" className="secondary wide" disabled={busy} onClick={() => void run(async () => { await api('/help', 'POST', { kind: 'help', note: `A booking failed: ${receipt.title}` }); hub.notify(text('Your Care Circle was told.')) })}>{text('Ask my Care Circle for help')}</button>
        ) : null}
      </section>
    )
  }

  const waiting = status === 'AWAITING_APPROVAL'
  return (
    <section className="receipt card" aria-labelledby="receipt-title">
      <span className="receipt-check"><CheckIcon /></span>
      <h2 id="receipt-title" tabIndex={-1} ref={heading} className="step-title">{text(waiting ? 'Sent for approval' : 'Demo booking confirmed')}</h2>
      <p className="lead">
        {waiting
          ? text('Someone in your Care Circle will be asked to approve this. Nothing is booked or charged until they do.')
          : t('Saathi booked {{title}} with the {{provider}} (simulated).', 'साथी ने {{provider}} से {{title}} बुक किया (सिम्युलेटेड)।', { title: bookingCopy(receipt.title, t, text), provider: text(receipt.provider_label) })}
      </p>
      <dl className="receipt-details">
        {receipt.provider_booking_id ? <div><dt>{text('Booking reference')}</dt><dd>{receipt.provider_booking_id}</dd></div> : null}
        <div><dt>{text('Booking')}</dt><dd>{text(bookingStatusLabel[status])}</dd></div>
        <div><dt>{text('Payment')}</dt><dd>{text(paymentLabel[payment.status])}</dd></div>
        <div><dt>{text('Total')}</dt><dd>{formatINR(receipt.amount_minor)}</dd></div>
        {receipt.pickup_eta_min && !waiting ? <div><dt>{text('Pickup')}</dt><dd>{t('About {{minutes}} min (estimate)', 'लगभग {{minutes}} मिनट (अनुमान)', { minutes: receipt.pickup_eta_min })}</dd></div> : null}
      </dl>
      <p className="simulation-warning">{text(payment.status === 'SUCCEEDED_SIMULATED' ? 'No money charged.' : 'Nothing charged.')} {text(receipt.notice)}</p>
      {appointment && status === 'CONFIRMED_SIMULATED' && !simple ? (
        <div className="suggestion">
          <p><strong>{text('Suggestion:')}</strong> {t('would you like to ask someone in your Care Circle whether they can come to {{title}} with you? Nobody is asked unless you choose to.', 'क्या आप अपने केयर सर्कल में किसी से पूछना चाहेंगे कि क्या वे {{title}} में आपके साथ आ सकते हैं? आपकी इच्छा के बिना किसी से नहीं पूछा जाएगा।', { title: appointment.title })}</p>
          <button type="button" className="secondary wide" disabled={busy} onClick={() => void run(async () => { await api('/help', 'POST', { kind: 'accompany', appointment_id: appointment.id }); hub.notify(text('Your Care Circle was asked. Nobody has agreed yet.')) })}>{text('Ask if someone can come with me')}</button>
        </div>
      ) : null}
      {simple ? <a className="primary wide" href="#/">{text('Done')}</a> : (
        <>
          <p className="reassure">{text(waiting ? 'No need to call anyone.' : 'That is it. There was no need to call anyone.')}</p>
          <a className="primary wide" href={`#/activity/${receipt.id}`}>{text(receipt.service === 'ride' && !waiting ? 'Track your demo ride' : 'See booking details')}</a>
          <button type="button" className="secondary wide" onClick={onAgain}>{text('Book something else')}</button>
        </>
      )}
    </section>
  )
}
