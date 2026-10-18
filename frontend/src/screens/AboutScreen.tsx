import { useState } from 'react'
import { api } from '../hub'
import type { HubState } from '../hub'
import FoodDemo from '../FoodDemo'
import type { Hub } from './hubType'
import { useI18n } from '../i18n'

export default function AboutScreen({ hub }: { hub: Hub }) {
  const { t, text } = useI18n()
  const { state, busy, run, setState, notify } = hub
  const [resetPending, setResetPending] = useState(false)

  function exportData() {
    const blob = new Blob([JSON.stringify({ profile: state.profile, activity: state.activity, audit: state.audit }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'saathi-demo-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <p className="eyebrow">GIT SET GO</p>
      <h1 className="page-title">{t('About Saathi', 'साथी के बारे में')}</h1>
      <p>{t('Built for people who find separate service apps difficult to navigate. Team leader: Lokita Varma. Team members: Lokita Varma and Sarthak Bhan.', 'उन लोगों के लिए बनाया गया है जिन्हें अलग-अलग सेवाओं के ऐप इस्तेमाल करना मुश्किल लगता है। टीम लीडर: Lokita Varma। टीम सदस्य: Lokita Varma और Sarthak Bhan।')}</p>

      <section className="card">
        <h2>{t('What you can try', 'आप क्या आज़मा सकते हैं')}</h2>
        <ul className="plain-list">
          <li>{t('Set up Saathi once: your name, comfort settings, saved places, Care Circle, demo services and how simulated payments work.', 'साथी का एक बार सेटअप करें: अपना नाम, सुविधा की सेटिंग, सहेजी हुई जगहें, देखभाल समूह, डेमो सेवाएँ और सिम्युलेटेड भुगतान का तरीका।')}</li>
          <li>{t('Ask for a ride, a meal or everyday pharmacy items, by typing or speaking, instead of calling family.', 'परिवार को फ़ोन करने के बजाय टाइप करके या बोलकर सवारी, खाना या फ़ार्मेसी की रोज़मर्रा की चीज़ें माँगें।')}</li>
          <li>{t('See a server price with every line explained, then confirm. Saathi books only after your clear yes, or, if you choose it in Profile, picks and books the best ride or meal for you.', 'सर्वर से आई कीमत और हर शुल्क का विवरण देखें, फिर पुष्टि करें। साथी आपकी स्पष्ट हाँ के बाद ही बुक करता है। अगर आप प्रोफ़ाइल में चुनें, तो यह आपके लिए सबसे अच्छी सवारी या भोजन चुनकर बुक करता है।')}</li>
          <li>{t('Book with Saathi’s own Demo Ride or Saathi Demo Kitchen, or compare example options shown under familiar names: Uber, Ola and Rapido for rides; Uber Eats, Swiggy and Zomato for food.', 'साथी की अपनी डेमो सवारी या साथी डेमो रसोई से बुक करें, या परिचित नामों के तहत दिखाए गए उदाहरण विकल्पों की तुलना करें: सवारी के लिए Uber, Ola और Rapido; भोजन के लिए Uber Eats, Swiggy और Zomato।')}</li>
          <li>{t('Invite a family member who can see shared activity, or also approve larger bookings. They cannot book or pay for you.', 'परिवार के किसी सदस्य को आमंत्रित करें जो साझा गतिविधि देख सके या बड़ी बुकिंग को मंज़ूरी भी दे सके। वे आपके लिए बुकिंग या भुगतान नहीं कर सकते।')}</li>
          <li>{t('Larger text, high contrast, read aloud, Hindi labels, and install on your home screen.', 'बड़ा टेक्स्ट, अधिक कंट्रास्ट, बोलकर पढ़ना, हिंदी लेबल और होम स्क्रीन पर इंस्टॉल करने की सुविधा।')}</li>
        </ul>
      </section>

      <section className="card demo-note">
        <h2>{t('What is simulated', 'क्या सिर्फ़ डेमो है')}</h2>
        <p>{t('Every booking is made by one of Saathi’s demo providers: the Demo Ride Provider, the Demo Food Provider or the Demo Pharmacy Provider. Prices, times and booking references such as DEMO-RIDE-1042 are samples. No driver comes, no food or medicine is delivered and no money moves.', 'हर बुकिंग साथी के किसी डेमो प्रदाता से होती है: डेमो सवारी प्रदाता, डेमो भोजन प्रदाता या डेमो फ़ार्मेसी प्रदाता। कीमतें, समय और DEMO-RIDE-1042 जैसे बुकिंग संदर्भ सिर्फ़ नमूने हैं। कोई ड्राइवर नहीं आता, खाना या दवा नहीं पहुँचती और पैसे का लेन-देन नहीं होता।')}</p>
        <p>{t('Names such as Uber or Swiggy are only labels on demo options. No account with those companies is used and Saathi has no link to them. The demo pharmacy has sample non-prescription items only.', 'Uber या Swiggy जैसे नाम डेमो विकल्पों पर सिर्फ़ लेबल हैं। उन कंपनियों के किसी खाते का इस्तेमाल नहीं होता और साथी का उनसे कोई संबंध नहीं है। डेमो फ़ार्मेसी में केवल बिना पर्चे के मिलने वाली चीज़ों के नमूने हैं।')}</p>
        <p>{t('Saathi never asks for card numbers, UPI PINs, OTPs or bank logins.', 'साथी कभी कार्ड नंबर, यूपीआई पिन, ओटीपी या बैंक लॉगिन नहीं माँगता।')}</p>
      </section>

      <section className="card">
        <h2>{t('What is still an integration', 'किन सुविधाओं का जुड़ना अभी बाकी है')}</h2>
        <p>{t('Twilio telephone-call endpoints are implemented but a live call has not yet been verified. Calling needs server credentials and an approved number; pair from Profile when enabled. WhatsApp and SMS are not connected. Message mode is an in-app preview.', 'Twilio फ़ोन कॉल एंडपॉइंट लागू किए गए हैं, लेकिन वास्तविक कॉल की जाँच अभी नहीं हुई है। कॉल के लिए सर्वर क्रेडेंशियल और स्वीकृत नंबर चाहिए; सुविधा चालू होने पर प्रोफ़ाइल से जोड़ें। WhatsApp और SMS जुड़े नहीं हैं। संदेश मोड ऐप के अंदर का पूर्वावलोकन है।')}</p>
        <p>{t('Understanding requests: ', 'अनुरोध समझना: ')}<strong>{state.gemini ? t('Gemini. Microphone recordings are sent to Google to be understood.', 'Gemini। अनुरोध समझने के लिए माइक्रोफ़ोन की रिकॉर्डिंग Google को भेजी जाती है।') : t('simple word matching on this server (not AI). Speech is turned into text by your browser.', 'इस सर्वर पर साधारण शब्द मिलान (AI नहीं)। आपका ब्राउज़र आवाज़ को टेक्स्ट में बदलता है।')}</strong></p>
        <p>{t('Storage: ', 'डेटा संग्रह: ')}<strong>{text(state.storage)}</strong>{t('. Default local storage persists on this computer. Firestore emulator mode is available.', '। डिफ़ॉल्ट स्थानीय डेटा इस कंप्यूटर पर सहेजा रहता है। Firestore एमुलेटर मोड उपलब्ध है।')}</p>
        <details>
          <summary>{t('Optional Gemini food integration', 'वैकल्पिक Gemini भोजन सुविधा')}</summary>
          <p>{t('This separate adapter requires a server API key and Firestore emulator. Its live behaviour has not been tested.', 'इस अलग एडाप्टर के लिए सर्वर API कुंजी और Firestore एमुलेटर चाहिए। वास्तविक उपयोग में इसकी जाँच नहीं हुई है।')}</p>
          <FoodDemo />
        </details>
      </section>

      <section className="card">
        <h2>{t('Your demo data', 'आपका डेमो डेटा')}</h2>
        <button className="secondary wide" onClick={exportData}>{t('Export my demo data', 'मेरा डेमो डेटा डाउनलोड करें')}</button>
        {state.role === 'owner' ? <button className="secondary wide" onClick={() => setResetPending(true)}>{t('Delete my data', 'मेरा डेटा हटाएँ')}</button> : null}
        {resetPending ? (
          <div className="confirmation">
            <p>{t('Delete this profile, its activity and everyone’s Care Circle access? This cannot be undone.', 'यह प्रोफ़ाइल, इसकी गतिविधि और सभी की देखभाल समूह तक पहुँच हटाएँ? इसे वापस नहीं लाया जा सकता।')}</p>
            <button className="primary wide" disabled={busy}
              onClick={() => void run(async () => { setState(await api<HubState>('/data', 'DELETE')); setResetPending(false); notify(t('Your data was deleted.', 'आपका डेटा हटा दिया गया।')) })}>
              {t('Yes, delete my data', 'हाँ, मेरा डेटा हटाएँ')}
            </button>
            <button className="secondary wide" onClick={() => setResetPending(false)}>{t('Keep my data', 'मेरा डेटा रखें')}</button>
          </div>
        ) : null}
      </section>
    </>
  )
}
