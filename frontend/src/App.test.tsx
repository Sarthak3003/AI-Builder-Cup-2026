import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

function mockHealthyApi() {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.endsWith('health')
      ? { status: 'ok', service: 'saathi-api' }
      : { version: '0.1.0', environment: 'test' },
  })))
}

test('reports a real successful API response and keeps future actions disabled', async () => {
  mockHealthyApi()
  render(<App />)
  expect(await screen.findByText('Backend connected · v0.1.0')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Talk to Saathi/ })).toBeDisabled()
})

test('shows failure and recovers when the user retries', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<App />)
  expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
  mockHealthyApi()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Backend connected · v0.1.0')).toBeInTheDocument()
})

test('does not mistake an unexpected response for a healthy backend', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  render(<App />)
  expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
})

test('sign in opens an honest placeholder without collecting personal data', async () => {
  mockHealthyApi()
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('heading', { name: 'A familiar place, just for you.' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
