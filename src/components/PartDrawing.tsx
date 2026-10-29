import type { ReactNode } from 'react'
import type { Part } from '../lib/types'

/**
 * Generated technical-drawing thumbnails: blue line art per category, with the part's key dimension
 * drawn as a dimension line with arrowheads and a mono label taken from the real catalog dimensions.
 * viewBox is 96×96; the drawing sits in y 6–72, the dimension band below it.
 */

const STROKE = '#1F6BFF'
const FILL = '#EEF4FF'
const DIM = '#00A3C2'
const TEXT = '#0B1B33'
const line = { fill: 'none', stroke: STROKE, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const body = { ...line, fill: FILL }
const thin = { fill: 'none', stroke: STROKE, strokeWidth: 0.9, strokeLinecap: 'round' as const }
const center = { fill: 'none', stroke: STROKE, strokeOpacity: 0.45, strokeWidth: 0.7, strokeDasharray: '5 2 1 2' }
const ext = { stroke: DIM, strokeOpacity: 0.6, strokeWidth: 0.7, strokeDasharray: '2 1.5' }

const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
const fmt = (n: number) => `${Math.round(n * 100) / 100}`

function Arrow({ x, y, dir }: { x: number; y: number; dir: 'l' | 'r' | 'u' | 'd' }) {
  const s = 3.2
  const pts = {
    l: `${x},${y} ${x + s * 1.6},${y - s * 0.7} ${x + s * 1.6},${y + s * 0.7}`,
    r: `${x},${y} ${x - s * 1.6},${y - s * 0.7} ${x - s * 1.6},${y + s * 0.7}`,
    u: `${x},${y} ${x - s * 0.7},${y + s * 1.6} ${x + s * 0.7},${y + s * 1.6}`,
    d: `${x},${y} ${x - s * 0.7},${y - s * 1.6} ${x + s * 0.7},${y - s * 1.6}`,
  }[dir]
  return <polygon points={pts} fill={DIM} />
}

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  const w = Math.max(14, children.length * 5.9 + 6)
  return (
    <g>
      <rect x={x - w / 2} y={y - 8.5} width={w} height={11} rx={2} fill="#fff" fillOpacity={0.92} />
      <text x={x} y={y} textAnchor="middle" fontSize={9.2} fontWeight={600} fill={TEXT} style={{ fontFamily: 'var(--font-mono)' }}>
        {children}
      </text>
    </g>
  )
}

/** Horizontal dimension in the band below the drawing, with extension lines up to `fromY`. */
function BandDim({ x1, x2, fromY, label }: { x1: number; x2: number; fromY: number; label: string }) {
  const y = 80
  const inside = x2 - x1 >= 12
  return (
    <g>
      <line x1={x1} y1={fromY} x2={x1} y2={y + 3} {...ext} />
      <line x1={x2} y1={fromY} x2={x2} y2={y + 3} {...ext} />
      {inside ? (
        <>
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={DIM} strokeWidth={0.9} />
          <Arrow x={x1} y={y} dir="l" />
          <Arrow x={x2} y={y} dir="r" />
        </>
      ) : (
        <>
          <line x1={x1 - 9} y1={y} x2={x2 + 9} y2={y} stroke={DIM} strokeWidth={0.9} />
          <Arrow x={x1} y={y} dir="r" />
          <Arrow x={x2} y={y} dir="l" />
        </>
      )}
      <Label x={(x1 + x2) / 2} y={93}>
        {label}
      </Label>
    </g>
  )
}

function Threads({ x1, x2, y1, y2, step = 4.5 }: { x1: number; x2: number; y1: number; y2: number; step?: number }) {
  const out: ReactNode[] = []
  for (let y = y1; y < y2 - 1; y += step) out.push(<path key={y} d={`M${x1} ${y}L${x2} ${y + step * 0.55}`} {...thin} />)
  return <>{out}</>
}

function fastener(part: Part) {
  const d = part.dimensions
  const thread = String(d.thread ?? `M${d.nominalDiameterMm ?? ''}`)
  const nd = num(d.nominalDiameterMm) ?? 6
  const w = Math.min(22, Math.max(12, nd * 2.4))
  const x1 = 48 - w / 2
  const x2 = 48 + w / 2
  const isSet = d.type === 'set screw' || /set screw/i.test(part.name)
  const isButton = d.headType === 'button' || /button head/i.test(part.name)
  const isHex = /hex head|hex bolt/i.test(part.name)
  if (isSet) {
    return (
      <>
        <path d={`M${x1} 16H${x2}V62L${x2 - 3} 68H${x1 + 3}L${x1} 62Z`} {...body} />
        <path d={`M${48 - w * 0.22} 16v7h${w * 0.44}v-7`} {...thin} strokeDasharray="2 1.5" />
        <path d={`M${x1 + 5} 68l3 -4h${w - 16}l3 4`} {...thin} />
        <Threads x1={x1} x2={x2} y1={26} y2={62} />
        <line x1={48} y1={10} x2={48} y2={74} {...center} />
        <BandDim x1={x1} x2={x2} fromY={68} label={thread} />
      </>
    )
  }
  const hw = w * 1.7
  const head = isButton ? (
    <path d={`M${48 - hw / 2} 24C${48 - hw / 2} 12 ${48 + hw / 2} 12 ${48 + hw / 2} 24Z`} {...body} />
  ) : (
    <rect x={48 - hw / 2} y={10} width={hw} height={14} rx={isHex ? 1 : 2.5} {...body} />
  )
  return (
    <>
      {head}
      {isHex ? (
        <path d={`M${48 - hw / 6} 10v14M${48 + hw / 6} 10v14`} {...thin} />
      ) : (
        <path d={`M${48 - hw / 5} ${isButton ? 16 : 10}v6h${(hw * 2) / 5}v-6`} {...thin} strokeDasharray="2 1.5" />
      )}
      <path d={`M${x1} 24V66L${x1 + 2} 70H${x2 - 2}L${x2} 66V24`} {...body} />
      <Threads x1={x1} x2={x2} y1={34} y2={68} />
      <line x1={48} y1={6} x2={48} y2={74} {...center} />
      <BandDim x1={x1} x2={x2} fromY={70} label={thread} />
    </>
  )
}

function ringFront(rOuter: number, rBore: number, extra: ReactNode, label: string) {
  return (
    <>
      <circle cx={48} cy={39} r={rOuter} {...body} />
      {extra}
      <circle cx={48} cy={39} r={rBore} {...line} fill="#fff" />
      <line x1={48 - rOuter - 4} y1={39} x2={48 + rOuter + 4} y2={39} {...center} />
      <line x1={48} y1={39 - rOuter - 4} x2={48} y2={39 + rOuter + 4} {...center} />
      <BandDim x1={48 - rBore} x2={48 + rBore} fromY={39} label={label} />
    </>
  )
}

function drawing(part: Part): ReactNode {
  const d = part.dimensions
  const bore = num(d.boreMm) ?? num(d.innerDiameterMm)
  const od = num(d.outerDiameterMm)
  switch (part.category) {
    case 'fastener':
      return fastener(part)
    case 'bearing': {
      const balls = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r = (a * Math.PI) / 180
        return <circle key={a} cx={48 + 20 * Math.cos(r)} cy={39 + 20 * Math.sin(r)} r={4.2} {...line} fill="#fff" />
      })
      return ringFront(31, 11, <><circle cx={48} cy={39} r={25} {...thin} />{balls}<circle cx={48} cy={39} r={15} {...thin} /></>, `Ø${fmt(bore ?? 0)}`)
    }
    case 'shaft collar': {
      const clamp = /clamp/i.test(part.name)
      return ringFront(
        28,
        13,
        clamp ? (
          <path d="M48 11v15M44 18h-6M58 18h-6" {...line} />
        ) : (
          <path d="M45 11v-4h6v4M45 11v15M51 11v15" {...thin} />
        ),
        `Ø${fmt(bore ?? 0)}`,
      )
    }
    case 'washer':
    case 'gasket':
      return ringFront(part.category === 'gasket' ? 28 : 29, part.category === 'gasket' ? 22 : 13, part.category === 'gasket' ? <circle cx={48} cy={39} r={25} {...thin} strokeDasharray="1.5 2" /> : null, `Ø${fmt(bore ?? 0)}`)
    case 'nut': {
      const hex = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6
        return `${48 + 29 * Math.cos(a)},${39 + 29 * Math.sin(a)}`
      }).join(' ')
      const t = parseThreadD(String(d.thread ?? ''))
      return (
        <>
          <polygon points={hex} {...body} />
          <circle cx={48} cy={39} r={21} {...thin} />
          <circle cx={48} cy={39} r={12} {...line} fill="#fff" />
          <circle cx={48} cy={39} r={10} {...thin} strokeDasharray="2 1.5" />
          <BandDim x1={36} x2={60} fromY={39} label={String(d.thread ?? (t ? `M${t}` : ''))} />
        </>
      )
    }
    case 'shaft': {
      const dia = num(d.diameterMm) ?? 8
      const h = Math.min(22, Math.max(10, dia * 1.5))
      const y1 = 39 - h / 2
      const y2 = 39 + h / 2
      return (
        <>
          <path d={`M10 ${y1 + 1.5}L11.5 ${y1}H70.5L72 ${y1 + 1.5}V${y2 - 1.5}L70.5 ${y2}H11.5L10 ${y2 - 1.5}Z`} {...body} />
          <path d={`M14 ${y1}v${h}M68 ${y1}v${h}`} {...thin} />
          <line x1={6} y1={39} x2={76} y2={39} {...center} />
          <line x1={73} y1={y1} x2={88} y2={y1} {...ext} />
          <line x1={73} y1={y2} x2={88} y2={y2} {...ext} />
          <line x1={84} y1={y1 - 9} x2={84} y2={y2 + 9} stroke={DIM} strokeWidth={0.9} />
          <Arrow x={84} y={y1} dir="d" />
          <Arrow x={84} y={y2} dir="u" />
          <Label x={48} y={y2 + 20}>{`Ø${fmt(dia)} ${String(d.tolerance ?? '')}`.trim()}</Label>
        </>
      )
    }
    case 'bracket': {
      const leg = num(d.legLengthMm)
      return (
        <>
          <path d="M14 10H22V60H82V68H14Z" {...body} />
          <circle cx={18} cy={24} r={2.4} {...line} fill="#fff" />
          <circle cx={18} cy={44} r={2.4} {...line} fill="#fff" />
          <circle cx={46} cy={64} r={2.4} {...line} fill="#fff" />
          <circle cx={68} cy={64} r={2.4} {...line} fill="#fff" />
          <BandDim x1={14} x2={82} fromY={68} label={leg ? `${fmt(leg)} mm` : String(d.holeForThread ?? '')} />
        </>
      )
    }
    case 'motor mount': {
      const pat = num(d.boltPatternMm) ?? 31
      const off = Math.min(20, pat * 0.55) // scaled half-pattern
      const holes = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => <circle key={`${sx}${sy}`} cx={48 + sx * off} cy={38 + sy * off} r={2.6} {...line} fill="#fff" />))
      return (
        <>
          <rect x={18} y={8} width={60} height={60} rx={3} {...body} />
          <circle cx={48} cy={38} r={11} {...line} fill="#fff" />
          <circle cx={48} cy={38} r={3.5} {...thin} />
          {holes}
          <line x1={14} y1={38} x2={82} y2={38} {...center} />
          <BandDim x1={48 - off} x2={48 + off} fromY={38 + off} label={`${fmt(pat)}×${fmt(pat)}`} />
        </>
      )
    }
    case 'gear':
    case 'pulley': {
      const teeth = num(d.teeth) ?? 20
      const n = Math.min(teeth, 40)
      const rO = 30
      const rI = part.category === 'gear' ? 26 : 27.5
      const pts: string[] = []
      for (let i = 0; i < n; i++) {
        const a0 = (2 * Math.PI * i) / n
        const a1 = a0 + (Math.PI / n) * 0.9
        const a2 = a0 + (Math.PI / n) * 1.1
        const a3 = a0 + (2 * Math.PI) / n
        pts.push(`${48 + rI * Math.cos(a0)},${39 + rI * Math.sin(a0)}`, `${48 + rO * Math.cos(a1)},${39 + rO * Math.sin(a1)}`, `${48 + rO * Math.cos(a2)},${39 + rO * Math.sin(a2)}`, `${48 + rI * Math.cos(a3)},${39 + rI * Math.sin(a3)}`)
      }
      const rb = Math.max(4, Math.min(10, (bore ?? 5) * 0.9))
      return (
        <>
          <polygon points={pts.join(' ')} {...body} />
          <circle cx={48} cy={39} r={part.category === 'gear' ? 22 : 15} {...thin} strokeDasharray={part.category === 'gear' ? '3 2' : undefined} />
          <circle cx={48} cy={39} r={rb} {...line} fill="#fff" />
          <line x1={14} y1={39} x2={82} y2={39} {...center} />
          <BandDim x1={48 - rb} x2={48 + rb} fromY={39} label={`${teeth}T Ø${fmt(bore ?? 0)}`} />
        </>
      )
    }
    case 'bushing': {
      const rb = 9
      return (
        <>
          <path d="M22 14H74V22H64V66H32V22H22Z" {...body} />
          <rect x={48 - rb} y={14} width={rb * 2} height={52} {...line} fill="#fff" />
          <path d="M32 30l6 -6M32 44l6 -6M32 58l6 -6M58 30l6 -6M58 44l6 -6M58 58l6 -6" {...thin} />
          <line x1={48} y1={8} x2={48} y2={72} {...center} />
          <BandDim x1={48 - rb} x2={48 + rb} fromY={66} label={`Ø${fmt(bore ?? 0)}`} />
        </>
      )
    }
    case 'spacer':
    case 'standoff': {
      const len = num(d.lengthMm)
      const isStandoff = part.category === 'standoff'
      return (
        <>
          <rect x={14} y={24} width={68} height={28} rx={1.5} {...body} />
          {isStandoff ? <path d="M14 33H82M14 43H82" {...thin} /> : <path d="M14 30H82M14 46H82" {...thin} strokeDasharray="2 1.5" />}
          {isStandoff && (
            <>
              <path d="M14 34h10M14 42h10M72 34h10M72 42h10" {...thin} strokeDasharray="2 1.5" />
            </>
          )}
          <line x1={8} y1={38} x2={88} y2={38} {...center} />
          <BandDim x1={14} x2={82} fromY={52} label={isStandoff ? `${String(d.thread ?? '').split('x')[0]} × ${fmt(len ?? 0)}` : `Ø${fmt(od ?? 0)} × ${fmt(len ?? 0)}`} />
        </>
      )
    }
    case 'insert': {
      const knurl: ReactNode[] = []
      for (let y = 18; y < 62; y += 6) knurl.push(<path key={y} d={`M32 ${y}l32 6M32 ${y + 6}l32 -6`} {...thin} />)
      return (
        <>
          <rect x={32} y={14} width={32} height={52} rx={2} {...body} />
          {knurl}
          <rect x={40} y={14} width={16} height={52} {...thin} strokeDasharray="2 1.5" />
          <line x1={48} y1={8} x2={48} y2={72} {...center} />
          <BandDim x1={40} x2={56} fromY={66} label={String(d.thread ?? '')} />
        </>
      )
    }
    case 'foot': {
      const dia = num(d.diameterMm) ?? num(d.outerDiameterMm)
      return (
        <>
          <path d="M16 62C16 34 30 24 48 24S80 34 80 62Z" {...body} />
          <path d="M16 62H80" {...line} />
          <path d="M44 24v18h8v-18" {...thin} strokeDasharray="2 1.5" />
          <path d="M40 24l4 6h8l4 -6" {...thin} strokeDasharray="2 1.5" />
          <line x1={48} y1={14} x2={48} y2={70} {...center} />
          <BandDim x1={16} x2={80} fromY={62} label={dia ? `Ø${fmt(dia)}` : String(d.holeForThread ?? '')} />
        </>
      )
    }
    default:
      return (
        <>
          <rect x={20} y={12} width={56} height={52} rx={4} {...body} />
          <circle cx={48} cy={38} r={9} {...line} fill="#fff" />
          <BandDim x1={20} x2={76} fromY={64} label={part.category} />
        </>
      )
  }
}

function parseThreadD(t: string) {
  const m = t.match(/^M(\d+(?:\.\d+)?)/i)
  return m ? m[1] : null
}

export function PartDrawing({ part, className = 'h-24 w-24' }: { part: Part; className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label={`Technical drawing of ${part.partNumber}`}>
      {drawing(part)}
    </svg>
  )
}
