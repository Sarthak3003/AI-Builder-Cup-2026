import type { ReactNode } from 'react'
import { tabHref } from '../route'
import type { Route, TabPage } from '../route'

export type Tab = { page: TabPage; label: string; icon: ReactNode; badge?: number }

export default function BottomNav({ route, tabs }: { route: Route; tabs: Tab[] }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map((tab) => {
        const current = route.page === tab.page || (tab.page === 'home' && route.page === 'request')
        return (
          <a key={tab.page} href={tabHref(tab.page)} className={current ? 'tab current' : 'tab'} aria-current={current ? 'page' : undefined}>
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.badge ? (
              <>
                <span className="badge" aria-hidden="true">{tab.badge}</span>
                <span className="sr-only">, {tab.badge} waiting for approval</span>
              </>
            ) : null}
          </a>
        )
      })}
    </nav>
  )
}
