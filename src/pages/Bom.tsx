import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Spinner, VerdictBadge } from '../components/ui'
import { getJson } from '../lib/api'
import type { Bom, VerdictType } from '../lib/types'

export function BomPage() {
  const [bom, setBom] = useState<Bom | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    getJson<Bom>('/api/bom')
      .then(setBom)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the BOM.'))
  }
  useEffect(load, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">Project</p>
          <h1 className="text-2xl font-bold tracking-tight">Bill of Materials</h1>
          {bom && <p className="mt-1 text-sm text-zinc-600">{bom.project} · {bom.lines.length} line(s) · updated {new Date(bom.updatedAt).toLocaleString()}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={load}>
            Refresh
          </button>
          <a className="btn-primary" href="/api/bom?format=csv" aria-disabled={!bom?.lines.length}>
            ⤓ Download bom.csv
          </a>
        </div>
      </div>

      <div className="mt-6">
        {error && (
          <Banner tone="danger" title="Could not load the BOM">
            {error}{' '}
            <button type="button" className="underline" onClick={load}>
              Retry
            </button>
          </Banner>
        )}
        {!bom && !error && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Spinner /> Loading BOM…
          </div>
        )}
        {bom && bom.lines.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600">
            No parts approved yet.{' '}
            <Link to="/" className="font-medium text-accent-700 hover:underline">
              Find parts
            </Link>{' '}
            and click “Approve & add to project”.
          </div>
        )}
        {bom && bom.lines.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Approved parts</caption>
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  {['#', 'Part number', 'Name', 'Need', 'Material', 'Standard', 'Qty', 'Verdict', 'Approved', 'CAD'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {bom.lines.map((l, i) => (
                  <tr key={l.lineId} className={l.humanReviewFlag ? 'bg-red-50/40' : ''}>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {l.partNumber}
                      {l.demo && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-sans text-[10px] font-semibold text-amber-900">demo</span>}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{l.name}</td>
                    <td className="px-3 py-2 text-zinc-600">{l.need}</td>
                    <td className="px-3 py-2 text-zinc-600">{l.material}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.standard}</td>
                    <td className="px-3 py-2 font-mono">{l.quantity}</td>
                    <td className="px-3 py-2">
                      <VerdictBadge verdict={l.verdict as VerdictType} />
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {l.approvedBy}
                      <br />
                      <span className="font-mono text-zinc-400">{new Date(l.approvedAt).toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2">
                      <a href={l.downloadUrl} target="_blank" rel="noreferrer noopener" className="font-mono text-xs text-accent-700 hover:underline">
                        {l.cadFormats.join('·')} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
