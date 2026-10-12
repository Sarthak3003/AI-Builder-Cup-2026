import { afterEach, expect, test, vi } from 'vitest'
import { newId } from './id'
import { parseRoute, routeHref, tabHref } from './route'

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

test('ids look like UUIDs even when the browser has no randomUUID', () => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  expect(newId()).toMatch(pattern)
  const real = crypto
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => real.getRandomValues(bytes) })
  const fallback = newId()
  expect(fallback).toMatch(pattern)
  expect(newId()).not.toBe(fallback)
})
