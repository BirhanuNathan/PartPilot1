import type { ReactNode } from 'react'
import { AlertTriangle, ArrowLeftRight, Check, CircleHelp, Info, Loader2, OctagonAlert, PlayCircle, UserRound, type LucideIcon } from 'lucide-react'
import type { VerdictType } from '../lib/types'

const VERDICT_STYLE: Record<VerdictType | 'UNVERIFIED', { label: string; cls: string; Icon: LucideIcon }> = {
  APPROVE: { label: 'APPROVE', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', Icon: Check },
  APPROVE_WITH_NOTES: { label: 'APPROVE + NOTES', cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: AlertTriangle },
  SWAP: { label: 'SWAPPED', cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: ArrowLeftRight },
  ESCALATE_TO_HUMAN: { label: 'HUMAN REVIEW', cls: 'bg-red-50 text-red-800 border-red-300', Icon: UserRound },
  UNVERIFIED: { label: 'NOT VERIFIED', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300', Icon: CircleHelp },
}

export function VerdictBadge({ verdict }: { verdict?: VerdictType }) {
  const v = VERDICT_STYLE[verdict ?? 'UNVERIFIED']
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${v.cls}`}>
      <v.Icon className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
      {v.label}
    </span>
  )
}

/** Thin segmented confidence bar (10 segments). */
export function Meter({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(1, value))
  const pct = Math.round(clamped * 100)
  const filled = Math.round(clamped * 10)
  const color = value >= 0.8 ? 'bg-emerald-500' : value >= 0.7 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-1.5 w-[7px] rounded-[1px] transition-colors duration-200 ${i < filled ? color : 'bg-zinc-200'}`} />
        ))}
      </div>
      <span className="font-mono text-xs tabular-nums text-zinc-700">{value.toFixed(2)}</span>
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />
}

export function Banner({ tone, title, children }: { tone: 'info' | 'warn' | 'danger' | 'demo'; title: string; children?: ReactNode }) {
  const { cls, Icon, iconCls } = {
    info: { cls: 'border-accent-200 bg-accent-50/90 text-accent-800', Icon: Info, iconCls: 'text-accent-600' },
    warn: { cls: 'border-amber-300 bg-amber-50/90 text-amber-900', Icon: AlertTriangle, iconCls: 'text-amber-500' },
    danger: { cls: 'border-red-300 bg-red-50/90 text-red-900', Icon: OctagonAlert, iconCls: 'text-red-500' },
    demo: { cls: 'border-cyan-400/60 bg-cyan-50/90 text-cyan-700', Icon: PlayCircle, iconCls: 'text-cyan-600' },
  }[tone]
  return (
    <div className={`flex gap-3 rounded-[14px] border px-4 py-3 ${cls}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${iconCls}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm">{children}</div>}
      </div>
    </div>
  )
}

/** PartPilot logo mark: a crosshair / compass glyph in a blue→cyan gradient. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pp-logo-g" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1F6BFF" />
          <stop offset="1" stopColor="#00B8D9" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#fff" stroke="#DCE5F0" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="url(#pp-logo-g)" strokeWidth="2.4" />
      <path d="M16 3.5v6M16 22.5v6M3.5 16h6M22.5 16h6" stroke="url(#pp-logo-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 12.2l3.8 3.8-3.8 3.8-3.8-3.8z" fill="url(#pp-logo-g)" />
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
    ['heightMm', 'H', 'mm'],
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
    if (dims[k] !== undefined && dims[k] !== '' && typeof dims[k] !== 'object') out.push([l, `${dims[k]}${u ? ` ${u}` : ''}`])
  }
  return out.slice(0, 6)
}
