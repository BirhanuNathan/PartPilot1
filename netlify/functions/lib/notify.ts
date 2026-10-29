/** Team notifications (Slack-compatible webhook, falling back to the in-app panel) and the audit log. */
import { store, timeKey } from './store'

export interface AppNotification {
  key: string
  at: string
  kind: 'approval' | 'gap-report' | 'review-request'
  title: string
  text: string
  channel: 'webhook' | 'in-app'
}

/**
 * Sends a notification. If NOTIFY_WEBHOOK_URL is set we POST `{ text }` (Slack incoming-webhook format);
 * otherwise — or if the webhook fails — the message is written to the in-app Notifications panel.
 */
export async function notifyTeam(kind: AppNotification['kind'], title: string, text: string): Promise<{ channel: 'webhook' | 'in-app'; detail: string }> {
  const webhook = Netlify.env.get('NOTIFY_WEBHOOK_URL')
  let channel: 'webhook' | 'in-app' = 'in-app'
  let detail = 'Written to in-app Notifications panel'
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `*${title}*\n${text}` }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        channel = 'webhook'
        detail = 'Posted to team webhook'
      } else {
        detail = `Webhook returned ${res.status}; saved to in-app panel instead`
      }
    } catch {
      detail = 'Webhook unreachable; saved to in-app panel instead'
    }
  }
  // Always keep a copy in-app so the Admin page shows what was sent.
  const key = timeKey('notifications')
  const n: AppNotification = { key, at: new Date().toISOString(), kind, title, text, channel }
  await store().setJSON(key, n)
  return { channel, detail }
}

export interface AuditEntry {
  key: string
  at: string
  action: string
  actor: string
  details: Record<string, unknown>
}

export async function writeAudit(action: string, actor: string, details: Record<string, unknown>): Promise<AuditEntry> {
  const key = timeKey('audit')
  const entry: AuditEntry = { key, at: new Date().toISOString(), action, actor, details }
  await store().setJSON(key, entry)
  return entry
}
