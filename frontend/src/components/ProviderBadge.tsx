type Tone = 'blue' | 'red' | 'yellow' | 'green'

// Decorative Google colours only; these are not the apps' own brand colours.
const tones: Record<string, Tone> = { uber: 'blue', ola: 'green', rapido: 'yellow', ubereats: 'red', swiggy: 'yellow', zomato: 'blue', pharmacy: 'green' }

export default function ProviderBadge({ id, name, demo = true }: { id: string; name: string; demo?: boolean }) {
  return (
    <span className="provider">
      <span className={`provider-dot tone-${tones[id] ?? 'blue'}`} aria-hidden="true">{name.slice(0, 1)}</span>
      <span className="provider-name">{name}</span>
      {demo ? <span className="chip demo">Demo</span> : null}
    </span>
  )
}
