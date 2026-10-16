import ServiceOptions from '../components/ServiceOptions'
import type { Hub } from './hubType'

export default function ServicesScreen({ hub }: { hub: Hub }) {
  const services = hub.state.services ?? []
  return (
    <>
      <h1 className="page-title">Your services</h1>
      <p className="lead">Choose the services Saathi can use for you.</p>
      <p className="muted service-disclaimer">All options are simulated. No real bookings, deliveries or payments.</p>
      {services.map((service) => <ServiceOptions key={service.service_type} hub={hub} service={service} />)}
    </>
  )
}
