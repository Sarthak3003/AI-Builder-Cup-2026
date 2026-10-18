import { useI18n } from '../i18n'

export default function JoinScreen({ code, busy, signedIn, onJoin }: { code: string; busy: boolean; signedIn: boolean; onJoin: (code: string) => void }) {
  const { t } = useI18n()
  return (
    <section className="card" aria-labelledby="join-title">
      <p className="eyebrow">{t('CARE CIRCLE INVITATION', 'देखभाल मंडली का निमंत्रण')}</p>
      <h1 id="join-title" className="page-title">{t('Join a Care Circle', 'देखभाल मंडली में शामिल हों')}</h1>
      <p>{t('Someone you know has invited you to help them with Saathi. You will see only what they chose to share, and they can remove you at any time.', 'आपके किसी परिचित ने साथी पर मदद के लिए आपको आमंत्रित किया है। आप केवल वही देखेंगे जो वे साझा करना चाहते हैं, और वे कभी भी आपको हटा सकते हैं।')}</p>
      {signedIn ? <p className="inline-note">{t('This browser is already using Saathi. Joining switches it to the caretaker view. To keep both, open this link in a private window or another browser.', 'इस ब्राउज़र में साथी पहले से खुला है। शामिल होने पर यह देखभालकर्ता दृश्य में बदल जाएगा। दोनों रखने के लिए यह लिंक निजी विंडो या दूसरे ब्राउज़र में खोलें।')}</p> : null}
      <button className="primary wide" disabled={busy} onClick={() => onJoin(code)}>{t('Join as caretaker', 'देखभालकर्ता के रूप में शामिल हों')}</button>
      <a className="secondary wide" href="#/">{t('Not now', 'अभी नहीं')}</a>
    </section>
  )
}
