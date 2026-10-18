import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LanguageContext } from './i18n'
import type { Language } from './i18n'

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en-IN')
  useEffect(() => { document.documentElement.lang = language === 'hi-IN' ? 'hi' : 'en' }, [language])
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}