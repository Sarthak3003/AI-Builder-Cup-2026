export default function JoinScreen({ code, busy, signedIn, onJoin }: { code: string; busy: boolean; signedIn: boolean; onJoin: (code: string) => void }) {
  return (
    <section className="card" aria-labelledby="join-title">
      <p className="eyebrow">CARE CIRCLE INVITATION</p>
      <h1 id="join-title" className="page-title">Join a Care Circle</h1>
      <p>Someone you know has invited you to help them with Saathi. You will see only what they chose to share, and they can remove you at any time.</p>
      {signedIn ? <p className="inline-note">This browser is already using Saathi. Joining switches it to the caretaker view. To keep both, open this link in a private window or another browser.</p> : null}
      <button className="primary wide" disabled={busy} onClick={() => onJoin(code)}>Join as caretaker</button>
      <a className="secondary wide" href="#/">Not now</a>
    </section>
  )
}
