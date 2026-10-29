/**
 * npm run test:examples — runs the golden-path home-page examples through the REAL Part Finder and Fit Checker
 * (same handlers, prompts, tools, rule engine and guardrails as production; live model calls, no mocks) and prints
 * PASS / FAIL per example.
 *
 * PASS means, for one run of one example:
 *   - no clarifying question, and every expected need is matched by a chosen part from the expected set;
 *   - every verdict is APPROVE or APPROVE_WITH_NOTES (no SWAP, no ESCALATE_TO_HUMAN) and humanReviewRequired is false;
 *   - Fit Checker overall confidence ≥ 0.8;
 *   - both agents together finish in under 30 s.
 *
 * Usage:
 *   npm run test:examples                       # in-process, needs ANTHROPIC_* / AI Gateway env (e.g. inside `netlify dev` env)
 *   npm run test:examples -- --runs 3           # repeat each example (default 3)
 *   npm run test:examples -- --url https://cad-parts-search.netlify.app   # call the deployed /api endpoints instead
 *   npm run test:examples -- --only nema17,idler --edge                    # subset; --edge also runs the safety edge case
 *   npm run test:examples -- --verbose                                     # print every agent step with timing
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_EXAMPLES, EDGE_EXAMPLE, EXAMPLES, type ExampleId, type ExamplePrompt } from '../src/demo/examples'
import type { AgentStreamEvent, FinderResult, VerifyResult } from '../netlify/functions/lib/schemas'
import type { Part } from '../netlify/functions/lib/catalog'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const RUNS = Number(arg('runs') ?? 3)
const BASE_URL = arg('url')?.replace(/\/$/, '')
const ONLY = arg('only')?.split(',') as ExampleId[] | undefined
const WITH_EDGE = args.includes('--edge')
const VERBOSE = args.includes('--verbose')
const TIME_LIMIT_MS = 30_000
const MIN_CONFIDENCE = 0.8

/** Acceptable part numbers per need (exact match or a genuine alternate). The agents never see this. */
const EXPECTED: Record<Exclude<ExampleId, 'pressure'>, { need: string; accept: string[] }[]> = {
  nema17: [
    { need: 'flat motor mount plate', accept: ['MP-NEMA17-FLAT-4-AL', 'MP-NEMA17-FLAT-5-AL'] },
    { need: 'M3 socket head screws', accept: ['SHCS-M3X0.5-10-88Z', 'SHCS-M3X0.5-10-A2'] },
    { need: 'Ø5 flanged bushing', accept: ['FB-5X8X6-BRZ', 'FB-5X8X6-POLY'] },
    { need: 'M3 standoffs', accept: ['SO-M3-20-FF-BR', 'SO-M3-20-FF-AL'] },
  ],
  enclosure: [
    { need: 'M4 button head screws', accept: ['BHCS-M4X0.7-10-109Z', 'BHCS-M4X0.7-10-A2'] },
    { need: 'M4 standoffs', accept: ['SO-M4-20-FF-AL', 'SO-M4-20-FF-BR'] },
    { need: 'rubber feet', accept: ['RF-20X8-M4-NBR', 'RF-20X8-M4-EPDM'] },
  ],
  idler: [
    { need: '6001 bearings', accept: ['BRG-6001-2RS', 'BRG-6001-ZZ'] },
    { need: 'Ø12 shaft', accept: ['SFT-12H6-200-CS', 'SFT-12H6-200-SS'] },
    { need: 'clamp collars', accept: ['SC-12-CL-AL', 'SC-12-CL-STL'] },
    { need: 'M6 hex bolts', accept: ['HB-M6X1-20-88Z', 'HB-M6X1-20-A2'] },
  ],
  pulley: [
    { need: 'GT2 20T pulley', accept: ['PUL-GT2-20T-5B-AL', 'PUL-GT2-20T-5B-STL'] },
    { need: 'Ø5 shaft', accept: ['SFT-5H6-100-CS', 'SFT-5H6-100-SS'] },
    { need: 'M3 set screws', accept: ['SS-M3X0.5-4-45H', 'SS-M3X0.5-4-A2'] },
    { need: 'Ø5 flanged bushing', accept: ['FB-5X8X6-BRZ', 'FB-5X8X6-POLY'] },
  ],
}

type Handler = (req: Request, context: unknown) => Promise<Response>
let handlers: { find: Handler; verify: Handler } | null = null

async function call(endpoint: 'find-parts' | 'verify-fit', body: unknown, onStep: (label: string) => void) {
  let res: Response
  if (BASE_URL) {
    res = await fetch(`${BASE_URL}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } else {
    if (!handlers) {
      // Functions read env through the Netlify global; provide it when running outside the Netlify runtime.
      ;(globalThis as Record<string, unknown>).Netlify ??= { env: { get: (k: string) => process.env[k] } }
      const find = (await import('../netlify/functions/find-parts.mts')).default as Handler
      const verify = (await import('../netlify/functions/verify-fit.mts')).default as Handler
      handlers = { find, verify }
    }
    const req = new Request(`http://local/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    res = await (endpoint === 'find-parts' ? handlers.find : handlers.verify)(req, { ip: 'test-examples' })
  }
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${await res.text()}`)
  // Read the NDJSON stream incrementally so step timings are real.
  let result: Extract<AgentStreamEvent, { type: 'result' }> | null = null
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const ev = JSON.parse(line) as AgentStreamEvent
      if (ev.type === 'step') onStep(ev.step.label)
      if (ev.type === 'error') throw new Error(`${endpoint}: ${ev.message}`)
      if (ev.type === 'result') result = ev
    }
    if (done) break
  }
  if (!result) throw new Error(`${endpoint}: stream ended without a result`)
  return result
}

interface RunReport {
  pass: boolean
  ms: number
  finderMs: number
  verifyMs: number
  confidence: number
  finderConfidence: number
  problems: string[]
  picks: string[]
  ruledOut: string[]
}

async function runOnce(ex: ExamplePrompt): Promise<RunReport> {
  const image = { mediaType: 'image/png' as const, data: readFileSync(join(root, 'public', ex.image)).toString('base64') }
  const body = { description: ex.description, constraints: ex.constraints, image }
  const problems: string[] = []
  const t0 = Date.now()
  const log = (agent: string) => (label: string) => VERBOSE && console.log(`      ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  [${agent}] ${label.slice(0, 150)}`)
  const found = await call('find-parts', body, log('finder'))
  const finderMs = Date.now() - t0
  const shortlist = found.result as FinderResult
  const parts = found.parts as Record<string, Part>
  if (shortlist.clarifyingQuestion) problems.push(`asked: "${shortlist.clarifyingQuestion}"`)
  if (!shortlist.needs.length) problems.push('no needs identified')
  for (const n of shortlist.needs) if (!n.candidates.length) problems.push(`no candidates for "${n.need}"`)
  if (problems.length) {
    return { pass: false, ms: finderMs, finderMs, verifyMs: 0, confidence: 0, finderConfidence: shortlist.confidence, problems, picks: [], ruledOut: [] }
  }

  const t1 = Date.now()
  const verified = await call('verify-fit', { ...body, shortlist }, log('checker'))
  const verifyMs = Date.now() - t1
  const ms = Date.now() - t0
  const v = verified.result as VerifyResult
  const allParts = { ...parts, ...(verified.parts as Record<string, Part>) }
  const pn = (id: string) => allParts[id]?.partNumber ?? id

  const picks = v.verdicts.map((x) => `${pn(x.partId)} ${x.verdict}`)
  const ruledOut = v.verdicts.flatMap((x) => (x.ruledOut ?? []).map((r) => `${r.partNumber} (${r.failed.join(', ')})`))
  for (const x of v.verdicts) if (x.verdict !== 'APPROVE' && x.verdict !== 'APPROVE_WITH_NOTES') problems.push(`${x.need}: ${x.verdict} ${pn(x.partId)}`)
  if (v.humanReviewRequired) problems.push(`human review: ${v.reasonsForReview.join(' | ')}`)
  if (v.overallConfidence < MIN_CONFIDENCE) problems.push(`confidence ${v.overallConfidence.toFixed(2)} < ${MIN_CONFIDENCE}`)
  if (ms >= TIME_LIMIT_MS) problems.push(`took ${(ms / 1000).toFixed(1)} s (limit 30 s)`)
  for (const n of shortlist.needs) if (!v.verdicts.some((x) => x.need === n.need)) problems.push(`no verdict for "${n.need}"`)
  const chosen = new Set(v.verdicts.map((x) => pn(x.partId)))
  const expected = EXPECTED[ex.id as keyof typeof EXPECTED] ?? []
  for (const e of expected) if (!e.accept.some((a) => chosen.has(a))) problems.push(`need "${e.need}" not matched (wanted ${e.accept.join(' or ')})`)

  return { pass: problems.length === 0, ms, finderMs, verifyMs, confidence: v.overallConfidence, finderConfidence: shortlist.confidence, problems, picks, ruledOut }
}

async function main() {
  const examples = (ONLY ? ALL_EXAMPLES.filter((e) => ONLY.includes(e.id)) : EXAMPLES).concat(WITH_EDGE && !ONLY?.includes('pressure') ? [EDGE_EXAMPLE] : [])
  console.log(`PartPilot golden-path examples — ${RUNS} run(s) each, ${BASE_URL ? `against ${BASE_URL}` : 'in-process (real handlers, live model)'}\n`)
  const summary: { id: string; title: string; passes: number; runs: number; times: number[] }[] = []

  for (const ex of examples) {
    const row = { id: ex.id, title: ex.title, passes: 0, runs: RUNS, times: [] as number[] }
    for (let i = 1; i <= RUNS; i++) {
      let r: RunReport
      try {
        r = await runOnce(ex)
      } catch (err) {
        r = { pass: false, ms: 0, finderMs: 0, verifyMs: 0, confidence: 0, finderConfidence: 0, problems: [err instanceof Error ? err.message : String(err)], picks: [], ruledOut: [] }
      }
      // The edge case is expected to end in human review; report it but never count it as a golden pass.
      const label = ex.kind === 'edge' ? (r.problems.some((p) => p.startsWith('human review')) ? 'REVIEW (expected)' : 'NO REVIEW (unexpected)') : r.pass ? 'PASS' : 'FAIL'
      if (r.pass && ex.kind === 'golden') row.passes++
      row.times.push(r.ms)
      console.log(
        `${label.padEnd(5)} ${ex.title} — run ${i}/${RUNS}  ${(r.ms / 1000).toFixed(1)} s (finder ${(r.finderMs / 1000).toFixed(1)} s, checker ${(r.verifyMs / 1000).toFixed(1)} s)  confidence ${r.finderConfidence.toFixed(2)} / ${r.confidence.toFixed(2)}`,
      )
      if (r.picks.length) console.log(`      picks: ${r.picks.join(' · ')}`)
      if (r.ruledOut.length) console.log(`      ruled out: ${r.ruledOut.join(' · ')}`)
      for (const p of r.problems) console.log(`      ! ${p}`)
    }
    summary.push(row)
  }

  console.log('\nSummary')
  for (const s of summary) {
    const avg = s.times.length ? s.times.reduce((a, b) => a + b, 0) / s.times.length / 1000 : 0
    const edge = s.id === 'pressure'
    console.log(`  ${edge ? 'EDGE' : s.passes === s.runs ? 'PASS' : 'FAIL'}  ${s.title.padEnd(34)} ${edge ? '(safety demo)' : `${s.passes}/${s.runs}`}  avg ${avg.toFixed(1)} s`)
  }
  const failed = summary.filter((s) => s.id !== 'pressure' && s.passes < s.runs)
  process.exitCode = failed.length ? 1 : 0
}

// Missing Blobs (when run outside Netlify) only affects rate limiting and search logs, which fail open; keep the output readable.
const origError = console.error
console.error = (...a: unknown[]) => {
  const msg = String(a[0] ?? '')
  if (/rate limit store error|search log (save|update) failed/.test(msg)) return
  origError(...a)
}

void main()
