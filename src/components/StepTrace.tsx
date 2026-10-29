import type { TraceStep } from '../lib/types'
import { Spinner } from './ui'

const TOOL_TAG: Record<string, string> = {
  search_catalog: 'search',
  get_part: 'get_part',
  list_categories: 'categories',
  ask_user: 'ask_user',
  check_compatibility: 'check',
}

/** Live list of agent steps built from the streamed trace. */
export function StepTrace({ title, subtitle, steps, status }: { title: string; subtitle: string; steps: TraceStep[]; status: 'waiting' | 'running' | 'done' | 'error' }) {
  return (
    <section className="card flex min-h-0 flex-col" aria-label={`${title} step trace`}>
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {status === 'running' && (
            <span className="flex items-center gap-1.5 text-accent-700">
              <Spinner className="h-3.5 w-3.5" /> Working
            </span>
          )}
          {status === 'done' && <span className="text-emerald-700">✓ Done</span>}
          {status === 'error' && <span className="text-red-700">✕ Stopped</span>}
          {status === 'waiting' && <span className="text-zinc-400">Waiting</span>}
        </span>
      </header>
      <ol className="max-h-[420px] space-y-0 overflow-y-auto px-4 py-3" aria-live="polite">
        {steps.length === 0 && status !== 'waiting' && <li className="py-1 text-sm text-zinc-500">Starting…</li>}
        {steps.length === 0 && status === 'waiting' && <li className="py-1 text-sm text-zinc-400">Starts when the Part Finder hands over its shortlist.</li>}
        {steps.map((s, i) => {
          const last = i === steps.length - 1 && status === 'running'
          return (
            <li key={`${s.index}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                {last ? (
                  <Spinner className="h-3.5 w-3.5 text-accent-600" />
                ) : s.kind === 'error' ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                ) : s.kind === 'reasoning' ? (
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-zinc-400" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-600" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${s.kind === 'reasoning' ? 'italic text-zinc-600' : s.kind === 'error' ? 'text-red-800' : 'text-zinc-900'}`}>
                  {s.tool && <span className="mr-1.5 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white not-italic">{TOOL_TAG[s.tool] ?? s.tool}</span>}
                  {s.label}
                </p>
                {s.resultSummary && <p className="mt-0.5 break-words font-mono text-xs text-zinc-500">→ {s.resultSummary}</p>}
                {s.args !== undefined && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-600">arguments</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[11px] text-zinc-700">{JSON.stringify(s.args, null, 2)}</pre>
                  </details>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
