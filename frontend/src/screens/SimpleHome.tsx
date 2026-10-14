import { wordsFor } from '../copy'
import { services } from '../route'
import { setSimple } from '../simple'
import AskSaathi from '../components/AskSaathi'
import ServiceIcon from '../components/ServiceIcon'
import type { Hub } from './hubType'

export default function SimpleHome({ hub }: { hub: Hub }) {
  const words = wordsFor(hub.state.profile.language)
  return (
    <>
      <h1 className="simple-hello">{words.hello(hub.state.profile.name)}</h1>
      <AskSaathi hub={hub} simple />
      <nav className="simple-tiles" aria-label="Services">
        {services.map((service) => (
          <a key={service} className="simple-tile" href={`#/request/${service}`}>
            <ServiceIcon service={service} />
            <span>{words[service]}</span>
          </a>
        ))}
      </nav>
      <button type="button" className="secondary wide" disabled={hub.busy} onClick={() => setSimple(hub, false)}>{words.fullView}</button>
    </>
  )
}
