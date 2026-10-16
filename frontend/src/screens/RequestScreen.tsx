import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, bookedNotice, bookingStatusLabel, formatINR, formatWhen, paymentLabel, paymentMethodLabel, serviceNames, serviceTypeOf } from '../hub'
import type { Activity, HubState, MenuItem, Quote, QuoteResult, Service } from '../hub'
import { newId } from '../id'
import { BackIcon, CheckIcon } from '../icons'
import PickNote from '../components/PickNote'
import PriceLines from '../components/PriceLines'
import ProviderBadge from '../components/ProviderBadge'
import type { Hub } from './hubType'

type Step = 'form' | 'choose' | 'review' | 'done'
const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const MAX_QUANTITY = 5

function Stepper({ item, value, onChange }: { item: MenuItem; value: number; onChange: (next: number) => void }) {
  return (
    <div className="stepper-control" role="group" aria-label={`How many: ${item.name}`}>
      <button type="button" className="secondary small" aria-label={`Fewer: ${item.name}`} disabled={value === 0} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" className="secondary small" aria-label={`More: ${item.name}`} disabled={value === MAX_QUANTITY} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

function Menu({ items, counts, onChange }: { items: MenuItem[]; counts: Record<string, number>; onChange: (id: string, value: number) => void }) {
  return (
    <ul className="menu-list">
      {items.map((item) => (
        <li key={item.id} className="menu-row">
          <div>
            <strong>{item.name}</strong>
            <small className="muted">
              {formatINR(item.price_minor)}
              {item.vegetarian === undefined ? '' : item.vegetarian ? ' · vegetarian' : ' · non-vegetarian'}
              {item.mild === undefined ? '' : item.mild ? ', mild' : ', some spice'}
            </small>
          </div>
          <Stepper item={item} value={counts[item.id] ?? 0} onChange={(value) => onChange(item.id, value)} />
        </li>
      ))}
    </ul>
  )
}

const optionLabel = (quote: Quote) => (quote.service === 'ride' ? `${quote.option_name} from ${quote.app_name ?? quote.provider_label}` : quote.title)

export default function RequestScreen({ hub, service, proposalId, simple = false }: { hub: Hub; service: Service; proposalId?: string; simple?: boolean }) {
  const { state, busy, run, refresh, setState } = hub
  const profile = state.profile
  const serviceType = serviceTypeOf[service]
  const provider = state.services?.find((item) => item.service_type === serviceType)
  const places = state.places ?? []
  // With the list switched off, Saathi's pick opens directly; the owner still confirms it.
  const autoPick = service === 'ride' && profile.show_ride_options === false
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

  function speak(text: string) {
    if (!('speechSynthesis' in window)) { hub.notify('Read aloud is unavailable in this browser.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = profile.language
    window.speechSynthesis.speak(utterance)
  }
  const spoken = selected ? `${selected.title}. ${formatINR(selected.amount_minor)}. ${selected.notice} ${paymentMethodLabel[selected.payment_method]}.` : ''
  useEffect(() => {
    if (profile.read_aloud && spoken && 'speechSynthesis' in window) speak(spoken)
    // Read each new quote once when it opens, only if the person asked for read-aloud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken])

  function startAgain() { setQuotes([]); setSelected(null); setReceipt(null); setCounts({}) }

  function getQuotes(event: FormEvent) {
    event.preventDefault()
    const items = Object.entries(counts).filter(([, quantity]) => quantity > 0).map(([item_id, quantity]) => ({ item_id, quantity }))
    const body = service === 'ride'
      ? { service_type: 'RIDE', pickup_place_id: pickupId || null, ...(destinationId === 'other' ? { destination_text: destinationText } : { destination_place_id: destinationId }), ...(autoPick ? { idempotency_key: (autoKey.current ??= newId()) } : {}) }
      : service === 'food' ? { service_type: 'FOOD', option_id: kitchenId, items } : { service_type: 'PHARMACY', items }
    void run(async () => {
      const result = await api<QuoteResult>('/quotes', 'POST', body)
      if (result.booking) { autoKey.current = null; await openRide(result.booking); return }
      setQuotes(result.quotes)
      setSelected(firstPick(result.quotes))
      await refresh()
    })
  }

  async function openRide(booking: Activity) {
    await refresh()
    hub.notify(bookedNotice(booking))
    window.location.hash = `#/activity/${booking.id}`
  }

  function confirm() {
    if (!selected) return
    // One key per quote: a double tap or a retry after a lost reply cannot book twice.
    const key = (keys.current[selected.id] ??= newId())
    void run(async () => {
      const booked = await api<Activity>(`/quotes/${selected.id}/confirm`, 'POST', { idempotency_key: key, confirmed: true })
      if (autoPick && booked.booking_status !== 'FAILED') { await openRide(booked); return }
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
      <a className="back" href="#/"><BackIcon /> Home</a>
      <h1 className="page-title">{serviceNames[service]}</h1>

      {step === 'form' && provider && provider.status !== 'CONNECTED' ? (
        <section className="card" aria-labelledby="connect-title">
          <h2 id="connect-title" className="step-title">Connect the {provider.provider_label} first</h2>
          <p>{provider.notice} Connect it to get sample prices here. There is no sign-in and nothing real is booked.</p>
          <button type="button" className="primary wide" disabled={busy} onClick={connect}>Connect {provider.provider_label}</button>
          <a className="secondary wide" href="#/services">Open Services</a>
        </section>
      ) : null}

      {step === 'form' && (!provider || provider.status === 'CONNECTED') ? (
        <section className="card" aria-labelledby="form-title">
          <h2 id="form-title" tabIndex={-1} ref={heading} className={simple ? 'sr-only' : 'step-title'}>What would you like?</h2>
          {simple ? null : <p className="muted">{autoPick ? 'Saathi will pick the ride with the best price and pickup time and book it for you straight away (simulated). You can cancel it on the ride page.' : `Prices come from the ${provider?.provider_label ?? 'demo provider'}. Nothing is booked until you confirm.`}</p>}
          {lastGroup.length ? <button type="button" className="secondary wide" onClick={() => { setQuotes(lastGroup); setSelected(firstPick(lastGroup)) }}>Continue where you left off</button> : null}
          {service === 'ride' && !places.length ? (
            <p className="clarify">Add your home in setup first, so Saathi knows where to pick you up. <a href="#/onboarding/places">Add a place</a></p>
          ) : null}
          <form onSubmit={getQuotes}>
            {service === 'ride' ? (
              <>
                <label className="field"><span>Pick me up from</span>
                  <select required value={pickupId} onChange={(event) => setPickupId(event.target.value)}>
                    {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
                  </select>
                </label>
                <label className="field"><span>Where to?</span>
                  <select required value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                    <option value="">Choose a place</option>
                    {places.filter((place) => place.id !== pickupId).map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
                    <option value="other">Somewhere else…</option>
                  </select>
                </label>
                {destinationId === 'other' ? (
                  <label className="field"><span>Place name or address</span>
                    <input required maxLength={150} value={destinationText} placeholder="e.g. Central market" onChange={(event) => setDestinationText(event.target.value)} />
                  </label>
                ) : null}
              </>
            ) : null}
            {service === 'food' ? (
              kitchens.length ? (
                <>
                  <label className="field"><span>Kitchen</span>
                    <select value={kitchenId} onChange={(event) => { setKitchenId(event.target.value); setCounts({}) }}>
                      {kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.app_name ? `${kitchen.name} · listed on ${kitchen.app_name} (demo)` : `${kitchen.name} · ${provider?.provider_label}`}</option>)}
                    </select>
                  </label>
                  <Menu items={kitchens.find((k) => k.id === kitchenId)?.items ?? []} counts={counts} onChange={(id, value) => setCounts({ ...counts, [id]: value })} />
                  {simple ? null : <p className="muted">Fictional demo kitchens. Your usual choice: {profile.vegetarian ? 'vegetarian' : 'any diet'}, {profile.mild ? 'mild' : 'any spice'}, up to ₹{profile.budget}.</p>}
                </>
              ) : <p className="clarify">Switch on a food option in <a href="#/services">Services</a> first.</p>
            ) : null}
            {service === 'medicine' ? (
              <>
                <p className="inline-note">Sample non-prescription items only. This is not medical advice and not a real pharmacy order.</p>
                <Menu items={provider?.catalogue.items ?? []} counts={counts} onChange={(id, value) => setCounts({ ...counts, [id]: value })} />
              </>
            ) : null}
            <button className="primary wide" disabled={busy || (service !== 'ride' && !chosenItems) || (service === 'ride' && !places.length)}>
              {service !== 'ride' ? 'Get demo price' : autoPick ? 'Book the best demo ride' : 'Get demo prices'}
            </button>
          </form>
        </section>
      ) : null}

      {step === 'choose' ? (
        <section className="results" aria-labelledby="results-title" aria-live="polite">
          <h2 id="results-title" tabIndex={-1} ref={heading} className="step-title">{simple ? 'Pick one' : `${quotes.length} demo prices`}</h2>
          {appointment ? <p className="inline-note appointment-note">For your appointment: <strong>{appointment.title}</strong>, {formatWhen(appointment.starts_at)}, at {appointment.place}.</p> : null}
          {simple ? null : <p className="muted">Pick one to see the full price. Nothing is booked until you confirm, and prices are held for 15 minutes.</p>}
          <div className="options">
            {quotes.map((quote) => (
              <article key={quote.id} className="option card">
                <ProviderBadge id={quote.app_id ?? quote.provider_type} name={quote.app_name ?? quote.provider_label} />
                <h3>{service === 'ride' ? quote.option_name : quote.title}</h3>
                {simple ? null : <p className="muted">{quote.app_name ? `Simulated by the ${quote.provider_label}` : 'Saathi’s own demo service'}</p>}
                <div className="option-foot">
                  <div>
                    <strong className="price">{formatINR(quote.amount_minor)}</strong>
                    {quote.pickup_eta_min ? <span className="eta">{quote.pickup_eta_min} min away</span> : quote.delivery_min ? <span className="eta">About {quote.delivery_min} min</span> : null}
                  </div>
                  <button type="button" className="secondary" disabled={busy} aria-label={`Choose ${optionLabel(quote)}`} onClick={() => setSelected(quote)}>Choose</button>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="secondary wide" disabled={busy} onClick={startAgain}>{simple ? 'Back' : 'Change my request'}</button>
        </section>
      ) : null}

      {step === 'review' && selected ? (
        <section className="review card" aria-labelledby="review-title">
          {simple ? null : <p className="eyebrow">YOU HAVE THE FINAL SAY</p>}
          <h2 id="review-title" tabIndex={-1} ref={heading} className="step-title">{simple ? 'Book this?' : 'Check and confirm'}</h2>
          {autoPick && selected.recommended ? <PickNote pick={selected.recommended} title="Saathi’s pick" /> : null}
          <ProviderBadge id={selected.app_id ?? selected.provider_type} name={selected.app_name ?? selected.provider_label} />
          <p className="review-name">{selected.title}</p>
          {selected.details?.pickup && selected.details.destination ? <p>{selected.details.pickup.label} → {selected.details.destination.label}</p> : null}
          {appointment ? <p className="inline-note appointment-note">For your appointment: <strong>{appointment.title}</strong>, {formatWhen(appointment.starts_at)}.</p> : null}
          <p className="review-price">{formatINR(selected.amount_minor)}</p>
          {simple ? null : <PriceLines lines={selected.line_items ?? []} total={selected.amount_minor} />}
          <dl className="receipt-details">
            {selected.pickup_eta_min ? <div><dt>Pickup</dt><dd>About {selected.pickup_eta_min} min (estimate)</dd></div> : null}
            {selected.duration_min ? <div><dt>Trip time</dt><dd>About {selected.duration_min} min</dd></div> : null}
            {selected.delivery_min ? <div><dt>Delivery</dt><dd>About {selected.delivery_min} min</dd></div> : null}
            <div><dt>Provider</dt><dd>{selected.provider_label} (simulated)</dd></div>
            <div><dt>Payment</dt><dd>{paymentMethodLabel[selected.payment_method]} · no money will be charged</dd></div>
            {simple ? null : <div><dt>Price held until</dt><dd>{clock.format(new Date(selected.expires_at * 1000))}</dd></div>}
          </dl>
          <p className="simulation-warning">{selected.notice}</p>
          {selected.approval.required ? <p className="inline-note">Someone in your Care Circle must approve this first. {selected.approval.reason}</p> : null}
          {expired ? <p className="inline-note">This price has expired. Please get a new one.</p> : null}
          <button type="button" className="primary wide" disabled={busy || expired} onClick={confirm}>Confirm demo booking</button>
          {autoPick && quotes.length > 1 ? <button type="button" className="secondary wide" disabled={busy} onClick={() => setSelected(null)}>Compare all options</button> : null}
          <button type="button" className="secondary wide" disabled={busy} onClick={() => (quotes.length > 1 && !autoPick ? setSelected(null) : startAgain())}>Go back</button>
          {simple ? null : <button type="button" className="secondary wide" onClick={() => speak(spoken)}>Read aloud</button>}
        </section>
      ) : null}

      {step === 'done' && receipt ? <Receipt hub={hub} receipt={receipt} simple={simple} onAgain={startAgain} /> : null}
    </>
  )
}

function Receipt({ hub, receipt, simple, onAgain }: { hub: Hub; receipt: Activity; simple: boolean; onAgain: () => void }) {
  const { state, busy, run } = hub
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const appointment = receipt.appointment_id ? state.appointments?.find((a) => a.id === receipt.appointment_id) : undefined
  const status = receipt.booking_status
  const payment = receipt.payment!

  if (status === 'FAILED') {
    return (
      <section className="receipt card failed" aria-labelledby="receipt-title">
        <h2 id="receipt-title" tabIndex={-1} ref={heading} className="step-title">Booking failed</h2>
        <p className="lead">The {receipt.provider_label} could not take this booking. Nothing was booked and nothing was charged.</p>
        <dl className="receipt-details">
          <div><dt>Booking</dt><dd>{bookingStatusLabel[status]}</dd></div>
          <div><dt>Payment</dt><dd>{paymentLabel[payment.status]}</dd></div>
        </dl>
        <p className="muted">This is a simulated failure, so the demo can show what happens when a service fails.</p>
        <button type="button" className="primary wide" onClick={onAgain}>Try again</button>
        {state.profile.offer_help !== false ? (
          <button type="button" className="secondary wide" disabled={busy} onClick={() => void run(async () => { await api('/help', 'POST', { kind: 'help', note: `A booking failed: ${receipt.title}` }); hub.notify('Your Care Circle was told.') })}>Ask my Care Circle for help</button>
        ) : null}
      </section>
    )
  }

  const waiting = status === 'AWAITING_APPROVAL'
  return (
    <section className="receipt card" aria-labelledby="receipt-title">
      <span className="receipt-check"><CheckIcon /></span>
      <h2 id="receipt-title" tabIndex={-1} ref={heading} className="step-title">{waiting ? 'Sent for approval' : 'Demo booking confirmed'}</h2>
      <p className="lead">
        {waiting
          ? 'Someone in your Care Circle will be asked to approve this. Nothing is booked or charged until they do.'
          : `Saathi booked ${receipt.title} with the ${receipt.provider_label} (simulated).`}
      </p>
      <dl className="receipt-details">
        {receipt.provider_booking_id ? <div><dt>Booking reference</dt><dd>{receipt.provider_booking_id}</dd></div> : null}
        <div><dt>Booking</dt><dd>{bookingStatusLabel[status]}</dd></div>
        <div><dt>Payment</dt><dd>{paymentLabel[payment.status]}</dd></div>
        <div><dt>Total</dt><dd>{formatINR(receipt.amount_minor)}</dd></div>
        {receipt.pickup_eta_min && !waiting ? <div><dt>Pickup</dt><dd>About {receipt.pickup_eta_min} min (estimate)</dd></div> : null}
      </dl>
      <p className="simulation-warning">{payment.status === 'SUCCEEDED_SIMULATED' ? 'No money charged.' : 'Nothing charged.'} {receipt.notice}</p>
      {simple ? null : (
        <details className="more">
          <summary>Demo details</summary>
          <dl className="receipt-details codes">
            <div><dt>Booking status</dt><dd><code>{status}</code></dd></div>
            <div><dt>Payment status</dt><dd><code>{payment.status}</code></dd></div>
          </dl>
        </details>
      )}
      {appointment && status === 'CONFIRMED_SIMULATED' && !simple ? (
        <div className="suggestion">
          <p><strong>Suggestion:</strong> would you like to ask someone in your Care Circle whether they can come to {appointment.title} with you? Nobody is asked unless you choose to.</p>
          <button type="button" className="secondary wide" disabled={busy} onClick={() => void run(async () => { await api('/help', 'POST', { kind: 'accompany', appointment_id: appointment.id }); hub.notify('Your Care Circle was asked. Nobody has agreed yet.') })}>Ask if someone can come with me</button>
        </div>
      ) : null}
      {simple ? <a className="primary wide" href="#/">Done</a> : (
        <>
          <p className="reassure">{waiting ? 'No need to call anyone.' : 'That is it. There was no need to call anyone.'}</p>
          <a className="primary wide" href={`#/activity/${receipt.id}`}>{receipt.service === 'ride' && !waiting ? 'Track your demo ride' : 'See booking details'}</a>
          <button type="button" className="secondary wide" onClick={onAgain}>Book something else</button>
        </>
      )}
    </section>
  )
}
