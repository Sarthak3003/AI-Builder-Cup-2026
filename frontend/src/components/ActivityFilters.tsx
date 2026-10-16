import type { Filters } from '../filters'
import { useI18n } from '../i18n'

export default function ActivityFilters({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  const { t } = useI18n()
  return (
    <fieldset className="filters">
      <legend className="sr-only">{t('Filter activity', 'गतिविधि फ़िल्टर करें')}</legend>
      <label className="field"><span>{t('Type', 'प्रकार')}</span>
        <select value={filters.service} onChange={(event) => onChange({ ...filters, service: event.target.value as Filters['service'] })}>
          <option value="all">{t('All', 'सभी')}</option><option value="ride">{t('Rides', 'सवारियाँ')}</option><option value="food">{t('Food', 'भोजन')}</option><option value="medicine">{t('Medicine', 'दवा')}</option>
        </select>
      </label>
      <label className="field"><span>{t('Status', 'स्थिति')}</span>
        <select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as Filters['status'] })}>
          <option value="all">{t('All', 'सभी')}</option><option value="pending">{t('Pending', 'लंबित')}</option><option value="confirmed">{t('Confirmed', 'पुष्टि हुई')}</option>
          <option value="completed">{t('Completed', 'पूरा हुआ')}</option><option value="failed">{t('Failed', 'असफल')}</option><option value="cancelled">{t('Cancelled or declined', 'रद्द या अस्वीकार किया गया')}</option>
        </select>
      </label>
      <label className="field"><span>{t('When', 'कब')}</span>
        <select value={filters.range} onChange={(event) => onChange({ ...filters, range: event.target.value as Filters['range'] })}>
          <option value="all">{t('Any time', 'किसी भी समय')}</option><option value="today">{t('Today', 'आज')}</option><option value="week">{t('Last 7 days', 'पिछले 7 दिन')}</option>
        </select>
      </label>
    </fieldset>
  )
}
