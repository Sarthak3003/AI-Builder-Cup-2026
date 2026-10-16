type Stage = 'coming' | 'done' | 'idle'
type Props = { stage: Stage; mover?: 'car' | 'scooter'; start?: string; end?: string; tall?: boolean }

const short = (text: string) => (text.length > 18 ? `${text.slice(0, 17)}…` : text)
const labelWidth = (text: string) => text.length * 6.4 + 14

// A drawn sketch, not a live map: nothing is tracked and no vehicle or rider exists.
export default function RouteMap({ stage, mover = 'car', start, end, tall = false }: Props) {
  const height = tall ? 220 : 150
  const at = stage === 'done' ? 'translate(300 40)' : mover === 'car' ? 'translate(96 118)' : 'translate(100 118)'
  const from = start ? short(start) : ''
  const to = end ? short(end) : ''
  return (
    <div className={`route-map ${stage}${tall ? ' tall' : ''}`}>
      <svg viewBox={`0 0 360 ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <rect className="land" width="360" height={height} />
        <path className="street" d={`M128 0 V${height} M236 0 L${236 + height / 3.75} ${height}`} />
        <g transform={`translate(0 ${(height - 150) / 2})`}>
          <rect className="park" x="18" y="62" width="88" height="36" rx="10" />
          <rect className="park" x="150" y="78" width="70" height="56" rx="10" />
          <path className="street" d="M0 118 H360 M0 40 H360" />
          <path className="route" d="M60 118 H128 V40 H300" />
          {mover === 'scooter' ? (
            <g className="pin-kitchen" transform="translate(60 118)">
              <circle r="13" />
              <svg x="-8" y="-8" width="16" height="16" viewBox="0 0 24 24"><path d="M4 12h16a8 8 0 0 1-16 0z" /><path d="M9 8c0-1.5 1-1.5 1-3M14 8c0-1.5 1-1.5 1-3" /></svg>
            </g>
          ) : <circle className="pin-start" cx="60" cy="118" r="9" />}
          <rect className="pin-end" x="291" y="31" width="18" height="18" rx="4" />
          {from ? <g className="map-label"><rect x="40" y="84" width={labelWidth(from)} height="18" rx="6" /><text x="47" y="97">{from}</text></g> : null}
          {to ? <g className="map-label"><rect x={300 - labelWidth(to) / 2} y="56" width={labelWidth(to)} height="18" rx="6" /><text x={307 - labelWidth(to) / 2} y="69">{to}</text></g> : null}
          {stage === 'idle' ? null : (
            <g className="map-car" transform={at}>
              <circle r="15" />
              <svg x="-10" y="-10" width="20" height="20" viewBox="0 0 24 24">
                {mover === 'car'
                  ? <><path d="M5 15.5 6.6 10a2 2 0 0 1 1.9-1.5h7a2 2 0 0 1 1.9 1.5l1.6 5.5" /><rect x="3" y="15.5" width="18" height="4.5" rx="1.5" /></>
                  : <><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17h6l2.5-6h-4M15 7h3l1.5 4M6 14.5V11h4" /></>}
              </svg>
            </g>
          )}
        </g>
      </svg>
      <span className="chip demo map-chip">Demo map · not live</span>
    </div>
  )
}
