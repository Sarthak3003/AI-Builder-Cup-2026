import ServiceOptions from '../components/ServiceOptions'
import type { Hub } from './hubType'
import { useI18n } from '../i18n'

export default function ServicesScreen({ hub }: { hub: Hub }) {
  const { t } = useI18n()
  const services = hub.state.services ?? []
  return (
    <>
      <h1 className="page-title">{t('Your services', 'आपकी सेवाएँ')}</h1>
      <p className="lead">{t('Choose the services Saathi can use for you.', 'वे सेवाएँ चुनें जिनका साथी आपके लिए इस्तेमाल कर सकता है।')}</p>
      <p className="muted service-disclaimer">{t('All options are simulated. No real bookings, deliveries or payments.', 'सभी विकल्प सिम्युलेटेड हैं। कोई असली बुकिंग, डिलीवरी या भुगतान नहीं होता।')}</p>
      {services.map((service) => <ServiceOptions key={service.service_type} hub={hub} service={service} />)}
    </>
  )
}
