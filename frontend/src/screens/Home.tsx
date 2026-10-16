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
    if (connection && connection.status !== 'CONNECTED') return connection.own_option_enabled === false
      ? t('Setup required: connect this service in Services', 'सेटअप ज़रूरी है: सेवाओं में यह सेवा जोड़ें')
      : t('Setup required: connect the {{provider}}', 'सेटअप ज़रूरी है: {{provider}} जोड़ें', { provider: text(connection.provider_label) })
    if (service === 'medicine') return t('Sample non-prescription items (demo)', 'बिना पर्चे मिलने वाली चीज़ों के नमूने (डेमो)')
    const names = [connection?.own_option_enabled === false ? undefined : text(connection?.provider_label), ...state.catalogue.filter((app) => app.service === service && state.profile.enabled_providers.includes(app.id)).map((app) => app.name)].filter(Boolean)
    return names.length ? t('{{providers}} (demo)', '{{providers}} (डेमो)', { providers: names.join(' · ') }) : t('Turn on an option in Services first', 'पहले सेवाओं में कोई विकल्प चालू करें')
  }
  const unfinished = (state.quotes ?? []).filter((quote) => quote.status === 'ACTIVE' && quote.expires_at * 1000 > now).at(-1)
  const flow = state.onboarding
  const next = flow?.steps.find((step) => step.id === flow.current)
  const done = flow?.steps.filter((step) => step.status !== null).length ?? 0

  return (
    <>
      <section className="hero">
        <h1>{words.hello(state.profile.name)}<span className="tagline">{words.tagline}</span></h1>
        <p className="lead">{state.profile.show_options === false
          ? t('Need a ride or a meal? Ask Saathi. There is no need to call family, and Saathi books the best option for you.', 'सवारी या खाना चाहिए? साथी से पूछें। परिवार को फ़ोन करने की ज़रूरत नहीं है, और साथी आपके लिए सबसे अच्छा विकल्प बुक कर देता है।')
          : t('Need a ride or a meal? Ask Saathi. There is no need to call family, and you always confirm first.', 'सवारी या खाना चाहिए? साथी से पूछें। परिवार को फ़ोन करने की ज़रूरत नहीं है, और बुकिंग से पहले हमेशा आप पुष्टि करते हैं।')}</p>
      </section>

      {flow && !flow.completed ? (
        <section className="card setup-card" aria-labelledby="setup-title">
          <h2 id="setup-title">{t('Finish setting up Saathi', 'साथी का सेटअप पूरा करें')}</h2>
          <p>{t('{{done}} of {{total}} steps done.', '{{total}} में से {{done}} चरण पूरे हुए।', { done, total: flow.steps.length })}{next ? t(' Next: {{step}}.', ' अगला चरण: {{step}}।', { step: text(next.title) }) : ''}{t(' Your answers so far are saved.', ' आपके अब तक के जवाब सहेज लिए गए हैं।')}</p>
          <a className="primary wide" href="#/onboarding">{t('Continue setup', 'सेटअप जारी रखें')}</a>
        </section>
      ) : null}

      <SimpleToggle hub={hub} />

      <AskSaathi hub={hub} />

      <InstallCard install={install} />

      <section aria-labelledby="services-title">
        <h2 id="services-title" className="section-title">{t('Or choose one', 'या कोई सेवा चुनें')}</h2>
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

      {unfinished ? (
        <a className="secondary wide" href={`#/request/${unfinished.service}/${unfinished.request_id}`}>{t('Continue your unfinished {{service}} request', '{{serviceHindi}} का अपना अधूरा अनुरोध जारी रखें', { service: serviceNames[unfinished.service].toLowerCase(), serviceHindi: words[unfinished.service] })}</a>
      ) : null}

      <section className="card demo-note" aria-labelledby="demo-title">
        <h2 id="demo-title">{t('A prototype, clearly marked', 'स्पष्ट रूप से चिह्नित प्रोटोटाइप')}</h2>
        <p>{t('The services shown here are demo versions. Nothing real is booked, ordered or paid.', 'यहाँ दिखाई गई सेवाएँ डेमो हैं। कोई असली बुकिंग, ऑर्डर या भुगतान नहीं होता।')} <a href="#/services">{t('See how the demo services work', 'जानें कि डेमो सेवाएँ कैसे काम करती हैं')}</a>{t('.', '।')}</p>
      </section>

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title" className="section-title">{t('One conversation, every service', 'एक बातचीत, हर सेवा')}</h2>
        {state.messages.length ? (
          state.messages.slice(-4).map((item, index) => (
            <div className={`message ${item.role}`} key={index}>
              <small>{item.role === 'user' ? t('You', 'आप') : t('Saathi demo', 'साथी डेमो')} · {text(item.channel)}</small>
              <p>{item.role === 'assistant' ? text(item.text) : item.text}</p>
            </div>
          ))
        ) : (
          <p className="muted">{t('Your requests will appear here, whichever way you ask.', 'आप जैसे भी पूछें, आपके अनुरोध यहाँ दिखाई देंगे।')}</p>
        )}
      </section>
    </>
  )
}
