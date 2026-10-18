import { expect, test } from 'vitest'
import { translateText } from './i18n'
import type { Translate } from './i18n'
import { bookingCopy } from './locales/booking'
import { careEventDetail, careEventTitle } from './locales/care'
import { systemText, translateSystem } from './locales/system'
import type { CareEvent } from './hub'

const hi = (value: string) => translateText(value, 'hi-IN')
const t: Translate = (_en, hindi, values = {}) => hindi.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key]))

test('every exact application string has Hindi copy and English remains unchanged', () => {
  for (const [english, hindi] of Object.entries(systemText)) {
    if (english !== 'whatsapp') expect(hindi, english).toMatch(/[\u0900-\u097f]/)
    expect(hi(english)).toBe(hindi)
    expect(translateText(english, 'en-IN')).toBe(english)
  }
})

test.each([
  ['Demo Ride to Home', 'Home तक डेमो सवारी'],
  ['Uber Go to Dr Mehta. Clinic', 'Dr Mehta. Clinic तक उबर गो'],
  ['Vegetable khichdi from Saathi Demo Kitchen', 'साथी डेमो रसोई से सब्ज़ियों की खिचड़ी'],
  ['Above the ₹1,500 approval limit.', '₹1,500 की मंज़ूरी सीमा से अधिक।'],
  ['Distance, 5.3 km at ₹16/km', 'दूरी, 5.3 किमी, ₹16/किमी की दर से'],
  ['The only option: ₹94, about 4 min away.', 'एकमात्र विकल्प: ₹94, लगभग 4 मिनट दूर।'],
  ['Lowest price: ₹105, delivered in about 25 min.', 'सबसे कम कीमत: ₹105, लगभग 25 मिनट में डिलीवरी।'],
  ['Demo booking confirmed: DEMO-RIDE-1042. No real driver will come and no money moves.', 'डेमो बुकिंग की पुष्टि हुई: DEMO-RIDE-1042। कोई वास्तविक ड्राइवर नहीं आएगा और कोई लेन-देन नहीं होगा।'],
  ['You already have a place called Doctor.', 'Doctor नाम की जगह पहले से सहेजी हुई है।'],
  ['Already approved by Asha.', 'Asha पहले ही मंज़ूरी दे चुके हैं।'],
])('translates generated copy without modifying its data: %s', (english, expected) => {
  expect(hi(english)).toBe(expected)
})

test.each([
  'Best balance of price and wait: ₹94, about 4 min away.',
  'Lowest price: ₹105, delivered in about 25 min.',
])('booking formatter preserves amounts and actual minute counts: %s', (english) => {
  expect(bookingCopy(english, t, hi)).toBe(hi(english))
  expect(bookingCopy(english, (en, _hi, values = {}) => en.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key])), value => value)).toBe(english)
})

test.each(['toString', 'constructor', '__proto__', 'My personal note', 'Uber', 'Home\n', 'x'.repeat(5000)])('unknown and malformed copy stays unchanged: %s', (value) => {
  expect(translateSystem(value)).toBe(value)
  expect(hi(value)).toBe(value)
})

test('generated summaries preserve named destinations and booking references', () => {
  const value = hi('Asked for a ride to Dr Mehta. Clinic. 2 quotes were shown; nothing was booked.')
  expect(value).toContain('Dr Mehta. Clinic')
  expect(value).not.toContain('Asked for')
  expect(hi('Booked Uber Go to Home with the Demo Ride Provider (simulated).')).toContain('Home तक उबर गो')
  expect(hi('Finish these steps first: Welcome, Saved places.')).toBe('पहले ये चरण पूरे करें: स्वागत है, सहेजी गई जगहें।')
})

test('personal care notes and names are not translated, even when they match a label', () => {
  const event: CareEvent = { id: 'event', at: 1, kind: 'question', actor: 'Home', title: 'Home asked about Demo Ride to Doctor', detail: 'Payment successful', permission: 'view_activity', ref: null, severity: 'info', certainty: 'confirmed', status: 'info' }
  expect(careEventTitle(event, t, hi)).toContain('Home ने Doctor तक डेमो सवारी')
  expect(careEventDetail(event, t, hi)).toBe('Payment successful')
})