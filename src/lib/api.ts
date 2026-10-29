import type { AgentStreamEvent } from './types'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
  const fallback =
    res.status === 429
      ? 'Rate limit reached. Try again later or switch on Demo mode.'
      : res.status >= 500
        ? 'The server had a problem. Please retry.'
        : `Request failed (${res.status}).`
  return new ApiError(data?.error ?? fallback, res.status, data?.code)
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw await errorFrom(res)
  return (await res.json()) as T
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw await errorFrom(res)
  return (await res.json()) as T
}

/**
 * POSTs to an agent endpoint and reads the NDJSON event stream, calling onEvent for each event.
 * Resolves with the final `result` event, or throws ApiError on an `error` event / HTTP error / timeout.
 */
export async function streamAgent(
  url: string,
  body: unknown,
  onEvent: (ev: AgentStreamEvent) => void,
  { timeoutMs = 55_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Extract<AgentStreamEvent, { type: 'result' }>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
  signal?.addEventListener('abort', () => ctrl.abort())
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) throw await errorFrom(res)
    if (!res.body) throw new ApiError('Empty response from the server.', 502)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let final: Extract<AgentStreamEvent, { type: 'result' }> | null = null
    for (;;) {
      const { done, value } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let ev: AgentStreamEvent
        try {
          ev = JSON.parse(line) as AgentStreamEvent
        } catch {
          continue
        }
        onEvent(ev)
        if (ev.type === 'error') throw new ApiError(ev.message, 500, ev.code)
        if (ev.type === 'result') final = ev
      }
      if (done) break
    }
    if (!final) throw new ApiError('The agent stopped before returning a result (it may have timed out).', 504, 'TIMEOUT')
    return final
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (ctrl.signal.aborted) throw new ApiError('The agent took too long to respond.', 504, 'TIMEOUT')
    throw new ApiError('Network error — check your connection, or switch on Demo mode.', 0, 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}
