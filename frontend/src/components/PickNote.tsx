import type { Pick } from '../hub'
import { useI18n } from '../i18n'
import { bookingCopy } from '../locales/booking'

// Says that Saathi made the choice, why, and whether that was Gemini or Saathi's own rule.
export default function PickNote({ pick, title }: { pick: Pick; title: string }) {
  const { t, text } = useI18n()
  return (
    <div className="pick-note">
      <p><strong>{text(title)}</strong> · {bookingCopy(pick.reason, t, text)}</p>
      <p className="muted">{text(pick.by === 'gemini' ? 'Chosen by Gemini (AI) from the demo prices.' : 'Chosen by Saathi’s price-and-wait rule (not AI).')}</p>
    </div>
  )
}
