import { useState } from 'react'
import { api } from '../hub'
import type { HubState, Place } from '../hub'
import type { Hub } from '../screens/hubType'
import { useI18n } from '../i18n'

const presets = ['Home', 'Doctor', 'Work', 'Other']
type Draft = { id?: string; label: string; address: string; notes: string; is_default_pickup: boolean }
const blank: Draft = { label: '', address: '', notes: '', is_default_pickup: false }

// Add, change and remove saved places. Every change is saved straight away and checked by the server.
export default function PlacesEditor({ hub }: { hub: Hub }) {
  const { t, text } = useI18n()
  const { state, busy, run, setState } = hub
  const places = state.places ?? []
  const [draft, setDraft] = useState<Draft>(places.length ? blank : { ...blank, label: 'Home' })
  const [formOpen, setFormOpen] = useState(true)
  const editing = places.find((place) => place.id === draft.id)
  const samples = (state.sample_places ?? []).filter((sample) => !places.some((place) => place.label.toLowerCase() === sample.label.toLowerCase()))
  const send = (body: Draft, after?: () => void) => void run(async () => {
    setState(await api<HubState>('/onboarding/locations', 'POST', body))
    after?.()
    hub.notify(t('Place saved. Your saved places are up to date.', 'जगह सहेजी गई। सहेजी गई जगहों की सूची अपडेट है।'))
  })
  const edit = (place: Place) => { setFormOpen(true); setDraft({ id: place.id, label: place.label, address: place.address, notes: place.notes, is_default_pickup: place.is_default_pickup }) }

  return (
    <>
      {places.length ? (
        <ul className="place-list" aria-label={t('Saved places', 'सहेजी गई जगहें')}>
          {places.map((place) => (
            <li key={place.id} className="place">
              <div className="member-head">
                <strong>{place.label}</strong>
                {place.is_default_pickup ? <span className="chip active">{t('Usual pickup', 'सामान्य पिकअप')}</span> : null}
              </div>
              <span>{place.address}</span>
              {place.notes ? <small className="muted">{place.notes}</small> : null}
              <div className="actions">
                <button type="button" className="secondary small" disabled={busy} onClick={() => edit(place)}>{t('Change {{place}}', '{{place}} बदलें', { place: place.label })}</button>
                {place.is_default_pickup ? null : (
                  <button type="button" className="secondary small" disabled={busy} onClick={() => send({ id: place.id, label: place.label, address: place.address, notes: place.notes, is_default_pickup: true })}>{t('Make {{place}} my usual pickup', '{{place}} को मेरा सामान्य पिकअप बनाएँ', { place: place.label })}</button>
                )}
                <button type="button" className="secondary small" disabled={busy} onClick={() => void run(async () => {
                  setState(await api<HubState>(`/onboarding/locations/${place.id}`, 'DELETE'))
                  if (draft.id === place.id) setDraft(blank)
                  hub.notify(t('Place removed.', 'जगह हटा दी गई।'))
                })}>{t('Remove {{place}}', '{{place}} हटाएँ', { place: place.label })}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t('No places yet. Start with your home.', 'अभी कोई जगह नहीं है। अपने घर से शुरू करें।')}</p>}

      {formOpen ? <form className="inline-form place-form" aria-labelledby="place-form-title" onSubmit={(event) => { event.preventDefault(); send(draft, () => { setDraft(blank); setFormOpen(false) }) }}>
        <fieldset className="save-fields" disabled={busy}>
        <h2 id="place-form-title" className="section-title">{editing ? t('Change {{place}}', '{{place}} बदलें', { place: editing.label }) : t('Add a place', 'जगह जोड़ें')}</h2>
        <div className="preset-row" role="group" aria-label={t('Quick names', 'तुरंत नाम चुनें')}>
          {presets.map((preset) => (
            <button key={preset} type="button" className={`chip-button${draft.label === preset ? ' on' : ''}`} aria-pressed={draft.label === preset} onClick={() => setDraft({ ...draft, label: preset })}>{text(preset)}</button>
          ))}
        </div>
        <label className="field"><span>{t('Name of the place', 'जगह का नाम')}</span>
          <input required maxLength={40} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
        </label>
        <label className="field"><span>{t('Address', 'पता')}</span>
          <input required minLength={3} maxLength={150} value={draft.address} placeholder={t('A sample address for this demo', 'इस डेमो के लिए एक उदाहरण पता')} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </label>
        <label className="field"><span>{t('Notes (optional)', 'नोट (वैकल्पिक)')}</span>
          <input maxLength={200} value={draft.notes} placeholder={t('Gate, floor or landmark', 'गेट, मंज़िल या पास की पहचान')} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={draft.is_default_pickup || !places.length} disabled={!places.length} onChange={(event) => setDraft({ ...draft, is_default_pickup: event.target.checked })} />
          {t('Use as my usual pickup', 'मेरे सामान्य पिकअप के रूप में इस्तेमाल करें')}
        </label>
        <button className="primary wide" disabled={busy}>{busy ? t('Saving place…', 'जगह सहेजी जा रही है…') : editing ? t('Save changes', 'बदलाव सहेजें') : t('Save place', 'जगह सहेजें')}</button>
        {editing ? <button type="button" className="secondary wide" onClick={() => setDraft(blank)}>{t('Cancel changes', 'बदलाव रद्द करें')}</button> : null}
        {samples.length && !editing ? (
          <div className="samples">
            <p className="muted">{t('Demo shortcut: fill in a clearly fake sample address, then save it.', 'डेमो शॉर्टकट: एक स्पष्ट रूप से काल्पनिक उदाहरण पता भरें, फिर उसे सहेजें।')}</p>
            <div className="actions">
              {samples.map((sample) => (
                <button key={sample.label} type="button" className="secondary small" onClick={() => setDraft({ ...blank, ...sample })}>{t('Use sample: {{place}}', 'उदाहरण इस्तेमाल करें: {{place}}', { place: text(sample.label) })}</button>
              ))}
            </div>
          </div>
        ) : null}
        </fieldset>
      </form> : <button type="button" className="secondary wide" disabled={busy} onClick={() => setFormOpen(true)}>{t('Add another place', 'एक और जगह जोड़ें')}</button>}
    </>
  )
}
