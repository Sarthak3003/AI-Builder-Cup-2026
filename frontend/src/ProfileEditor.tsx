import { useState } from 'react'
import type { Profile } from './hub'
import BookingPreference from './components/BookingPreference'
import { useI18n } from './i18n'

export default function ProfileEditor({ initial, busy, save }: { initial: Profile; busy: boolean; save: (profile: Profile) => void }) {
  const { t, setLanguage } = useI18n()
  const [draft, setDraft] = useState(initial)
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft(current => ({ ...current, [key]: value }))
  return <form className="profile-form" onSubmit={event => { event.preventDefault(); save(draft) }}>
    <div className="section-label">{t('ONE PROFILE, EVERY SERVICE', 'एक प्रोफ़ाइल, हर सेवा')}</div><h2>{t('Your preferences', 'आपकी पसंद')}</h2>
    <p>{t('Use fictional details in this prototype. Preferences carry across food, rides and medicine requests.', 'इस प्रोटोटाइप में काल्पनिक जानकारी इस्तेमाल करें। आपकी पसंद भोजन, सवारी और दवा के अनुरोधों पर लागू होती है।')}</p>
    <div className="form-grid">
      <label>{t('Your name', 'आपका नाम')}<input required maxLength={60} value={draft.name} onChange={e => update('name', e.target.value)} /></label>
      <label>{t('Preferred language', 'पसंदीदा भाषा')}<select value={draft.language} onChange={e => { const value = e.target.value as Profile['language']; update('language', value); setLanguage(value) }}><option value="en-IN">English (India)</option><option value="hi-IN">हिन्दी (भारत)</option></select></label>
      <label>{t('Default budget (₹)', 'सामान्य बजट (₹)')}<input type="number" min={0} max={10000} required value={draft.budget} onChange={e => update('budget', Number(e.target.value))} /></label>
    </div>
    <fieldset><legend>{t('Comfort and accessibility', 'सुविधा और सुलभता')}</legend>
      <label className="check"><input type="checkbox" checked={draft.large_text} onChange={e => update('large_text', e.target.checked)} />{t('Larger text', 'बड़े अक्षर')}</label>
      <label className="check"><input type="checkbox" checked={draft.high_contrast} onChange={e => update('high_contrast', e.target.checked)} />{t('High contrast', 'ज़्यादा कंट्रास्ट')}</label>
      <label className="check"><input type="checkbox" checked={draft.vegetarian} onChange={e => update('vegetarian', e.target.checked)} />{t('Vegetarian meals', 'शाकाहारी भोजन')}</label>
      <label className="check"><input type="checkbox" checked={draft.mild} onChange={e => update('mild', e.target.checked)} />{t('Mild spice', 'कम मसाले')}</label>
    </fieldset>
    <label>{t('Saved medicine labels (one per line, up to 10)', 'सहेजे गए दवा के नाम (हर पंक्ति में एक, अधिकतम 10)')}<textarea rows={3} value={draft.medicines.join('\n')} onChange={e => update('medicines', e.target.value.split('\n'))} /></label>
    <p className="muted">{t('Saved labels only. Saathi does not diagnose, suggest doses, validate prescriptions or supply medicine.', 'केवल नाम सहेजे जाते हैं। साथी बीमारी की पहचान, खुराक की सलाह, पर्चे की जाँच या दवा की आपूर्ति नहीं करता।')}</p>
    <BookingPreference showOptions={draft.show_options} onChange={(value) => update('show_options', value)} disabled={busy} />
    <fieldset><legend>{t('Caregiver approvals', 'देखभालकर्ता की मंज़ूरी')}</legend>
      <label className="check"><input type="checkbox" checked={draft.caregiver_enabled} onChange={e => update('caregiver_enabled', e.target.checked)} />{t('Require caregiver approval above my limit, and for every medicine request', 'मेरी सीमा से अधिक राशि और दवा के हर अनुरोध के लिए देखभालकर्ता की मंज़ूरी ज़रूरी हो')}</label>
      <div className="form-grid">
        <label>{t('Caregiver display name', 'देखभालकर्ता का दिखने वाला नाम')}<input maxLength={60} value={draft.caregiver_name} onChange={e => update('caregiver_name', e.target.value)} /></label>
        <label>{t('Approval limit (₹)', 'मंज़ूरी की सीमा (₹)')}<input type="number" min={0} max={10000} required value={draft.approval_limit} onChange={e => update('approval_limit', Number(e.target.value))} /></label>
      </div>
    </fieldset>
    <button className="primary" disabled={busy}>{t('Save preferences', 'पसंद सहेजें')}</button>
  </form>
}
