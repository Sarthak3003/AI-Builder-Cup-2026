import type { DemoPerson } from '../hub'

// Demo only: one browser plays Meera or someone in her Care Circle, one person at a time.
export default function PersonSwitcher({ people, current, busy, onSwitch }: { people: DemoPerson[]; current?: string; busy: boolean; onSwitch: (id: string) => void }) {
  const me = people.find((person) => person.id === current)
  return (
    <nav className="person-switcher" aria-label="Demo people">
      <p><span className="chip demo">Demo</span> You are <strong>{me?.name ?? 'someone'}</strong>{me ? ` · ${me.role}` : ''}</p>
      <div className="person-buttons">
        {people.map((person) => (
          <button key={person.id} type="button" className={person.id === current ? 'person current' : 'person'} aria-pressed={person.id === current}
            disabled={busy || person.id === current} onClick={() => onSwitch(person.id)}>
            <span className="person-name">{person.name}</span>
            <span className="person-role">{person.role}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
