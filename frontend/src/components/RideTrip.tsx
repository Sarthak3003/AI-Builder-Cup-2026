import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatWhen } from '../hub'
import type { Activity, Appointment, PlaceSnapshot, Trip } from '../hub'
import { CarIcon, PhoneIcon } from '../icons'
import BookingSummary from './BookingSummary'
import PickNote from './PickNote'
import RouteMap from './RouteMap'
import StatusChips from './StatusChips'

type Stage = 'coming' | 'done' | 'idle'
type Props = { item: Activity; appointment?: Appointment; actions?: ReactNode; headerAction?: ReactNode }

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
          {item.chosen_by ? <PickNote pick={item.chosen_by} title="Booked for you by Saathi" /> : null}
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

      <BookingSummary item={item} title="Fare" breakdown="Fare breakdown" actions={actions} />
    </>
  )
}
