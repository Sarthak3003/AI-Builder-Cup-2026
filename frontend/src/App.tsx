import { useCallback, useEffect, useRef, useState } from 'react'
import { api, serviceNames } from './hub'
import type { HubState } from './hub'
import { wordsFor } from './copy'
import { applyShortcut, useRoute } from './route'
import type { Route } from './route'
import { useInstall, useOnline } from './usePwa'
import { useRunner } from './useRunner'
import { ActivityIcon, AppsIcon, FamilyIcon, HomeIcon, LogoMark, ProfileIcon } from './icons'
import BottomNav from './components/BottomNav'
import type { Tab } from './components/BottomNav'
import { OfflineBanner } from './components/Banners'
import ConnectionStatus from './ConnectionStatus'
import ActivityScreen from './screens/ActivityScreen'
import AboutScreen from './screens/AboutScreen'
import AppsScreen from './screens/AppsScreen'
import FamilyScreen from './screens/FamilyScreen'
import Home from './screens/Home'
import ProfileScreen from './screens/ProfileScreen'
import RequestScreen from './screens/RequestScreen'
import SimpleHome from './screens/SimpleHome'
import type { Hub } from './screens/hubType'
import './theme.css'
import './App.css'

const reason = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

function pageTitle(route: Route): string {
  switch (route.page) {
    case 'request': return serviceNames[route.service]
    case 'home': return 'Home'
    case 'activity': return 'Activity'
    case 'apps': return 'Apps'
    case 'family': return 'Family'
    case 'profile': return 'Profile'
    case 'about': return 'About'
  }
}

export default function App() {
  const [state, setState] = useState<HubState | null>(null)
  const { busy, error, notice, run, setError, setNotice } = useRunner()
  const [route, go] = useRoute()
  const online = useOnline()
  const install = useInstall()
  const main = useRef<HTMLElement>(null)
  const firstRoute = useRef(true)
  const boot = useRef<Promise<HubState> | null>(null)

  const refresh = useCallback(async () => setState(await api<HubState>('/state')), [])
  const start = useCallback(async () => {
    try { setState(await api<HubState>('/session', 'POST', {})); setError('') } catch (failure) { setError(reason(failure, 'Cannot connect to Saathi.')) }
  }, [setError])

  useEffect(() => {
    let active = true
    boot.current ??= api<HubState>('/session', 'POST', {})
    void boot.current.then((data) => { if (active) setState(data) }).catch((failure) => { if (active) setError(reason(failure, 'Cannot connect to Saathi.')) })
    return () => { active = false }
  }, [setError])
  useEffect(() => { applyShortcut(go) }, [go])

  const language = state?.profile.language
  useEffect(() => { document.documentElement.lang = language === 'hi-IN' ? 'hi' : 'en' }, [language])

  // Announce each screen: new title, and move keyboard and screen-reader focus to the top of the content.
  const title = pageTitle(route)
  useEffect(() => {
    document.title = `${title} · Saathi`
    if (firstRoute.current) { firstRoute.current = false; return }
    main.current?.focus()
  }, [title])

  const hub: Hub | null = state ? { state, busy, online, run, refresh, setState, notify: setNotice } : null
  const words = wordsFor(language)
  const simple = Boolean(state?.profile.simple) && state?.role === 'owner'
  const pending = state?.activity.filter((item) => item.status === 'awaiting_approval').length ?? 0
  const allTabs: Tab[] = [
    { page: 'home', label: words.home, icon: <HomeIcon /> },
    { page: 'activity', label: words.activity, icon: <ActivityIcon /> },
    { page: 'apps', label: words.apps, icon: <AppsIcon /> },
    { page: 'family', label: words.family, icon: <FamilyIcon />, badge: pending },
    { page: 'profile', label: words.profile, icon: <ProfileIcon /> },
  ]
  const tabs = simple ? allTabs.slice(0, 2) : allTabs

  function screen(current: Hub) {
    const home = simple ? <SimpleHome hub={current} /> : <Home hub={current} install={install} />
    switch (route.page) {
      case 'request': return current.state.role === 'owner' ? <RequestScreen key={`${route.service}/${route.proposal ?? ''}`} hub={current} service={route.service} proposalId={route.proposal} simple={simple} /> : home
      case 'activity': return <ActivityScreen hub={current} simple={simple} />
      case 'apps': return <AppsScreen hub={current} />
      case 'family': return <FamilyScreen hub={current} />
      case 'profile': return <ProfileScreen hub={current} install={install} />
      case 'about': return <AboutScreen hub={current} />
      default: return home
    }
  }

  return (
    <div className={`app${state?.profile.large_text ? ' large-text' : ''}${state?.profile.high_contrast ? ' high-contrast' : ''}${simple ? ' simple' : ''}`}>
      <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
      <div className="frame">
        <OfflineBanner online={online} />
        <header className="topbar">
          <a className="brand" href="#/" aria-label="Saathi home"><LogoMark size={34} /><span className="wordmark">saathi</span></a>
          <span className="chip demo">Prototype</span>
          {simple ? null : <a className="avatar" href="#/profile" aria-label="Open profile">{state?.profile.name.slice(0, 1) ?? 'S'}</a>}
        </header>

        <main id="main" tabIndex={-1} ref={main} aria-busy={busy}>
          {error ? (
            <div className="error" role="alert">
              <p>{error}</p>
              <div className="actions">
                <button className="secondary" onClick={() => void run(refresh)}>Retry connection</button>
                <button className="secondary" onClick={() => void run(async () => { await api('/session', 'DELETE'); setState(null); await start() })}>Start a new demo session</button>
              </div>
            </div>
          ) : null}
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          {busy ? <p className="busy" role="status">Saving your request…</p> : null}
          {hub ? screen(hub) : (
            <section className="card">
              <h1 className="page-title">Your everyday companion</h1>
              <p>Connecting to your local Saathi profile…</p>
              <button className="primary wide" onClick={() => void start()}>Connect</button>
            </section>
          )}
        </main>

        <footer className="footnote">
          {simple ? <p>{words.notEmergency}</p> : (
            <>
              <ConnectionStatus />
              <p>Saathi cannot respond to emergencies. Contact local emergency services directly.</p>
              <a href="#/about">About this demo</a>
            </>
          )}
        </footer>
        {hub ? <BottomNav route={route} tabs={tabs} /> : null}
      </div>
    </div>
  )
}
