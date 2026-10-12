import { waitText } from '../hub'
import type { Option, Service } from '../hub'
import ProviderBadge from './ProviderBadge'

export default function OptionCard({ option, service, busy, onChoose }: { option: Option; service: Service; busy: boolean; onChoose: () => void }) {
  const label = option.provider_name ? `Choose ${option.name} from ${option.provider_name}` : `Choose ${option.name}`
  return (
    <article className="option card">
      {option.provider && option.provider_name ? <ProviderBadge id={option.provider} name={option.provider_name} /> : null}
      <h3>{option.name}</h3>
      <p className="muted">{option.detail}</p>
      <div className="option-foot">
        <div>
          <strong className="price">₹{option.price}</strong>
          {option.eta_min ? <span className="eta">{waitText(service, option.eta_min)}</span> : null}
        </div>
        <button className="secondary" disabled={busy} aria-label={label} onClick={onChoose}>Choose</button>
      </div>
    </article>
  )
}
