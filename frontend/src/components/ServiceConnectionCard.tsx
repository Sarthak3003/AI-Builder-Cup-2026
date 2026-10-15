import type { ReactNode } from 'react'
import { api, connectionLabel, formatWhen } from '../hub'
import type { DemoService, HubState } from '../hub'
import type { Hub } from '../screens/hubType'

// One card per demo provider. Connecting stores a simulated connection, never a real account or login.
export default function ServiceConnectionCard({ hub, service, canReset = false, children }: { hub: Hub; service: DemoService; canReset?: boolean; children?: ReactNode }) {
  const { busy, run, setState } = hub
  const connected = service.status === 'CONNECTED'
  const title = `service-${service.service_type}`
  const call = (action: string, body?: unknown) => void run(async () => {
    setState(await api<HubState>(`/services/${service.service_type}/${action}`, 'POST', body))
  })
  return (
    <section className={`card service-connection${connected ? ' connected' : ''}`} aria-labelledby={title}>
      <div className="member-head">
        <h3 id={title}>{service.provider_label}</h3>
        <span className="chip demo">Demo mode</span>
        <span className={`chip ${connected ? 'active' : 'invited'}`}>{connectionLabel[service.status]}</span>
      </div>
      <p className="inline-note">{service.notice}</p>
      <p className="muted">{service.description}</p>
      <ul className="perm-list" aria-label={`What the ${service.provider_label} can do`}>
        {service.capabilities.map((capability) => <li key={capability.id}>{capability.label}</li>)}
      </ul>
      {connected && service.consent_at ? (
        <p className="muted">Connected {formatWhen(service.consent_at)}. Saathi may get sample prices and make simulated bookings here.</p>
      ) : (
        <p className="muted">Connecting lets Saathi get sample prices and make simulated bookings with this demo provider. There is no sign-in, password or real account.</p>
      )}
      {children}
      <div className="actions">
        {connected ? (
          <button type="button" className="secondary" disabled={busy} onClick={() => call('disconnect')}>Disconnect {service.provider_label}</button>
        ) : (
          <button type="button" className="primary" disabled={busy} onClick={() => call('connect-demo', { consent: true })}>Connect {service.provider_label}</button>
        )}
        {canReset && service.status !== 'SETUP_REQUIRED' ? (
          <button type="button" className="secondary" disabled={busy} onClick={() => call('reset')}>Reset this demo setup</button>
        ) : null}
      </div>
    </section>
  )
}
