import { api } from '../hub'
import type { HubState, Profile } from '../hub'
import { firebaseConfigured, signIn } from '../firebase'
import ProfileEditor from '../ProfileEditor'
import { InstallCard } from '../components/Banners'
import type { useInstall } from '../usePwa'
import type { Hub } from './hubType'

export default function ProfileScreen({ hub, install }: { hub: Hub; install: ReturnType<typeof useInstall> }) {
  const { state, busy, run, setState, notify } = hub
  if (state.role !== 'owner') return <p>Only the owner can edit this shared profile.</p>

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
        <h2 id="account-title">Account</h2>
        {firebaseConfigured ? (
          <button className="secondary wide" disabled={busy}
            onClick={() => void run(async () => { setState(await signIn()); window.location.hash = '#/' })}>
            Sign in with Google
          </button>
        ) : (
          <p className="muted">Google sign-in needs project setup and is not configured in this demo. Local demo sessions work without it.</p>
        )}
      </section>
    </>
  )
}
