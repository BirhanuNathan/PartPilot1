// Fit Checker Agent — POST /api/verify-fit
// Reviews the Part Finder's shortlist like a skeptical senior engineer. Streams NDJSON like find-parts.
import type { Context } from '@netlify/functions'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './lib/agent'
import { getPart } from './lib/catalog'
import { checkCompatibility } from './lib/compat'
import { jsonError, ndjsonStream, rateLimit, validateImage } from './lib/http'
import { FIT_CHECKER_PROMPT } from './lib/prompts'
import { VerifyRequestSchema, VerifyResultSchema, type FinderResult, type VerifyResult } from './lib/schemas'
import { getSearchLogByKey, saveSearchLog } from './lib/store'
import { checkCompatibilityTool, getPartTool, searchCatalogTool } from './lib/tools'

/**
 * Deterministic guardrails applied on top of the LLM's verdicts:
 * - re-run the rule engine on the chosen part and use its numbers as the shown checks;
 * - an APPROVE on a part that fails a rule is downgraded to ESCALATE_TO_HUMAN;
 * - low confidence, safety-critical needs, or any escalation force human review.
 */
function applyGuardrails(result: VerifyResult, shortlist: FinderResult): VerifyResult {
  const reasons = new Set(result.reasonsForReview)
  const verdicts = result.verdicts
    .filter((v) => getPart(v.partId))
    .map((v) => {
      const need = shortlist.needs.find((n) => n.need === v.need)
      const part = getPart(v.partId)!
      if (!need?.requirement) return v
      const report = checkCompatibility(part, need.requirement)
      let verdict = v.verdict
      let notes = v.notes
      if (report.overall === 'fail' && verdict !== 'ESCALATE_TO_HUMAN') {
        verdict = 'ESCALATE_TO_HUMAN'
        const failed = report.checks.filter((c) => c.result === 'fail').map((c) => c.rule)
        notes = `${notes ? notes + ' ' : ''}Guardrail: deterministic check failed (${failed.join(', ')}).`
        reasons.add(`${v.need}: ${part.partNumber} fails ${failed.join(', ')}`)
      }
      if (need.requirement.safetyCritical && verdict !== 'ESCALATE_TO_HUMAN') {
        verdict = 'ESCALATE_TO_HUMAN'
        reasons.add(`${v.need}: safety-critical use requires engineer sign-off`)
      }
      return { ...v, verdict, notes, checks: report.checks }
    })

  if (result.overallConfidence < 0.7) reasons.add(`Fit Checker confidence ${result.overallConfidence.toFixed(2)} is below 0.70`)
  if (shortlist.confidence < 0.7) reasons.add(`Part Finder confidence ${shortlist.confidence.toFixed(2)} is below 0.70`)
  for (const v of verdicts) if (v.verdict === 'ESCALATE_TO_HUMAN') reasons.add(`${v.need}: escalated — ${v.notes.slice(0, 140)}`)
  for (const n of shortlist.needs) if (!verdicts.some((v) => v.need === n.need)) reasons.add(`${n.need}: no verified part`)

  const humanReviewRequired = result.humanReviewRequired || reasons.size > 0
  return { ...result, verdicts, humanReviewRequired, reasonsForReview: [...reasons] }
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Request body must be JSON.')
  }
  const parsed = VerifyRequestSchema.safeParse(body)
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request.')
  const { description, image, constraints, shortlist, searchId } = parsed.data
  if (image) {
    const imgErr = validateImage(image)
    if (imgErr) return jsonError(400, imgErr, { code: 'BAD_IMAGE' })
  }
  if (shortlist.needs.length === 0) return jsonError(400, 'Nothing to verify — the shortlist is empty.')

  const limited = await rateLimit(context, 'verify-fit', 20)
  if (limited) return limited

  return ndjsonStream(async (send) => {
    // Only send what the reviewer needs; attach full part records so it can start checking immediately.
    const shortlistForModel = shortlist.needs.map((n) => ({
      need: n.need,
      category: n.category,
      requirement: n.requirement ?? {},
      candidates: n.candidates.map((c) => ({ ...c, part: getPart(c.partId) })),
    }))
    const content: Anthropic.ContentBlockParam[] = []
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
    content.push({
      type: 'text',
      text: [
        `Original description:\n"""${description}"""`,
        `Constraints: ${Object.keys(constraints).length ? JSON.stringify(constraints) : 'none stated'}`,
        `Part Finder understanding: ${shortlist.understanding}`,
        shortlist.visionObservations ? `Part Finder screenshot observations: ${shortlist.visionObservations}` : '',
        `Part Finder confidence: ${shortlist.confidence}`,
        `Shortlist to review:\n${JSON.stringify(shortlistForModel)}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    })

    const t0 = Date.now()
    send({ type: 'step', step: { index: -1, kind: 'info', label: 'Reviewing the shortlist against the CAD rulebook…', at: new Date().toISOString() } })

    const outcome = await runAgent<VerifyResult>({
      name: 'Fit Checker',
      system: FIT_CHECKER_PROMPT,
      userContent: content,
      tools: [getPartTool, checkCompatibilityTool, searchCatalogTool],
      schema: VerifyResultSchema,
      onStep: (step) => send({ type: 'step', step }),
    })

    if (outcome.status !== 'ok') {
      send({ type: 'error', message: outcome.status === 'error' ? outcome.message : 'The Fit Checker could not finish.', code: 'AGENT_ERROR' })
      return
    }

    const result = applyGuardrails(outcome.result, shortlist)
    send({ type: 'step', step: { index: 999, kind: 'info', label: 'Applied deterministic guardrails (rule re-check, confidence and safety thresholds)', at: new Date().toISOString() } })

    const parts: Record<string, unknown> = {}
    for (const v of result.verdicts) {
      parts[v.partId] = getPart(v.partId)
      if (v.originalPartId && getPart(v.originalPartId)) parts[v.originalPartId] = getPart(v.originalPartId)
    }

    if (searchId) {
      const log = await getSearchLogByKey(searchId).catch(() => null)
      if (log) {
        await saveSearchLog({
          ...log,
          verdicts: result.verdicts.map((v) => ({ need: v.need, partId: v.partId, verdict: v.verdict })),
          humanReviewRequired: result.humanReviewRequired,
        }).catch((e) => console.error('search log update failed', e))
      }
    }

    send({ type: 'result', searchId, result, parts, meta: { iterations: outcome.iterations, elapsedMs: Date.now() - t0 } })
  })
}
