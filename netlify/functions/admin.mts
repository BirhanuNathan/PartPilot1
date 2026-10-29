// GET /api/admin — data for the Admin / Automations page: runs, latest report, trust counts, notifications, audit.
import type { AutomationRun } from './lib/automation'
import type { AppNotification, AuditEntry } from './lib/notify'
import { listRecent, store, type SearchLogEntry } from './lib/store'
import type { GapReport } from './lib/weekly-report'

export default async () => {
  const [runs, notifications, audit, searches, latestReport] = await Promise.all([
    listRecent<AutomationRun>('runs', 25),
    listRecent<AppNotification>('notifications', 20),
    listRecent<AuditEntry>('audit', 20),
    listRecent<SearchLogEntry>('searchlog', 500),
    store().get('reports-latest', { type: 'json' }) as Promise<GapReport | null>,
  ])

  const trust = { APPROVE: 0, APPROVE_WITH_NOTES: 0, SWAP: 0, ESCALATE_TO_HUMAN: 0, searches: searches.length, verified: 0, humanReviewRequired: 0, errors: 0, demo: 0 }
  for (const s of searches) {
    if (s.demo) trust.demo++
    if (s.error) trust.errors++
    if (s.verdicts) {
      trust.verified++
      if (s.humanReviewRequired) trust.humanReviewRequired++
      for (const v of s.verdicts) {
        if (v.verdict in trust) trust[v.verdict as 'APPROVE']++
      }
    }
  }

  return Response.json({ runs, notifications, audit, trust, latestReport }, { headers: { 'Cache-Control': 'no-store' } })
}
