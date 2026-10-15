import { api } from '../hub'
import type { HubState, Profile } from '../hub'
import ProfileEditor from '../ProfileEditor'
import { InstallCard } from '../components/Banners'
import DemoControls from '../components/DemoControls'
import type { useInstall } from '../usePwa'
import type { Hub } from './hubType'

export default function ProfileScreen({ hub, install }: { hub: Hub; install: ReturnType<typeof useInstall> }) {
  const { state, busy, run, setState, notify } = hub

  const save = (profile: Profile) => void run(async () => {
    setState(await api<HubState>('/profile', 'PUT', profile))
    notify('Preferences saved for every service.')
  })

  return (
    <>
      <h1 className="page-title">Your profile</h1>
      <ProfileEditor key={JSON.stringify(state.profile)} initial={state.profile} busy={busy} save={save} />
      <InstallCard install={install} />
      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title">Your demo session</h2>
        <p className="muted">No sign-in needed. Your profile stays in this browser session for up to 24 hours. A different browser or cleared cookies starts a separate demo.</p>
      </section>
      {state.demo_controls ? <DemoControls hub={hub} /> : null}
    </>
  )
}
