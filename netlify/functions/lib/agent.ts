/**
 * Generic Anthropic Messages API tool-use loop used by both agents.
 * The model decides which tool to call; we execute it, feed the result back,
 * and repeat until it returns a final JSON answer or the iteration cap is hit.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'
import { MODEL } from './prompts'
import type { TraceStep } from './schemas'

export const MAX_ITERATIONS = 5
/** Room for one turn of ~10 parallel check_compatibility calls, or the final JSON answer. */
export const MAX_TOKENS = 2500
/** Soft wall-clock budget per agent run; past this we force a final answer. */
export const DEADLINE_MS = 16_000

export interface AgentTool {
  definition: Anthropic.Tool
  /** Runs the tool. Return value is JSON-serialized and sent back to the model. */
  run: (input: Record<string, unknown>) => Promise<unknown> | unknown
  /** Live label for the UI, e.g. "Searching bearings with bore 8 mm…" */
  describe: (input: Record<string, unknown>) => string
  /** Short summary of the result for the trace. */
  summarize: (result: unknown) => string
  /** If true, calling this tool ends the run (used by ask_user). */
  terminal?: boolean
}

export interface AgentRunOptions<T> {
  name: string
  system: string
  userContent: Anthropic.ContentBlockParam[]
  tools: AgentTool[]
  schema: z.ZodType<T>
  onStep: (step: TraceStep) => void
}

export type AgentRunOutcome<T> =
  | { status: 'ok'; result: T; steps: TraceStep[]; iterations: number }
  | { status: 'question'; question: string; steps: TraceStep[]; iterations: number }
  | { status: 'error'; message: string; steps: TraceStep[]; iterations: number }

// Extra request params tuned for Sonnet 5.5: no extended thinking between tool calls (faster, keeps
// within max_tokens) and medium effort. If the gateway rejects them we drop them for the rest of the run.
let useTuningParams = true

async function createMessage(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming) {
  const tuned = useTuningParams
    ? { ...params, thinking: { type: 'between_tools' as const }, output_config: { effort: 'medium' as const } }
    : params
  try {
    return await client.messages.create(tuned, { timeout: 25_000, maxRetries: 0 })
  } catch (err) {
    if (useTuningParams && err instanceof Anthropic.BadRequestError) {
      useTuningParams = false
      return await client.messages.create(params, { timeout: 25_000, maxRetries: 0 })
    }
    throw err
  }
}

/** Pulls the first top-level JSON object out of a model reply (tolerates code fences or stray prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object found in the reply.')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export async function runAgent<T>(opts: AgentRunOptions<T>): Promise<AgentRunOutcome<T>> {
  const client = new Anthropic()
  const started = Date.now()
  const steps: TraceStep[] = []
  const emit = (s: Omit<TraceStep, 'index' | 'at'>) => {
    const step: TraceStep = { ...s, index: steps.length, at: new Date().toISOString() }
    steps.push(step)
    opts.onStep(step)
  }
  const toolMap = new Map(opts.tools.map((t) => [t.definition.name, t]))
  const toolDefs = opts.tools.map((t) => t.definition)
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.userContent }]

  let finalText = ''
  let iterations = 0
  // tool_use blocks in the last assistant turn that were never executed (e.g. the turn was cut at max_tokens).
  // Any follow-up user message must answer them with tool_result blocks or the API rejects the request.
  let unanswered: Anthropic.ToolUseBlock[] = []

  try {
    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      iterations = i
      const outOfTime = Date.now() - started > DEADLINE_MS
      const lastTurn = i === MAX_ITERATIONS || outOfTime
      const resp = await createMessage(client, {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: opts.system,
        tools: toolDefs,
        tool_choice: lastTurn ? { type: 'none' } : { type: 'auto' },
        messages,
      })
      messages.push({ role: 'assistant', content: resp.content })

      if (resp.stop_reason === 'refusal') {
        emit({ kind: 'error', label: 'The model declined this request.' })
        return { status: 'error', message: 'The AI declined to process this request. Try rephrasing the description.', steps, iterations }
      }

      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const note = textOf(resp.content)

      if (toolUses.length === 0 || resp.stop_reason !== 'tool_use') {
        unanswered = toolUses
        finalText = note
        if (resp.stop_reason === 'max_tokens') finalText += '\n[TRUNCATED]'
        break
      }

      if (note) emit({ kind: 'reasoning', label: note.length > 240 ? `${note.slice(0, 237)}…` : note, note })

      // A terminal tool (ask_user) stops the loop and returns the question to the engineer.
      const terminal = toolUses.find((t) => toolMap.get(t.name)?.terminal)
      if (terminal) {
        const input = terminal.input as Record<string, unknown>
        const tool = toolMap.get(terminal.name)!
        emit({ kind: 'tool', tool: terminal.name, args: input, label: tool.describe(input), resultSummary: 'Paused for engineer input' })
        return { status: 'question', question: String(input.question ?? 'Could you clarify the requirement?'), steps, iterations }
      }

      // Execute all tool calls from this turn and return every result in one user message.
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu) => {
          const tool = toolMap.get(tu.name)
          const input = (tu.input ?? {}) as Record<string, unknown>
          if (!tool) {
            emit({ kind: 'tool', tool: tu.name, args: input, label: `Unknown tool ${tu.name}`, resultSummary: 'error' })
            return { type: 'tool_result', tool_use_id: tu.id, content: `Unknown tool: ${tu.name}`, is_error: true }
          }
          try {
            const out = await tool.run(input)
            emit({ kind: 'tool', tool: tu.name, args: input, label: tool.describe(input), resultSummary: tool.summarize(out) })
            return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            emit({ kind: 'tool', tool: tu.name, args: input, label: tool.describe(input), resultSummary: `error: ${msg}` })
            return { type: 'tool_result', tool_use_id: tu.id, content: `Tool error: ${msg}`, is_error: true }
          }
        }),
      )

      const content: Anthropic.ContentBlockParam[] = [...results]
      const nextIsLast = i + 1 === MAX_ITERATIONS || Date.now() - started > DEADLINE_MS
      if (nextIsLast) {
        content.push({ type: 'text', text: 'Tool budget reached. Using what you have, reply now with ONLY the final JSON object.' })
      }
      messages.push({ role: 'user', content })
    }

    emit({ kind: 'info', label: 'Validating the structured answer…' })
    const parsed = parseFinal(finalText, opts.schema)
    if (parsed.ok) {
      emit({ kind: 'final', label: 'Answer validated' })
      return { status: 'ok', result: parsed.value, steps, iterations }
    }

    // One retry: show the model the validation error and ask for corrected JSON.
    emit({ kind: 'info', label: 'Answer did not match the schema — asking the model to fix it…', note: parsed.error })
    messages.push({
      role: 'user',
      content: [
        ...unanswered.map((tu): Anthropic.ToolResultBlockParam => ({ type: 'tool_result', tool_use_id: tu.id, content: 'Not executed: the turn ended before tools could run.', is_error: true })),
        {
          type: 'text',
          text: `Your final answer was not valid for the required JSON schema.\nError: ${parsed.error}\nReply with ONLY the corrected, complete JSON object. Be concise.`,
        },
      ],
    })
    const retry = await createMessage(client, {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: opts.system,
      tools: toolDefs,
      tool_choice: { type: 'none' },
      messages,
    })
    const reparsed = parseFinal(textOf(retry.content), opts.schema)
    if (reparsed.ok) {
      emit({ kind: 'final', label: 'Answer validated after one correction' })
      return { status: 'ok', result: reparsed.value, steps, iterations: iterations + 1 }
    }
    emit({ kind: 'error', label: 'The model returned an invalid answer twice.', note: reparsed.error })
    return { status: 'error', message: `The ${opts.name} returned an answer we could not read. Please try again, or switch on Demo mode.`, steps, iterations }
  } catch (err) {
    const message =
      err instanceof Anthropic.APIConnectionTimeoutError
        ? 'The AI service timed out.'
        : err instanceof Anthropic.RateLimitError
          ? 'The AI service is rate limited right now.'
          : err instanceof Anthropic.APIError
            ? `The AI service returned an error (${err.status ?? 'unknown'}).`
            : 'Unexpected error while running the agent.'
    console.error(`[${opts.name}]`, err)
    emit({ kind: 'error', label: message })
    return { status: 'error', message: `${message} Please retry, or switch on Demo mode.`, steps, iterations }
  }
}

function parseFinal<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  if (text.includes('[TRUNCATED]')) return { ok: false, error: 'The reply was cut off at the token limit. Shorten reasons and notes.' }
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
  const r = schema.safeParse(raw)
  if (r.success) return { ok: true, value: r.data }
  return {
    ok: false,
    error: r.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; '),
  }
}
