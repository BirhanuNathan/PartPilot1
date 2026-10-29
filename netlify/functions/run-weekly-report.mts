// POST /api/run-weekly-report — "Run weekly report now" button on the Admin page.
import type { Context } from '@netlify/functions'
import { jsonError, rateLimit } from './lib/http'
import { runWeeklyReport } from './lib/weekly-report'

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.')
  const limited = await rateLimit(context, 'weekly-report', 10)
  if (limited) return limited
  const { run, report } = await runWeeklyReport('manual: "Run weekly report now" button')
  return Response.json({ run, report }, { status: run.status === 'succeeded' ? 200 : 500 })
}
