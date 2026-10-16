import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { formatINR } from '../hub'
import { useI18n } from '../i18n'
import type { Translate } from '../i18n'
import { bookingCopy } from '../locales/booking'
import type { Activity, PlaceSnapshot } from '../hub'
import { PhoneIcon, ScooterIcon } from '../icons'
import BookingSummary from './BookingSummary'
import PickNote from './PickNote'
import RouteMap from './RouteMap'
import StatusChips from './StatusChips'

type Props = { item: Activity; deliverTo?: PlaceSnapshot; actions?: ReactNode; headerAction?: ReactNode }

function headline(item: Activity, t: Translate, text: (value: string) => string) {
  switch (item.booking_status) {
    case 'CONFIRMED_SIMULATED':
      return { title: text('Preparing your order'), detail: text('The demo kitchen needs a few minutes, then a demo partner picks it up. Simulated: no real food is cooked or delivered.') }
    case 'COMPLETED_SIMULATED':
      return { title: text('Delivered (simulated)'), detail: text('Demo order completed. No real food was delivered.') }
    case 'AWAITING_APPROVAL':
      return { title: text('Waiting for approval'), detail: `${item.approval_reason ? `${bookingCopy(item.approval_reason, t, text)} ` : ''}${text('Nothing is ordered until an approver agrees.')}` }
    case 'CANCELLED_SIMULATED':
      return { title: text('Order cancelled'), detail: text('This demo order was cancelled.') }
    case 'DECLINED':
      return { title: text('Declined in the Care Circle'), detail: t('{{name}} declined this request. Nothing was ordered or charged.', '{{name}} ने इस अनुरोध को मना किया। कुछ ऑर्डर नहीं हुआ और कोई राशि नहीं ली गई।', { name: item.decision?.name ?? text('An approver') }) }
    default:
      return { title: text('Order failed'), detail: bookingCopy(item.failure ?? 'Nothing was ordered or charged.', t, text) }
  }
}

// A meal order laid out like a familiar food delivery app, with every part marked as a demo.
export default function FoodTrip({ item, deliverTo, actions, headerAction }: Props) {
  const { t, text, formatWhen, formatTime } = useI18n()
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
  const kitchen = text(item.details?.kitchen ?? item.option_name)
  const due = (item.updated_at ?? item.created_at) + (item.delivery_min ?? 0) * 60
  const left = Math.ceil((due - now) / 60)
  const head = headline(item, t, text)
  return (
    <>
      <div className="ride-header">
        <div>
          <h1 className="page-title">{kitchen}</h1>
          <p className="muted">{formatWhen(item.created_at)} · {t(count === 1 ? '{{count}} item' : '{{count}} items', '{{count}} चीज़ें', { count })}</p>
        </div>
        {headerAction}
      </div>

      <div className="order-track">
        <RouteMap stage={stage} mover="scooter" start={kitchen} end={deliverTo?.label} tall />
        <section className="card order-sheet" aria-labelledby="order-status-title">
          {preparing && item.delivery_min ? <p className="eta-band">{t('Arrives by about {{time}} · demo estimate', 'लगभग {{time}} तक पहुँचेगा · डेमो अनुमान', { time: formatTime(due) })}</p> : null}
          <div className="order-status">
            <div>
              <h2 id="order-status-title">{head.title}</h2>
              <p className="muted">{head.detail}</p>
            </div>
            {preparing && item.delivery_min ? (
              <span className="eta-badge">{left > 0 ? <><strong>{left}</strong> {t(left === 1 ? 'min' : 'mins', 'मिनट')}</> : <strong>{text('Due')}</strong>}</span>
            ) : null}
          </div>
          <StatusChips item={item} />
          {item.chosen_by ? <PickNote pick={item.chosen_by} title="Ordered for you by Saathi" /> : null}
          {deliverTo ? <p className="deliver-to"><span className="muted">{text('Delivering to')}</span> <strong>{deliverTo.label}</strong>{deliverTo.address ? ` · ${deliverTo.address}` : ''}</p> : null}
          {preparing ? (
            <div className="partner-row">
              <span className="driver-avatar small" aria-hidden="true"><ScooterIcon /></span>
              <div>
                <strong>{text('Demo delivery partner')}</strong>
                <span className="muted">{text('Not a real person · picks up when the food is ready')}</span>
              </div>
              <button type="button" className="secondary call-button" aria-label={text('Call the demo delivery partner')} onClick={() => setCalled(true)}><PhoneIcon /></button>
            </div>
          ) : null}
          {called ? <p className="inline-note" role="status">{text('Demo only: there is no delivery partner to call.')}</p> : null}
        </section>
      </div>

      <BookingSummary item={item} title="Your order" breakdown="Bill details" actions={actions}>
        <ul className="order-items">
          {items.map((line) => (
            <li key={line.name}>
              {line.vegetarian === undefined ? null : <span className={`diet-mark ${line.vegetarian ? 'veg' : 'non-veg'}`} aria-hidden="true" />}
              <span>{text(line.name)} × {line.quantity}{line.vegetarian === undefined ? null : <span className="sr-only">{line.vegetarian ? t(', vegetarian', ', शाकाहारी') : t(', non-vegetarian', ', मांसाहारी')}</span>}</span>
              {line.unit_minor ? <span>{formatINR(line.unit_minor * line.quantity)}</span> : <span />}
            </li>
          ))}
        </ul>
      </BookingSummary>
    </>
  )
}
