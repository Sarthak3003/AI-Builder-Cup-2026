export type PaymentChime = { play: () => void; dispose: () => void }

// Unlock audio on the tap, but only play this original bell after payment succeeds.
export function preparePaymentChime(): PaymentChime {
  let context: AudioContext | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let played = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    if (context && context.state !== 'closed') void context.close().catch(() => {})
  }
  try {
    if (typeof AudioContext === 'undefined') return { play: () => {}, dispose }
    const audio = context = new AudioContext()
    const ready = audio.resume().catch(() => {})
    return {
      dispose,
      play: () => {
        if (played || disposed) return
        played = true
        void ready.then(() => {
          if (disposed) return
          if (audio.state !== 'running') { dispose(); return }
          const start = audio.currentTime
          for (const [frequency, volume] of [[1046.5, 0.12], [2093, 0.035], [3139.5, 0.012]]) {
            const tone = audio.createOscillator()
            const gain = audio.createGain()
            tone.type = 'sine'
            tone.frequency.setValueAtTime(frequency, start)
            gain.gain.setValueAtTime(0, start)
            gain.gain.linearRampToValueAtTime(volume, start + 0.012)
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85)
            tone.connect(gain)
            gain.connect(audio.destination)
            tone.start(start)
            tone.stop(start + 0.9)
          }
          timer = setTimeout(dispose, 1000)
        }).catch(dispose)
      },
    }
  } catch {
    dispose()
    return { play: () => {}, dispose }
  }
}