import { api, serviceOf } from '../hub'
import type { DemoService, HubState, ServiceType } from '../hub'
import type { Hub } from '../screens/hubType'
import ProviderBadge from './ProviderBadge'
import ServiceConnectionCard from './ServiceConnectionCard'

const titles: Record<ServiceType, string> = { RIDE: 'Rides', FOOD: 'Food delivery', PHARMACY: 'Pharmacy' }

// Example switches only control which sample options appear, never a provider connection.
export default function ServiceOptions({ hub, service, canReset = false }: { hub: Hub; service: DemoService; canReset?: boolean }) {
  const { state, busy, run, setState } = hub
  const enabled = state.profile.enabled_providers
  const apps = state.catalogue.filter((app) => app.service === serviceOf[service.service_type])
  const title = `options-${service.service_type}`
  const explanation = `examples-${service.service_type}`
  const toggle = (id: string) => {
    const next = enabled.includes(id) ? enabled.filter((item) => item !== id) : [...enabled, id]
    void run(async () => { setState(await api<HubState>('/profile', 'PUT', { ...state.profile, enabled_providers: next })) })
  }
  return (
    <section className="service-options" aria-labelledby={title}>
      <h2 id={title}>{titles[service.service_type]}</h2>
      <ServiceConnectionCard hub={hub} service={service} canReset={canReset} />
      {apps.length ? (
        <div className="example-options">
          <p id={explanation} className="muted"><strong>Example options only.</strong> Choose which names appear in comparisons. The full flow always runs through the {service.provider_label}, never these companies.</p>
          <ul className="example-provider-list" aria-label={`${titles[service.service_type]} example options`}>
            {apps.map((app) => (
              <li key={app.id} className="example-provider-option">
                <div className="example-provider-info">
                  <ProviderBadge id={app.id} name={app.name} demo={false} />
                  <span className="chip">Example only · not connected</span>
                </div>
                <button type="button" role="switch" aria-checked={enabled.includes(app.id)} aria-label={`Show ${app.name} example option`} aria-describedby={explanation} className={enabled.includes(app.id) ? 'switch on' : 'switch'} disabled={busy} onClick={() => toggle(app.id)}>
                  <span className="knob" />
                  <span className="sr-only">{enabled.includes(app.id) ? 'Shown' : 'Hidden'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}