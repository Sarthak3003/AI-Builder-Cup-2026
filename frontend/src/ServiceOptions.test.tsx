import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { HubState, Profile } from './hub'
import { catalogue, demoServices, fail, makeState, progress, stubApi } from './test-utils'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const setup = (): HubState => makeState({
  onboarding: progress(4), services: demoServices('SETUP_REQUIRED'),
  profile: { ...makeState().profile, payment_method: null, show_options: false },
})

test.each(['#/onboarding/services', '#/services'])('%s separates the working demo providers from example-only brand options', async (route) => {
  const calls = stubApi({}, setup())
  window.location.hash = route
  render(<App />)
  for (const [category, provider, names] of [
    ['Rides', 'Demo Ride Provider', ['Uber', 'Ola', 'Rapido']],
    ['Food delivery', 'Demo Food Provider', ['Uber Eats', 'Swiggy', 'Zomato']],
  ] as const) {
    const section = await screen.findByRole('region', { name: category })
    const demo = within(section).getByRole('region', { name: provider })
    expect(within(demo).getByText('End-to-end demo')).toBeVisible()
    expect(within(demo).getByRole('button', { name: `Connect ${provider}` })).toBeEnabled()
    expect(within(section).getByText(new RegExp(`full flow always runs through the ${provider}, never these companies`))).toBeVisible()
    const examples = within(section).getByRole('list', { name: `${category} example options` })
    expect(within(examples).getAllByRole('listitem')).toHaveLength(3)
    expect(within(examples).getAllByText('Example only · not connected')).toHaveLength(3)
    for (const name of names) {
      expect(within(examples).getByText(name, { exact: true })).toBeVisible()
      expect(within(examples).getByRole('switch', { name: `Show ${name} example option` })).toBeChecked()
      expect(screen.queryByRole('button', { name: `Connect ${name}` })).not.toBeInTheDocument()
    }
  }
  expect(calls.filter((call) => call.url.includes('/services/'))).toHaveLength(0)
})

test.each(['RIDE', 'FOOD'] as const)('connecting %s sends consent only to its demo provider', async (serviceType) => {
  const initial = setup()
  const service = initial.services!.find((entry) => entry.service_type === serviceType)!
  const connected = { ...initial, services: initial.services!.map((entry) => entry.service_type === serviceType ? { ...entry, status: 'CONNECTED' as const } : entry) }
  const calls = stubApi({ [`POST /services/${serviceType}/connect-demo`]: () => connected }, initial)
  window.location.hash = '#/onboarding/services'
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: `Connect ${service.provider_label}` }))
  expect(await screen.findByRole('button', { name: `Disconnect ${service.provider_label}` })).toBeEnabled()
  expect(calls.filter((call) => call.url.includes('/services/'))).toEqual([
    { method: 'POST', url: `/api/hub/services/${serviceType}/connect-demo`, body: { consent: true } },
  ])
  expect(screen.getAllByText('Example only · not connected')).toHaveLength(6)
})

test('setup saves example visibility independently, retains the demo providers and restores it on reload', async () => {
  let saved = setup()
  const calls = stubApi({
    'POST /session': () => saved,
    'PUT /profile': (body) => { saved = { ...saved, profile: body as Profile }; return saved },
  }, saved)
  window.location.hash = '#/onboarding/services'
  const { unmount } = render(<App />)
  await screen.findByRole('region', { name: 'Rides' })
  for (const app of catalogue) await userEvent.click(screen.getByRole('switch', { name: `Show ${app.name} example option` }))
  expect(saved.profile.enabled_providers).toEqual([])
  expect(saved.profile.show_options).toBe(false)
  expect(saved.profile.payment_method).toBeNull()
  expect(saved.services?.map((service) => service.status)).toEqual(['SETUP_REQUIRED', 'SETUP_REQUIRED', 'SETUP_REQUIRED'])
  expect(calls.filter((call) => call.url.includes('/services/'))).toHaveLength(0)
  unmount()
  render(<App />)
  await screen.findByRole('region', { name: 'Rides' })
  for (const app of catalogue) expect(screen.getByRole('switch', { name: `Show ${app.name} example option` })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Connect Demo Ride Provider' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Connect Demo Food Provider' })).toBeEnabled()
})

test('a failed example preference save leaves the original selection and connection intact', async () => {
  stubApi({ 'PUT /profile': () => fail(503, { detail: 'Could not save example options.' }) }, makeState())
  window.location.hash = '#/services'
  render(<App />)
  await userEvent.click(await screen.findByRole('switch', { name: 'Show Uber example option' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save example options.')
  expect(screen.getByRole('switch', { name: 'Show Uber example option' })).toBeChecked()
  expect(screen.getByRole('button', { name: 'Disconnect Demo Ride Provider' })).toBeEnabled()
})