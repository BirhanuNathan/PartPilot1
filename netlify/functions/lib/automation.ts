/** Automation Runs log: every automation records its trigger and each step with a timestamp. */
import { store, timeKey } from './store'

export interface RunStep {
  name: string
  status: 'done' | 'skipped' | 'failed'
  at: string
  detail?: string
}

export interface AutomationRun {
  key: string
  automation: 'approval-pipeline' | 'weekly-gap-report'
  trigger: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'succeeded' | 'failed'
  steps: RunStep[]
  output?: Record<string, unknown>
}

export class RunLogger {
  run: AutomationRun

  constructor(automation: AutomationRun['automation'], trigger: string) {
    const now = new Date()
    this.run = { key: timeKey('runs', now), automation, trigger, startedAt: now.toISOString(), status: 'running', steps: [] }
  }

  async step(name: string, status: RunStep['status'], detail?: string) {
    this.run.steps.push({ name, status, detail, at: new Date().toISOString() })
    await this.save()
  }

  async finish(status: 'succeeded' | 'failed', output?: Record<string, unknown>) {
    this.run.status = status
    this.run.finishedAt = new Date().toISOString()
    if (output) this.run.output = output
    await this.save()
    return this.run
  }

  private async save() {
    try {
      await store().setJSON(this.run.key, this.run)
    } catch (err) {
      console.error('run log save failed', err)
    }
  }
}
