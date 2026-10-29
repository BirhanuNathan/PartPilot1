// POST /api/log-search — records a Demo-mode replay in the search log so the weekly report and AI-trust
// panel reflect demo sessions too (entries are flagged demo: true). Live searches are logged by the agents themselves.
import type { Context } from '@netlify/functions'
import { z } from 'zod'
import { getPart } from './lib/catalog'
import { jsonError, rateLimit } from './lib/http'
import { FinderResultSchema, VerifyResultSchema } from './lib/schemas'
import { saveSearchLog, timeKey } from './lib/store'

const LogSchema = z.object({
  description: z.string().max(2000),
  constraints: z.record(z.string(), z.unknown()).default({}),
  hasImage: z.boolean().default(false),
  finder: FinderResultSchema,
  verify: VerifyResultSchema.optional(),
})

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.')
  const parsed = LogSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'Invalid log entry.')
  const limited = await rateLimit(context, 'log-search', 40)
  if (limited) return limited
  const { description, constraints, hasImage, finder, verify } = parsed.data
  const key = timeKey('searchlog')
  await saveSearchLog({
    id: key.split('/')[1],
    key,
    at: new Date().toISOString(),
    description,
    constraints,
    hasImage,
    demo: true,
    finderConfidence: finder.confidence,
    clarifyingQuestion: finder.clarifyingQuestion,
    needs: finder.needs.map((n) => ({
      need: n.need,
      category: n.category,
      requirement: n.requirement,
      candidateCount: n.candidates.filter((c) => getPart(c.partId)).length,
      topPartId: n.candidates[0]?.partId,
    })),
    verdicts: verify?.verdicts.filter((v) => getPart(v.partId)).map((v) => ({ need: v.need, partId: v.partId, verdict: v.verdict })),
    humanReviewRequired: verify?.humanReviewRequired,
  })
  return Response.json({ ok: true, searchId: key })
}
