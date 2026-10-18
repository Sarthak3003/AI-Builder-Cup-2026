import { useEffect, useRef } from 'react'
import { formatINR } from '../hub'
import type { Activity } from '../hub'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'
import './PaymentSuccess.css'

export default function PaymentSuccess({ item, onDone }: { item: Activity; onDone: () => void }) {
  const { t, text } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const modal = dialog.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    modal.showModal()
    heading.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      modal.close()
      document.body.style.overflow = overflow
      const target = previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.hasAttribute('disabled') ? previousFocus : document.getElementById('main')
      target?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog ref={dialog} className="payment-success" aria-labelledby="payment-success-title" aria-describedby="payment-success-notice" onCancel={(event) => { event.preventDefault(); onDone() }}>
      <div className="payment-success-content">
        <p className="payment-success-brand">{t('saathi', 'साथी')} <span className="chip demo">{text('Simulated payment')}</span></p>
        <div className="payment-success-message">
          <svg className="payment-success-art" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
            <g className="payment-confetti">
              <circle className="confetti-green" cx="139" cy="27" r="6" />
              <path className="confetti-green" d="m39 67 4 7 7 4-7 4-4 7-4-7-7-4 7-4z" />
              <rect className="confetti-blue" x="21" y="113" width="15" height="7" rx="1" transform="rotate(-16 28 116)" />
              <circle className="confetti-yellow" cx="34" cy="160" r="6" />
              <path className="confetti-red confetti-arc" d="M80 207c-8-10 4-18 10-10" />
              <path className="confetti-yellow" d="m144 196 4 7 7 4-7 4-4 7-4-7-7-4 7-4z" />
              <rect className="confetti-blue" x="182" y="191" width="7" height="14" rx="1" transform="rotate(-28 185 198)" />
              <path className="confetti-red confetti-arc" d="M207 164c13-3 16 10 6 14" />
              <path className="confetti-yellow" d="m207 88 4 7 7 4-7 4-4 7-4-7-7-4 7-4z" />
              <path className="confetti-blue confetti-arc" d="M187 55c-5-11 5-17 12-10" />
              <rect className="confetti-red" x="92" y="29" width="6" height="12" rx="1" transform="rotate(-28 95 35)" />
            </g>
            <circle className="payment-check-circle" cx="120" cy="120" r="66" />
            <path className="payment-check-stroke" d="m94 121 18 18 38-38" pathLength="1" />
          </svg>
          <h1 id="payment-success-title" ref={heading} tabIndex={-1}>{text('Payment successful')}</h1>
          <p className="payment-success-amount">{formatINR(item.payment!.amount_minor)}</p>
          <p className="payment-success-booking">{bookingCopy(item.title, t, text)}</p>
          <p id="payment-success-notice" className="muted">{text('Simulated payment only. No real money was charged.')}</p>
        </div>
        <button type="button" className="primary wide" onClick={onDone}>{text('Back to booking')}</button>
      </div>
    </dialog>
  )
}