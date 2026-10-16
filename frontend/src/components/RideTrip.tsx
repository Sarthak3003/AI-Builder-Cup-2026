import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatINR, formatWhen, paymentMethodLabel } from '../hub'
import type { Activity, Appointment, PlaceSnapshot, Trip } from '../hub'
import { CarIcon, PhoneIcon } from '../icons'
import PriceLines from './PriceLines'
import ProviderBadge from './ProviderBadge'
import StatusChips from './StatusChips'

type Stage = 'coming' | 'done' | 'idle'
type Props = { item: Activity; appointment?: Appointment; actions?: ReactNode; headerAction?: ReactNode }

// A drawn sketch, not a live map: nothing is tracked and no vehicle exists.
function RouteMap({ stage }: { stage: Stage }) {
  return (
    <div className={`route-map ${stage}`}>
      <svg viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <rect className="land" width="360" height="150" />
        <rect className="park" x="18" y="62" width="88" height="36" rx="10" />
        <rect className="park" x="150" y="78" width="70" height="56" rx="10" />
        <path className="street" d="M0 118 H360 M0 40 H360 M128 0 V150 M244 0 L284 150" />
        <path className="route" d="M60 118 H128 V40 H300" />
        <circle className="pin-start" cx="60" cy="118" r="9" />
        <rect className="pin-end" x="291" y="31" width="18" height="18" rx="4" />
        {stage === 'idle' ? null : (
          <g className="map-car" transform={stage === 'done' ? 'translate(300 40)' : 'translate(96 118)'}>
            <circle r="15" />
            <svg x="-10" y="-10" width="20" height="20" viewBox="0 0 24 24">
              <path d="M5 15.5 6.6 10a2 2 0 0 1 1.9-1.5h7a2 2 0 0 1 1.9 1.5l1.6 5.5" />
              <rect x="3" y="15.5" width="18" height="4.5" rx="1.5" />
            </svg>
          </g>
        )}
      </svg>
      <span className="chip demo map-chip">Demo map · not live</span>
    </div>
  )
}

function headline(item: Activity) {
  const from = item.details?.pickup?.label
  const to = item.details?.destination?.label ?? 'the destination'
  switch (item.booking_status) {
    case 'CONFIRMED_SIMULATED': {
      const pickup = item.pickup_eta_min ? `Pickup${from ? ` from ${from}` : ''} in about ${item.pickup_eta_min} min (estimate). ` : ''
      return { title: 'Demo driver on the way', detail: `${pickup}Simulated: no real driver will arrive.` }
    }
    case 'COMPLETED_SIMULATED':
      return { title: `Arrived at ${to}`, detail: 'Demo trip completed. No real trip took place.' }
    case 'AWAITING_APPROVAL':
      return { title: 'Waiting for approval', detail: `${item.approval_reason ? `${item.approval_reason} ` : ''}Nothing is booked until an approver agrees.` }
    case 'CANCELLED_SIMULATED':
      return { title: 'Ride cancelled', detail: 'This demo ride was cancelled.' }
    case 'DECLINED':
      return { title: 'Declined in the Care Circle', detail: `${item.decision?.name ?? 'An approver'} declined this request. Nothing was booked or charged.` }
    default:
      return { title: 'Booking failed', detail: item.failure ?? 'Nothing was booked or charged.' }
  }
}

function PinRow({ pin }: { pin: string }) {
  return (
    <div className="pin-row">
      <strong>Ride PIN (demo)</strong>
      <span className="pin">
        <span className="sr-only">{pin.split('').join(' ')}</span>
        {pin.split('').map((digit, index) => <span key={index} className="pin-digit" aria-hidden="true">{digit}</span>)}
      </span>
      <p className="muted pin-note">In a real ride you would say it to the driver in the car, never on a phone call.</p>
    </div>
  )
}

function DriverCard({ trip, coming }: { trip: Trip; coming: boolean }) {
  const [called, setCalled] = useState(false)
  return (
    <section className="card driver-card" aria-labelledby="driver-title">
      <div className="driver-row">
        <span className="driver-avatar" aria-hidden="true"><CarIcon /></span>
        <div className="driver-text">
          <h2 id="driver-title">Demo driver</h2>
          <p className="muted">Not a real person · {trip.vehicle} (sample)</p>
          <p className="plate">{trip.plate}</p>
        </div>
        {coming ? <button type="button" className="secondary call-button" aria-label="Call the demo driver" onClick={() => setCalled(true)}><PhoneIcon /></button> : null}
      </div>
      {called ? <p className="inline-note" role="status">Demo only: there is no driver to call.</p> : null}
    </section>
  )
}

function Stop({ kind, place }: { kind: 'start' | 'end'; place: PlaceSnapshot }) {
  return (
    <li className="stop">
      <span className={`stop-mark ${kind}`} aria-hidden="true" />
      <div>
        <span className="muted">{kind === 'start' ? 'Pickup' : 'Drop'}</span>
        <strong>{place.label}</strong>
        {place.address && place.address !== place.label ? <span className="muted">{place.address}</span> : null}
      </div>
    </li>
  )
}

// A ride laid out like a familiar ride app: route, status, PIN and driver, then the trip and fare.
export default function RideTrip({ item, appointment, actions, headerAction }: Props) {
  const status = item.booking_status
  const stage: Stage = status === 'CONFIRMED_SIMULATED' ? 'coming' : status === 'COMPLETED_SIMULATED' ? 'done' : 'idle'
  const head = headline(item)
  const { pickup, destination, distance_km } = item.details ?? {}
  const facts = [distance_km ? `${distance_km} km` : '', item.duration_min ? `about ${item.duration_min} min` : ''].filter(Boolean)
  return (
    <>
      <div className="ride-header">
        <div>
          <h1 className="page-title">{item.title}</h1>
          <p className="muted">{formatWhen(item.created_at)}</p>
        </div>
        {headerAction}
      </div>

      <section className="card ride-card" aria-labelledby="ride-status-title">
        <RouteMap stage={stage} />
        <div className="ride-status">
          <h2 id="ride-status-title">{head.title}</h2>
          <p className="muted">{head.detail}</p>
          <StatusChips item={item} />
        </div>
        {stage === 'coming' && item.trip ? <PinRow pin={item.trip.pin} /> : null}
      </section>

      {item.trip && stage !== 'idle' ? <DriverCard trip={item.trip} coming={stage === 'coming'} /> : null}

      <section className="card route-card" aria-labelledby="route-title">
        <h2 id="route-title" className="sr-only">Route</h2>
        <ol className="stops">
          {pickup ? <Stop kind="start" place={pickup} /> : null}
          {destination ? <Stop kind="end" place={destination} /> : null}
        </ol>
        {facts.length ? <p className="muted">{facts.join(' · ')}</p> : null}
        {appointment ? <p className="inline-note appointment-note">For {appointment.title}, {formatWhen(appointment.starts_at)}</p> : null}
      </section>

      <section className="card fare-card" aria-labelledby="fare-title">
        <div className="fare-head">
          <h2 id="fare-title">Fare</h2>
          <strong className="fare-total">{formatINR(item.amount_minor)}</strong>
        </div>
        <ProviderBadge id={item.app_id ?? item.provider_type} name={item.app_name ?? item.provider_label} />
        <p className="muted">{item.payment ? `${paymentMethodLabel[item.payment.method]} · no money moves` : 'Payment details are not shared with you.'}</p>
        {item.line_items?.length ? (
          <details className="more">
            <summary>Fare breakdown</summary>
            <PriceLines lines={item.line_items} total={item.amount_minor} />
          </details>
        ) : null}
        <dl className="receipt-details">
          {item.provider_booking_id ? <div><dt>Booking reference</dt><dd>{item.provider_booking_id} (simulated)</dd></div> : null}
          <div><dt>Provider</dt><dd>{item.provider_label} (simulated)</dd></div>
          {item.approval_reason ? <div><dt>Why approval</dt><dd>{item.approval_reason}</dd></div> : null}
          {item.decision ? <div><dt>Decision</dt><dd>{item.decision.action === 'approve' ? 'Approved' : 'Declined'} by {item.decision.name}{item.decision.note ? `: “${item.decision.note}”` : ''}</dd></div> : null}
        </dl>
        <p className="muted">{item.notice} No money moves.</p>
        <details className="more">
          <summary>Demo details</summary>
          <dl className="receipt-details codes">
            <div><dt>Booking status</dt><dd><code>{item.booking_status}</code></dd></div>
            <div><dt>Payment status</dt><dd><code>{item.payment?.status ?? 'not shared with you'}</code></dd></div>
            <div><dt>Provider type</dt><dd><code>{item.provider_type}</code></dd></div>
          </dl>
        </details>
        {actions ? <div className="actions">{actions}</div> : null}
      </section>
    </>
  )
}
