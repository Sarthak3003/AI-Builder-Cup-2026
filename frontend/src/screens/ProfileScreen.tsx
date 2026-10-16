import { api, paymentMethodLabel } from '../hub'
import type { HubState, Profile } from '../hub'
import ProfileEditor from '../ProfileEditor'
import { InstallCard } from '../components/Banners'
import DemoControls from '../components/DemoControls'
import PersonSwitcher from '../components/PersonSwitcher'
import PhoneAccess from '../components/PhoneAccess'
import type { useInstall } from '../usePwa'
import type { Hub } from './hubType'
import { useI18n } from '../i18n'

export default function ProfileScreen({ hub, install, onSwitch }: { hub: Hub; install: ReturnType<typeof useInstall>; onSwitch: (id: string) => void }) {
  const { t, text } = useI18n()
  const { state, busy, run, setState, notify } = hub

  const save = (profile: Profile) => void run(async () => {
    setState(await api<HubState>('/profile', 'PUT', profile))
    notify(t('Preferences saved for every service.', 'हर सेवा के लिए आपकी पसंद सहेज दी गई है।'))
  })
  const pickup = state.places?.find((place) => place.is_default_pickup)
  const method = state.profile.payment_method

  return (
    <>
      <h1 className="page-title">{t('Your profile', 'आपकी प्रोफ़ाइल')}</h1>
      <PersonSwitcher people={state.demo_people} current={state.demo_person} busy={busy} onSwitch={onSwitch} />
      {state.onboarding ? (
        <section className="card" aria-labelledby="setup-links-title">
          <h2 id="setup-links-title">{t('Your setup', 'आपका सेटअप')}</h2>
          <p className="muted">{state.onboarding.completed ? t('Setup is finished. You can change any part of it.', 'सेटअप पूरा हो गया है। आप उसका कोई भी हिस्सा बदल सकते हैं।') : t('Setup is not finished yet. Your answers so far are saved.', 'सेटअप अभी पूरा नहीं हुआ है। अब तक के आपके जवाब सहेज दिए गए हैं।')}</p>
          <ul className="plain-list">
            <li><a href="#/onboarding/places">{t('Saved places', 'सहेजी गई जगहें')}</a> · {state.places?.length ? t('{{count}} saved, usual pickup: {{pickup}}', '{{count}} सहेजी गईं, सामान्य पिकअप: {{pickup}}', { count: state.places.length, pickup: pickup?.label ?? t('none', 'कोई नहीं') }) : t('none yet', 'अभी कोई नहीं')}</li>
            <li><a href="#/onboarding/payment">{t('Payment (simulated)', 'भुगतान (सिम्युलेटेड)')}</a> · {method ? text(paymentMethodLabel[method]) : t('not chosen', 'नहीं चुना गया')}</li>
            <li><a href="#/onboarding/accessibility">{t('Comfort and accessibility', 'सुविधा और सुलभता')}</a></li>
            <li><a href="#/services">{t('Demo services', 'डेमो सेवाएँ')}</a></li>
            <li><a href={state.onboarding.completed ? '#/onboarding/review' : '#/onboarding'}>{state.onboarding.completed ? t('Review everything', 'सब कुछ जाँचें') : t('Continue setup', 'सेटअप जारी रखें')}</a></li>
          </ul>
        </section>
      ) : null}
      <ProfileEditor key={JSON.stringify(state.profile)} initial={state.profile} busy={busy} save={save} />
      <PhoneAccess hub={hub} />
      <InstallCard install={install} />
      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title">{t('Your demo session', 'आपका डेमो सत्र')}</h2>
        <p className="muted">{t('No sign-in needed. Your profile stays in this browser session for up to 24 hours. A different browser or cleared cookies starts a separate demo.', 'साइन-इन की ज़रूरत नहीं है। आपकी प्रोफ़ाइल इस ब्राउज़र सत्र में 24 घंटे तक रहती है। दूसरे ब्राउज़र या कुकीज़ हटाने पर अलग डेमो शुरू होता है।')}</p>
      </section>
      {state.demo_controls ? <DemoControls hub={hub} /> : null}
    </>
  )
}
