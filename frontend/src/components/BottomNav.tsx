import type { ReactNode } from 'react'
import { tabHref } from '../route'
import type { Route, TabPage } from '../route'
import { useI18n } from '../i18n'

export type Tab = { page: TabPage; label: string; icon: ReactNode; badge?: number; badgeLabel?: string }

export default function BottomNav({ route, tabs }: { route: Route; tabs: Tab[] }) {
  const { t, text } = useI18n()
  function label(value: string) {
    switch (value) {
      case 'Home': return t('Home', 'होम')
      case 'Activity': return t('Activity', 'गतिविधि')
      case 'Services': return t('Services', 'सेवाएँ')
      case 'Family': return t('Family', 'परिवार')
      case 'Profile': return t('Profile', 'प्रोफ़ाइल')
      case 'Overview': return t('Overview', 'एक नज़र में')
      case 'Approvals': return t('Approvals', 'मंज़ूरियाँ')
      case 'Chats': return t('Chats', 'बातचीत')
      case 'Safety': return t('Safety', 'सुरक्षा')
      case 'needing attention': return t('needing attention', 'पर ध्यान देना है')
      case 'alerts to review': return t('alerts to review', 'सूचनाएँ देखनी हैं')
      case 'waiting for approval': return t('waiting for approval', 'मंज़ूरी के इंतज़ार में')
      default: return text(value)
    }
  }
  return (
    <nav className="bottom-nav" aria-label={t('Main navigation', 'मुख्य नेविगेशन')}>
      {tabs.map((tab) => {
        const current = route.page === tab.page || (tab.page === 'home' && route.page === 'request')
        return (
          <a key={tab.page} href={tabHref(tab.page)} className={current ? 'tab current' : 'tab'} aria-current={current ? 'page' : undefined}>
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{label(tab.label)}</span>
            {tab.badge ? (
              <>
                <span className="badge" aria-hidden="true">{tab.badge}</span>
                <span className="sr-only">{t(', {{count}} {{label}}', ', {{count}} {{label}}', { count: tab.badge, label: tab.badgeLabel != null ? label(tab.badgeLabel) : t('waiting for approval', 'मंज़ूरी के इंतज़ार में') })}</span>
              </>
            ) : null}
          </a>
        )
      })}
    </nav>
  )
}
