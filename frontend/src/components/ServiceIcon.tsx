import type { Service } from '../hub'
import { CarIcon, MealIcon, MedicineIcon } from '../icons'

export default function ServiceIcon({ service }: { service: Service }) {
  const Icon = service === 'ride' ? CarIcon : service === 'food' ? MealIcon : MedicineIcon
  return <span className={`service-icon svc-${service}`}><Icon /></span>
}
