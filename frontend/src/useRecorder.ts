import { useEffect, useRef, useState } from 'react'

const MAX_SECONDS = 15
const PAUSE_MS = 1500
const SPEECH_LEVEL = 0.02

// Records one short request. Stops on a second tap, after a pause once speech has started, or at 15 seconds.
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const stopNow = useRef<(() => void) | null>(null)
  const supported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  useEffect(() => () => stopNow.current?.(), [])

  async function start(onClip: (clip: Blob) => void) {
    setError('')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone permission was refused. Allow it in the browser, or type instead.')
      return
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const cleanup: (() => void)[] = [() => stream.getTracks().forEach((track) => track.stop())]
    const stop = () => { if (recorder.state === 'recording') recorder.stop() }
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      cleanup.forEach((step) => step())
      stopNow.current = null
      setRecording(false)
      const clip = new Blob(chunks, { type: recorder.mimeType })
      if (clip.size) onClip(clip)
      else setError('I did not hear anything. Tap the microphone and try again.')
    }
    stopNow.current = stop
    const limit = window.setTimeout(stop, MAX_SECONDS * 1000)
    cleanup.push(() => window.clearTimeout(limit), watchForPause(stream, stop))
    recorder.start()
    setRecording(true)
  }

  return { supported, recording, error, start, stop: () => stopNow.current?.() }
}

function watchForPause(stream: MediaStream, onPause: () => void): () => void {
  if (typeof AudioContext === 'undefined') return () => {}
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  let spoke = false
  let quietSince = 0
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples)
    const level = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
    const now = performance.now()
    if (level > SPEECH_LEVEL) { spoke = true; quietSince = 0 } else if (spoke) {
      quietSince ||= now
      if (now - quietSince > PAUSE_MS) onPause()
    }
  }, 100)
  return () => { window.clearInterval(timer); void context.close() }
}
