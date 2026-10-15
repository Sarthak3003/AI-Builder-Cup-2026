import { api, serviceOf } from '../hub'
import type { DemoService, HubState } from '../hub'
import ProviderBadge from '../components/ProviderBadge'
import ServiceConnectionCard from '../components/ServiceConnectionCard'
import type { Hub } from './hubType'

// Familiar names are only labels on simulated options; each provider card controls the real switch.
function AppToggles({ hub, service }: { hub: Hub; service: DemoService }) {
  const { state, busy, run, setState } = hub
  const enabled = state.profile.enabled_providers
  const apps = state.catalogue.filter((app) => app.service === serviceOf[service.service_type])
  if (!apps.length) return null
  const toggle = (id: string) => {
    const next = enabled.includes(id) ? enabled.filter((item) => item !== id) : [...enabled, id]
    void run(async () => { setState(await api<HubState>('/profile', 'PUT', { ...state.profile, enabled_providers: next })) })
  }
  return (
    <div className="app-group">
      <p className="muted"><strong>Options shown under familiar names.</strong> Saathi has no link to these companies; every choice is simulated by the {service.provider_label}.</p>
      <ul className="app-list">
        {apps.map((app) => {
          const on = enabled.includes(app.id)
          return (
            <li key={app.id} className="app-row">
              <ProviderBadge id={app.id} name={app.name} />
              <button type="button" role="switch" aria-checked={on} aria-label={`Use ${app.name}`} className={on ? 'switch on' : 'switch'} disabled={busy} onClick={() => toggle(app.id)}>
                <span className="knob" />
                <span className="sr-only">{on ? 'On' : 'Off'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function ServicesScreen({ hub }: { hub: Hub }) {
  const services = hub.state.services ?? []
  return (
    <>
      <h1 className="page-title">Demo services</h1>
      <section className="card demo-note" aria-labelledby="services-honesty">
        <h2 id="services-honesty">Everything here is simulated</h2>
        <p>
          Saathi uses three demo providers. Familiar names such as Uber or Swiggy appear only as example options: Saathi is not
          connected to those companies, nothing is dispatched or delivered, and no money is charged.
        </p>
        <p className="muted">A real connection would need each company&rsquo;s approval and your own sign-in. That part is not built.</p>
      </section>
      {services.map((service) => (
        <ServiceConnectionCard key={service.service_type} hub={hub} service={service} canReset>
          <AppToggles hub={hub} service={service} />
        </ServiceConnectionCard>
      ))}
    </>
  )
}
