import { useCallback, useEffect, useRef, useState } from 'react'
import { api, serviceNames } from './hub'
import type { CareState, HubState } from './hub'
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
import CareScreen from './screens/CareScreen'
import DetailScreen from './screens/DetailScreen'
import Home from './screens/Home'
import JoinScreen from './screens/JoinScreen'
import ProfileScreen from './screens/ProfileScreen'
import RequestScreen from './screens/RequestScreen'
import SimpleHome from './screens/SimpleHome'
import type { Hub } from './screens/hubType'
import Overview from './care/Overview'
import { Approvals, CareActivity, CareDetail } from './care/CareActivity'
import { CircleSettings, Conversations, Safety } from './care/CareScreens'
import type { CareHub } from './care/careHub'
import './theme.css'
import './App.css'

const reason = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)
const POLL_MS = 8000

function pageTitle(route: Route): string {
  switch (route.page) {
    case 'request': return serviceNames[route.service]
    case 'home': return 'Home'
    case 'activity': return 'Activity'
    case 'detail': return 'Activity details'
    case 'join': return 'Join a Care Circle'
    case 'apps': return 'Apps'
    case 'family': return 'Care Circle'
    case 'profile': return 'Profile'
    case 'about': return 'About'
    case 'approvals': return 'Approvals'
    case 'conversations': return 'Conversations'
    case 'safety': return 'Safety'
    case 'circle': return 'Care Circle settings'
  }
}

export default function App() {
  const [state, setState] = useState<HubState | CareState | null>(null)
  const { busy, error, notice, run, setError, setNotice } = useRunner()
  const [route, go] = useRoute()
  const online = useOnline()
  const install = useInstall()
  const main = useRef<HTMLElement>(null)
  const firstRoute = useRef(true)
  const boot = useRef<Promise<HubState | CareState> | null>(null)

  const refresh = useCallback(async () => setState(await api<HubState | CareState>('/state')), [])
  const start = useCallback(async () => {
    try { setState(await api<HubState>('/session', 'POST', {})); setError('') } catch (failure) { setError(reason(failure, 'Cannot connect to Saathi.')) }
  }, [setError])

  useEffect(() => {
    let active = true
    boot.current ??= api<HubState | CareState>('/session', 'POST', {})
    void boot.current.then((data) => { if (active) setState(data) }).catch((failure) => { if (active) setError(reason(failure, 'Cannot connect to Saathi.')) })
    return () => { active = false }
  }, [setError])
  useEffect(() => { applyShortcut(go) }, [go])

  // Approvals and alerts made on another device show up here without a manual refresh.
  const signedIn = state !== null
  useEffect(() => {
    if (!signedIn) return
    const poll = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      api<HubState | CareState>('/state').then(setState).catch((failure) => {
        if (failure instanceof Error && /removed|revoked|expired|Invalid session/i.test(failure.message)) { setState(null); setError(failure.message) }
      })
    }
    const timer = window.setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
  }, [signedIn, setError])

  const care = state?.role === 'caregiver' ? state : null
  const owner = state?.role === 'owner' ? state : null
  const language = owner ? owner.profile.language : care?.owner.language
  useEffect(() => { document.documentElement.lang = language === 'hi-IN' ? 'hi' : 'en' }, [language])

  // Announce each screen: new title, and move keyboard and screen-reader focus to the top of the content.
  const title = pageTitle(route)
  useEffect(() => {
    document.title = `${title} · Saathi`
    if (firstRoute.current) { firstRoute.current = false; return }
    main.current?.focus()
  }, [title])

  const hub: Hub | null = owner ? { state: owner, busy, online, run, refresh, setState, notify: setNotice } : null
  const careHub: CareHub | null = care ? { state: care, busy, run, refresh, notify: setNotice } : null
  const words = wordsFor(language)
  const simple = Boolean(owner?.profile.simple)
  const alerts = owner?.events?.filter((event) => event.status === 'open' && event.severity === 'attention').length ?? 0
  const ownerTabs: Tab[] = [
    { page: 'home', label: words.home, icon: <HomeIcon /> },
    { page: 'activity', label: words.activity, icon: <ActivityIcon /> },
    { page: 'apps', label: words.apps, icon: <AppsIcon /> },
    { page: 'family', label: words.family, icon: <FamilyIcon />, badge: alerts, badgeLabel: 'needing attention' },
    { page: 'profile', label: words.profile, icon: <ProfileIcon /> },
  ]
  const careAlerts = care?.events.filter((event) => event.status === 'open' && event.kind !== 'approval_needed').length ?? 0
  const careTabs: Tab[] = [
    { page: 'home', label: 'Overview', icon: <HomeIcon /> },
    { page: 'activity', label: 'Activity', icon: <ActivityIcon /> },
    { page: 'approvals', label: 'Approvals', icon: <FamilyIcon />, badge: care?.approvals.length ?? 0 },
    { page: 'conversations', label: 'Chats', icon: <AppsIcon /> },
    { page: 'safety', label: 'Safety', icon: <ProfileIcon />, badge: careAlerts, badgeLabel: 'alerts to review' },
  ]
  const tabs = care ? careTabs : simple ? ownerTabs.slice(0, 2) : ownerTabs

  const join = (code: string) => void run(async () => {
    setState(await api<CareState>('/caregiver/join', 'POST', { code }))
    window.location.hash = '#/'
  })
  const leave = () => void run(async () => { await api('/session', 'DELETE'); setState(null); window.location.hash = '#/'; await start() })
  const switchTo = (id: string) => void run(async () => {
    setState(await api<HubState | CareState>('/demo/switch', 'POST', { to: id }))
    window.location.hash = '#/'
  })

  function ownerScreen(current: Hub) {
    const home = simple ? <SimpleHome hub={current} /> : <Home hub={current} install={install} />
    switch (route.page) {
      case 'request': return <RequestScreen key={`${route.service}/${route.proposal ?? ''}`} hub={current} service={route.service} proposalId={route.proposal} simple={simple} />
      case 'activity': return <ActivityScreen hub={current} simple={simple} />
      case 'detail': return <DetailScreen hub={current} id={route.id} />
      case 'apps': return <AppsScreen hub={current} />
      case 'family': return <CareScreen hub={current} />
      case 'profile': return <ProfileScreen hub={current} install={install} onSwitch={switchTo} />
      case 'about': return <AboutScreen hub={current} />
      default: return home
    }
  }

  function careScreen(current: CareHub) {
    switch (route.page) {
      case 'activity': return <CareActivity hub={current} />
      case 'detail': return <CareDetail hub={current} id={route.id} />
      case 'approvals': return <Approvals hub={current} />
      case 'conversations': return <Conversations hub={current} />
      case 'safety': return <Safety hub={current} />
      case 'circle': return <CircleSettings hub={current} onLeave={leave} onSwitch={switchTo} />
      default: return <Overview hub={current} />
    }
  }

  function content() {
    if (route.page === 'join') return <JoinScreen code={route.code} busy={busy} signedIn={signedIn} onJoin={join} />
    if (careHub) return careScreen(careHub)
    if (hub) return ownerScreen(hub)
    return (
      <section className="card">
        <h1 className="page-title">Your everyday companion</h1>
        <p>Opening your demo. No sign-in needed.</p>
        <button className="primary wide" disabled={busy || !online} onClick={() => void start()}>Connect</button>
      </section>
    )
  }

  return (
    <div className={`app${owner?.profile.large_text ? ' large-text' : ''}${owner?.profile.high_contrast ? ' high-contrast' : ''}${simple ? ' simple' : ''}${care ? ' care' : ''}`}>
      <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
      <div className="frame">
        <OfflineBanner online={online} />
        <header className="topbar">
          <a className="brand" href="#/" aria-label="Saathi home"><LogoMark size={34} /><span className="wordmark">saathi</span></a>
          <span className="chip demo">{care ? 'Care Circle · demo' : 'Prototype'}</span>
          {care ? <a className="avatar" href="#/circle" aria-label="Care Circle and settings">{care.grant.name.slice(0, 1)}</a> : null}
          {owner && !simple ? <a className="avatar" href="#/profile" aria-label="Open profile">{owner.profile.name.slice(0, 1)}</a> : null}
        </header>

        <main id="main" tabIndex={-1} ref={main} aria-busy={busy}>
          {error ? (
            <div className="error" role="alert">
              <p>{error}</p>
              <div className="actions">
                <button className="secondary" onClick={() => void run(state ? refresh : start)}>Retry connection</button>
                <button className="secondary" onClick={() => void run(async () => { await api('/session', 'DELETE'); setState(null); await start() })}>Start a new demo session</button>
              </div>
            </div>
          ) : null}
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          {busy ? <p className="busy" role="status">Saving your request…</p> : null}
          {content()}
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
        {state ? <BottomNav route={route} tabs={tabs} /> : null}
      </div>
    </div>
  )
}
