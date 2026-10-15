import { bookingStatusLabel, paymentLabel } from '../hub'
import type { Activity } from '../hub'

// Booking and simulated payment are separate facts, so they are shown as separate lines.
export default function StatusChips({ item }: { item: Activity }) {
  return (
    <div className="status-chips">
      <span className={`status ${item.booking_status.toLowerCase()}`}>{bookingStatusLabel[item.booking_status]}</span>
      {item.payment ? <span className={`pay ${item.payment.status.toLowerCase()}`}>Payment: {paymentLabel[item.payment.status]}</span> : null}
      {item.payment?.refund ? <span className="pay refunded">Refund recorded (simulated)</span> : null}
    </div>
  )
}
