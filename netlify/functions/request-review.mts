// POST /api/request-review — "Request human review" button. Notifies the team and writes an audit entry.
import { z } from 'zod'
import { getPart } from './lib/catalog'
import { jsonError } from './lib/http'
import { notifyTeam, writeAudit } from './lib/notify'

const ReviewSchema = z.object({
  requestedBy: z.string().trim().min(1).max(80),
  need: z.string().max(200),
  partId: z.string().max(40),
  verdict: z.string().max(40).optional(),
  reason: z.string().max(1000).optional(),
  searchId: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
})

export default async (req: Request) => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.')
  const parsed = ReviewSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request.')
  const r = parsed.data
  const part = getPart(r.partId)
  if (!part) return jsonError(400, 'Unknown part id.')

  const text = [
    `${r.requestedBy} requested a human review of ${part.partNumber} (${part.name}).`,
    `Need: ${r.need}${r.verdict ? ` — agent verdict ${r.verdict}` : ''}`,
    r.reason ? `Reason: ${r.reason}` : '',
    r.description ? `Context: "${r.description.slice(0, 200)}"` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const sent = await notifyTeam('review-request', `Human review requested: ${part.partNumber}`, text)
  await writeAudit('review.requested', r.requestedBy, { partNumber: part.partNumber, need: r.need, verdict: r.verdict, searchId: r.searchId })
  return Response.json({ ok: true, channel: sent.channel, detail: sent.detail })
}
