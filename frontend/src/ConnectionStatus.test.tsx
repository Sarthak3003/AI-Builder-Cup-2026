import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import ConnectionStatus from './ConnectionStatus'

afterEach(() => vi.unstubAllGlobals())

function mockHealthyApi() {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.endsWith('health')
      ? { status: 'ok', service: 'saathi-api' }
      : { version: '0.1.0', environment: 'test' },
  })))
}

test('reports a real successful API response', async () => {
  mockHealthyApi()
  render(<ConnectionStatus />)
  expect(screen.getByRole('status')).toHaveTextContent('Connecting to Saathi…')
  expect(await screen.findByText('Backend connected · v0.1.0')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
})

test('shows failure and recovers when the user retries', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<ConnectionStatus />)
  expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
  mockHealthyApi()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Backend connected · v0.1.0')).toBeInTheDocument()
})

test('does not mistake an unexpected response for a healthy backend', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  render(<ConnectionStatus />)
  expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
})

test('treats an HTTP error from either endpoint as unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
    ok: !url.endsWith('version'),
    json: async () => ({ status: 'ok', service: 'saathi-api', version: '0.1.0' }),
  })))
  render(<ConnectionStatus />)
  expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
})

test('gives up when the API does not answer within the time limit', async () => {
  vi.useFakeTimers()
  try {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    render(<ConnectionStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to Saathi…')
    await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to Saathi…')
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByRole('status')).toHaveTextContent('Backend unavailable')
  } finally {
    vi.useRealTimers()
  }
})
