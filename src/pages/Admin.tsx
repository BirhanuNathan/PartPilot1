import { useCallback, useEffect, useState } from 'react'
import { Bell, CalendarClock, FileText, Play, RefreshCw, ScrollText, ShieldCheck, Workflow, Zap } from 'lucide-react'
import { RunStepper } from '../components/RunStepper'
import { Banner, Spinner } from '../components/ui'
import { ApiError, getJson, postJson } from '../lib/api'
import type { AppNotification, AuditEntry, AutomationRun, GapReport } from '../lib/types'

interface AdminData {
  runs: AutomationRun[]
  notifications: AppNotification[]
  audit: AuditEntry[]
  latestReport: GapReport | null
  trust: { APPROVE: number; APPROVE_WITH_NOTES: number; SWAP: number; ESCALATE_TO_HUMAN: number; searches: number; verified: number; humanReviewRequired: number; errors: number; demo: number }
}

const AUTOMATION_LABEL: Record<AutomationRun['automation'], string> = {
  'approval-pipeline': 'Approval pipeline',
  'weekly-gap-report': 'Weekly Library Gap Report',
}

export function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const load = useCallback(() => {
    getJson<AdminData>('/api/admin')
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load admin data.'))
  }, [])
  useEffect(load, [load])

  const runNow = async () => {
    setRunning(true)
    setRunError(null)
    try {
      await postJson('/api/run-weekly-report', {})
    } catch (e) {
      setRunError(e instanceof ApiError ? e.message : 'The report run failed.')
    } finally {
      setRunning(false)
      load()
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps flex items-center gap-1.5 text-accent-700">
            <Workflow className="h-3.5 w-3.5" aria-hidden="true" /> Automations
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Automation runs & AI trust</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={load}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
          <button type="button" className="btn-primary" onClick={() => void runNow()} disabled={running}>
            {running ? (
              <>
                <Spinner /> Running report…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden="true" /> Run weekly report now
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <Banner tone="danger" title="Could not load admin data">
          {error}
        </Banner>
      )}
      {runError && <Banner tone="danger" title="Weekly report run failed">{runError}</Banner>}
      {!data && !error && (
        <div className="flex items-center gap-2 font-mono text-sm text-zinc-500">
          <Spinner className="h-4 w-4 text-accent-600" /> Loading automations…
        </div>
      )}

      {data && (
        <>
          <TrustPanel trust={data.trust} />
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <RunsLog runs={data.runs} />
            <ReportPanel report={data.latestReport} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <NotificationsPanel items={data.notifications} />
            <AuditPanel items={data.audit} />
          </div>
        </>
      )}
    </div>
  )
}

function TrustPanel({ trust }: { trust: AdminData['trust'] }) {
  const rows = [
    { key: 'APPROVE', label: 'Approve', color: 'bg-emerald-500', n: trust.APPROVE },
    { key: 'APPROVE_WITH_NOTES', label: 'Approve with notes', color: 'bg-amber-300', n: trust.APPROVE_WITH_NOTES },
    { key: 'SWAP', label: 'Swap', color: 'bg-amber-500', n: trust.SWAP },
    { key: 'ESCALATE_TO_HUMAN', label: 'Escalate to human', color: 'bg-red-500', n: trust.ESCALATE_TO_HUMAN },
  ]
  const total = rows.reduce((s, r) => s + r.n, 0)
  return (
    <section className="card p-5" aria-labelledby="trust-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trust-h" className="flex items-center gap-2 text-base font-semibold text-zinc-900">
          <ShieldCheck className="h-4.5 w-4.5 text-accent-600" aria-hidden="true" /> AI trust panel
        </h2>
        <p className="font-mono text-xs text-zinc-500">
          {trust.searches} searches · {trust.verified} verified · {trust.humanReviewRequired} needed human review · {trust.errors} errors{trust.demo ? ` · ${trust.demo} demo` : ''}
        </p>
      </div>
      <p className="mt-1 text-sm text-zinc-600">How often the Fit Checker agreed with, corrected, or escalated the Part Finder's picks.</p>
      {total === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No verdicts yet — run a search on the Find Parts page.</p>
      ) : (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={rows.map((r) => `${r.label} ${r.n}`).join(', ')}>
            {rows.map((r) => r.n > 0 && <div key={r.key} className={`${r.color} border-r-2 border-white last:border-r-0`} style={{ width: `${(r.n / total) * 100}%` }} />)}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {rows.map((r) => (
              <div key={r.key}>
                <dt className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className={`h-2.5 w-2.5 rounded-sm ${r.color}`} aria-hidden="true" />
                  {r.label}
                </dt>
                <dd className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">
                  {r.n}
                  <span className="ml-1.5 text-xs font-normal text-zinc-500">{Math.round((r.n / total) * 100)}%</span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}

function RunsLog({ runs }: { runs: AutomationRun[] }) {
  return (
    <section className="card p-5" aria-labelledby="runs-h">
      <h2 id="runs-h" className="flex items-center gap-2 text-base font-semibold text-zinc-900">
        <Zap className="h-4.5 w-4.5 text-accent-600" aria-hidden="true" /> Automation Runs
      </h2>
      {runs.length === 0 && <p className="mt-3 text-sm text-zinc-600">No runs yet. Approve a part or run the weekly report.</p>}
      <ol className="mt-3 space-y-3">
        {runs.map((r) => (
          <li key={r.key} className="rounded-[12px] border border-zinc-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                {r.automation === 'weekly-gap-report' ? <CalendarClock className="h-4 w-4 text-cyan-600" aria-hidden="true" /> : <Workflow className="h-4 w-4 text-accent-600" aria-hidden="true" />}
                {AUTOMATION_LABEL[r.automation]}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                  r.status === 'succeeded' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : r.status === 'failed' ? 'border-red-300 bg-red-50 text-red-800' : 'border-zinc-200 bg-zinc-100 text-zinc-700'
                }`}
              >
                {r.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              <span className="font-medium text-zinc-800">Trigger:</span> {r.trigger}
            </p>
            <p className="font-mono text-[11px] text-zinc-500">
              {new Date(r.startedAt).toLocaleString()}
              {r.finishedAt && ` · ${((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)} s`}
            </p>
            <RunStepper steps={r.steps} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function ReportPanel({ report }: { report: GapReport | null }) {
  return (
    <section className="card p-5" aria-labelledby="report-h">
      <h2 id="report-h" className="flex items-center gap-2 text-base font-semibold text-zinc-900">
        <FileText className="h-4.5 w-4.5 text-accent-600" aria-hidden="true" /> Latest Weekly Library Gap Report
      </h2>
      {!report ? (
        <p className="mt-3 text-sm text-zinc-600">No report yet. It runs every Sunday 00:00 UTC, or click “Run weekly report now”.</p>
      ) : (
        <>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            {report.periodStart.slice(0, 10)} to {report.periodEnd.slice(0, 10)} · {report.totalSearches} searches · {report.gapSearches} with gaps · digest by{' '}
            {report.digestSource === 'llm' ? 'AI' : 'template'}
          </p>
          <div className="mt-3 whitespace-pre-wrap rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">{report.digest}</div>
          {report.clusters.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Gap clusters ranked by frequency</caption>
                <thead className="text-zinc-500">
                  <tr>
                    <th scope="col" className="py-1 pr-2 font-medium">#</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Category</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Key dimensions</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Count</th>
                    <th scope="col" className="py-1 font-medium">Reasons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {report.clusters.slice(0, 10).map((c, i) => (
                    <tr key={c.key} className="align-top">
                      <td className="py-1.5 pr-2 font-mono text-zinc-400">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-medium">{c.category}</td>
                      <td className="py-1.5 pr-2 font-mono text-zinc-600">{c.dims}</td>
                      <td className="py-1.5 pr-2 font-mono font-semibold">{c.count}</td>
                      <td className="py-1.5 text-zinc-600">
                        {Object.entries(c.reasons)
                          .map(([k, v]) => `${k} ×${v}`)
                          .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function NotificationsPanel({ items }: { items: AppNotification[] }) {
  return (
    <section className="card p-5" aria-labelledby="notif-h" id="notifications">
      <h2 id="notif-h" className="flex items-center gap-2 text-base font-semibold text-zinc-900">
        <Bell className="h-4.5 w-4.5 text-accent-600" aria-hidden="true" /> Notifications
      </h2>
      <p className="mt-0.5 text-xs text-zinc-500">Team messages from the automations. When NOTIFY_WEBHOOK_URL is set they are also posted to the webhook.</p>
      {items.length === 0 && <p className="mt-3 text-sm text-zinc-600">No notifications yet.</p>}
      <ul className="mt-3 space-y-2">
        {items.map((n) => (
          <li key={n.key} className="rounded-[10px] border border-zinc-200 bg-white/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{n.title}</span>
              <span className="font-mono text-[10px] text-zinc-400">
                {n.channel === 'webhook' ? 'webhook + in-app' : 'in-app'} · {new Date(n.at).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-700">{n.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AuditPanel({ items }: { items: AuditEntry[] }) {
  return (
    <section className="card p-5" aria-labelledby="audit-h">
      <h2 id="audit-h" className="flex items-center gap-2 text-base font-semibold text-zinc-900">
        <ScrollText className="h-4.5 w-4.5 text-accent-600" aria-hidden="true" /> Audit log
      </h2>
      {items.length === 0 && <p className="mt-3 text-sm text-zinc-600">No audit entries yet.</p>}
      <ul className="mt-3 divide-y divide-zinc-100">
        {items.map((a) => (
          <li key={a.key} className="py-2 text-xs">
            <span className="font-mono font-semibold text-zinc-800">{a.action}</span> <span className="text-zinc-600">by {a.actor}</span>
            <span className="ml-2 font-mono text-[10px] text-zinc-400">{new Date(a.at).toLocaleString()}</span>
            <details>
              <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-accent-700">details</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[11px] text-zinc-700">{JSON.stringify(a.details, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
