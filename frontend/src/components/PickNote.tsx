import type { Pick } from '../hub'

// Says that Saathi made the choice, why, and whether that was Gemini or Saathi's own rule.
export default function PickNote({ pick, title }: { pick: Pick; title: string }) {
  return (
    <div className="pick-note">
      <p><strong>{title}</strong> · {pick.reason}</p>
      <p className="muted">{pick.by === 'gemini' ? 'Chosen by Gemini (AI) from the demo prices.' : 'Chosen by Saathi’s price-and-wait rule (not AI).'}</p>
    </div>
  )
}
