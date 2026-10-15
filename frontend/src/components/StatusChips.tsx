import { paymentLabel, statusLabel } from '../hub'
import type { Activity } from '../hub'

// Booking and simulated payment are separate facts, so they are shown as separate lines.
export default function StatusChips({ item }: { item: Activity }) {
  return (
    <div className="status-chips">
      <span className={`status ${item.status}`}>{statusLabel[item.status] ?? item.status}</span>
      {item.payment ? <span className={`pay ${item.payment.status}`}>Payment: {paymentLabel[item.payment.status]}</span> : null}
    </div>
  )
}
