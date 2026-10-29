// Shared types come straight from the function schemas so client and server never drift.
export type {
  AgentStreamEvent,
  Constraints,
  FinderResult,
  Need,
  TraceStep,
  Verdict,
  VerdictType,
  VerifyResult,
} from '../../netlify/functions/lib/schemas'
export type { Part } from '../../netlify/functions/lib/catalog'
export type { Check } from '../../netlify/functions/lib/compat'
export type { AutomationRun, RunStep } from '../../netlify/functions/lib/automation'
export type { AppNotification, AuditEntry } from '../../netlify/functions/lib/notify'
export type { GapReport, GapCluster } from '../../netlify/functions/lib/weekly-report'
export type { Bom, BomLine } from '../../netlify/functions/lib/bom'

export interface ImagePayload {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  data: string
}
