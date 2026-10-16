import { formatINR } from '../hub'
import type { LineItem } from '../hub'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'

// The server's own itemised price. The screen only formats it; it never adds anything up.
export default function PriceLines({ lines, total }: { lines: LineItem[]; total: number }) {
  const { t, text } = useI18n()
  return (
    <dl className="price-lines" aria-label={text('Price breakdown')}>
      {lines.map((line) => <div key={line.label}><dt>{bookingCopy(line.label, t, text)}</dt><dd>{formatINR(line.amount_minor)}</dd></div>)}
      <div className="total"><dt>{text('Total (sample price)')}</dt><dd>{formatINR(total)}</dd></div>
    </dl>
  )
}
