import { wordsFor } from '../copy'
import { setSimple } from '../simple'
import type { Hub } from '../screens/hubType'

export default function SimpleToggle({ hub }: { hub: Hub }) {
  const on = Boolean(hub.state.profile.simple)
  const label = wordsFor(hub.state.profile.language).simpleOn
  return (
    <div className="card simple-toggle">
      <span id="simple-toggle-label">{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="simple-toggle-label"
        className={on ? 'switch on' : 'switch'} disabled={hub.busy} onClick={() => setSimple(hub, !on)}>
        <span className="knob" />
      </button>
    </div>
  )
}
