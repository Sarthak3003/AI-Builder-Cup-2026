import { useId } from 'react'
import { useI18n } from '../i18n'

type Props = { showOptions?: boolean; onChange: (showOptions: boolean) => void; disabled?: boolean }

export default function BookingPreference({ showOptions = true, onChange, disabled = false }: Props) {
  const { t } = useI18n()
  const description = useId()
  return (
    <fieldset className="choice-group" disabled={disabled} aria-describedby={description}>
      <legend>{t('When I ask for a ride or a meal', 'जब मैं सवारी या भोजन माँगूँ')}</legend>
      <label className="check check-row"><input type="radio" name="booking-choice" checked={showOptions} onChange={() => onChange(true)} />{t('Show me the options and let me confirm', 'मुझे विकल्प दिखाएँ और पुष्टि मुझसे करवाएँ')}</label>
      <label className="check check-row"><input type="radio" name="booking-choice" checked={!showOptions} onChange={() => onChange(false)} />{t('Let Saathi choose the best option and book it for me', 'साथी मेरे लिए सबसे अच्छा विकल्प चुने और बुक करे')}</label>
      <div id={description}>
        <p className="muted">{t('If you let Saathi book for you, Saathi weighs the price and the waiting time, books rides and meals straight away without asking, and opens the booking page. Medicine requests always ask first. Every booking is simulated, and you can cancel it there.', 'अगर आप साथी को अपने लिए बुक करने देते हैं, तो साथी कीमत और इंतज़ार का समय देखकर बिना पूछे सवारी और भोजन बुक करता है और बुकिंग पेज खोलता है। दवा के अनुरोध में हमेशा पहले पूछा जाता है। हर बुकिंग सिम्युलेटेड है और आप उसे उसी पेज पर रद्द कर सकते हैं।')}</p>
        <p className="muted">{t('Telephone calls always ask you to confirm. Care Circle approval rules still apply.', 'फ़ोन कॉल पर हमेशा आपसे पुष्टि माँगी जाती है। देखभाल समूह की मंज़ूरी के नियम फिर भी लागू होते हैं।')}</p>
      </div>
    </fieldset>
  )
}
