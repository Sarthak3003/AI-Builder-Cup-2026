import { useState } from 'react'
import { serviceNames, serviceTypeOf } from '../hub'
import type { Service } from '../hub'
import { wordsFor } from '../copy'
import { ChevronIcon } from '../icons'
import { services } from '../route'
import type { useInstall } from '../usePwa'
import { InstallCard } from '../components/Banners'
import AskSaathi from '../components/AskSaathi'
import ServiceIcon from '../components/ServiceIcon'
import SimpleToggle from '../components/SimpleToggle'
import type { Hub } from './hubType'

export default function Home({ hub, install }: { hub: Hub; install: ReturnType<typeof useInstall> }) {
  const { state } = hub
  const [now] = useState(() => Date.now())
  const words = wordsFor(state.profile.language)

  const appsLine = (service: Service) => {
    const connection = state.services?.find((item) => item.service_type === serviceTypeOf[service])
    if (connection && connection.status !== 'CONNECTED') return `Setup required: connect the ${connection.provider_label}`
    if (service === 'medicine') return 'Sample non-prescription items (demo)'
    const names = state.catalogue.filter((app) => app.service === service && state.profile.enabled_providers.includes(app.id)).map((app) => app.name)
    return names.length ? `${names.join(' · ')} (demo)` : 'Turn on an option in Services first'
  }
  const unfinished = (state.quotes ?? []).filter((quote) => quote.status === 'ACTIVE' && quote.expires_at * 1000 > now).at(-1)
  const flow = state.onboarding
  const next = flow?.steps.find((step) => step.id === flow.current)
  const done = flow?.steps.filter((step) => step.status !== null).length ?? 0

  return (
    <>
      <section className="hero">
        <h1>{words.hello(state.profile.name)}<span className="tagline">{words.tagline}</span></h1>
        <p className="lead">Need a ride or a meal? Ask Saathi. There is no need to call family, and you always confirm first.</p>
      </section>

      {flow && !flow.completed ? (
        <section className="card setup-card" aria-labelledby="setup-title">
          <h2 id="setup-title">Finish setting up Saathi</h2>
          <p>{done} of {flow.steps.length} steps done.{next ? ` Next: ${next.title}.` : ''} Your answers so far are saved.</p>
          <a className="primary wide" href="#/onboarding">Continue setup</a>
        </section>
      ) : null}

      <SimpleToggle hub={hub} />

      <AskSaathi hub={hub} />

      <InstallCard install={install} />

      <section aria-labelledby="services-title">
        <h2 id="services-title" className="section-title">Or choose one</h2>
        <ul className="service-list">
          {services.map((service) => (
            <li key={service}>
              <a className="service-card" href={`#/request/${service}`}>
                <ServiceIcon service={service} />
                <span className="service-text">
                  <strong>{serviceNames[service]}</strong>
                  <span className="service-apps">{appsLine(service)}</span>
                </span>
                <ChevronIcon />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {unfinished ? (
        <a className="secondary wide" href={`#/request/${unfinished.service}/${unfinished.request_id}`}>Continue your unfinished {serviceNames[unfinished.service].toLowerCase()} request</a>
      ) : null}

      <section className="card demo-note" aria-labelledby="demo-title">
        <h2 id="demo-title">A prototype, clearly marked</h2>
        <p>The services shown here are demo versions. Nothing real is booked, ordered or paid. <a href="#/services">See how the demo services work</a>.</p>
      </section>

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title" className="section-title">One conversation, every service</h2>
        {state.messages.length ? (
          state.messages.slice(-4).map((item, index) => (
            <div className={`message ${item.role}`} key={index}>
              <small>{item.role === 'user' ? 'You' : 'Saathi demo'} · {item.channel}</small>
              <p>{item.text}</p>
            </div>
          ))
        ) : (
          <p className="muted">Your requests will appear here, whichever way you ask.</p>
        )}
      </section>
    </>
  )
}
