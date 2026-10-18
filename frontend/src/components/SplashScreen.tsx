import { LogoMark } from '../icons'
import { useI18n } from '../i18n'

export default function SplashScreen({ welcome = false, onContinue }: { welcome?: boolean; onContinue?: () => void }) {
  const { t } = useI18n()
  return <main className="splash-screen" aria-busy={!welcome}>
    <div className="splash-welcome">
      <div className="splash-logo" aria-hidden="true"><LogoMark size={160} /></div>
      <h1>{t('saathi', 'साथी')}</h1>
      {welcome ? <>
        <p className="splash-tagline">{t('Welcome to a little more independence.', 'और आत्मनिर्भर जीवन में आपका स्वागत है।')}</p>
        <p className="splash-intro">{t('Rides, meals and everyday help. All together, with you.', 'सवारी, भोजन और रोज़मर्रा की मदद। सब एक जगह, आपके साथ।')}</p>
        <button className="primary splash-start" onClick={onContinue}>{t('Get started', 'शुरू करें')}</button>
      </> : <div className="splash-status" role="status">
        <span className="splash-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="sr-only">{t('Getting things ready for you…', 'आपके लिए सब तैयार हो रहा है…')}</span>
      </div>}
    </div>
    {welcome ? <p className="splash-signoff">{t('Your everyday companion', 'आपका रोज़मर्रा का साथी')}</p> : null}
  </main>
}
