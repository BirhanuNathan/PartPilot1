/**
 * check_compatibility — the deterministic rule engine the Fit Checker agent calls.
 * Pure functions with no I/O, so the same code also runs in the browser to
 * compute checks for the pre-recorded demo traces.
 */
import { z } from 'zod'
import { COARSE_PITCH, parseMetricThread, partBore, partThread, standardsEquivalent, type Part } from './catalog'

export const RequirementSchema = z
  .object({
    unitSystem: z.enum(['metric', 'imperial']).optional().describe('Unit system of the assembly'),
    thread: z.string().optional().describe('Required thread, e.g. "M6x1" or "1/4-20 UNC"'),
    shaftDiameterMm: z.number().optional().describe('Diameter of the shaft the part must fit (bore must match)'),
    housingBoreMm: z.number().optional().describe('Housing bore the part outer diameter must fit'),
    minLengthMm: z.number().optional(),
    maxLengthMm: z.number().optional(),
    clampThicknessMm: z
      .number()
      .optional()
      .describe('Thickness of material clamped under a screw head, before it enters the tapped hole'),
    tappedMaterial: z.string().optional().describe('Material the screw threads into, e.g. "aluminum", "steel"'),
    material: z.string().optional().describe('Required part material, if specified'),
    matingMaterial: z.string().optional().describe('Material of the mating part'),
    minLoadN: z.number().optional().describe('Working load the part must carry, in newtons'),
    requiredCadFormat: z.string().optional().describe('CAD format required for import (default STEP)'),
    standard: z.string().optional(),
    motorFrame: z.string().optional().describe('e.g. "NEMA 17"'),
    beltProfile: z.string().optional().describe('e.g. "GT2"'),
    gearModule: z.number().optional(),
    safetyCritical: z.boolean().optional().describe('Load-bearing, lifting, pressure, or regulated use'),
  })

export type Requirement = z.infer<typeof RequirementSchema>

export type CheckResult = 'pass' | 'warn' | 'fail'

export interface Check {
  rule: string
  result: CheckResult
  expected?: string
  actual?: string
  detail: string
}

export interface CompatibilityReport {
  partId: string
  partNumber: string
  overall: CheckResult
  checks: Check[]
}

const has = (s: string | undefined, ...words: string[]) => !!s && words.some((w) => s.toLowerCase().includes(w))
const isSoft = (m?: string) => has(m, 'alumin', 'nylon', 'plastic', 'pom', 'abs', 'pla', 'polymer', 'brass')
const isSteel = (m?: string) => has(m, 'steel', 'iron', 'stainless')
const fmt = (n: number) => `${Math.round(n * 100) / 100}`

export function checkCompatibility(part: Part, req: Requirement): CompatibilityReport {
  const checks: Check[] = []
  const d = part.dimensions
  const isFastener = part.category === 'fastener'

  // 1. Never mix metric and imperial
  if (req.unitSystem) {
    const ok = part.unitSystem === req.unitSystem
    checks.push({
      rule: 'unit_system',
      result: ok ? 'pass' : 'fail',
      expected: req.unitSystem,
      actual: part.unitSystem,
      detail: ok ? 'Unit system matches the assembly.' : 'Mixed metric/imperial — never mix unit systems in one joint.',
    })
  }

  // 2. Thread size and pitch
  const pt = partThread(part)
  if (req.thread) {
    const want = parseMetricThread(req.thread)
    const got = pt ? parseMetricThread(pt) : null
    if (!pt) {
      checks.push({ rule: 'thread', result: 'fail', expected: req.thread, actual: 'none', detail: 'Part has no thread.' })
    } else if (want && got) {
      const wantPitch = want.pitch ?? COARSE_PITCH[want.d]
      const gotPitch = got.pitch ?? COARSE_PITCH[got.d]
      if (want.d !== got.d) {
        checks.push({ rule: 'thread', result: 'fail', expected: req.thread, actual: pt, detail: `Thread diameter M${got.d} ≠ required M${want.d}.` })
      } else if (wantPitch !== gotPitch) {
        checks.push({
          rule: 'thread',
          result: 'fail',
          expected: `M${want.d}x${wantPitch}`,
          actual: pt,
          detail: `Pitch mismatch: ${gotPitch} mm vs ${wantPitch} mm — will not engage the mating thread.`,
        })
      } else {
        checks.push({ rule: 'thread', result: 'pass', expected: `M${want.d}x${wantPitch}`, actual: pt, detail: 'Thread diameter and pitch match.' })
      }
    } else if (!!want !== !!got) {
      checks.push({ rule: 'thread', result: 'fail', expected: req.thread, actual: pt, detail: 'Metric vs imperial thread mismatch.' })
    } else {
      const c = (s: string) => s.toLowerCase().replace(/\s/g, '')
      const ok = c(pt).startsWith(c(req.thread)) || c(req.thread).startsWith(c(pt))
      checks.push({ rule: 'thread', result: ok ? 'pass' : 'fail', expected: req.thread, actual: pt, detail: ok ? 'Thread matches.' : 'Thread designation differs.' })
    }
  }

  // 3. Bore ↔ shaft fit
  if (req.shaftDiameterMm !== undefined) {
    const bore = part.category === 'shaft' ? d.diameterMm : partBore(part)
    if (bore === undefined) {
      checks.push({ rule: 'bore_fit', result: 'warn', expected: `${req.shaftDiameterMm} mm`, actual: 'n/a', detail: 'Part has no bore dimension to compare.' })
    } else {
      const diff = Math.abs(bore - req.shaftDiameterMm)
      const result: CheckResult = diff <= 0.05 ? 'pass' : diff <= 0.2 ? 'warn' : 'fail'
      checks.push({
        rule: 'bore_fit',
        result,
        expected: `${req.shaftDiameterMm} mm`,
        actual: `${bore} mm`,
        detail: result === 'pass' ? 'Bore matches shaft diameter.' : `Bore/shaft mismatch of ${fmt(diff)} mm.`,
      })
    }
  }

  // 4. Outer diameter ↔ housing
  if (req.housingBoreMm !== undefined) {
    const od = d.outerDiameterMm
    if (od === undefined) {
      checks.push({ rule: 'housing_fit', result: 'warn', expected: `${req.housingBoreMm} mm`, actual: 'n/a', detail: 'Part has no outer diameter.' })
    } else {
      const diff = Math.abs(od - req.housingBoreMm)
      const result: CheckResult = diff <= 0.05 ? 'pass' : 'fail'
      checks.push({ rule: 'housing_fit', result, expected: `${req.housingBoreMm} mm`, actual: `${od} mm`, detail: result === 'pass' ? 'OD matches housing bore.' : `OD off by ${fmt(diff)} mm.` })
    }
  }

  // 5. Length window
  const len = d.lengthMm
  if (req.minLengthMm !== undefined || req.maxLengthMm !== undefined) {
    const lo = req.minLengthMm ?? 0
    const hi = req.maxLengthMm ?? Infinity
    const ok = len !== undefined && len >= lo && len <= hi
    checks.push({
      rule: 'length',
      result: ok ? 'pass' : 'fail',
      expected: `${lo}–${hi === Infinity ? '∞' : hi} mm`,
      actual: len !== undefined ? `${len} mm` : 'n/a',
      detail: ok ? 'Length within range.' : 'Length outside the required range.',
    })
  }

  // 6. Thread engagement ≥ 1.5×d (2×d into soft material)
  if (isFastener && req.clampThicknessMm !== undefined && len !== undefined && d.nominalDiameterMm) {
    const factor = isSoft(req.tappedMaterial) ? 2 : 1.5
    const required = factor * d.nominalDiameterMm
    const engagement = len - req.clampThicknessMm
    const ok = engagement >= required
    checks.push({
      rule: 'thread_engagement',
      result: ok ? 'pass' : 'fail',
      expected: `≥ ${fmt(required)} mm (${factor}×d)`,
      actual: `${fmt(engagement)} mm`,
      detail: ok
        ? `Engagement ${fmt(engagement)} mm meets the ${factor}×d rule.`
        : `Only ${fmt(engagement)} mm engagement; need ≥ ${fmt(required)} mm — choose a screw ≥ ${Math.ceil(req.clampThicknessMm + required)} mm long.`,
    })
  }

  // 7. Material
  if (req.material) {
    const ok = part.material.toLowerCase().includes(req.material.toLowerCase())
    checks.push({ rule: 'material', result: ok ? 'pass' : 'warn', expected: req.material, actual: part.material, detail: ok ? 'Material as specified.' : 'Material differs from the stated requirement.' })
  }
  if (isFastener && isSoft(part.material) && (isSteel(req.matingMaterial) || isSteel(req.tappedMaterial) || (req.minLoadN ?? 0) > 0)) {
    checks.push({
      rule: 'material_conflict',
      result: 'fail',
      expected: 'Steel or stainless fastener',
      actual: part.material,
      detail: 'Soft (aluminum/polymer) fastener used against steel or under load — risk of thread stripping or fatigue.',
    })
  } else if (isFastener && has(part.material, 'stainless') && has(req.tappedMaterial ?? req.matingMaterial, 'alumin')) {
    checks.push({
      rule: 'galvanic',
      result: 'warn',
      expected: 'Isolated or compatible metals',
      actual: `${part.material} into aluminum`,
      detail: 'Stainless into aluminum can gall and corrode galvanically — use anti-seize or a coated fastener.',
    })
  }

  // 8. Load rating with a 1.5 safety factor
  if (req.minLoadN !== undefined) {
    if (part.loadRatingN === undefined) {
      checks.push({ rule: 'load_rating', result: 'warn', expected: `≥ ${fmt(req.minLoadN * 1.5)} N`, actual: 'not rated', detail: 'No load rating in the catalog — verify with the vendor.' })
    } else {
      const sf = part.loadRatingN / req.minLoadN
      const result: CheckResult = sf >= 1.5 ? 'pass' : sf >= 1 ? 'warn' : 'fail'
      checks.push({
        rule: 'load_rating',
        result,
        expected: `≥ ${fmt(req.minLoadN * 1.5)} N (SF 1.5)`,
        actual: `${part.loadRatingN} N (SF ${fmt(sf)})`,
        detail: result === 'pass' ? 'Load rating has adequate margin.' : result === 'warn' ? 'Rated above load but safety factor below 1.5.' : 'Load exceeds the part rating.',
      })
    }
  }

  // 9. CAD format available for import
  const fmtReq = req.requiredCadFormat ?? 'STEP'
  const hasFmt = part.cadFormats.some((f) => f.toLowerCase() === fmtReq.toLowerCase())
  checks.push({ rule: 'cad_format', result: hasFmt ? 'pass' : 'fail', expected: fmtReq, actual: part.cadFormats.join(', '), detail: hasFmt ? `${fmtReq} model available.` : `No ${fmtReq} model in the library.` })

  // 10. Standard
  if (req.standard) {
    const ok = standardsEquivalent(part.standard, req.standard)
    checks.push({ rule: 'standard', result: ok ? 'pass' : 'warn', expected: req.standard, actual: part.standard, detail: ok ? 'Standard matches (or ISO/DIN equivalent).' : 'Different standard — confirm interchangeability.' })
  }

  // 11. Interface specifics
  if (req.motorFrame) {
    const ok = String(d.motorFrame ?? '').toLowerCase().replace(/\s/g, '') === req.motorFrame.toLowerCase().replace(/\s/g, '')
    checks.push({ rule: 'motor_frame', result: ok ? 'pass' : 'fail', expected: req.motorFrame, actual: String(d.motorFrame ?? 'n/a'), detail: ok ? 'Motor frame matches.' : 'Motor frame / bolt pattern differs.' })
  }
  if (req.beltProfile) {
    const ok = String(d.profile ?? '').toLowerCase() === req.beltProfile.toLowerCase()
    checks.push({ rule: 'belt_profile', result: ok ? 'pass' : 'fail', expected: req.beltProfile, actual: String(d.profile ?? 'n/a'), detail: ok ? 'Belt profile matches.' : 'Belt profile differs.' })
  }
  if (req.gearModule !== undefined) {
    const ok = d.module === req.gearModule
    checks.push({ rule: 'gear_module', result: ok ? 'pass' : 'fail', expected: `m${req.gearModule}`, actual: d.module !== undefined ? `m${d.module}` : 'n/a', detail: ok ? 'Module matches.' : 'Gears of different module will not mesh.' })
  }

  // 12. Safety-critical uses always need a human
  const pressurePart = part.category === 'gasket'
  if (req.safetyCritical || pressurePart) {
    checks.push({
      rule: 'safety_critical',
      result: 'warn',
      detail: pressurePart ? 'Pressure/sealing part — requires engineer sign-off.' : 'Safety-critical / load-bearing use — requires engineer sign-off.',
    })
  }

  const overall: CheckResult = checks.some((c) => c.result === 'fail') ? 'fail' : checks.some((c) => c.result === 'warn') ? 'warn' : 'pass'
  return { partId: part.id, partNumber: part.partNumber, overall, checks }
}
