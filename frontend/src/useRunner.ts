import { useRef, useState } from 'react'

// One request at a time: a second tap while the first is running is ignored rather than sent twice.
export function useRunner() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const operationVersion = useRef(0)

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    operationVersion.current += 1
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.') } finally { inFlight.current = false; operationVersion.current += 1; setBusy(false) }
  }

  return { busy, error, notice, run, setError, setNotice, inFlight, operationVersion }
}
