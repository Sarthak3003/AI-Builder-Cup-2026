import { useState } from 'react'
import { api } from '../hub'
import type { HubState, Place } from '../hub'
import type { Hub } from '../screens/hubType'

const presets = ['Home', 'Doctor', 'Work', 'Other']
type Draft = { id?: string; label: string; address: string; notes: string; is_default_pickup: boolean }
const blank: Draft = { label: '', address: '', notes: '', is_default_pickup: false }

// Add, change and remove saved places. Every change is saved straight away and checked by the server.
export default function PlacesEditor({ hub }: { hub: Hub }) {
  const { state, busy, run, setState } = hub
  const places = state.places ?? []
  const [draft, setDraft] = useState<Draft>(places.length ? blank : { ...blank, label: 'Home' })
  const editing = places.find((place) => place.id === draft.id)
  const samples = (state.sample_places ?? []).filter((sample) => !places.some((place) => place.label.toLowerCase() === sample.label.toLowerCase()))
  const send = (body: Draft, after?: () => void) => void run(async () => {
    setState(await api<HubState>('/onboarding/locations', 'POST', body))
    after?.()
  })
  const edit = (place: Place) => setDraft({ id: place.id, label: place.label, address: place.address, notes: place.notes, is_default_pickup: place.is_default_pickup })

  return (
    <>
      {places.length ? (
        <ul className="place-list" aria-label="Saved places">
          {places.map((place) => (
            <li key={place.id} className="place">
              <div className="member-head">
                <strong>{place.label}</strong>
                {place.is_default_pickup ? <span className="chip active">Usual pickup</span> : null}
              </div>
              <span>{place.address}</span>
              {place.notes ? <small className="muted">{place.notes}</small> : null}
              <div className="actions">
                <button type="button" className="secondary small" disabled={busy} onClick={() => edit(place)}>Change {place.label}</button>
                {place.is_default_pickup ? null : (
                  <button type="button" className="secondary small" disabled={busy} onClick={() => send({ id: place.id, label: place.label, address: place.address, notes: place.notes, is_default_pickup: true })}>Make {place.label} my usual pickup</button>
                )}
                <button type="button" className="secondary small" disabled={busy} onClick={() => void run(async () => {
                  setState(await api<HubState>(`/onboarding/locations/${place.id}`, 'DELETE'))
                  if (draft.id === place.id) setDraft(blank)
                })}>Remove {place.label}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No places yet. Start with your home.</p>}

      <form className="inline-form place-form" aria-labelledby="place-form-title" onSubmit={(event) => { event.preventDefault(); send(draft, () => setDraft(blank)) }}>
        <h2 id="place-form-title" className="section-title">{editing ? `Change ${editing.label}` : 'Add a place'}</h2>
        <div className="preset-row" role="group" aria-label="Quick names">
          {presets.map((preset) => (
            <button key={preset} type="button" className={`chip-button${draft.label === preset ? ' on' : ''}`} aria-pressed={draft.label === preset} onClick={() => setDraft({ ...draft, label: preset })}>{preset}</button>
          ))}
        </div>
        <label className="field"><span>Name of the place</span>
          <input required maxLength={40} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
        </label>
        <label className="field"><span>Address</span>
          <input required minLength={3} maxLength={150} value={draft.address} placeholder="A sample address for this demo" onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </label>
        <label className="field"><span>Notes (optional)</span>
          <input maxLength={200} value={draft.notes} placeholder="Gate, floor or landmark" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={draft.is_default_pickup || !places.length} disabled={!places.length} onChange={(event) => setDraft({ ...draft, is_default_pickup: event.target.checked })} />
          Use as my usual pickup
        </label>
        <button className="primary wide" disabled={busy}>{editing ? 'Save changes' : 'Save place'}</button>
        {editing ? <button type="button" className="secondary wide" onClick={() => setDraft(blank)}>Cancel changes</button> : null}
        {samples.length && !editing ? (
          <div className="samples">
            <p className="muted">Demo shortcut: fill in a clearly fake sample address, then save it.</p>
            <div className="actions">
              {samples.map((sample) => (
                <button key={sample.label} type="button" className="secondary small" onClick={() => setDraft({ ...blank, ...sample })}>Use sample: {sample.label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </>
  )
}
