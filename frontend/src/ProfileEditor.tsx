import { useState } from 'react'
import type { Profile } from './hub'

export default function ProfileEditor({ initial, busy, save }: { initial: Profile; busy: boolean; save: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(initial)
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft(current => ({ ...current, [key]: value }))
  return <form className="profile-form" onSubmit={event => { event.preventDefault(); save(draft) }}>
    <div className="section-label">ONE PROFILE, EVERY SERVICE</div><h2>Your preferences</h2>
    <p>Use fictional details in this prototype. Preferences carry across food, rides and medicine requests.</p>
    <div className="form-grid">
      <label>Your name<input required maxLength={60} value={draft.name} onChange={e => update('name', e.target.value)} /></label>
      <label>Voice language<select value={draft.language} onChange={e => update('language', e.target.value as Profile['language'])}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi (India)</option></select></label>
      <label>Default budget (₹)<input type="number" min={0} max={10000} required value={draft.budget} onChange={e => update('budget', Number(e.target.value))} /></label>
    </div>
    <fieldset><legend>Comfort and accessibility</legend>
      <label className="check"><input type="checkbox" checked={draft.large_text} onChange={e => update('large_text', e.target.checked)} />Larger text</label>
      <label className="check"><input type="checkbox" checked={draft.high_contrast} onChange={e => update('high_contrast', e.target.checked)} />High contrast</label>
      <label className="check"><input type="checkbox" checked={draft.vegetarian} onChange={e => update('vegetarian', e.target.checked)} />Vegetarian meals</label>
      <label className="check"><input type="checkbox" checked={draft.mild} onChange={e => update('mild', e.target.checked)} />Mild spice</label>
    </fieldset>
    <label>Saved medicine labels (one per line, up to 10)<textarea rows={3} value={draft.medicines.join('\n')} onChange={e => update('medicines', e.target.value.split('\n'))} /></label>
    <p className="muted">Saved labels only. Saathi does not diagnose, suggest doses, validate prescriptions or supply medicine.</p>
    <fieldset><legend>When I ask for a ride or a meal</legend>
      <label className="check"><input type="radio" name="choice" checked={draft.show_options !== false} onChange={() => update('show_options', true)} />Show me the options and let me confirm</label>
      <label className="check"><input type="radio" name="choice" checked={draft.show_options === false} onChange={() => update('show_options', false)} />Let Saathi choose the best option and book it for me</label>
      <p className="muted">Saathi weighs the price and the waiting time, books rides and meals straight away without asking, and opens the booking page. Medicine requests always ask first. Every booking is simulated, and you can cancel it there.</p>
    </fieldset>
    <fieldset><legend>Caregiver approvals</legend>
      <label className="check"><input type="checkbox" checked={draft.caregiver_enabled} onChange={e => update('caregiver_enabled', e.target.checked)} />Require caregiver approval above my limit, and for every medicine request</label>
      <div className="form-grid">
        <label>Caregiver display name<input maxLength={60} value={draft.caregiver_name} onChange={e => update('caregiver_name', e.target.value)} /></label>
        <label>Approval limit (₹)<input type="number" min={0} max={10000} required value={draft.approval_limit} onChange={e => update('approval_limit', Number(e.target.value))} /></label>
      </div>
    </fieldset>
    <button className="primary" disabled={busy}>Save preferences</button>
  </form>
}
