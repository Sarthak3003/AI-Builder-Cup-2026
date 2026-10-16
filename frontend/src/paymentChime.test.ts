import { afterEach, expect, test, vi } from 'vitest'
import { preparePaymentChime } from './paymentChime'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function mockAudio(state = 'running', resume = vi.fn().mockResolvedValue(undefined)) {
  const tones: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = []
  const audio = {
    state, currentTime: 10, destination: {}, resume,
    close: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => {
      const tone = { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      tones.push(tone)
      return tone
    }),
    createGain: vi.fn(() => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
  }
  vi.stubGlobal('AudioContext', class { constructor() { return audio } })
  return { audio, tones }
}

test('audio is unlocked silently on the gesture and the short bell plays only once on success', async () => {
  vi.useFakeTimers()
  const { audio, tones } = mockAudio()
  const chime = preparePaymentChime()
  expect(audio.resume).toHaveBeenCalledTimes(1)
  expect(audio.createOscillator).not.toHaveBeenCalled()
  chime.play()
  chime.play()
  await vi.advanceTimersByTimeAsync(0)
  expect(tones).toHaveLength(3)
  for (const tone of tones) {
    expect(tone.start).toHaveBeenCalledWith(10)
    expect(tone.stop).toHaveBeenCalledWith(10.9)
  }
  await vi.advanceTimersByTimeAsync(1000)
  expect(audio.close).toHaveBeenCalledTimes(1)
  chime.dispose()
  expect(audio.close).toHaveBeenCalledTimes(1)
})

test('cancelling before playback closes audio and prevents a late chime', async () => {
  const { audio } = mockAudio()
  const chime = preparePaymentChime()
  chime.play()
  chime.dispose()
  await Promise.resolve()
  expect(audio.createOscillator).not.toHaveBeenCalled()
  expect(audio.close).toHaveBeenCalledTimes(1)
})

test('blocked autoplay degrades to silent success without throwing', async () => {
  const { audio } = mockAudio('suspended', vi.fn().mockRejectedValue(new Error('Blocked')))
  const chime = preparePaymentChime()
  chime.play()
  await Promise.resolve()
  await Promise.resolve()
  expect(audio.createOscillator).not.toHaveBeenCalled()
  expect(audio.close).toHaveBeenCalledTimes(1)
})

test.each(['missing', 'unavailable'])('audio %s does not prevent the visual confirmation', (kind) => {
  vi.stubGlobal('AudioContext', kind === 'missing' ? undefined : class { constructor() { throw new Error('Unavailable') } })
  expect(() => {
    const chime = preparePaymentChime()
    chime.play()
    chime.dispose()
  }).not.toThrow()
})