import { useEffect, useRef, useState } from 'react'
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
  const [editing, setEditing] = useState(true)
  const summary = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (!editing) summary.current?.focus() }, [editing])

  const save = (profile: Profile) => void run(async () => {
    setState(await api<HubState>('/profile', 'PUT', profile))
    setEditing(false)
    notify(t('Preferences saved for every service.', 'हर सेवा के लिए आपकी पसंद सहेज दी गई है।'))
  })
  const pickup = state.places?.find((place) => place.is_default_pickup)
  const method = state.profile.payment_method

  return (
    <>
      <h1 className="page-title">{t('Your profile', 'आपकी प्रोफ़ाइल')}</h1>
      {<PersonSwitcher people={state.demo_people} current={state.demo_person} busy={busy} onSwitch={onSwitch} />}
      {state.onboarding ? (
        <details className="settings-group" name="profile-settings"><summary>{t('Places, payment & setup', 'जगहें, भुगतान और सेटअप')}</summary><section className="card" aria-labelledby="setup-links-title">
          <h2 id="setup-links-title">{t('Your setup', 'आपका सेटअप')}</h2>
          <p className="muted">{state.onboarding.completed ? t('Setup is finished. You can change any part of it.', 'सेटअप पूरा हो गया है। आप उसका कोई भी हिस्सा बदल सकते हैं।') : t('Setup is not finished yet. Your answers so far are saved.', 'सेटअप अभी पूरा नहीं हुआ है। अब तक के आपके जवाब सहेज दिए गए हैं।')}</p>
          <ul className="plain-list">
            <li><a href="#/onboarding/places">{t('Saved places', 'सहेजी गई जगहें')}</a> · {state.places?.length ? t('{{count}} saved, usual pickup: {{pickup}}', '{{count}} सहेजी गईं, सामान्य पिकअप: {{pickup}}', { count: state.places.length, pickup: pickup?.label ?? t('none', 'कोई नहीं') }) : t('none yet', 'अभी कोई नहीं')}</li>
            <li><a href="#/onboarding/payment">{t('Payment (simulated)', 'भुगतान (सिम्युलेटेड)')}</a> · {method ? text(paymentMethodLabel[method]) : t('not chosen', 'नहीं चुना गया')}</li>
            <li><a href="#/onboarding/accessibility">{t('Comfort and accessibility', 'सुविधा और सुलभता')}</a></li>
            <li><a href="#/services">{t('Demo services', 'डेमो सेवाएँ')}</a></li>
            <li><a href={state.onboarding.completed ? '#/onboarding/review' : '#/onboarding'}>{state.onboarding.completed ? t('Review everything', 'सब कुछ जाँचें') : t('Continue setup', 'सेटअप जारी रखें')}</a></li>
          </ul>
        </section></details>
      ) : null}
      {editing ? <ProfileEditor initial={state.profile} busy={busy} save={save} /> : (
        <section className="card preference-summary" aria-labelledby="saved-preferences-title">
          <h2 id="saved-preferences-title" ref={summary} tabIndex={-1}>{t('Preferences saved', 'पसंद सहेजी गई')}</h2>
          <p>{t('Your changes are active across Saathi.', 'आपके बदलाव साथी की सभी सेवाओं में लागू हैं।')}</p>
          <dl>
            <dt>{t('Your name', 'आपका नाम')}</dt><dd>{state.profile.name}</dd>
            <dt>{t('Preferred language', 'पसंदीदा भाषा')}</dt><dd>{state.profile.language === 'hi-IN' ? 'हिन्दी' : 'English'}</dd>
            <dt>{t('Default budget (₹)', 'सामान्य बजट (₹)')}</dt><dd>₹{state.profile.budget}</dd>
            <dt>{t('Meals', 'भोजन')}</dt><dd>{state.profile.vegetarian ? t('Vegetarian', 'शाकाहारी') : t('No vegetarian restriction', 'शाकाहारी की पाबंदी नहीं')} · {state.profile.mild ? t('Mild spice', 'कम मसाले') : t('Regular spice', 'सामान्य मसाले')}</dd>
          </dl>
          <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(true)}>{t('Edit preferences', 'पसंद बदलें')}</button>
        </section>
      )}
      <details className="settings-group" name="profile-settings"><summary>{t('Telephone access', 'फ़ोन से पहुँच')}</summary><PhoneAccess hub={hub} /></details>
      {!install.installed && (install.canInstall || install.showIosSteps) ? <details className="settings-group" name="profile-settings"><summary>{t('Install the app', 'ऐप इंस्टॉल करें')}</summary><InstallCard install={install} /></details> : null}
      {state.demo_controls ? <details className="settings-group" name="profile-settings"><summary>{t('Prototype tools', 'प्रोटोटाइप उपकरण')}</summary><DemoControls hub={hub} /></details> : null}
    </>
  )
}
