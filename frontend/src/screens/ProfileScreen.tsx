import { api, paymentMethodLabel } from '../hub'
import type { HubState, Profile } from '../hub'
import ProfileEditor from '../ProfileEditor'
import { InstallCard } from '../components/Banners'
import DemoControls from '../components/DemoControls'
import PersonSwitcher from '../components/PersonSwitcher'
import PhoneAccess from '../components/PhoneAccess'
import type { useInstall } from '../usePwa'
import type { Hub } from './hubType'

export default function ProfileScreen({ hub, install, onSwitch }: { hub: Hub; install: ReturnType<typeof useInstall>; onSwitch: (id: string) => void }) {
  const { state, busy, run, setState, notify } = hub

  const save = (profile: Profile) => void run(async () => {
    setState(await api<HubState>('/profile', 'PUT', profile))
    notify('Preferences saved for every service.')
  })
  const pickup = state.places?.find((place) => place.is_default_pickup)
  const method = state.profile.payment_method

  return (
    <>
      <h1 className="page-title">Your profile</h1>
      <PersonSwitcher people={state.demo_people} current={state.demo_person} busy={busy} onSwitch={onSwitch} />
      {state.onboarding ? (
        <section className="card" aria-labelledby="setup-links-title">
          <h2 id="setup-links-title">Your setup</h2>
          <p className="muted">{state.onboarding.completed ? 'Setup is finished. You can change any part of it.' : 'Setup is not finished yet. Your answers so far are saved.'}</p>
          <ul className="plain-list">
            <li><a href="#/onboarding/places">Saved places</a> · {state.places?.length ? `${state.places.length} saved, usual pickup: ${pickup?.label ?? 'none'}` : 'none yet'}</li>
            <li><a href="#/onboarding/payment">Payment (simulated)</a> · {method ? paymentMethodLabel[method] : 'not chosen'}</li>
            <li><a href="#/onboarding/accessibility">Comfort and accessibility</a></li>
            <li><a href="#/services">Demo services</a></li>
            <li><a href={state.onboarding.completed ? '#/onboarding/review' : '#/onboarding'}>{state.onboarding.completed ? 'Review everything' : 'Continue setup'}</a></li>
          </ul>
        </section>
      ) : null}
      <ProfileEditor key={JSON.stringify(state.profile)} initial={state.profile} busy={busy} save={save} />
      <PhoneAccess hub={hub} />
      <InstallCard install={install} />
      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title">Your demo session</h2>
        <p className="muted">No sign-in needed. Your profile stays in this browser session for up to 24 hours. A different browser or cleared cookies starts a separate demo.</p>
      </section>
      {state.demo_controls ? <DemoControls hub={hub} /> : null}
    </>
  )
}
