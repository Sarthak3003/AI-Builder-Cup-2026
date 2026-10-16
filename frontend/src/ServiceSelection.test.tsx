import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { demoServices, fail, makeState, progress, stubApi } from './test-utils'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const setup = () => makeState({ onboarding: progress(4), services: demoServices('SETUP_REQUIRED') })

test.each(['#/onboarding/services', '#/services'])('%s lists demo and familiar services with identical rows and toggles', async (route) => {
  const calls = stubApi({}, setup())
  window.location.hash = route
  render(<App />)
  for (const [category, names] of [
    ['Rides', ['Demo Ride Provider', 'Uber', 'Ola', 'Rapido']],
    ['Food delivery', ['Demo Food Provider', 'Uber Eats', 'Swiggy', 'Zomato']],
  ] as const) {
    const list = await screen.findByRole('list', { name: `${category} services` })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    names.forEach((name, index) => {
      expect(rows[index]).toHaveClass('service-option-row')
      expect(within(rows[index]).getByText(name)).toBeVisible()
      expect(within(rows[index]).getByText('Simulated')).toBeVisible()
      expect(within(rows[index]).getByRole('switch', { name: `Use ${name}` })).not.toBeChecked()
    })
  }
  expect(screen.queryByText('What this demo provider can do')).not.toBeInTheDocument()
  expect(screen.queryByText('Example options only.')).not.toBeInTheDocument()
  expect(screen.queryByText('End-to-end demo')).not.toBeInTheDocument()
  expect(calls.filter((call) => call.url.includes('/services/'))).toHaveLength(0)
})

test.each([
  ['RIDE', 'demo-ride', 'Demo Ride Provider'], ['RIDE', 'uber', 'Uber'], ['RIDE', 'ola', 'Ola'],
  ['FOOD', 'demo-kitchen', 'Demo Food Provider'], ['FOOD', 'swiggy', 'Swiggy'],
] as const)('selecting %s %s explicitly enables the same simulated flow', async (serviceType, optionId, name) => {
  let saved = setup()
  const own = optionId.startsWith('demo-')
  const calls = stubApi({
    'POST /session': () => saved,
    [`POST /services/${serviceType}/options`]: () => {
      saved = { ...saved, profile: { ...saved.profile, enabled_providers: own ? [] : [optionId] }, services: saved.services!.map((s) => s.service_type === serviceType ? { ...s, status: 'CONNECTED', own_option_enabled: own } : s) }
      return saved
    },
  }, saved)
  window.location.hash = '#/onboarding/services'
  const { unmount } = render(<App />)
  await userEvent.click(await screen.findByRole('switch', { name: `Use ${name}` }))
  expect(screen.getByRole('switch', { name: `Use ${name}` })).toBeChecked()
  expect(calls.filter((call) => call.url.includes('/services/'))).toEqual([
    { method: 'POST', url: `/api/hub/services/${serviceType}/options`, body: { option_id: optionId, enabled: true, consent: true } },
  ])
  if (!own) expect(screen.getByRole('switch', { name: `Use ${serviceType === 'RIDE' ? 'Demo Ride Provider' : 'Demo Food Provider'}` })).not.toBeChecked()
  unmount()
  render(<App />)
  expect(await screen.findByRole('switch', { name: `Use ${name}` })).toBeChecked()
})

test('a failed save does not switch a service on', async () => {
  stubApi({ 'POST /services/RIDE/options': () => fail(503, { detail: 'Could not save services.' }) }, setup())
  window.location.hash = '#/services'
  render(<App />)
  await userEvent.click(await screen.findByRole('switch', { name: 'Use Uber' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save services.')
  expect(screen.getByRole('switch', { name: 'Use Uber' })).not.toBeChecked()
})