import { Check, Minus, X } from 'lucide-react'
import type { RunStep } from '../lib/types'

/** Vertical stepper for an automation run: animated check marks, connecting line, timestamps. */
export function RunStepper({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="relative mt-3">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const done = s.status === 'done'
        const failed = s.status === 'failed'
        return (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {!last && <span className={`absolute left-[11px] top-6 bottom-0 w-px ${done ? 'bg-gradient-to-b from-accent-500 to-cyan-500' : 'bg-zinc-200'}`} aria-hidden="true" />}
            <span
              className={`relative z-10 flex h-6 w-6 shrink-0 animate-pop items-center justify-center rounded-full ring-4 ring-white ${
                done ? 'bg-emerald-500 text-white' : failed ? 'bg-red-500 text-white' : 'border border-zinc-300 bg-white text-zinc-400'
              }`}
              style={{ animationDelay: `${i * 90}ms` }}
              aria-label={s.status}
              role="img"
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : failed ? <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium text-zinc-900">{s.name}</span>
                <time dateTime={s.at} className="font-mono text-[11px] tabular-nums text-zinc-500">
                  {new Date(s.at).toLocaleTimeString()}
                </time>
              </div>
              {s.detail && <p className="mt-0.5 break-words text-xs text-zinc-600">{s.detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
