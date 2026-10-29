/**
 * Parts catalog access layer.
 *
 * Everything in PartPilot (agents, automations, UI) reads parts ONLY through
 * `searchCatalog(filters)`, `getPart(id)` and `listCategories()`. Today they are
 * backed by the seed file `data/parts.json`; to connect the company's real parts
 * library, replace the bodies of these three functions with calls to the
 * library's search API or a database query and keep the return shapes the same.
 * Nothing else in the codebase needs to change.
 */
import partsData from '../../../data/parts.json'

/** Base URL of the company parts library. Change this one constant to point downloads at the real library. */
export const LIBRARY_BASE_URL = 'https://example-parts-library.com/part/'

export type UnitSystem = 'metric' | 'imperial'

export interface PartDimensions {
  thread?: string
  nominalDiameterMm?: number
  pitchMm?: number
  lengthMm?: number
  boreMm?: number
  outerDiameterMm?: number
  innerDiameterMm?: number
  diameterMm?: number
  widthMm?: number
  thicknessMm?: number
  [key: string]: string | number | undefined
}

export interface Part {
  id: string
  partNumber: string
  name: string
  category: string
  standard: string
  material: string
  unitSystem: UnitSystem
  dimensions: PartDimensions
  loadRatingN?: number
  tags: string[]
  cadFormats: string[]
  downloadUrl: string
}

export interface CatalogFilters {
  category?: string
  query?: string
  material?: string
  standard?: string
  unitSystem?: UnitSystem
  thread?: string
  boreMm?: number
  outerDiameterMm?: number
  minLengthMm?: number
  maxLengthMm?: number
  minLoadN?: number
  cadFormat?: string
  limit?: number
}

export interface CatalogSearchResult {
  total: number
  results: Part[]
  appliedFilters: CatalogFilters
}

const PARTS: Part[] = (partsData as Omit<Part, 'downloadUrl'>[]).map((p) => ({
  ...p,
  unitSystem: (p.unitSystem ?? 'metric') as UnitSystem,
  downloadUrl: `${LIBRARY_BASE_URL}${encodeURIComponent(p.partNumber)}`,
}))

const CATEGORY_SYNONYMS: Record<string, string> = {
  bolt: 'fastener',
  bolts: 'fastener',
  screw: 'fastener',
  screws: 'fastener',
  'cap screw': 'fastener',
  fasteners: 'fastener',
  nuts: 'nut',
  washers: 'washer',
  bearings: 'bearing',
  'pillow block': 'bearing',
  collar: 'shaft collar',
  collars: 'shaft collar',
  'shaft collars': 'shaft collar',
  brackets: 'bracket',
  'l-bracket': 'bracket',
  'angle bracket': 'bracket',
  shafts: 'shaft',
  rod: 'shaft',
  gears: 'gear',
  pulleys: 'pulley',
  bushings: 'bushing',
  'sleeve bearing': 'bushing',
  spacers: 'spacer',
  standoffs: 'standoff',
  'o-ring': 'gasket',
  seal: 'gasket',
  gaskets: 'gasket',
  'motor mounts': 'motor mount',
  inserts: 'insert',
  'set screw': 'fastener',
  'set screws': 'fastener',
  'grub screw': 'fastener',
  'button head screw': 'fastener',
  'hex bolt': 'fastener',
  'socket head cap screw': 'fastener',
  'motor plate': 'motor mount',
  'mounting plate': 'motor mount',
  'motor mount plate': 'motor mount',
  'flanged bushing': 'bushing',
  'timing pulley': 'pulley',
  feet: 'foot',
  'rubber foot': 'foot',
  'rubber feet': 'foot',
  bumper: 'foot',
  bumpers: 'foot',
}

/** ISO/DIN equivalents; used so "DIN 912" also finds ISO 4762 parts. */
export const STANDARD_EQUIVALENTS: string[][] = [
  ['ISO 4762', 'DIN 912'],
  ['ISO 4017', 'DIN 933'],
  ['ISO 4014', 'DIN 931'],
  ['ISO 4032', 'DIN 934'],
  ['ISO 7089', 'DIN 125'],
  ['ISO 15', 'DIN 625'],
  ['ISO 2795', 'DIN 1850'],
]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function normalizeCategory(category: string): string {
  const c = norm(category)
  return CATEGORY_SYNONYMS[c] ?? c
}

export function standardsEquivalent(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  return STANDARD_EQUIVALENTS.some((group) => {
    const g = group.map(norm)
    return g.some((x) => na.includes(x)) && g.some((x) => nb.includes(x))
  })
}

/** Parses "M6x1", "M6 x 1.0", "m6" → { d: 6, pitch?: 1 }. Returns null for non-metric threads. */
export function parseMetricThread(thread: string): { d: number; pitch?: number } | null {
  const m = thread.replace(/\s+/g, '').match(/^M(\d+(?:\.\d+)?)(?:[x×]([\d.]+))?/i)
  if (!m) return null
  return { d: Number(m[1]), pitch: m[2] ? Number(m[2]) : undefined }
}

/** ISO 261 coarse pitches, used when a thread is given without pitch. */
export const COARSE_PITCH: Record<number, number> = { 2: 0.4, 2.5: 0.45, 3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75 }

export function partThread(p: Part): string | undefined {
  const d = p.dimensions
  return (d.thread as string) ?? (d.holeForThread as string) ?? (d.fitsThread as string) ?? undefined
}

/** The "hole" diameter a part exposes to a shaft: bearing/collar/pulley bore, washer ID. */
export function partBore(p: Part): number | undefined {
  const d = p.dimensions
  return d.boreMm ?? d.innerDiameterMm
}

function threadMatches(partT: string | undefined, wanted: string): boolean {
  if (!partT) return false
  const w = parseMetricThread(wanted)
  const pt = parseMetricThread(partT)
  if (w && pt) return w.d === pt.d && (w.pitch === undefined || w.pitch === pt.pitch)
  if (w || pt) return false
  const compact = (s: string) => norm(s).replace(/\s/g, '')
  return compact(partT).startsWith(compact(wanted)) || compact(wanted).startsWith(compact(partT))
}

function textScore(p: Part, query: string): number {
  const tokens = norm(query).split(/[^a-z0-9.\-/]+/).filter((t) => t.length > 1)
  if (tokens.length === 0) return 0
  const hay = norm([p.name, p.partNumber, p.category, p.material, p.standard, ...p.tags].join(' '))
  return tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) / tokens.length
}

export function searchCatalog(filters: CatalogFilters): CatalogSearchResult {
  const limit = Math.min(Math.max(filters.limit ?? 8, 1), 15)
  const cat = filters.category ? normalizeCategory(filters.category) : undefined
  const tol = 0.1

  let matches = PARTS.filter((p) => {
    if (cat && p.category !== cat) return false
    if (filters.unitSystem && p.unitSystem !== filters.unitSystem) return false
    if (filters.material && !norm(p.material).includes(norm(filters.material))) return false
    if (filters.standard && !standardsEquivalent(p.standard, filters.standard)) return false
    if (filters.thread && !threadMatches(partThread(p), filters.thread)) return false
    if (filters.boreMm !== undefined) {
      const b = partBore(p) ?? p.dimensions.diameterMm
      if (b === undefined || Math.abs(b - filters.boreMm) > tol) return false
    }
    if (filters.outerDiameterMm !== undefined) {
      const od = p.dimensions.outerDiameterMm ?? (p.category === 'shaft' ? p.dimensions.diameterMm : undefined)
      if (od === undefined || Math.abs(od - filters.outerDiameterMm) > tol) return false
    }
    const len = p.dimensions.lengthMm ?? (p.dimensions.legLengthMm as number | undefined)
    if (filters.minLengthMm !== undefined && (len === undefined || len < filters.minLengthMm)) return false
    if (filters.maxLengthMm !== undefined && (len === undefined || len > filters.maxLengthMm)) return false
    if (filters.minLoadN !== undefined && (p.loadRatingN === undefined || p.loadRatingN < filters.minLoadN)) return false
    if (filters.cadFormat && !p.cadFormats.map(norm).includes(norm(filters.cadFormat))) return false
    return true
  })

  if (filters.query) {
    const scored = matches.map((p) => ({ p, s: textScore(p, filters.query!) }))
    // With no structured filters, the free-text query must actually match something.
    const structured = Object.keys(filters).some((k) => !['query', 'limit'].includes(k))
    matches = scored
      .filter((x) => structured || x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p)
  }

  return { total: matches.length, results: matches.slice(0, limit), appliedFilters: filters }
}

export function getPart(id: string): Part | null {
  return PARTS.find((p) => p.id === id || p.partNumber === id) ?? null
}

export function listCategories(): { category: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of PARTS) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
}

/** Compact representation sent to the LLM to keep tool results small. */
export function summarizePart(p: Part) {
  return {
    id: p.id,
    partNumber: p.partNumber,
    name: p.name,
    category: p.category,
    standard: p.standard,
    material: p.material,
    unitSystem: p.unitSystem,
    dimensions: p.dimensions,
    loadRatingN: p.loadRatingN,
    cadFormats: p.cadFormats,
  }
}
