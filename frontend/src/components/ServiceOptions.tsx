import { api, serviceOf } from '../hub'
import type { DemoService, HubState, ServiceType } from '../hub'
import type { Hub } from '../screens/hubType'
import ProviderBadge from './ProviderBadge'

const titles: Record<ServiceType, string> = { RIDE: 'Rides', FOOD: 'Food delivery', PHARMACY: 'Pharmacy' }
const ownIds: Record<ServiceType, string> = { RIDE: 'demo-ride', FOOD: 'demo-kitchen', PHARMACY: 'demo-pharmacy' }

// Every selection uses the same simulated provider, including familiar-name options.
export default function ServiceOptions({ hub, service }: { hub: Hub; service: DemoService }) {
  const { state, busy, run, setState } = hub
  const apps = state.catalogue.filter((app) => app.service === serviceOf[service.service_type])
  const title = `options-${service.service_type}`
  const connected = service.status === 'CONNECTED'
  const options = [
    { id: ownIds[service.service_type], name: service.provider_label, badge: service.provider_type, enabled: connected && service.own_option_enabled !== false },
    ...apps.map((app) => ({ ...app, badge: app.id, enabled: connected && state.profile.enabled_providers.includes(app.id) })),
  ]
  const toggle = (id: string, enabled: boolean) => void run(async () => {
    setState(await api<HubState>(`/services/${service.service_type}/options`, 'POST', { option_id: id, enabled, consent: true }))
  })
  return (
    <section className="service-options" aria-labelledby={title}>
      <h2 id={title}>{titles[service.service_type]}</h2>
      <ul className="service-option-list" aria-label={`${titles[service.service_type]} services`}>
        {options.map((option) => (
          <li key={option.id} className={`service-option-row${option.enabled ? ' selected' : ''}`}>
            <div className="service-option-info">
              <ProviderBadge id={option.badge} name={option.name} demo={false} />
              <span className="muted service-option-note">Simulated</span>
            </div>
            <button type="button" role="switch" aria-checked={option.enabled} aria-label={`Use ${option.name}`} className={option.enabled ? 'switch on' : 'switch'} disabled={busy} onClick={() => toggle(option.id, !option.enabled)}>
              <span className="knob" />
              <span className="sr-only">{option.enabled ? 'On' : 'Off'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}