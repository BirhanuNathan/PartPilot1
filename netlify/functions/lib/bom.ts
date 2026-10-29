/** Bill of Materials + import package helpers used by the approval pipeline. */
import { getPart, type Part } from './catalog'
import { store } from './store'

export interface PackageRecord {
  id: string
  createdAt: string
  project: string
  files: { bom: { filename: string; content: string }; instructions: { filename: string; content: string } }
  links: { partNumber: string; url: string; formats: string[] }[]
}

export const BOM_KEY = 'bom/default'

export interface BomLine {
  lineId: string
  partId: string
  partNumber: string
  name: string
  category: string
  standard: string
  material: string
  quantity: number
  need: string
  verdict: string
  humanReviewFlag: boolean
  notes: string
  approvedBy: string
  approvedAt: string
  searchId?: string
  cadFormats: string[]
  downloadUrl: string
  demo: boolean
}

export interface Bom {
  project: string
  updatedAt: string
  lines: BomLine[]
}

export async function readBom(): Promise<Bom> {
  const bom = (await store().get(BOM_KEY, { type: 'json' })) as Bom | null
  return bom ?? { project: 'Default project', updatedAt: new Date().toISOString(), lines: [] }
}

export async function writeBom(bom: Bom) {
  await store().setJSON(BOM_KEY, bom)
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function bomToCsv(lines: BomLine[]): string {
  const header = ['Line', 'Part Number', 'Name', 'Category', 'Standard', 'Material', 'Qty', 'Need', 'Verdict', 'Human Review', 'Approved By', 'Approved At', 'CAD Formats', 'Download URL']
  const rows = lines.map((l, i) => [
    i + 1,
    l.partNumber,
    l.name,
    l.category,
    l.standard,
    l.material,
    l.quantity,
    l.need,
    l.verdict,
    l.humanReviewFlag ? 'YES' : 'no',
    l.approvedBy,
    l.approvedAt,
    l.cadFormats.join(' '),
    l.downloadUrl,
  ])
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Filename convention: partpilot_<project-slug>_<YYYYMMDD-HHMM>_<kind>.<ext> */
export function packageFilename(project: string, at: Date, kind: 'bom' | 'import-instructions', ext: 'csv' | 'txt') {
  const slug = project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project'
  const stamp = at.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
  return `partpilot_${slug}_${stamp}_${kind}.${ext}`
}

export function importInstructions(project: string, lines: BomLine[], at: Date): string {
  const out: string[] = []
  out.push(`PartPilot import package — ${project}`)
  out.push(`Generated ${at.toISOString()}`)
  out.push('')
  out.push('1. Download each STEP model below (preferred neutral format; native SLDPRT where listed).')
  out.push('2. In your CAD tool, Insert > Component > From file, and place each part at the mating feature noted.')
  out.push('3. Apply mates: concentric for bores/shafts, coincident for faces, and check thread callouts match the holes.')
  out.push('4. Parts flagged HUMAN REVIEW must be signed off by a responsible engineer before release.')
  out.push('')
  lines.forEach((l, i) => {
    out.push(`[${i + 1}] ${l.partNumber} x${l.quantity} — ${l.name}`)
    out.push(`    Need: ${l.need}`)
    out.push(`    Verdict: ${l.verdict}${l.humanReviewFlag ? '  ** HUMAN REVIEW REQUIRED **' : ''}`)
    if (l.notes) out.push(`    Notes: ${l.notes}`)
    out.push(`    Formats: ${l.cadFormats.join(', ')}`)
    out.push(`    Download: ${l.downloadUrl}`)
    out.push('')
  })
  return out.join('\n')
}

export function lineFromPart(part: Part, fields: Omit<BomLine, 'lineId' | 'partId' | 'partNumber' | 'name' | 'category' | 'standard' | 'material' | 'cadFormats' | 'downloadUrl'>): BomLine {
  return {
    lineId: `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    partId: part.id,
    partNumber: part.partNumber,
    name: part.name,
    category: part.category,
    standard: part.standard,
    material: part.material,
    cadFormats: part.cadFormats,
    downloadUrl: part.downloadUrl,
    ...fields,
  }
}

export { getPart }
