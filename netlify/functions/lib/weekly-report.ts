/**
 * Automation 2 — Weekly Library Gap Report (fixed workflow, not an agent).
 * Steps: pull last week's search log → extract searches with no good match → cluster & rank
 * (deterministic) → write a plain-language digest (one LLM call) → save to Blobs → notify the catalog owner.
 */
import Anthropic from '@anthropic-ai/sdk'
import { RunLogger, type AutomationRun } from './automation'
import { getPart } from './catalog'
import { notifyTeam } from './notify'
import { DIGEST_PROMPT, MODEL } from './prompts'
import { listRecent, store, type SearchLogEntry } from './store'

export interface GapItem {
  category: string
  need: string
  reason: 'no-candidates' | 'swap' | 'escalated' | 'clarification-needed' | 'agent-error'
  dims: string
  description: string
  at: string
}

export interface GapCluster {
  key: string
  category: string
  dims: string
  count: number
  reasons: Record<string, number>
  exampleNeeds: string[]
  lastSeen: string
}

export interface GapReport {
  id: string
  generatedAt: string
  trigger: string
  periodStart: string
  periodEnd: string
  totalSearches: number
  gapSearches: number
  clusters: GapCluster[]
  digest: string
  digestSource: 'llm' | 'template'
}

const KEY_DIMS = ['thread', 'shaftDiameterMm', 'housingBoreMm', 'minLengthMm', 'maxLengthMm', 'minLoadN', 'material', 'unitSystem', 'motorFrame', 'beltProfile', 'gearModule']

function dimsSignature(req?: Record<string, unknown>): string {
  if (!req) return 'unspecified'
  const parts = KEY_DIMS.filter((k) => req[k] !== undefined && req[k] !== '').map((k) => {
    const v = req[k]
    // Round loads to the nearest 500 N so similar searches group together.
    if (k === 'minLoadN' && typeof v === 'number') return `load≥${Math.ceil(v / 500) * 500}N`
    if (k.endsWith('Mm')) return `${k.replace(/Mm$/, '').replace(/^min/, 'min ').replace(/^max/, 'max ')}=${v}mm`
    return `${k}=${v}`
  })
  return parts.length ? parts.join(', ') : 'unspecified'
}

export function extractGaps(entries: SearchLogEntry[]): GapItem[] {
  const gaps: GapItem[] = []
  for (const e of entries) {
    if (e.error) {
      gaps.push({ category: 'unknown', need: '(agent error)', reason: 'agent-error', dims: 'unspecified', description: e.description, at: e.at })
      continue
    }
    if (e.clarifyingQuestion && e.needs.length === 0) {
      gaps.push({ category: 'unknown', need: e.clarifyingQuestion, reason: 'clarification-needed', dims: 'unspecified', description: e.description, at: e.at })
    }
    for (const n of e.needs) {
      const verdict = e.verdicts?.find((v) => v.need === n.need)?.verdict
      const reason: GapItem['reason'] | null =
        n.candidateCount === 0 ? 'no-candidates' : verdict === 'SWAP' ? 'swap' : verdict === 'ESCALATE_TO_HUMAN' ? 'escalated' : null
      if (!reason) continue
      const category = n.category ?? (n.topPartId ? getPart(n.topPartId)?.category : undefined) ?? 'uncategorized'
      gaps.push({ category, need: n.need, reason, dims: dimsSignature(n.requirement), description: e.description, at: e.at })
    }
  }
  return gaps
}

export function clusterGaps(gaps: GapItem[]): GapCluster[] {
  const map = new Map<string, GapCluster>()
  for (const g of gaps) {
    const key = `${g.category}|${g.dims}`
    const c = map.get(key) ?? { key, category: g.category, dims: g.dims, count: 0, reasons: {}, exampleNeeds: [], lastSeen: g.at }
    c.count++
    c.reasons[g.reason] = (c.reasons[g.reason] ?? 0) + 1
    if (c.exampleNeeds.length < 3 && !c.exampleNeeds.includes(g.need)) c.exampleNeeds.push(g.need)
    if (g.at > c.lastSeen) c.lastSeen = g.at
    map.set(key, c)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
}

function templateDigest(r: Omit<GapReport, 'digest' | 'digestSource'>): string {
  if (r.clusters.length === 0) return `No library gaps this week: all ${r.totalSearches} search(es) found a verified part.`
  return [
    `${r.gapSearches} of ${r.totalSearches} searches this week did not end with a clean match.`,
    ...r.clusters.slice(0, 6).map((c) => `- ${c.category} (${c.dims}): ${c.count}× — ${Object.entries(c.reasons).map(([k, v]) => `${k} ${v}`).join(', ')}. e.g. "${c.exampleNeeds[0]}"`),
  ].join('\n')
}

async function llmDigest(r: Omit<GapReport, 'digest' | 'digestSource'>): Promise<string> {
  const client = new Anthropic()
  const resp = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 800,
      system: DIGEST_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ period: `${r.periodStart} → ${r.periodEnd}`, totalSearches: r.totalSearches, gapSearches: r.gapSearches, clusters: r.clusters.slice(0, 10) }),
        },
      ],
    },
    { timeout: 15_000, maxRetries: 1 },
  )
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!text) throw new Error('Empty digest')
  return text
}

export async function runWeeklyReport(trigger: string): Promise<{ run: AutomationRun; report?: GapReport }> {
  const log = new RunLogger('weekly-gap-report', trigger)
  const end = new Date()
  const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000)
  try {
    // Step 1 — pull the past week's search log
    const all = await listRecent<SearchLogEntry>('searchlog', 1000)
    const week = all.filter((e) => e.at >= start.toISOString())
    await log.step('Pulled past week of search log', 'done', `${week.length} search(es) since ${start.toISOString().slice(0, 10)}`)

    // Step 2 — extract searches without a good match
    const gaps = extractGaps(week)
    const gapSearches = new Set(gaps.map((g) => g.at + g.description)).size
    await log.step('Extracted searches with no good match', 'done', `${gaps.length} gap(s) across ${gapSearches} search(es)`)

    // Step 3 — cluster and rank (deterministic)
    const clusters = clusterGaps(gaps)
    await log.step('Clustered and ranked gaps', 'done', clusters.length ? `${clusters.length} cluster(s); top: ${clusters[0].category} (${clusters[0].dims}) ×${clusters[0].count}` : 'No clusters')

    const base = {
      id: `report_${end.toISOString().slice(0, 10)}_${end.getTime().toString(36)}`,
      generatedAt: end.toISOString(),
      trigger,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      totalSearches: week.length,
      gapSearches,
      clusters,
    }

    // Step 4 — plain-language digest (one LLM call; template fallback keeps the workflow reliable)
    let digest: string
    let digestSource: GapReport['digestSource'] = 'template'
    if (clusters.length === 0) {
      digest = templateDigest(base)
      await log.step('Wrote digest', 'done', 'No gaps — used template, no LLM call needed')
    } else {
      try {
        digest = await llmDigest(base)
        digestSource = 'llm'
        await log.step('Wrote plain-language digest', 'done', `LLM digest, ${digest.length} chars`)
      } catch (err) {
        console.error('digest LLM failed', err)
        digest = templateDigest(base)
        await log.step('Wrote digest', 'done', 'AI unavailable — used deterministic template')
      }
    }
    const report: GapReport = { ...base, digest, digestSource }

    // Step 5 — save to Blobs
    await store().setJSON(`reports/${report.id}`, report)
    await store().setJSON('reports-latest', report)
    await log.step('Saved report to Blobs', 'done', `reports/${report.id}`)

    // Step 6 — send to the catalog owner
    const sent = await notifyTeam('gap-report', `Weekly Library Gap Report (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})`, digest)
    await log.step('Sent report to catalog owner', 'done', sent.detail)

    const run = await log.finish('succeeded', { reportId: report.id, clusters: clusters.length })
    return { run, report }
  } catch (err) {
    console.error('weekly report failed', err)
    await log.step('Workflow error', 'failed', err instanceof Error ? err.message : String(err))
    return { run: await log.finish('failed') }
  }
}
