/** Tool definitions shared by the two agents. Each tool wraps the catalog or the rule engine. */
import { z } from 'zod'
import type { AgentTool } from './agent'
import { getPart, listCategories, searchCatalog, summarizePart, type CatalogFilters } from './catalog'
import { checkCompatibility, RequirementSchema, type CompatibilityReport } from './compat'

function jsonSchema(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest as { type: 'object'; properties?: Record<string, unknown>; required?: string[] }
}

const SearchInput = z.object({
  category: z.string().optional().describe('Catalog category, e.g. fastener, bearing, shaft collar, bracket, motor mount, shaft, bushing, spacer, standoff, pulley, gear, gasket, nut, washer, insert'),
  query: z.string().optional().describe('Free-text keywords ranked against name/tags, e.g. "socket head cap screw"'),
  filters: z
    .object({
      thread: z.string().optional().describe('e.g. "M6x1" or "M3" (any pitch)'),
      boreMm: z.number().optional().describe('Bore / inner diameter in mm (±0.1)'),
      outerDiameterMm: z.number().optional(),
      minLengthMm: z.number().optional(),
      maxLengthMm: z.number().optional(),
      material: z.string().optional().describe('Substring match, e.g. "stainless", "aluminum"'),
      standard: z.string().optional().describe('e.g. "ISO 4762" (DIN equivalents also match)'),
      unitSystem: z.enum(['metric', 'imperial']).optional(),
      minLoadN: z.number().optional(),
      cadFormat: z.string().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(15).optional(),
})

export const searchCatalogTool: AgentTool = {
  definition: {
    name: 'search_catalog',
    description:
      'Search the company parts library. Combine a category with dimensional filters. Returns matching parts with full dimensions. Empty results mean the filters are too tight — relax one at a time.',
    input_schema: jsonSchema(SearchInput),
  },
  run: (input) => {
    const parsed = SearchInput.parse(input)
    const filters: CatalogFilters = { category: parsed.category, query: parsed.query, limit: parsed.limit, ...(parsed.filters ?? {}) }
    const res = searchCatalog(filters)
    return { total: res.total, showing: res.results.length, results: res.results.map(summarizePart) }
  },
  describe: (input) => {
    const f = (input.filters ?? {}) as Record<string, unknown>
    const bits = [
      f.thread && `thread ${f.thread}`,
      f.boreMm !== undefined && `bore ${f.boreMm} mm`,
      f.outerDiameterMm !== undefined && `OD ${f.outerDiameterMm} mm`,
      (f.minLengthMm !== undefined || f.maxLengthMm !== undefined) && `length ${f.minLengthMm ?? '…'}–${f.maxLengthMm ?? '…'} mm`,
      f.material && `${f.material}`,
      f.standard && `${f.standard}`,
      f.unitSystem && `${f.unitSystem}`,
    ].filter(Boolean)
    const what = (input.category as string) || (input.query as string) || 'catalog'
    return `Searching ${what}${bits.length ? ` with ${bits.join(', ')}` : ''}…`
  },
  summarize: (r) => {
    const res = r as { total: number; results: { partNumber: string }[] }
    if (res.total === 0) return 'No matches'
    return `${res.total} match${res.total === 1 ? '' : 'es'}: ${res.results.slice(0, 4).map((p) => p.partNumber).join(', ')}${res.total > 4 ? '…' : ''}`
  },
}

const GetPartInput = z.object({ id: z.string().describe('Part id (e.g. "P0012") or part number') })

export const getPartTool: AgentTool = {
  definition: {
    name: 'get_part',
    description: 'Get the full record for one part by id or part number.',
    input_schema: jsonSchema(GetPartInput),
  },
  run: (input) => {
    const { id } = GetPartInput.parse(input)
    const p = getPart(id)
    if (!p) throw new Error(`No part with id ${id}`)
    return summarizePart(p)
  },
  describe: (input) => `Reading part ${String(input.id)}…`,
  summarize: (r) => {
    const p = r as { partNumber: string; name: string }
    return `${p.partNumber} — ${p.name}`
  },
}

export const listCategoriesTool: AgentTool = {
  definition: {
    name: 'list_categories',
    description: 'List catalog categories with part counts.',
    input_schema: { type: 'object', properties: {} },
  },
  run: () => listCategories(),
  describe: () => 'Listing catalog categories…',
  summarize: (r) => `${(r as unknown[]).length} categories`,
}

const AskUserInput = z.object({ question: z.string().describe('One concise question for the engineer') })

export const askUserTool: AgentTool = {
  definition: {
    name: 'ask_user',
    description:
      'Ask the engineer ONE clarifying question when critical information (e.g. shaft diameter, thread size) is missing and cannot be inferred. Ends your turn; the engineer will answer and re-run the search.',
    input_schema: jsonSchema(AskUserInput),
  },
  run: (input) => input,
  describe: (input) => `Asking the engineer: “${String(input.question)}”`,
  summarize: () => 'Waiting for the engineer',
  terminal: true,
}

const CheckInput = z.object({
  partId: z.string(),
  requirement: RequirementSchema,
})

export const checkCompatibilityTool: AgentTool = {
  definition: {
    name: 'check_compatibility',
    description:
      'Deterministic rule check of one part against a requirement. Compares unit system, thread & pitch, bore/shaft fit, housing fit, length, thread engagement (1.5×d steel / 2×d soft), material conflicts, load rating with SF 1.5, CAD format, standard (ISO/DIN equivalents) and flags safety-critical use. Returns pass/warn/fail per rule with numbers.',
    input_schema: jsonSchema(CheckInput),
  },
  run: (input) => {
    const { partId, requirement } = CheckInput.parse(input)
    const p = getPart(partId)
    if (!p) throw new Error(`No part with id ${partId}`)
    return checkCompatibility(p, requirement)
  },
  describe: (input) => {
    const req = (input.requirement ?? {}) as Record<string, unknown>
    const focus = req.thread
      ? `thread ${req.thread}`
      : req.shaftDiameterMm !== undefined
        ? `fit on Ø${req.shaftDiameterMm} mm shaft`
        : req.minLoadN !== undefined
          ? `load rating for ${req.minLoadN} N`
          : 'compatibility'
    return `Checking ${focus} for ${String(input.partId)}…`
  },
  summarize: (r) => {
    const rep = r as CompatibilityReport
    const fails = rep.checks.filter((c) => c.result === 'fail').map((c) => c.rule)
    const warns = rep.checks.filter((c) => c.result === 'warn').map((c) => c.rule)
    return `${rep.partNumber}: ${rep.overall.toUpperCase()}${fails.length ? ` — fails ${fails.join(', ')}` : ''}${warns.length ? ` — warns ${warns.join(', ')}` : ''}`
  },
}
