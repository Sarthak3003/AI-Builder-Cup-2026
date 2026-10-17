import { afterEach, expect, test, vi } from 'vitest'
import { api } from './hub'

afterEach(() => vi.unstubAllGlobals())
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data })

test.each([
  ['/bookings/b/cancel', { id: 'b', booking_status: 'CANCELLED_SIMULATED' }, '/bookings/b'],
  ['/bookings/b/complete', { id: 'b', booking_status: 'COMPLETED_SIMULATED' }, '/bookings/b'],
  ['/bookings/b/payment/complete', { id: 'b', payment: { status: 'SUCCEEDED_SIMULATED' } }, '/bookings/b'],
] as const)('recovers committed mutation %s without resending', async (path, saved, read) => {
  const fetcher = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValueOnce(response(saved))
  vi.stubGlobal('fetch', fetcher)
  expect(await api(path, 'POST')).toEqual(saved)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1][0]).toBe(`/api/hub${read}`)
  expect(fetcher.mock.calls[1][1].method).toBe('GET')
})

test('confirmation reconciles only the matching quote', async () => {
  const saved = { id: 'b', quote_id: 'q' }
  const fetcher = vi.fn().mockResolvedValueOnce(response({}, 504)).mockResolvedValueOnce(response({ activity: [{ id: 'other', quote_id: 'else' }, saved] }))
  vi.stubGlobal('fetch', fetcher)
  expect(await api('/quotes/q/confirm', 'POST', { idempotency_key: 'same' })).toEqual(saved)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test.each([response({ id: 'b', booking_status: 'CONFIRMED_SIMULATED' }), response({}, 503)])('unconfirmed outcome never claims success or resends', async (read) => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(read)
  vi.stubGlobal('fetch', fetcher)
  await expect(api('/bookings/b/cancel', 'POST')).rejects.toThrow('Check Activity')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('definitive rejection is not reconciled', async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ detail: 'Not allowed' }, 403))
  vi.stubGlobal('fetch', fetcher)
  await expect(api('/bookings/b/cancel', 'POST')).rejects.toThrow('Not allowed')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
