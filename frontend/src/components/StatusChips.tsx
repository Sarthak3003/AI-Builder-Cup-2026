import { bookingStatusLabel, paymentLabel } from '../hub'
import type { Activity } from '../hub'
import { useI18n } from '../i18n'

// Booking and simulated payment are separate facts, so they are shown as separate lines.
export default function StatusChips({ item }: { item: Activity }) {
  const { t, text } = useI18n()
  return (
    <div className="status-chips">
      <span className={`status ${item.booking_status.toLowerCase()}`}>{text(bookingStatusLabel[item.booking_status])}</span>
      {item.payment ? <span className={`pay ${item.payment.status.toLowerCase()}`}>{t('Payment: {{status}}', 'भुगतान: {{status}}', { status: text(paymentLabel[item.payment.status]) })}</span> : null}
      {item.payment?.refund ? <span className="pay refunded">{text('Refund recorded (simulated)')}</span> : null}
    </div>
  )
}
