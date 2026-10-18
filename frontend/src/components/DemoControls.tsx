import { useEffect, useRef, useState } from 'react'
import { api, inviteLink } from '../hub'
import type { HubState } from '../hub'
import { routeHref } from '../route'
import type { Hub } from '../screens/hubType'
import { useI18n } from '../i18n'

type Scenario = 'fresh' | 'meera'
type Invite = { name: string; role: string; code: string }
type Reset = { scenario: Scenario; state: HubState; invites: Invite[] }

const SCENARIOS: Record<Scenario, { button: string; explain: string; done: string }> = {
  fresh: {
    button: 'Start fresh at setup',
    explain: 'You start again at setup with an empty profile, as in the scripted demo.',
    done: 'Demo reset. Setup starts now.',
  },
  meera: {
    button: "Load Meera's demo",
    explain: "You get Meera's finished setup: past bookings, appointments, Asha and Ravi invited, and a pharmacy order waiting for approval.",
    done: "Meera's demo is loaded.",
  },
}

// Only shown when the server allows demo controls (local, test, or SAATHI_DEMO_CONTROLS=1).
export default function DemoControls({ hub }: { hub: Hub }) {
  const { t, text } = useI18n()
  const { busy, run, setState, notify } = hub
  const [pending, setPending] = useState<Scenario | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const keep = useRef<HTMLButtonElement>(null)
  const openers = useRef<Partial<Record<Scenario, HTMLButtonElement | null>>>({})
  const asked = useRef<Scenario | null>(null)
  // The safe choice gets focus, so pressing Enter twice cannot wipe the demo by accident.
  // When the question closes, focus goes back to the button that asked it.
  useEffect(() => {
    if (pending) { asked.current = pending; keep.current?.focus() }
    else if (asked.current) { openers.current[asked.current]?.focus(); asked.current = null }
  }, [pending])

  const reset = (scenario: Scenario) => void run(async () => {
    const result = await api<Reset>('/demo/reset', 'POST', { scenario, confirm: true })
    setState(result.state); setInvites(result.invites); setPending(null)
    notify(text(SCENARIOS[scenario].done))
    if (scenario === 'fresh') window.location.hash = routeHref({ page: 'onboarding' })
  })

  return (
    <section className="card demo-note" aria-labelledby="demo-controls-title">
      <h2 id="demo-controls-title">{t('Demo controls', 'डेमो नियंत्रण')}</h2>
      <p>{t('For judging and testing only. Everything stays simulated.', 'केवल मूल्यांकन और परीक्षण के लिए। सब कुछ सिम्युलेटेड रहता है।')}</p>
      <h3>{t('Reset demo data', 'डेमो डेटा रीसेट करें')}</h3>
      {pending ? (
        <div className="confirmation">
          <p><strong>{t('Replace everything in this demo?', 'इस डेमो में सब कुछ बदल दें?')}</strong> {text(SCENARIOS[pending].explain)} {t('This demo’s current profile, places, bookings and Care Circle access are deleted.', 'इस डेमो की मौजूदा प्रोफ़ाइल, जगहें, बुकिंग और देखभाल समूह की पहुँच हटा दी जाएँगी।')}</p>
          <button className="primary wide" disabled={busy} onClick={() => reset(pending)}>{t('Yes, reset the demo', 'हाँ, डेमो रीसेट करें')}</button>
          <button ref={keep} className="secondary wide" onClick={() => setPending(null)}>{t('Keep my data', 'मेरा डेटा रहने दें')}</button>
        </div>
      ) : (
        (Object.keys(SCENARIOS) as Scenario[]).map((scenario) => (
          <button key={scenario} ref={(node) => { openers.current[scenario] = node }} className="secondary wide" disabled={busy} onClick={() => setPending(scenario)}>{text(SCENARIOS[scenario].button)}</button>
        ))
      )}
      {invites.length ? (
        <div className="invite-box">
          <p><strong>{t('To use Saathi as Asha or Ravi in this browser,', 'इस ब्राउज़र में Asha या Ravi के रूप में साथी इस्तेमाल करने के लिए,')}</strong> {t('tap their name under Switch account at the top of this page.', 'इस पेज के ऊपर खाता बदलें में उनके नाम पर टैप करें।')}</p>
          <p>{t('To show two people side by side, open a link below in a private window or on another device:', 'दो लोगों को साथ-साथ दिखाने के लिए नीचे दिया लिंक निजी विंडो में या दूसरे डिवाइस पर खोलें:')}</p>
          {invites.map((invite) => (
            <label key={invite.code} className="field"><span>{invite.name} ({text(invite.role)})</span>
              <input readOnly value={inviteLink(invite.code)} onFocus={(event) => event.target.select()} />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  )
}
