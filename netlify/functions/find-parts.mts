// Part Finder Agent — POST /api/find-parts
// Streams NDJSON: { type: "step" } events while the agent works, then { type: "result" } or { type: "error" }.
import type { Context } from '@netlify/functions'
import type Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './lib/agent'
import { getPart } from './lib/catalog'
import { jsonError, ndjsonStream, rateLimit, validateImage } from './lib/http'
import { PART_FINDER_PROMPT } from './lib/prompts'
import { FindRequestSchema, FinderResultSchema, type FinderResult } from './lib/schemas'
import { saveSearchLog, timeKey, type SearchLogEntry } from './lib/store'
import { askUserTool, getPartTool, listCategoriesTool, searchCatalogTool } from './lib/tools'

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Request body must be JSON.')
  }
  const parsed = FindRequestSchema.safeParse(body)
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request.')
  const { description, image, constraints } = parsed.data
  if (image) {
    const imgErr = validateImage(image)
    if (imgErr) return jsonError(400, imgErr, { code: 'BAD_IMAGE' })
  }

  const limited = await rateLimit(context, 'find-parts', 20)
  if (limited) return limited

  return ndjsonStream(async (send) => {
    const content: Anthropic.ContentBlockParam[] = []
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
    content.push({
      type: 'text',
      text: [
        `Engineer's description:\n"""${description}"""`,
        `Constraints: ${Object.keys(constraints).length ? JSON.stringify(constraints) : 'none stated'}`,
        image ? 'A CAD screenshot is attached above. Describe what you see first.' : 'No screenshot attached.',
      ].join('\n\n'),
    })

    const t0 = Date.now()
    send({
      type: 'step',
      step: { index: -1, kind: 'info', label: image ? 'Reading your screenshot and description…' : 'Reading your description…', at: new Date().toISOString() },
    })

    const outcome = await runAgent<FinderResult>({
      name: 'Part Finder',
      system: PART_FINDER_PROMPT,
      userContent: content,
      tools: [searchCatalogTool, getPartTool, listCategoriesTool, askUserTool],
      schema: FinderResultSchema,
      onStep: (step) => send({ type: 'step', step }),
    })

    const logKey = timeKey('searchlog')
    const baseLog: SearchLogEntry = {
      id: logKey.split('/')[1],
      key: logKey,
      at: new Date().toISOString(),
      description,
      constraints,
      hasImage: !!image,
      demo: false,
      needs: [],
    }

    if (outcome.status === 'error') {
      await saveSearchLog({ ...baseLog, error: outcome.message }).catch(() => {})
      send({ type: 'error', message: outcome.message, code: 'AGENT_ERROR' })
      return
    }

    let result: FinderResult
    if (outcome.status === 'question') {
      result = { understanding: 'More information is needed before choosing parts.', confidence: 0, needs: [], clarifyingQuestion: outcome.question }
    } else {
      // Drop hallucinated part ids and keep candidates ranked by score.
      result = {
        ...outcome.result,
        needs: outcome.result.needs.map((n) => ({
          ...n,
          candidates: n.candidates.filter((c) => getPart(c.partId)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 5),
        })),
      }
    }

    const parts: Record<string, unknown> = {}
    for (const n of result.needs) for (const c of n.candidates) parts[c.partId] = getPart(c.partId)

    await saveSearchLog({
      ...baseLog,
      finderConfidence: result.confidence,
      clarifyingQuestion: result.clarifyingQuestion,
      needs: result.needs.map((n) => ({
        need: n.need,
        category: n.category,
        requirement: n.requirement,
        candidateCount: n.candidates.length,
        topPartId: n.candidates[0]?.partId,
      })),
    }).catch((e) => console.error('search log save failed', e))

    send({ type: 'result', searchId: logKey, result, parts, meta: { iterations: outcome.iterations, elapsedMs: Date.now() - t0 } })
  })
}
