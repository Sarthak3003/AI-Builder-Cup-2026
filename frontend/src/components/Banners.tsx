import type { useInstall } from '../usePwa'
import { DownloadIcon } from '../icons'

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null
  return (
    <div className="banner offline" role="status">
      You are offline. You can look around, but Saathi cannot book anything until you are back online.
    </div>
  )
}

export function InstallCard({ install }: { install: ReturnType<typeof useInstall> }) {
  if (install.installed) return null
  if (install.canInstall) {
    return (
      <section className="install card" aria-labelledby="install-title">
        <span className="install-icon"><DownloadIcon /></span>
        <div>
          <h2 id="install-title">Put Saathi on your phone</h2>
          <p>Open it like any other app, straight from your home screen.</p>
          <button className="primary" onClick={() => void install.install()}>Install Saathi</button>
        </div>
      </section>
    )
  }
  if (install.showIosSteps) {
    return (
      <section className="install card" aria-labelledby="install-title">
        <span className="install-icon"><DownloadIcon /></span>
        <div>
          <h2 id="install-title">Put Saathi on your iPhone</h2>
          <p>Tap the Share button in Safari, then choose Add to Home Screen.</p>
        </div>
      </section>
    )
  }
  return null
}
