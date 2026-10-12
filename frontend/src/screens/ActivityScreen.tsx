import ActivityList from '../components/ActivityList'
import type { Hub } from './hubType'

export default function ActivityScreen({ hub }: { hub: Hub }) {
  const { state, busy, run, refresh } = hub
  return (
    <>
      <h1 className="page-title">Your activity</h1>
      <p className="muted">Rides, meals and medicine requests are saved here, whichever way you ask. All bookings are simulated.</p>
      <button className="secondary" disabled={busy} onClick={() => void run(refresh)}>Refresh activity</button>
      <ActivityList
        hub={hub}
        items={state.activity}
        empty={<><h2>A fresh start</h2><p>Your first request will appear here.</p><a className="primary" href="#/">Explore services</a></>}
      />
      <details className="audit">
        <summary>Activity audit</summary>
        <ul>
          {state.audit.slice().reverse().map((event, index) => (
            <li key={index}>{event.event.replaceAll('_', ' ')} · {new Date(event.at * 1000).toLocaleTimeString()}</li>
          ))}
        </ul>
      </details>
    </>
  )
}
