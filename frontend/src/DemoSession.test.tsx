import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fail, makeState, stubApi } from './test-utils'
import App from './App'

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

test('visitors enter the demo without Google login', async () => {
  window.history.replaceState(null, '', '/')
  const calls = stubApi()
  render(<App />)
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  expect(calls.some(call => call.url.includes('/auth/'))).toBe(false)
})

test('failed session creation can be retried without login', async () => {
  window.history.replaceState(null, '', '/')
  let attempts = 0
  stubApi({ 'POST /session': () => ++attempts === 1 ? fail(503, { detail: 'Please retry.' }) : makeState() })
  render(<App />)
  expect(await screen.findByText('Please retry.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
  expect(await screen.findByText('Hello, Friend.')).toBeInTheDocument()
  expect(attempts).toBe(2)
})
