import { useState } from 'react'
import { serviceNames, serviceTypeOf } from '../hub'
import type { Service } from '../hub'
import { wordsFor } from '../copy'
import { useI18n } from '../i18n'
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
  const { language, t, text } = useI18n()
  const [now] = useState(() => Date.now())
  const words = wordsFor(language)

  const appsLine = (service: Service) => {
    const connection = state.services?.find((item) => item.service_type === serviceTypeOf[service])
    if (connection && connection.status !== 'CONNECTED') return t('Set up service', 'सेवा सेट करें')
    return service === 'ride' ? t('Choose your destination', 'अपनी मंज़िल चुनें')
      : service === 'food' ? t('Find a meal you like', 'अपनी पसंद का भोजन चुनें')
        : t('Request everyday essentials', 'ज़रूरी चीज़ें मँगाएँ')
  }
  const unfinished = (state.quotes ?? []).filter((quote) => quote.status === 'ACTIVE' && quote.expires_at * 1000 > now).at(-1)
  const flow = state.onboarding
  const next = flow?.steps.find((step) => step.id === flow.current)
  const done = flow?.steps.filter((step) => step.status !== null).length ?? 0

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{t('YOUR EVERYDAY COMPANION', 'आपका रोज़ का साथी')}</p>
        <h1>{words.hello(state.profile.name)}</h1>
        <p className="lead">{t('What can we help you with today?', 'आज हम आपकी किस तरह मदद करें?')}</p>
      </section>

      <section className="quick-services" aria-labelledby="services-title">
        <h2 id="services-title" className="section-title">{t('What do you need?', 'आपको क्या चाहिए?')}</h2>
        <ul className="service-list">
          {services.map((service) => (
            <li key={service}>
              <a className="service-card" href={`#/request/${service}`}>
                <ServiceIcon service={service} />
                <span className="service-text">
                  <strong>{text(serviceNames[service])}</strong>
                  <span className="service-apps">{appsLine(service)}</span>
                </span>
                <ChevronIcon />
              </a>
            </li>
          ))}
        </ul>
      </section>



      <AskSaathi hub={hub} />

      {flow && !flow.completed ? (
        <section className="card setup-card" aria-labelledby="setup-title">
          <h2 id="setup-title">{t('Finish setting up Saathi', 'साथी का सेटअप पूरा करें')}</h2>
          <p>{t('{{done}} of {{total}} steps done.', '{{total}} में से {{done}} चरण पूरे हुए।', { done, total: flow.steps.length })}{next ? t(' Next: {{step}}.', ' अगला चरण: {{step}}।', { step: text(next.title) }) : ''}{t(' Your answers so far are saved.', ' आपके अब तक के जवाब सहेज लिए गए हैं।')}</p>
          <a className="primary wide" href="#/onboarding">{t('Continue setup', 'सेटअप जारी रखें')}</a>
        </section>
      ) : null}



      {unfinished ? (
        <a className="secondary wide" href={`#/request/${unfinished.service}/${unfinished.request_id}`}>{t('Continue your unfinished {{service}} request', '{{serviceHindi}} का अपना अधूरा अनुरोध जारी रखें', { service: serviceNames[unfinished.service].toLowerCase(), serviceHindi: words[unfinished.service] })}</a>
      ) : null}

      {state.messages.length ? <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title" className="section-title">{t('Recent conversation', 'हाल की बातचीत')}</h2>
        {state.messages.length ? (
          state.messages.slice(-4).map((item, index) => (
            <div className={`message ${item.role}`} key={index}>
              <small>{item.role === 'user' ? t('You', 'आप') : t('Saathi', 'साथी')} · {text(item.channel)}</small>
              <p>{item.role === 'assistant' ? text(item.text) : item.text}</p>
            </div>
          ))
        ) : (
          <p className="muted">{t('Your requests will appear here, whichever way you ask.', 'आप जैसे भी पूछें, आपके अनुरोध यहाँ दिखाई देंगे।')}</p>
        )}
      </section> : null}
      <SimpleToggle hub={hub} />
      <InstallCard install={install} />
    </>
  )
}
