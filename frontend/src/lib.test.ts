import { afterEach, expect, test, vi } from 'vitest'
import { newId } from './id'
import { parseRoute, routeHref, tabHref } from './route'
import { encodeWav, toBase64 } from './wav'

afterEach(() => vi.unstubAllGlobals())

test.each([
  ['', { page: 'home' }],
  ['#/', { page: 'home' }],
  ['#/activity', { page: 'activity' }],
  ['#/apps', { page: 'apps' }],
  ['#/family', { page: 'family' }],
  ['#/profile', { page: 'profile' }],
  ['#/about', { page: 'about' }],
  ['#/request/ride', { page: 'request', service: 'ride' }],
  ['#/request/food', { page: 'request', service: 'food' }],
  ['#/request/medicine', { page: 'request', service: 'medicine' }],
  ['#/request/ride/abc-123', { page: 'request', service: 'ride', proposal: 'abc-123' }],
])('%s opens the right screen', (hash, route) => {
  expect(parseRoute(hash)).toEqual(route)
})

test.each(['#/request', '#/request/taxi', '#/nope', '#main'])('%s falls back to home', (hash) => {
  expect(parseRoute(hash)).toEqual({ page: 'home' })
})

test('addresses and routes round-trip', () => {
  for (const route of [{ page: 'home' }, { page: 'activity' }, { page: 'request', service: 'food' }, { page: 'request', service: 'ride', proposal: 'abc' }] as const) {
    expect(parseRoute(routeHref(route))).toEqual(route)
  }
  expect(tabHref('home')).toBe('#/')
  expect(tabHref('family')).toBe('#/family')
})

test('recordings become 16 kHz, 16-bit mono WAV for Gemini', () => {
  const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 16000))
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(wav.buffer, offset, 4))
  expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
  expect(wav.byteLength).toBe(52)
  expect([wav.getUint16(22, true), wav.getUint32(24, true), wav.getUint16(34, true), wav.getUint32(40, true)]).toEqual([1, 16000, 16, 8])
  expect([0, 1, 2, 3].map((index) => wav.getInt16(44 + index * 2, true))).toEqual([0, 32767, -32768, 32767])
})

test('base64 handles recordings larger than one chunk', () => {
  expect(toBase64(new TextEncoder().encode('RIFF').buffer)).toBe('UklGRg==')
  const big = new Uint8Array(100_000).map((_, index) => index % 251)
  const back = atob(toBase64(big.buffer))
  expect(back.length).toBe(big.length)
  expect(back.charCodeAt(99_999)).toBe(99_999 % 251)
})

test('ids look like UUIDs even when the browser has no randomUUID', () => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  expect(newId()).toMatch(pattern)
  const real = crypto
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => real.getRandomValues(bytes) })
  const fallback = newId()
  expect(fallback).toMatch(pattern)
  expect(newId()).not.toBe(fallback)
})
