import { formatINR } from '../hub'
import type { LineItem } from '../hub'

// The server's own itemised price. The screen only formats it; it never adds anything up.
export default function PriceLines({ lines, total }: { lines: LineItem[]; total: number }) {
  return (
    <dl className="price-lines" aria-label="Price breakdown">
      {lines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{formatINR(line.amount_minor)}</dd></div>)}
      <div className="total"><dt>Total (sample price)</dt><dd>{formatINR(total)}</dd></div>
    </dl>
  )
}
