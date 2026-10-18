import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import type { Activity } from './hub'
import { preparePaymentChime } from './paymentChime'
import { booking, fail, makeState, rideQuote, stubApi } from './test-utils'

vi.mock('./paymentChime', () => ({ preparePaymentChime: vi.fn() }))
const sound = { play: vi.fn(), dispose: vi.fn() }
const pending = () => booking(rideQuote({ payment_method: 'PAY_ON_COMPLETION' }))
const paid = (item: Activity): Activity => ({ ...item, payment: { ...item.payment!, status: 'SUCCEEDED_SIMULATED' } })
const stateWith = (item: Activity) => makeState({ demo_controls: true, activity: [item] })
const paymentButton = () => screen.getByRole('button', { name: 'Demo: mark simulated payment complete' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(preparePaymentChime).mockReturnValue(sound)
  window.history.replaceState(null, '', `/#/activity/${pending().id}`)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('only a successful response shows the screen and plays one chime, even after repeated taps', async () => {
  const item = pending()
  let finish!: (item: Activity) => void
  const response = new Promise<Activity>((resolve) => { finish = resolve })
  const calls = stubApi({
    'POST /bookings/*/payment/complete': () => response,
    'GET /state': () => stateWith(paid(item)),
  }, stateWith(item))
  render(<App />)
  await screen.findByRole('heading', { name: item.title })
  await userEvent.click(paymentButton())
  fireEvent.click(paymentButton())
  expect(paymentButton()).toBeDisabled()
  expect(preparePaymentChime).toHaveBeenCalledTimes(1)
  expect(sound.play).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(calls.filter((call) => call.url.endsWith('/payment/complete'))).toHaveLength(1)

  await act(async () => finish(paid(item)))
  const dialog = await screen.findByRole('dialog', { name: 'Payment successful' })
  expect(within(dialog).getByRole('heading', { name: 'Payment successful' })).toHaveFocus()
  expect(within(dialog).getByText('₹135')).toBeInTheDocument()
  expect(within(dialog).getByText(item.title)).toBeInTheDocument()
  expect(dialog).toHaveAccessibleDescription('Simulated payment only. No real money was charged.')
  expect(document.body.style.overflow).toBe('hidden')
  expect(sound.play).toHaveBeenCalledTimes(1)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Back to booking' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Booked · simulated')).toBeInTheDocument()
  expect(screen.getByText('Payment: Paid (simulated) · no money charged')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Demo: mark simulated payment complete' })).not.toBeInTheDocument()
  expect(document.body.style.overflow).toBe('')
  expect(screen.getByRole('main')).toHaveFocus()
  expect(sound.dispose).toHaveBeenCalled()
})

test.each([
  ['server error', fail(503, { detail: 'Payment update unavailable.' })],
  ['permission denied', fail(403, { detail: 'Not allowed.' })],
  ['still pending', pending()],
  ['a different booking', { ...paid(pending()), id: 'another-booking' }],
])('no celebration for %s', async (_name, response) => {
  stubApi({ 'POST /bookings/*/payment/complete': () => response }, stateWith(pending()))
  render(<App />)
  await screen.findByRole('heading', { name: pending().title })
  await userEvent.click(paymentButton())
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(sound.play).not.toHaveBeenCalled()
  expect(sound.dispose).toHaveBeenCalled()
  expect(paymentButton()).toBeEnabled()
})

test('a refresh failure cannot turn a confirmed payment into a failure or leave a duplicate payment button', async () => {
  stubApi({
    'POST /bookings/*/payment/complete': () => paid(pending()),
    'GET /state': () => fail(503, { detail: 'Refresh unavailable.' }),
  }, stateWith(pending()))
  render(<App />)
  await screen.findByRole('heading', { name: pending().title })
  await userEvent.click(paymentButton())
  const dialog = await screen.findByRole('dialog', { name: 'Payment successful' })
  expect(sound.play).toHaveBeenCalledTimes(1)
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Payment: Paid (simulated) · no money charged')).toBeInTheDocument()
  expect(screen.getByText('Payment was marked complete, but the latest booking details could not be refreshed.')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Demo: mark simulated payment complete' })).not.toBeInTheDocument()
})

test('opening an already paid booking does not replay the success screen or sound', async () => {
  stubApi({}, stateWith(paid(pending())))
  render(<App />)
  expect(await screen.findByText('Payment: Paid (simulated) · no money charged')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(preparePaymentChime).not.toHaveBeenCalled()
})

test('completing the trip alone does not celebrate a payment', async () => {
  stubApi({ 'POST /bookings/*/complete': () => ({ ...pending(), booking_status: 'COMPLETED_SIMULATED' }) }, stateWith(pending()))
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Demo: mark trip or delivery completed' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(preparePaymentChime).not.toHaveBeenCalled()
})

test('leaving while payment is pending disposes audio and does not open a late success screen', async () => {
  let finish!: (item: Activity) => void
  const response = new Promise<Activity>((resolve) => { finish = resolve })
  stubApi({ 'POST /bookings/*/payment/complete': () => response }, stateWith(pending()))
  render(<App />)
  await screen.findByRole('heading', { name: pending().title })
  await userEvent.click(paymentButton())
  await userEvent.click(screen.getByRole('link', { name: 'Back to activity' }))
  expect(await screen.findByRole('heading', { name: 'Your activity' })).toBeInTheDocument()
  expect(sound.dispose).toHaveBeenCalled()
  await act(async () => finish(paid(pending())))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(sound.play).not.toHaveBeenCalled()
})