import { CornerDownRight } from 'lucide-react'
import type { TraceStep } from '../lib/types'

export type AgentStatus = 'waiting' | 'running' | 'done' | 'error'

const TOOL_TAG: Record<string, string> = {
  search_catalog: 'search',
  get_part: 'get_part',
  list_categories: 'categories',
  ask_user: 'ask_user',
  check_compatibility: 'check',
}

const KIND_TAG: Record<TraceStep['kind'], { tag: string; cls: string }> = {
  info: { tag: 'info', cls: 'text-zinc-500' },
  reasoning: { tag: 'think', cls: 'text-cyan-700' },
  tool: { tag: 'tool', cls: 'text-accent-700' },
  final: { tag: 'done', cls: 'text-emerald-700' },
  error: { tag: 'error', cls: 'text-red-700' },
}

const STATUS_TEXT: Record<AgentStatus, { text: string; cls: string }> = {
  waiting: { text: 'idle', cls: 'text-zinc-500' },
  running: { text: 'running', cls: 'text-cyan-700' },
  done: { text: 'exit 0', cls: 'text-emerald-700' },
  error: { text: 'stopped', cls: 'text-red-700' },
}

function offset(steps: TraceStep[], s: TraceStep) {
  const t0 = Date.parse(steps[0]?.at ?? '')
  const t = Date.parse(s.at)
  if (Number.isNaN(t0) || Number.isNaN(t)) return '+0.0s'
  return `+${((t - t0) / 1000).toFixed(1)}s`
}

/** Light, terminal-style live log of one agent's streamed steps. */
export function AgentLog({ title, file, steps, status }: { title: string; file: string; steps: TraceStep[]; status: AgentStatus }) {
  const st = STATUS_TEXT[status]
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-zinc-200 bg-[#FBFDFF] shadow-[inset_0_1px_0_#fff]" aria-label={`${title} step log`}>
      <header className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-r from-accent-50 to-cyan-50/60 px-3 py-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-accent-200" />
          <span className="h-2 w-2 rounded-full bg-accent-200" />
          <span className="h-2 w-2 rounded-full bg-accent-200" />
        </span>
        <h3 className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-zinc-800">
          {title} <span className="font-normal text-zinc-500">— {file}</span>
        </h3>
        <span className={`font-mono text-[11px] font-semibold ${st.cls}`}>[{st.text}]</span>
      </header>
      <ol className="max-h-[360px] min-h-[120px] space-y-1 overflow-y-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed" aria-live="polite" aria-relevant="additions">
        {steps.length === 0 && status === 'waiting' && <li className="text-zinc-500">$ waiting for the Part Finder's shortlist…</li>}
        {steps.length === 0 && status !== 'waiting' && <li className="text-zinc-500">$ starting…</li>}
        {steps.map((s, i) => {
          const k = KIND_TAG[s.kind]
          return (
            <li key={`${s.index}-${i}`} className="animate-fade-in">
              <div className="flex gap-2">
                <span className="shrink-0 whitespace-pre tabular-nums text-zinc-400">{offset(steps, s).padStart(6, ' ')}</span>
                <span className={`shrink-0 whitespace-pre font-semibold ${k.cls}`}>{(s.tool ? TOOL_TAG[s.tool] ?? s.tool : k.tag).padEnd(6, ' ')}</span>
                <span className={`min-w-0 break-words ${s.kind === 'reasoning' ? 'text-zinc-600' : s.kind === 'error' ? 'text-red-800' : 'text-zinc-900'}`}>{s.label}</span>
              </div>
              {s.resultSummary && (
                <p className="ml-[14.3ch] flex gap-1 break-words text-zinc-600">
                  <CornerDownRight className="mt-[3px] h-3 w-3 shrink-0 text-cyan-600" aria-hidden="true" />
                  <span className="min-w-0">{s.resultSummary}</span>
                </p>
              )}
              {s.args !== undefined && (
                <details className="ml-[14.3ch]">
                  <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-accent-700">arguments</summary>
                  <pre className="mt-1 overflow-x-auto rounded-md border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700">{JSON.stringify(s.args, null, 2)}</pre>
                </details>
              )}
            </li>
          )
        })}
        {status === 'running' && (
          <li className="flex items-center gap-1 text-cyan-700" aria-hidden="true">
            $ <span className="inline-block h-3.5 w-[7px] animate-blink bg-cyan-500" />
          </li>
        )}
      </ol>
    </section>
  )
}
