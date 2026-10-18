import { useState } from 'react'
import { useI18n } from '../i18n'
import { api, live } from '../hub'
import type { Activity } from '../hub'
import { applyFilters, noFilters } from '../filters'
import ActivityFilters from '../components/ActivityFilters'
import ActivityList from '../components/ActivityList'
import ActivityTimeline from '../components/ActivityTimeline'
import PhoneHistory from '../components/PhoneHistory'
import { UpcomingPlans } from '../components/Plans'
import type { Hub } from './hubType'

export default function ActivityScreen({ hub, simple = false }: { hub: Hub; simple?: boolean }) {
  const { t, text, formatWhen } = useI18n()
  const { state, busy, run, refresh } = hub
  const [filters, setFilters] = useState(noFilters)
  const cancel = (item: Activity) => live(item) ? (
    <button className="secondary" disabled={busy} onClick={() => void run(async () => { await api(`/bookings/${item.id}/cancel`, 'POST'); await refresh() })}>{t('Cancel booking', 'बुकिंग रद्द करें')}</button>
  ) : null
  if (simple) {
    return (
      <>
        <h1 className="page-title">{t('Your activity', 'आपकी गतिविधि')}</h1>
        <ActivityList items={state.activity} simple actions={cancel} empty={<p>{t('Nothing yet.', 'अभी कुछ नहीं है।')}</p>} />
        <PhoneHistory conversations={state.conversations ?? []} />
      </>
    )
  }
  const shown = applyFilters(state.activity, filters)
  return (
    <>
      <h1 className="page-title">{t('Your activity', 'आपकी गतिविधि')}</h1>
      <p className="muted">{t('Your bookings, requests and upcoming plans.', 'आपकी बुकिंग, अनुरोध और आने वाली योजनाएँ।')}</p>
      <UpcomingPlans runner={hub} appointments={state.appointments ?? []} reminders={state.reminders ?? []} canEdit canMarkDone canMedicine />
      <h2 className="section-title">{t('History', 'पिछली गतिविधियाँ')}</h2>
      <PhoneHistory conversations={state.conversations ?? []} />
      <details className="settings-group"><summary>{t('Filter history', 'गतिविधियाँ छाँटें')}</summary><ActivityFilters filters={filters} onChange={setFilters} /></details>
      <ActivityList
        items={shown}
        actions={cancel}
        empty={state.activity.length ? <p>{t('Nothing matches these filters.', 'इन फ़िल्टर से मेल खाती कोई गतिविधि नहीं है।')}</p> : <><h2>{t('A fresh start', 'एक नई शुरुआत')}</h2><p>{t('Your first request will appear here.', 'आपका पहला अनुरोध यहाँ दिखाई देगा।')}</p><a className="primary" href="#/">{t('Explore services', 'सेवाएँ देखें')}</a></>}
      />
      <details className="settings-group"><summary>{t('Timeline', 'घटनाक्रम')}</summary><section className="card" aria-labelledby="timeline-title">
        <h2 id="timeline-title">{t('Timeline', 'घटनाक्रम')}</h2>
        <p className="muted">{t('The same record your Care Circle sees, minus anything you have not shared with them.', 'आपकी देखभाल मंडली यही रिकॉर्ड देखती है, लेकिन वह जानकारी नहीं जो आपने उनके साथ साझा नहीं की है।')}</p>
        <ActivityTimeline events={state.events ?? []} />
      </section></details>
      <details className="audit">
        <summary>{t('Who did what', 'किसने क्या किया')}</summary>
        <ul>
          {state.audit.slice().reverse().map((event, index) => (
            <li key={index}>{text(event.event.replaceAll('_', ' '))}{event.actor && event.actor !== 'owner' ? t(' · by {{actor}}', ' · {{actor}} द्वारा', { actor: event.actor }) : ''} · {formatWhen(event.at)}</li>
          ))}
        </ul>
      </details>
    </>
  )
}
