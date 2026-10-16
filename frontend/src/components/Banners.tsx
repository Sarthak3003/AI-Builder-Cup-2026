import type { useInstall } from '../usePwa'
import { DownloadIcon } from '../icons'
import { useI18n } from '../i18n'

export function OfflineBanner({ online }: { online: boolean }) {
  const { t } = useI18n()
  if (online) return null
  return (
    <div className="banner offline" role="status">
      {t('You are offline. You can look around, but Saathi cannot book anything until you are back online.', 'आप ऑफ़लाइन हैं। आप जानकारी देख सकते हैं, लेकिन दोबारा ऑनलाइन होने तक Saathi कोई बुकिंग नहीं कर सकता।')}
    </div>
  )
}

export function InstallCard({ install }: { install: ReturnType<typeof useInstall> }) {
  const { t } = useI18n()
  if (install.installed) return null
  if (install.canInstall) {
    return (
      <section className="install card" aria-labelledby="install-title">
        <span className="install-icon"><DownloadIcon /></span>
        <div>
          <h2 id="install-title">{t('Put Saathi on your phone', 'अपने फ़ोन पर Saathi जोड़ें')}</h2>
          <p>{t('Open it like any other app, straight from your home screen.', 'इसे किसी भी दूसरे ऐप की तरह सीधे अपनी होम स्क्रीन से खोलें।')}</p>
          <button className="primary" onClick={() => void install.install()}>{t('Install Saathi', 'Saathi इंस्टॉल करें')}</button>
        </div>
      </section>
    )
  }
  if (install.showIosSteps) {
    return (
      <section className="install card" aria-labelledby="install-title">
        <span className="install-icon"><DownloadIcon /></span>
        <div>
          <h2 id="install-title">{t('Put Saathi on your iPhone', 'अपने iPhone पर Saathi जोड़ें')}</h2>
          <p>{t('Tap the Share button in Safari, then choose Add to Home Screen.', 'Safari में शेयर बटन दबाएँ, फिर होम स्क्रीन में जोड़ें चुनें।')}</p>
        </div>
      </section>
    )
  }
  return null
}
