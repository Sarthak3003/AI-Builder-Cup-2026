import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { formatINR, formatWhen } from '../hub'
import type { Activity, PlaceSnapshot } from '../hub'
import { PhoneIcon, ScooterIcon } from '../icons'
import BookingSummary from './BookingSummary'
import PickNote from './PickNote'
import RouteMap from './RouteMap'
import StatusChips from './StatusChips'

type Props = { item: Activity; deliverTo?: PlaceSnapshot; actions?: ReactNode; headerAction?: ReactNode }

const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })

function headline(item: Activity) {
  switch (item.booking_status) {
    case 'CONFIRMED_SIMULATED':
      return { title: 'Preparing your order', detail: 'The demo kitchen needs a few minutes, then a demo partner picks it up. Simulated: no real food is cooked or delivered.' }
    case 'COMPLETED_SIMULATED':
      return { title: 'Delivered (simulated)', detail: 'Demo order completed. No real food was delivered.' }
    case 'AWAITING_APPROVAL':
      return { title: 'Waiting for approval', detail: `${item.approval_reason ? `${item.approval_reason} ` : ''}Nothing is ordered until an approver agrees.` }
    case 'CANCELLED_SIMULATED':
      return { title: 'Order cancelled', detail: 'This demo order was cancelled.' }
    case 'DECLINED':
      return { title: 'Declined in the Care Circle', detail: `${item.decision?.name ?? 'An approver'} declined this request. Nothing was ordered or charged.` }
    default:
      return { title: 'Order failed', detail: item.failure ?? 'Nothing was ordered or charged.' }
  }
}

// A meal order laid out like a familiar food delivery app, with every part marked as a demo.
export default function FoodTrip({ item, deliverTo, actions, headerAction }: Props) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [called, setCalled] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const status = item.booking_status
  const preparing = status === 'CONFIRMED_SIMULATED'
  const stage = preparing ? 'coming' : status === 'COMPLETED_SIMULATED' ? 'done' : 'idle'
  const items = item.details?.items ?? []
  const count = items.reduce((sum, line) => sum + line.quantity, 0)
  const kitchen = item.details?.kitchen ?? item.option_name
  const due = (item.updated_at ?? item.created_at) + (item.delivery_min ?? 0) * 60
  const left = Math.ceil((due - now) / 60)
  const head = headline(item)
  return (
    <>
      <div className="ride-header">
        <div>
          <h1 className="page-title">{kitchen}</h1>
          <p className="muted">{formatWhen(item.created_at)} · {count} {count === 1 ? 'item' : 'items'}</p>
        </div>
        {headerAction}
      </div>

      <div className="order-track">
        <RouteMap stage={stage} mover="scooter" start={kitchen} end={deliverTo?.label} tall />
        <section className="card order-sheet" aria-labelledby="order-status-title">
          {preparing && item.delivery_min ? <p className="eta-band">Arrives by about {clock.format(new Date(due * 1000))} · demo estimate</p> : null}
          <div className="order-status">
            <div>
              <h2 id="order-status-title">{head.title}</h2>
              <p className="muted">{head.detail}</p>
            </div>
            {preparing && item.delivery_min ? (
              <span className="eta-badge">{left > 0 ? <><strong>{left}</strong> {left === 1 ? 'min' : 'mins'}</> : <strong>Due</strong>}</span>
            ) : null}
          </div>
          <StatusChips item={item} />
          {item.chosen_by ? <PickNote pick={item.chosen_by} title="Ordered for you by Saathi" /> : null}
          {deliverTo ? <p className="deliver-to"><span className="muted">Delivering to</span> <strong>{deliverTo.label}</strong>{deliverTo.address ? ` · ${deliverTo.address}` : ''}</p> : null}
          {preparing ? (
            <div className="partner-row">
              <span className="driver-avatar small" aria-hidden="true"><ScooterIcon /></span>
              <div>
                <strong>Demo delivery partner</strong>
                <span className="muted">Not a real person · picks up when the food is ready</span>
              </div>
              <button type="button" className="secondary call-button" aria-label="Call the demo delivery partner" onClick={() => setCalled(true)}><PhoneIcon /></button>
            </div>
          ) : null}
          {called ? <p className="inline-note" role="status">Demo only: there is no delivery partner to call.</p> : null}
        </section>
      </div>

      <BookingSummary item={item} title="Your order" breakdown="Bill details" actions={actions}>
        <ul className="order-items">
          {items.map((line) => (
            <li key={line.name}>
              <span className={`diet-mark ${line.vegetarian === false ? 'non-veg' : 'veg'}`} aria-hidden="true" />
              <span>{line.name} × {line.quantity}<span className="sr-only">{line.vegetarian === false ? ', non-vegetarian' : ', vegetarian'}</span></span>
              {line.unit_minor ? <span>{formatINR(line.unit_minor * line.quantity)}</span> : <span />}
            </li>
          ))}
        </ul>
      </BookingSummary>
    </>
  )
}
