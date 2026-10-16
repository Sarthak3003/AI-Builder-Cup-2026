import ServiceOptions from '../components/ServiceOptions'
import type { Hub } from './hubType'

export default function ServicesScreen({ hub }: { hub: Hub }) {
  const services = hub.state.services ?? []
  return (
    <>
      <h1 className="page-title">Demo services</h1>
      <section className="card demo-note" aria-labelledby="services-honesty">
        <h2 id="services-honesty">Everything here is simulated</h2>
        <p>
          Demo providers run every booking from start to finish. Familiar names such as Uber or Swiggy appear only as example options: Saathi is not
          connected to those companies, nothing is dispatched or delivered, and no money is charged.
        </p>
      </section>
      {services.map((service) => <ServiceOptions key={service.service_type} hub={hub} service={service} canReset />)}
    </>
  )
}
