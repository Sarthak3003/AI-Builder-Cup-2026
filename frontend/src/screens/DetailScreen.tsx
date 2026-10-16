import { useEffect, useRef, useState } from 'react'
import { api, live } from '../hub'
import type { Activity } from '../hub'
import ActivityDetailView from '../components/ActivityDetailView'
import PaymentSuccess from '../components/PaymentSuccess'
import { preparePaymentChime } from '../paymentChime'
import type { PaymentChime } from '../paymentChime'
import type { Hub } from './hubType'

export default function DetailScreen({ hub, id }: { hub: Hub; id: string }) {
  const { state, busy, run, refresh, notify } = hub
  const [paid, setPaid] = useState<Activity | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const active = useRef(true)
  const sound = useRef<PaymentChime | null>(null)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; sound.current?.dispose() }
  }, [])
  const saved = state.activity.find((entry) => entry.id === id)
  const item = saved && paid ? { ...saved, payment: saved.payment?.status === 'PENDING_SIMULATED' ? paid.payment : saved.payment } : saved
  if (!item) return <><a className="back" href="#/activity">Back to activity</a><p>That activity is not available.</p></>
  const call = (path: string, method = 'POST', body?: unknown) => void run(async () => { await api<Activity>(path, method, body); await refresh() })
  const completePayment = () => void run(async () => {
    sound.current?.dispose()
    const chime = sound.current = preparePaymentChime()
    try {
      const completed = await api<Activity>(`/bookings/${id}/payment/complete`, 'POST')
      if (!active.current) return
      if (completed.id !== id || completed.payment?.status !== 'SUCCEEDED_SIMULATED') throw new Error('Payment is not marked complete yet. Please check its status and try again.')
      setPaid(completed)
      setShowSuccess(true)
      chime.play()
      try { await refresh() } catch {
        if (active.current) notify('Payment was marked complete, but the latest booking details could not be refreshed.')
      }
    } catch (error) {
      chime.dispose()
      throw error
    }
  })
  const conversation = state.conversations?.find((entry) => entry.request_id && entry.request_id === item.request_id)
  const appointment = state.appointments?.find((entry) => entry.id === item.appointment_id)
  const pending = item.payment?.status === 'PENDING_SIMULATED' && ['CONFIRMED_SIMULATED', 'COMPLETED_SIMULATED'].includes(item.booking_status)
  const ride = item.service === 'ride'
  const food = item.service === 'food'
  const help = () => void run(async () => { await api('/help', 'POST', { kind: 'help', note: `Help with ${item.title}` }); notify('Your Care Circle was told.') })
  return (
    <>
      {showSuccess && paid ? <PaymentSuccess item={paid} onDone={() => { setShowSuccess(false); sound.current?.dispose() }} /> : null}
      <ActivityDetailView
        item={item}
        events={state.events ?? []}
        conversation={conversation}
        appointment={appointment}
        deliverTo={food ? state.places?.find((place) => place.is_default_pickup) : undefined}
        headerAction={(ride || food) && live(item) ? <button type="button" className="secondary small" disabled={busy} onClick={help}>Help</button> : null}
        actions={
          <>
            {live(item) ? <button className="secondary" disabled={busy} onClick={() => call(`/bookings/${id}/cancel`)}>{ride ? 'Cancel ride' : food ? 'Cancel order' : 'Cancel booking'}</button> : null}
            {(ride || food) && item.booking_status === 'FAILED' ? <a className="primary" href={`#/request/${item.service}`}>Try again</a> : null}
            {state.demo_controls && item.booking_status === 'CONFIRMED_SIMULATED' ? <button className="secondary" disabled={busy} onClick={() => call(`/bookings/${id}/complete`)}>Demo: mark trip or delivery completed</button> : null}
            {state.demo_controls && pending ? <button className="secondary" disabled={busy} onClick={completePayment}>Demo: mark simulated payment complete</button> : null}
          </>
        }
        extra={
          <section className="card">
            <h2>Sharing</h2>
            <label className="check-row">
              <input type="checkbox" checked={item.shared !== false} disabled={busy} onChange={(event) => call(`/bookings/${id}/sharing`, 'PUT', { shared: event.target.checked })} />
              Share this with my Care Circle
            </label>
            <p className="muted">Only people you have given activity access can see it, and never your addresses or payment details unless you allow that.</p>
          </section>
        }
      />
    </>
  )
}
