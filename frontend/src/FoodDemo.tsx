import { useState } from 'react'

type Meal = { id: string; name: string; price: number; spice: string }
type Proposal = { id: string; summary: string; clarification: string; options: Meal[] }
type Order = { id: string; item: Meal; status: string }

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/demo${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check your request and try again.')
  return data as T
}

export default function FoodDemo() {
  const [message, setMessage] = useState('I would like a mild vegetarian lunch under 150 rupees.')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [selection, setSelection] = useState<Meal | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  return <section className="food-demo" aria-labelledby="food-title" aria-busy={busy}>
    <div className="section-label">TRY THE FOOD DEMO</div>
    <h2 id="food-title">What would you like to eat?</h2>
    <p>Simulated meals and prices. No payment, delivery or real order. Please don’t enter personal or medical information.</p>
    <form onSubmit={e => { e.preventDefault(); void run(async () => {
      setProposal(null); setSelection(null); setOrder(null)
      await api('/session', {})
      setProposal(await api<Proposal>('/requests', { message }))
    }) }}>
      <label htmlFor="food-message">Tell Saathi your meal preferences and budget</label>
      <textarea id="food-message" value={message} maxLength={1000} minLength={3} required disabled={busy}
        onChange={e => setMessage(e.target.value)} />
      <button className="talk" disabled={busy || message.trim().length < 3}>Find meals</button>
    </form>
    {busy ? <p role="status">Working on your request…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {proposal ? <div aria-live="polite">
      <h3>Your preferences</h3><p>{proposal.summary}</p>
      {proposal.clarification ? <p>{proposal.clarification}</p> : null}
      <div className="services">{proposal.options.map(meal => <article key={meal.id}>
        <h3>{meal.name}</h3><p>₹{meal.price} · {meal.spice} spice</p>
        <button className="secondary" disabled={busy || !!order} onClick={() => setSelection(meal)}>Choose {meal.name}</button>
      </article>)}</div>
    </div> : null}
    {selection && proposal && !order ? <div className="confirmation">
      <h3>Review before confirming</h3>
      <p>{selection.name} for ₹{selection.price}. This saves a simulated order only.</p>
      <button className="talk" disabled={busy} onClick={() => { void run(async () => {
        const saved = await api<Order>(`/requests/${proposal.id}/confirm`, { option_id: selection.id, confirmed: true })
        localStorage.setItem('saathi.lastDemoOrder', saved.id)
        setOrder(saved); setSelection(null)
      }) }}>Confirm simulated order</button>{' '}
      <button className="secondary" disabled={busy} onClick={() => setSelection(null)}>Cancel selection</button>
    </div> : null}
    <h3>Your demo activity</h3>
    <button className="secondary" disabled={busy} onClick={() => { void run(async () => {
      const id = localStorage.getItem('saathi.lastDemoOrder')
      if (!id) { setNotice('No saved demo order in this browser yet.'); return }
      setOrder(await api<Order>(`/activity/${encodeURIComponent(id)}`))
      setNotice('Activity loaded from Firestore.')
    }) }}>Load saved activity</button>
    {order ? <p role="status">Saved simulated order: {order.item.name} · ₹{order.item.price}. No delivery will take place.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>
}
