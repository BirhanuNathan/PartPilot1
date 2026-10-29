// Scheduled function: runs the Weekly Library Gap Report every Sunday 00:00 UTC.
import type { Config } from '@netlify/functions'
import { runWeeklyReport } from './lib/weekly-report'

export default async () => {
  const { run } = await runWeeklyReport('schedule: @weekly')
  console.log(`weekly gap report ${run.status}`)
}

export const config: Config = {
  schedule: '@weekly',
}
