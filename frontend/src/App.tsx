import { useEffect, useState } from 'react'
import './App.css'

type Connection =
  | { state: 'checking' }
  | { state: 'online'; version: string }
  | { state: 'offline' }

export default function App() {
  const [connection, setConnection] = useState<Connection>({ state: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    let active = true
    async function checkConnection() {
      try {
        const responses = await Promise.all([
          fetch('/api/health', { signal: controller.signal }),
          fetch('/api/version', { signal: controller.signal }),
        ])
        if (responses.some((response) => !response.ok)) throw new Error('API unavailable')
        const [health, version] = await Promise.all(responses.map((response) => response.json()))
        if (health.status !== 'ok' || health.service !== 'saathi-api' || typeof version.version !== 'string') {
          throw new Error('Unexpected API response')
        }
        if (active) setConnection({ state: 'online', version: version.version })
      } catch {
        if (active) setConnection({ state: 'offline' })
      } finally {
        clearTimeout(timeout)
      }
    }
    void checkConnection()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  function retry() {
    setConnection({ state: 'checking' })
    setAttempt((value) => value + 1)
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header>
        <a className="brand" href="/" aria-label="Saathi home"><span className="brand-mark" aria-hidden="true">s</span>saathi<span className="brand-dot">.</span></a>
        <button className="secondary" onClick={() => setShowLogin((value) => !value)}>{showLogin ? 'Back to home' : 'Sign in'}</button>
      </header>
      <main id="main">
        <div className="eyebrow"><span aria-hidden="true" /> YOUR EVERYDAY COMPANION</div>
        <h1>A little help.<br /><span>A more independent you.</span></h1>
        <p className="intro">Everyday things should feel easy. Saathi is being built to help you get where you need to go, find a meal, and manage your essentials.</p>
        {showLogin ? (
          <section className="login-panel" aria-labelledby="login-title">
            <div className="section-label">YOUR SAATHI ACCOUNT</div>
            <h2 id="login-title">A familiar place, just for you.</h2>
            <p>Sign-in and saved profiles are coming in Phase 2. There is no need to enter your personal details yet.</p>
            <button className="secondary" onClick={() => setShowLogin(false)}>Back to home</button>
          </section>
        ) : (
          <>
            <section className="voice-panel" aria-labelledby="voice-title">
              <div><div className="section-label">START WITH A CONVERSATION</div><h2 id="voice-title">Just say what you need.</h2><p>Call, message, or use the app.<br />One companion that remembers you.</p></div>
              <div className="voice-action"><button disabled className="talk"><span aria-hidden="true">◉</span> Talk to Saathi</button><span>Voice is coming in Phase 6</span></div>
            </section>
            <section aria-labelledby="help-title">
              <div className="section-heading"><h2 id="help-title">A hand with the everyday</h2><span>Services coming in Phase 4</span></div>
              <div className="services">
                <article><span className="service-icon" aria-hidden="true">↗</span><h3>Go somewhere</h3><p>A ride to your doctor,<br />family, or anywhere else.</p><span className="soon">Rides · Coming soon</span></article>
                <article><span className="service-icon" aria-hidden="true">♧</span><h3>Find a meal</h3><p>Something comforting,<br />made for your preferences.</p><span className="soon">Food · Coming soon</span></article>
                <article><span className="service-icon" aria-hidden="true">✚</span><h3>Your essentials</h3><p>Help finding medicines<br />already saved in your profile.</p><span className="soon">Medicines · Coming soon</span></article>
              </div>
            </section>
          </>
        )}
        <section className="connection" aria-labelledby="connection-title">
          <div><h2 id="connection-title">Foundation preview</h2><p>Booking, payments, and AI conversations are not active yet.</p></div>
          <div className="connection-result">
            <p role="status" className={connection.state}>
              <span className="status-dot" aria-hidden="true" />
              {connection.state === 'checking' ? 'Connecting to Saathi…' : connection.state === 'online' ? `Backend connected · v${connection.version}` : 'Backend unavailable'}
            </p>
            {connection.state === 'offline' ? <button className="retry" onClick={retry}>Try again</button> : null}
          </div>
        </section>
      </main>
      <footer><span>Technology that adapts to you.</span><span>SAATHI · PHASE 01</span></footer>
    </div>
  )
}
