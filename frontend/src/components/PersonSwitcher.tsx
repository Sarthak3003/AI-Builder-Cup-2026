import type { DemoPerson } from '../hub'
import { useI18n } from '../i18n'

// Demo only: one browser plays Meera or someone in her Care Circle, one person at a time.
export default function PersonSwitcher({ people, current, busy, onSwitch }: { people?: DemoPerson[]; current?: string; busy: boolean; onSwitch: (id: string) => void }) {
  const { t, text } = useI18n()
  if (!people?.length) return null
  const me = people.find((person) => person.id === current)
  return (
    <section className="card demo-note person-switcher" aria-labelledby="switch-account-title">
      <h2 id="switch-account-title">{t('Switch account', 'खाता बदलें')}</h2>
      <p><span className="chip demo">{t('Demo', 'डेमो')}</span> {t('You are', 'आप हैं')} <strong>{me?.name ?? t('someone', 'कोई व्यक्ति')}</strong>{me ? ` · ${text(me.role)}` : ''}{t('. Tap a name to switch.', '। बदलने के लिए किसी नाम पर टैप करें।')}</p>
      <div className="person-buttons">
        {people.map((person) => (
          <button key={person.id} type="button" className={person.id === current ? 'person current' : 'person'} aria-pressed={person.id === current}
            disabled={busy || person.id === current} onClick={() => onSwitch(person.id)}>
            <span className="person-name">{person.name}</span>
            <span className="person-role">{text(person.role)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
