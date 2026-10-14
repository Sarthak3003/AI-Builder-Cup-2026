import { api } from '../hub'
import type { HubState, Service } from '../hub'
import ProviderBadge from '../components/ProviderBadge'
import type { Hub } from './hubType'

const groups: { service: Service; title: string; note: string }[] = [
  { service: 'ride', title: 'Rides', note: 'Saathi compares these apps when you book a ride.' },
  { service: 'food', title: 'Food', note: 'Saathi compares these apps when you order a meal.' },
  { service: 'medicine', title: 'Medicine', note: 'Only medicines already saved in your profile.' },
]

export default function AppsScreen({ hub }: { hub: Hub }) {
  const { state, busy, run, setState } = hub
  const owner = state.role === 'owner'
  const enabled = state.profile.enabled_providers

  function toggle(id: string) {
    const next = enabled.includes(id) ? enabled.filter((item) => item !== id) : [...enabled, id]
    void run(async () => { setState(await api<HubState>('/profile', 'PUT', { ...state.profile, enabled_providers: next })) })
  }

  return (
    <>
      <h1 className="page-title">Apps Saathi can use</h1>
      <section className="card demo-note" aria-labelledby="apps-honesty">
        <h2 id="apps-honesty">Demo versions only</h2>
        <p>
          These show how booking would feel with well-known apps. Saathi is not connected to the real services, nothing is booked
          or charged, and the names are only examples with no link to those companies.
        </p>
        <p className="muted">
          A real connection needs each company&rsquo;s approval and your own sign-in to that app. That part is not built yet.
        </p>
      </section>

      {groups.map((group) => (
        <section key={group.service} className="app-group" aria-labelledby={`group-${group.service}`}>
          <h2 id={`group-${group.service}`} className="section-title">{group.title}</h2>
          <p className="muted">{group.note}</p>
          <ul className="app-list">
            {state.catalogue.filter((app) => app.service === group.service).map((app) => {
              const on = enabled.includes(app.id)
              return (
                <li key={app.id} className="app-row card">
                  <div className="app-info">
                    <ProviderBadge id={app.id} name={app.name} />
                    <small className="muted">{app.blurb}</small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Use ${app.name}`}
                    className={on ? 'switch on' : 'switch'}
                    disabled={busy || !owner}
                    onClick={() => toggle(app.id)}
                  >
                    <span className="knob" />
                    <span className="sr-only">{on ? 'On' : 'Off'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {owner ? null : <p className="muted">Only the account owner can change these.</p>}
    </>
  )
}
