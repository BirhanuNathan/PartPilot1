import type { ReactNode } from 'react'
import type { VerdictType } from '../lib/types'

const VERDICT_STYLE: Record<VerdictType | 'UNVERIFIED', { label: string; cls: string; icon: string }> = {
  APPROVE: { label: 'Approve', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', icon: '✓' },
  APPROVE_WITH_NOTES: { label: 'Approve with notes', cls: 'bg-amber-50 text-amber-900 border-amber-300', icon: '!' },
  SWAP: { label: 'Swapped', cls: 'bg-amber-50 text-amber-900 border-amber-300', icon: '⇄' },
  ESCALATE_TO_HUMAN: { label: 'Human review', cls: 'bg-red-50 text-red-800 border-red-300', icon: '⚑' },
  UNVERIFIED: { label: 'Not verified', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300', icon: '?' },
}

export function VerdictBadge({ verdict }: { verdict?: VerdictType }) {
  const v = VERDICT_STYLE[verdict ?? 'UNVERIFIED']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.cls}`}>
      <span aria-hidden="true">{v.icon}</span>
      {v.label}
    </span>
  )
}

export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const color = value >= 0.8 ? 'bg-emerald-600' : value >= 0.7 ? 'bg-amber-500' : 'bg-red-600'
  return (
    <div className="flex items-center gap-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-zinc-700">{(value).toFixed(2)}</span>
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Banner({ tone, title, children }: { tone: 'info' | 'warn' | 'danger' | 'demo'; title: string; children?: ReactNode }) {
  const cls = {
    info: 'border-accent-200 bg-accent-50 text-accent-800',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-red-300 bg-red-50 text-red-900',
    demo: 'border-amber-400 bg-amber-100 text-amber-950',
  }[tone]
  return (
    <div className={`rounded-lg border px-4 py-3 ${cls}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  )
}

/** Simple line-art placeholder per category (stands in for the library thumbnail). */
export function PartGlyph({ category, className = 'h-16 w-16' }: { category: string; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  let body: ReactNode
  switch (category) {
    case 'bearing':
      body = (<><circle cx="32" cy="32" r="22" {...common} /><circle cx="32" cy="32" r="9" {...common} />{[0, 60, 120, 180, 240, 300].map((a) => (<circle key={a} cx={32 + 15.5 * Math.cos((a * Math.PI) / 180)} cy={32 + 15.5 * Math.sin((a * Math.PI) / 180)} r="3.2" {...common} />))}</>)
      break
    case 'fastener':
      body = (<><path d="M20 10h24l4 8H16z" {...common} /><path d="M26 18v36h12V18" {...common} />{[24, 30, 36, 42, 48].map((y) => (<path key={y} d={`M26 ${y}l12 3`} {...common} />))}</>)
      break
    case 'nut':
    case 'standoff':
      body = (<><path d="M32 10l19 11v22L32 54 13 43V21z" {...common} /><circle cx="32" cy="32" r="9" {...common} /></>)
      break
    case 'washer':
    case 'spacer':
    case 'gasket':
      body = (<><circle cx="32" cy="32" r="22" {...common} /><circle cx="32" cy="32" r="11" {...common} /></>)
      break
    case 'shaft':
      body = (<><rect x="8" y="26" width="48" height="12" rx="2" {...common} /><path d="M14 26v12M50 26v12" {...common} /></>)
      break
    case 'shaft collar':
      body = (<><circle cx="32" cy="32" r="20" {...common} /><circle cx="32" cy="32" r="10" {...common} /><path d="M32 12v-4M28 8h8" {...common} /></>)
      break
    case 'bracket':
    case 'motor mount':
      body = (<><path d="M14 12v40h38v-8H22V12z" {...common} /><circle cx="18" cy="22" r="2.5" {...common} /><circle cx="40" cy="48" r="2.5" {...common} /></>)
      break
    case 'gear':
    case 'pulley':
      body = (<><circle cx="32" cy="32" r="16" {...common} /><circle cx="32" cy="32" r="5" {...common} />{Array.from({ length: 12 }, (_, i) => i * 30).map((a) => { const r = (a * Math.PI) / 180; return <path key={a} d={`M${32 + 16 * Math.cos(r)} ${32 + 16 * Math.sin(r)}L${32 + 22 * Math.cos(r)} ${32 + 22 * Math.sin(r)}`} {...common} /> })}</>)
      break
    case 'bushing':
      body = (<><ellipse cx="32" cy="18" rx="16" ry="5" {...common} /><path d="M20 21v26c0 3 5 5 12 5s12-2 12-5V21" {...common} /><ellipse cx="32" cy="18" rx="8" ry="2.5" {...common} /></>)
      break
    default:
      body = (<><rect x="14" y="14" width="36" height="36" rx="4" {...common} /><circle cx="32" cy="32" r="7" {...common} /></>)
  }
  return (
    <svg viewBox="0 0 64 64" className={`${className} text-zinc-400`} aria-hidden="true">
      {body}
    </svg>
  )
}

/** Picks the most useful dimensions for display. */
export function keyDims(dims: Record<string, unknown>): [string, string][] {
  const labels: [string, string, string?][] = [
    ['thread', 'Thread'],
    ['boreMm', 'Bore', 'mm'],
    ['diameterMm', 'Ø', 'mm'],
    ['outerDiameterMm', 'OD', 'mm'],
    ['innerDiameterMm', 'ID', 'mm'],
    ['widthMm', 'W', 'mm'],
    ['lengthMm', 'L', 'mm'],
    ['legLengthMm', 'Leg', 'mm'],
    ['thicknessMm', 't', 'mm'],
    ['motorFrame', 'Frame'],
    ['boltPatternMm', 'Pattern', 'mm'],
    ['profile', 'Profile'],
    ['teeth', 'Teeth'],
    ['module', 'Module'],
    ['crossSectionMm', 'CS', 'mm'],
    ['holeForThread', 'Holes'],
    ['fitsThread', 'Fits'],
    ['setScrew', 'Set screw'],
  ]
  const out: [string, string][] = []
  for (const [k, l, u] of labels) {
    if (dims[k] !== undefined && dims[k] !== '') out.push([l, `${dims[k]}${u ? ` ${u}` : ''}`])
  }
  return out.slice(0, 6)
}
