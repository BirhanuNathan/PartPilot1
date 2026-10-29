/** Small HTTP helpers: JSON errors, NDJSON streaming, upload validation, and per-IP rate limiting. */
import type { Context } from '@netlify/functions'
import { store } from './store'
import type { AgentStreamEvent } from './schemas'

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status })
}

/** Streams newline-delimited JSON events so the UI can render agent steps live. */
export function ndjsonStream(run: (send: (ev: AgentStreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const send = (ev: AgentStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'))
      try {
        await run(send)
      } catch (err) {
        console.error(err)
        send({ type: 'error', message: 'Something went wrong on the server. Please retry, or switch on Demo mode.' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}

// ---------- Upload validation (never trust the client) ----------

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
}

/** Returns an error message, or null if the image is an acceptable PNG/JPEG/WebP under 4 MB. */
export function validateImage(img: { mediaType: string; data: string }): string | null {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(img.data.slice(0, 2000))) return 'Screenshot data is not valid base64.'
  const approxBytes = Math.floor((img.data.length * 3) / 4)
  if (approxBytes > MAX_IMAGE_BYTES) return 'Screenshot is larger than 4 MB. Please use a smaller image.'
  const check = MAGIC[img.mediaType]
  if (!check) return 'Only PNG, JPEG, or WebP screenshots are accepted.'
  const head = Buffer.from(img.data.slice(0, 24), 'base64')
  if (!check(new Uint8Array(head))) return 'The screenshot file does not match its declared image type.'
  return null
}

// ---------- Rate limiting ----------

/**
 * Fixed-window rate limit stored in Blobs: `limit` requests per IP per hour per bucket.
 * Returns null when allowed, or a 429 Response when the limit is exceeded.
 */
export async function rateLimit(context: Context, bucket: string, limit: number): Promise<Response | null> {
  const ip = context.ip || 'unknown'
  const hour = new Date().toISOString().slice(0, 13)
  const ipKey = Buffer.from(ip).toString('base64url')
  const key = `ratelimit/${bucket}/${hour}/${ipKey}`
  try {
    const s = store()
    const current = ((await s.get(key, { type: 'json' })) as { count: number } | null)?.count ?? 0
    if (current >= limit) {
      return jsonError(429, `Rate limit reached: ${limit} requests per hour for this feature. Try again later, or switch on Demo mode.`, {
        code: 'RATE_LIMITED',
      })
    }
    await s.setJSON(key, { count: current + 1 })
  } catch (err) {
    // If Blobs is unavailable we fail open rather than blocking the engineer.
    console.error('rate limit store error', err)
  }
  return null
}
