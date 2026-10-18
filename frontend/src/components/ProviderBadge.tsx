import { useI18n } from '../i18n'

type Tone = 'blue' | 'red' | 'yellow' | 'green'

// Decorative Google colours only; these are not the apps' own brand colours.
const tones: Record<string, Tone> = {
  uber: 'blue', ola: 'green', rapido: 'yellow', ubereats: 'red', swiggy: 'yellow', zomato: 'blue',
  DEMO_RIDE: 'blue', DEMO_FOOD: 'red', DEMO_PHARMACY: 'green',
}

export default function ProviderBadge({ id, name, demo = true }: { id: string; name: string; demo?: boolean }) {
  const { text } = useI18n()
  const label = text(name)
  return (
    <span className="provider">
      <span className={`provider-dot tone-${tones[id] ?? 'blue'}`} aria-hidden="true">{label.slice(0, 1)}</span>
      <span className="provider-name">{label}</span>
      {demo ? <span className="chip demo">{text('Demo')}</span> : null}
    </span>
  )
}
