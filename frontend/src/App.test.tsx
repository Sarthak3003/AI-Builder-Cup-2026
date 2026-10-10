import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

const profile = { name: 'Friend', language: 'en-IN', large_text: false, high_contrast: false, vegetarian: true, mild: true, budget: 200, home: 'Demo home', caregiver_name: '', approval_limit: 150, caregiver_enabled: false, medicines: ['Saved medicine A'] }
const initial = { profile, role: 'owner', storage: 'local-sqlite', activity: [], requests: [], messages: [], audit: [] }
afterEach(() => vi.unstubAllGlobals())

test('loads one app and switches between service forms', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => initial })))
  render(<App />)
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Go somewhere/ }))
  expect(screen.getByRole('textbox', { name: 'Destination' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Medicine request/ }))
  expect(screen.getByRole('combobox', { name: 'Saved medicine' })).toBeInTheDocument()
})

test('requires explicit review before submitting a demo request', async () => {
  const proposal = { id: 'abc', summary: 'Food options within ₹200', options: [{ id: 'dal', name: 'Dal and rice', price: 120, detail: 'Demo meal' }], clarification: '', service: 'food' }
  const mock = vi.fn(async (path: string) => ({ ok: true, json: async () => path.endsWith('/requests') ? proposal : initial }))
  vi.stubGlobal('fetch', mock)
  render(<App />)
  await screen.findByText('Hello, Friend.')
  await userEvent.click(screen.getByRole('button', { name: 'Show options' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Choose Dal and rice' }))
  expect(screen.getByRole('heading', { name: 'Review your request' })).toBeInTheDocument()
  expect(mock.mock.calls.some(([path]) => path.includes('/confirm'))).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
  expect(screen.queryByRole('button', { name: 'Confirm demo request' })).not.toBeInTheDocument()
})

test('caregiver cannot see request creation controls', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...initial, role: 'caregiver' }) })))
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Review approvals' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Show options' })).not.toBeInTheDocument()
})

test('connection failures remain visible and can retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Backend offline')))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Backend offline')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => initial })))
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
})
