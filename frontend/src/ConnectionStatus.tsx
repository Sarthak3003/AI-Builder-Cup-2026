import { useEffect, useState } from 'react'
import { useI18n } from './i18n'

type Connection =
  | { state: 'checking' }
  | { state: 'online'; version: string }
  | { state: 'offline' }

export default function ConnectionStatus() {
  const { t } = useI18n()
  const [connection, setConnection] = useState<Connection>({ state: 'checking' })
  const [attempt, setAttempt] = useState(0)

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
    <div className="connection-status">
      <p role="status" className={connection.state}>
        <span className="status-dot" aria-hidden="true" />
        {connection.state === 'checking'
          ? t('Connecting to Saathi…', 'Saathi से जुड़ रहे हैं…')
          : connection.state === 'online'
            ? t('Backend connected · v{{version}}', 'बैकएंड से जुड़ गए · v{{version}}', { version: connection.version })
            : t('Backend unavailable', 'बैकएंड उपलब्ध नहीं है')}
      </p>
      {connection.state === 'offline' ? <button className="secondary" onClick={retry}>{t('Try again', 'फिर कोशिश करें')}</button> : null}
    </div>
  )
}
