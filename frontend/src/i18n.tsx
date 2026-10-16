import { createContext, useContext } from 'react'
import { systemText, translateSystem } from './locales/system'

export type Language = 'en-IN' | 'hi-IN'
export type Values = Record<string, string | number>
export type Translate = (english: string, hindi: string, values?: Values) => string
export const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: 'en-IN', setLanguage: () => {} })

const interpolate = (template: string, values: Values = {}) => template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => String(values[key] ?? match))

// Only application-generated copy belongs here, never names, addresses or user messages.
export function translateText(value: string | null | undefined, language: Language): string {
  if (!value) return ''
  if (language !== 'hi-IN') return value
  return Object.hasOwn(systemText, value) ? systemText[value] : translateSystem(value)
}

export function useI18n() {
  const { language, setLanguage } = useContext(LanguageContext)
  const t: Translate = (english, hindi, values) => interpolate(language === 'hi-IN' ? hindi : english, values)
  const text = (value: string | null | undefined) => translateText(value, language)
  const formatWhen = (seconds: number) => new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(seconds * 1000))
  const formatTime = (seconds: number) => new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(new Date(seconds * 1000))
  return { language, setLanguage, t, text, formatWhen, formatTime }
}