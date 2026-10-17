import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { Conversation } from './hub'
import { booking, makeCareState, makeState, rideQuote, stubApi } from './test-utils'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const phone = { enabled: true, number: '+15555550124' }
const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'call-one', channel: 'phone', at: Date.now() / 1000 - 65, service: 'ride', request_id: 'r-1', safety: null,
  status: 'CONFIRMED_SIMULATED', workflow_state: 'COMPLETED', call_status: 'ENDED', duration_seconds: 65,
  booking_id: 'ride-one', transcript_retained: false,
  summary: { by: 'rules', text: 'Asked for a ride to Doctor.', confirmed: ['Demo ride confirmed.'], suggestions: [] },
  ...overrides,
})

test('pairing is owner-only, private, single-use and transcript retention is opt-in', async () => {
  const calls = stubApi({
    'POST /phone/pairing-codes': () => ({ code: '01234567', expires_at: Date.now() / 1000 + 300, single_use: true }),
    'POST /phone/revoke': () => ({ revoked: true }),
  }, makeState({ phone }))
  window.location.hash = '#/profile'
  render(<App />)
  await userEvent.click(await screen.findByText('Telephone access'))
  expect(await screen.findByRole('heading', { name: 'Call Saathi' })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Save a redacted text transcript for this call' })).not.toBeChecked()
  expect(screen.getByRole('link', { name: 'Call +15555550124' })).toHaveAttribute('href', 'tel:+15555550124')
  await userEvent.click(screen.getByRole('button', { name: 'Generate pairing code' }))
  expect(await screen.findByText('0123 4567')).toBeInTheDocument()
  expect(calls.find((call) => call.url.endsWith('/phone/pairing-codes'))?.body).toEqual({ retain_transcript: false })
  expect(screen.getByText(/Single use · expires in 5 minutes/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Revoke phone access' }))
  expect(await screen.findByText(/Phone access and unused pairing codes revoked/)).toBeInTheDocument()
  expect(screen.queryByText('0123 4567')).not.toBeInTheDocument()
})

test('disabled calling explains configuration without a simulator', async () => {
  stubApi({}, makeState({ phone: { enabled: false, number: '' } }))
  window.location.hash = '#/profile'
  render(<App />)
  expect(await screen.findByText(/Telephone calling is not enabled/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Generate pairing code' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Start simulated call' })).not.toBeInTheDocument()
})

test('activity shows call source, duration, verified result and optional transcript', async () => {
  const call = conversation({ transcript_retained: true, transcript: [{ role: 'user', text: 'Take me to Doctor' }, { role: 'assistant', text: 'Your demo ride is confirmed.' }] })
  stubApi({}, makeState({ conversations: [call] }))
  window.location.hash = '#/activity'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Phone calls' })).toBeInTheDocument()
  expect(screen.getByText(/Phone call ·/)).toBeInTheDocument()
  expect(screen.getByText(/Call ended · 65 seconds · completed/)).toBeInTheDocument()
  expect(screen.getByText('Demo ride confirmed.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open booking from this call' })).toHaveAttribute('href', '#/activity/ride-one')
  await userEvent.click(screen.getByText('Phone transcript'))
  expect(screen.getByText('Take me to Doctor')).toBeVisible()
})

test('phone updates use read-only snapshots every three seconds on Activity', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const calls = stubApi({ 'GET /snapshot': () => makeState({ conversations: [conversation()], activity: [booking(rideQuote())] }) })
  window.location.hash = '#/activity'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Your activity' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Phone calls' })).not.toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(await screen.findByRole('heading', { name: 'Phone calls' })).toBeInTheDocument()
  expect(screen.getByText(/Text transcript was not saved/)).toBeInTheDocument()
  expect(calls.filter((call) => call.url.endsWith('/snapshot'))).toHaveLength(1)
})

test('caretakers never get pairing controls', async () => {
  stubApi({}, makeCareState(['view_activity']))
  window.location.hash = '#/profile'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Supporting Meera' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Generate pairing code' })).not.toBeInTheDocument()
})
