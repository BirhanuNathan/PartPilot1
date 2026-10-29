/** Netlify Blobs access for PartPilot. All persistent state lives in one site-wide store. */
import { getStore } from '@netlify/blobs'

export function store() {
  return getStore({ name: 'partpilot', consistency: 'strong' })
}

/** Sortable key: ISO timestamp + random suffix, so lexical order = chronological order. */
export function timeKey(prefix: string, date = new Date()): string {
  return `${prefix}/${date.toISOString()}-${Math.random().toString(36).slice(2, 8)}`
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Reads the most recent `limit` JSON entries under a prefix (newest first). */
export async function listRecent<T>(prefix: string, limit = 25): Promise<T[]> {
  const s = store()
  const { blobs } = await s.list({ prefix: `${prefix}/` })
  const keys = blobs
    .map((b) => b.key)
    .sort()
    .reverse()
    .slice(0, limit)
  const items = await Promise.all(keys.map((k) => s.get(k, { type: 'json' }) as Promise<T | null>))
  return items.filter((x): x is T => x !== null)
}

// ---------- Search log ----------

export interface SearchLogNeed {
  need: string
  category?: string
  requirement?: Record<string, unknown>
  candidateCount: number
  topPartId?: string
}

export interface SearchLogEntry {
  id: string
  key: string
  at: string
  description: string
  constraints: Record<string, unknown>
  hasImage: boolean
  demo: boolean
  finderConfidence?: number
  clarifyingQuestion?: string
  needs: SearchLogNeed[]
  verdicts?: { need: string; partId: string; verdict: string }[]
  humanReviewRequired?: boolean
  error?: string
}

export async function saveSearchLog(entry: SearchLogEntry) {
  await store().setJSON(entry.key, entry)
}

export async function getSearchLogByKey(key: string): Promise<SearchLogEntry | null> {
  if (!key.startsWith('searchlog/')) return null
  return (await store().get(key, { type: 'json' })) as SearchLogEntry | null
}
