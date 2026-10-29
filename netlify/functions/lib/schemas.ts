/**
 * Zod schemas shared by the functions and (as types) by the front end.
 * Every JSON object an LLM returns is validated against one of these.
 */
import { z } from 'zod'
import { RequirementSchema } from './compat'

export { RequirementSchema }

export const ConstraintsSchema = z
  .object({
    unitSystem: z.enum(['metric', 'imperial']).optional(),
    material: z.string().max(60).optional(),
    standard: z.string().max(30).optional(),
    maxLoadN: z.number().positive().max(1e7).optional(),
  })
  .default({})

export const ImageSchema = z.object({
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(16),
})

export const CandidateSchema = z.object({
  partId: z.string(),
  reason: z.string(),
  matchScore: z.number().min(0).max(1),
})

export const NeedSchema = z.object({
  need: z.string(),
  category: z.string().optional(),
  requirement: RequirementSchema.optional(),
  candidates: z.array(CandidateSchema).max(5),
})

export const FinderResultSchema = z.object({
  understanding: z.string(),
  visionObservations: z.string().optional(),
  confidence: z.number().min(0).max(1),
  needs: z.array(NeedSchema).max(8),
  clarifyingQuestion: z.string().optional(),
})

export const VerdictEnum = z.enum(['APPROVE', 'APPROVE_WITH_NOTES', 'SWAP', 'ESCALATE_TO_HUMAN'])

export const VerdictCheckSchema = z.object({
  rule: z.string(),
  result: z.enum(['pass', 'warn', 'fail']),
  expected: z.string().optional(),
  actual: z.string().optional(),
  detail: z.string(),
})

/** A shortlisted candidate the deterministic rule engine ruled out (added by the server, never by the LLM). */
export const RuledOutSchema = z.object({
  partId: z.string(),
  partNumber: z.string(),
  failed: z.array(z.string()),
  detail: z.string(),
})

export const VerdictSchema = z.object({
  need: z.string(),
  partId: z.string(),
  originalPartId: z.string().optional(),
  verdict: VerdictEnum,
  checks: z.array(VerdictCheckSchema).default([]),
  notes: z.string().default(''),
  ruledOut: z.array(RuledOutSchema).optional(),
})

export const VerifyResultSchema = z.object({
  verdicts: z.array(VerdictSchema),
  overallConfidence: z.number().min(0).max(1),
  humanReviewRequired: z.boolean(),
  reasonsForReview: z.array(z.string()).default([]),
})

export const FindRequestSchema = z.object({
  description: z.string().trim().min(5, 'Describe what you are building (at least a few words).').max(2000),
  image: ImageSchema.optional(),
  constraints: ConstraintsSchema,
})

export const VerifyRequestSchema = z.object({
  searchId: z.string().max(80).optional(),
  description: z.string().trim().min(5).max(2000),
  image: ImageSchema.optional(),
  constraints: ConstraintsSchema,
  shortlist: FinderResultSchema,
})

export type Constraints = z.infer<typeof ConstraintsSchema>
export type FinderResult = z.infer<typeof FinderResultSchema>
export type Need = z.infer<typeof NeedSchema>
export type Verdict = z.infer<typeof VerdictSchema>
export type RuledOut = z.infer<typeof RuledOutSchema>
export type VerdictType = z.infer<typeof VerdictEnum>
export type VerifyResult = z.infer<typeof VerifyResultSchema>

/** One entry in an agent's step trace, streamed to the UI as it happens. */
export interface TraceStep {
  index: number
  kind: 'info' | 'reasoning' | 'tool' | 'final' | 'error'
  /** Human-friendly label, e.g. "Searching bearings with bore 8 mm…" */
  label: string
  tool?: string
  args?: unknown
  resultSummary?: string
  note?: string
  at: string
}

/** Events in the NDJSON stream returned by /api/find-parts and /api/verify-fit. */
export type AgentStreamEvent =
  | { type: 'step'; step: TraceStep }
  | { type: 'result'; searchId?: string; result: unknown; parts: Record<string, unknown>; meta?: Record<string, unknown> }
  | { type: 'error'; message: string; code?: string }
