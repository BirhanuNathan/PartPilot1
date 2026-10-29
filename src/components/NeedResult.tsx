import type { Check, Need, Part, Verdict } from '../lib/types'
import { keyDims, Meter, PartGlyph, VerdictBadge } from './ui'

const RESULT_CLS = { pass: 'text-emerald-700', warn: 'text-amber-700', fail: 'text-red-700' }
const RESULT_ICON = { pass: '✓', warn: '!', fail: '✕' }

function ChecksTable({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null
  return (
    <details className="group mt-3" open={checks.some((c) => c.result === 'fail')}>
      <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900">
        Rule checks ({checks.filter((c) => c.result === 'pass').length}/{checks.length} pass)
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">Rule</th>
              <th scope="col" className="py-1 pr-2 font-medium">Result</th>
              <th scope="col" className="py-1 pr-2 font-medium">Expected</th>
              <th scope="col" className="py-1 pr-2 font-medium">Actual</th>
              <th scope="col" className="py-1 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {checks.map((c, i) => (
              <tr key={i} className="align-top">
                <td className="py-1.5 pr-2 font-mono text-zinc-800">{c.rule}</td>
                <td className={`py-1.5 pr-2 font-semibold ${RESULT_CLS[c.result]}`}>
                  <span aria-hidden="true">{RESULT_ICON[c.result]}</span> {c.result}
                </td>
                <td className="py-1.5 pr-2 font-mono text-zinc-600">{c.expected ?? '—'}</td>
                <td className="py-1.5 pr-2 font-mono text-zinc-600">{c.actual ?? '—'}</td>
                <td className="py-1.5 text-zinc-600">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export interface NeedResultProps {
  need: Need
  verdict?: Verdict
  parts: Record<string, Part>
  verifying: boolean
  approved: boolean
  busy: boolean
  onApprove: () => void
  onRequestReview: () => void
}

/** One result card per need: the chosen part (after Fit Checker), its verdict, checks and actions. */
export function NeedResult({ need, verdict, parts, verifying, approved, busy, onApprove, onRequestReview }: NeedResultProps) {
  const top = need.candidates[0]
  const partId = verdict?.partId ?? top?.partId
  const part = partId ? parts[partId] : undefined
  const candidate = need.candidates.find((c) => c.partId === partId)
  const original = verdict?.originalPartId ? parts[verdict.originalPartId] : undefined
  const others = need.candidates.filter((c) => c.partId !== partId && c.partId !== verdict?.originalPartId)

  if (!part) {
    return (
      <article className="card p-5">
        <p className="label-caps">{need.category ?? 'Need'}</p>
        <h3 className="mt-1 font-semibold">{need.need}</h3>
        <p className="mt-2 text-sm text-zinc-600">No matching part was found in the library for this need. It will be included in the weekly Library Gap Report.</p>
      </article>
    )
  }

  const needsReview = verdict?.verdict === 'ESCALATE_TO_HUMAN'
  const border = needsReview ? 'border-l-red-500' : verdict?.verdict === 'APPROVE' ? 'border-l-emerald-500' : verdict ? 'border-l-amber-400' : 'border-l-zinc-300'

  return (
    <article className={`card border-l-4 ${border} p-5`} aria-label={`${need.need}: ${part.partNumber}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="label-caps">{need.need}</p>
        </div>
        {verifying && !verdict ? <span className="text-xs text-zinc-500">Fit Checker reviewing…</span> : <VerdictBadge verdict={verdict?.verdict} />}
      </div>

      <div className="mt-3 flex gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 grid-paper">
          <PartGlyph category={part.category} className="h-14 w-14" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-base font-semibold tracking-tight text-zinc-900">{part.partNumber}</p>
          <p className="text-sm text-zinc-700">{part.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keyDims(part.dimensions).map(([k, v]) => (
              <span key={k} className="chip">
                <span className="mr-1 text-zinc-400">{k}</span>
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Standard</dt>
          <dd className="font-mono text-zinc-800">{part.standard}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Material</dt>
          <dd className="text-zinc-800">{part.material}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">CAD formats</dt>
          <dd className="font-mono text-zinc-800">{part.cadFormats.join(' · ')}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Match score</dt>
          <dd>{candidate ? <Meter value={candidate.matchScore} label="Match score" /> : <span className="text-zinc-500">alternate</span>}</dd>
        </div>
        {part.loadRatingN !== undefined && (
          <div>
            <dt className="text-zinc-500">Load rating</dt>
            <dd className="font-mono text-zinc-800">{part.loadRatingN.toLocaleString()} N</dd>
          </div>
        )}
      </dl>

      {original && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⇄ Replaces Part Finder's pick <span className="font-mono font-semibold line-through">{original.partNumber}</span>
        </p>
      )}

      <div className="mt-3 space-y-1.5 text-sm">
        {candidate && (
          <p className="text-zinc-700">
            <span className="font-medium text-zinc-900">Why: </span>
            {candidate.reason}
          </p>
        )}
        {verdict?.notes && (
          <p className="text-zinc-700">
            <span className="font-medium text-zinc-900">Fit Checker: </span>
            {verdict.notes}
          </p>
        )}
      </div>

      {verdict && <ChecksTable checks={verdict.checks} />}

      {others.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900">Other candidates ({others.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {others.map((c) => (
              <li key={c.partId} className="flex items-start justify-between gap-3 text-xs">
                <span>
                  <span className="font-mono font-semibold text-zinc-800">{parts[c.partId]?.partNumber ?? c.partId}</span>
                  <span className="text-zinc-600"> — {c.reason}</span>
                </span>
                <span className="font-mono text-zinc-500">{c.matchScore.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
        <button type="button" className="btn-primary" onClick={onApprove} disabled={busy || approved || (verifying && !verdict)}>
          {approved ? '✓ Added to project' : 'Approve & add to project'}
        </button>
        <a className="btn-secondary" href={part.downloadUrl} target="_blank" rel="noreferrer noopener">
          Open in parts library ↗
        </a>
        <button type="button" className={needsReview ? 'btn-secondary border-red-300 text-red-800 hover:bg-red-50' : 'btn-ghost'} onClick={onRequestReview} disabled={busy}>
          Request human review
        </button>
      </div>
    </article>
  )
}
