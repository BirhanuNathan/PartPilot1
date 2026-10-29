import { Fragment } from 'react'
import { Check, ClipboardPenLine, PlayCircle, ScanSearch, ShieldCheck, Stamp, UserRound, X, type LucideIcon } from 'lucide-react'
import type { TraceStep } from '../lib/types'
import { AgentLog, type AgentStatus } from './StepTrace'

export type NodeStatus = 'waiting' | 'running' | 'done' | 'error' | 'paused' | 'review'

interface PipelineNode {
  key: string
  label: string
  short: string
  sub: string
  Icon: LucideIcon
  status: NodeStatus
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  waiting: 'waiting',
  running: 'working',
  done: 'complete',
  error: 'stopped',
  paused: 'awaiting you',
  review: 'human review',
}

function Hex({ status, Icon }: { status: NodeStatus; Icon: LucideIcon }) {
  const active = status === 'running' || status === 'paused'
  const stroke =
    status === 'done' ? '#1F6BFF' : status === 'error' || status === 'review' ? '#E5484D' : active ? '#00B8D9' : '#C2CFDF'
  const fill = status === 'done' ? '#EEF4FF' : active ? '#E8FAFD' : status === 'error' || status === 'review' ? '#FDEEEE' : '#FFFFFF'
  const iconCls =
    status === 'done' ? 'text-accent-600' : status === 'error' || status === 'review' ? 'text-red-600' : active ? 'text-cyan-600' : 'text-zinc-400'
  return (
    <div className={`relative h-12 w-12 shrink-0 sm:h-16 sm:w-16 ${active ? 'animate-pulse-glow' : ''}`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          d="M27 5.5a10 10 0 0 1 10 0l16.5 9.5a10 10 0 0 1 5 8.7v16.6a10 10 0 0 1-5 8.7L37 58.5a10 10 0 0 1-10 0L10.5 49a10 10 0 0 1-5-8.7V23.7a10 10 0 0 1 5-8.7Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={status === 'waiting' ? 1.5 : 2}
          className="transition-[stroke,fill] duration-200"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon className={`h-5 w-5 transition-colors sm:h-6 sm:w-6 duration-200 ${iconCls}`} strokeWidth={1.75} aria-hidden="true" />
      </span>
      {status === 'done' && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 animate-pop items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      {(status === 'error' || status === 'review') && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 animate-pop items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-white">
          {status === 'review' ? <UserRound className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </span>
      )}
    </div>
  )
}

function Connector({ state }: { state: 'idle' | 'flowing' | 'done' }) {
  return (
    <li role="presentation" aria-hidden="true" className="relative mx-0.5 mt-6 h-[2px] min-w-2 flex-1 overflow-hidden rounded-full bg-zinc-200 sm:mx-1 sm:mt-8">
      {state === 'done' && <div className="absolute inset-0 bg-gradient-to-r from-accent-500 to-cyan-500" />}
      {state === 'flowing' && <div className="flow-line absolute inset-0 animate-flow" />}
    </li>
  )
}

export interface AgentPipelineProps {
  inputStatus: NodeStatus
  finderStatus: AgentStatus
  verifyStatus: AgentStatus
  approvalStatus: NodeStatus
  finderPaused?: boolean
  finderSteps: TraceStep[]
  verifySteps: TraceStep[]
  demo?: boolean
}

/** Animated horizontal pipeline (Input → Part Finder → Fit Checker → Approval) with live terminal logs underneath. */
export function AgentPipeline({ inputStatus, finderStatus, verifyStatus, approvalStatus, finderPaused, finderSteps, verifySteps, demo }: AgentPipelineProps) {
  const nodes: PipelineNode[] = [
    { key: 'input', label: 'Input', short: 'Input', sub: 'Description + screenshot', Icon: ClipboardPenLine, status: inputStatus },
    { key: 'finder', label: 'Part Finder Agent', short: 'Part Finder', sub: 'Searches and ranks parts', Icon: ScanSearch, status: finderPaused ? 'paused' : finderStatus },
    { key: 'checker', label: 'Fit Checker Agent', short: 'Fit Checker', sub: 'Verifies against the rulebook', Icon: ShieldCheck, status: verifyStatus },
    { key: 'approval', label: 'Approval', short: 'Approval', sub: 'Engineer approves to BOM', Icon: Stamp, status: approvalStatus },
  ]
  const activeIdx = nodes.findIndex((n) => n.status === 'running' || n.status === 'paused')
  const linkState = (i: number): 'idle' | 'flowing' | 'done' => {
    const next = nodes[i + 1]
    if (next.status === 'running' || next.status === 'paused') return 'flowing'
    if (next.status === 'waiting') return 'idle'
    return 'done'
  }

  return (
    <section className="card p-4 sm:p-5" aria-label="Agent pipeline">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="label-caps">Agent pipeline</p>
        {demo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-700">
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> DEMO — recorded replay
          </span>
        )}
      </div>
      <ol className="flex items-start" aria-label="Pipeline stages">
        {nodes.map((n, i) => (
          <Fragment key={n.key}>
            <li
              className="flex w-16 shrink-0 flex-col items-center text-center sm:w-32"
              aria-current={i === activeIdx ? 'step' : undefined}
              aria-label={`${n.label}: ${STATUS_LABEL[n.status]}`}
            >
              <Hex status={n.status} Icon={n.Icon} />
              <span className="mt-2 text-[11px] font-semibold leading-tight text-zinc-900 sm:text-sm">
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </span>
              <span className="mt-0.5 hidden text-xs text-zinc-500 sm:block">{n.sub}</span>
              <span
                className={`mt-1 font-mono text-[10px] uppercase tracking-wide ${
                  n.status === 'done' ? 'text-emerald-700' : n.status === 'running' || n.status === 'paused' ? 'text-cyan-700' : n.status === 'waiting' ? 'text-zinc-500' : 'text-red-700'
                }`}
              >
                {STATUS_LABEL[n.status]}
              </span>
            </li>
            {i < nodes.length - 1 && <Connector state={linkState(i)} />}
          </Fragment>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <AgentLog title="Part Finder" file="find-parts.log" steps={finderSteps} status={finderStatus} />
        <AgentLog title="Fit Checker" file="verify-fit.log" steps={verifySteps} status={verifyStatus} />
      </div>
    </section>
  )
}
