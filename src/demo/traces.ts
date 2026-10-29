/**
 * Demo mode: pre-recorded agent traces and results for the three example prompts.
 * Loaded lazily (dynamic import) so the catalog JSON only ships to the browser when Demo mode is used.
 * The Fit Checker "checks" are computed live with the same deterministic rule engine the agent calls.
 */
import { getPart } from '../../netlify/functions/lib/catalog'
import { checkCompatibility, type Requirement } from '../../netlify/functions/lib/compat'
import type { FinderResult, Part, TraceStep, VerifyResult } from '../lib/types'
import type { ExamplePrompt } from './examples'

const byPn = (pn: string): Part => {
  const p = getPart(pn)
  if (!p) throw new Error(`Demo references unknown part ${pn}`)
  return p
}
const id = (pn: string) => byPn(pn).id

export interface DemoStep extends Omit<TraceStep, 'index' | 'at'> {
  delay: number
}

export interface DemoRun {
  finder: { steps: DemoStep[]; result: FinderResult; parts: Record<string, Part> }
  verify: { steps: DemoStep[]; result: VerifyResult; parts: Record<string, Part> }
}

type NeedSpec = { need: string; category: string; requirement: Requirement; candidates: [string, number, string][] }
type VerdictSpec = { need: string; pn: string; original?: string; verdict: VerifyResult['verdicts'][number]['verdict']; notes: string }

function build(
  finderSteps: DemoStep[],
  understanding: string,
  vision: string,
  confidence: number,
  needs: NeedSpec[],
  verifySteps: DemoStep[],
  verdicts: VerdictSpec[],
  overallConfidence: number,
  reasons: string[],
): DemoRun {
  const finderResult: FinderResult = {
    understanding,
    visionObservations: vision,
    confidence,
    needs: needs.map((n) => ({
      need: n.need,
      category: n.category,
      requirement: n.requirement,
      candidates: n.candidates.map(([pn, score, reason]) => ({ partId: id(pn), matchScore: score, reason })),
    })),
  }
  const finderParts: Record<string, Part> = {}
  for (const n of needs) for (const [pn] of n.candidates) finderParts[id(pn)] = byPn(pn)

  const verifyParts: Record<string, Part> = {}
  const verifyResult: VerifyResult = {
    overallConfidence,
    humanReviewRequired: reasons.length > 0,
    reasonsForReview: reasons,
    verdicts: verdicts.map((v) => {
      const part = byPn(v.pn)
      verifyParts[part.id] = part
      if (v.original) verifyParts[id(v.original)] = byPn(v.original)
      const req = needs.find((n) => n.need === v.need)!.requirement
      return {
        need: v.need,
        partId: part.id,
        originalPartId: v.original ? id(v.original) : undefined,
        verdict: v.verdict,
        notes: v.notes,
        checks: checkCompatibility(part, req).checks,
      }
    }),
  }
  return { finder: { steps: finderSteps, result: finderResult, parts: finderParts }, verify: { steps: verifySteps, result: verifyResult, parts: verifyParts } }
}

const RUNS: Record<ExamplePrompt['id'], () => DemoRun> = {
  nema17: () =>
    build(
      [
        { kind: 'info', label: 'Reading your screenshot and description…', delay: 500 },
        { kind: 'reasoning', label: 'Screenshot shows a 4 mm plate with a Ø22.5 pilot bore, 4× Ø3.4 holes on a 31 mm square (NEMA 17 pattern) and an Ø8 shaft. I need a motor mount, M3 screws, a support bearing and a collar.', delay: 1400 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'motor mount', query: 'NEMA 17' }, label: 'Searching motor mount for NEMA 17…', resultSummary: '2 matches: MM-NEMA17-L-AL, MM-NEMA17-L-STL', delay: 900 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'fastener', filters: { thread: 'M3x0.5', minLengthMm: 8, maxLengthMm: 12 } }, label: 'Searching fastener with thread M3x0.5, length 8–12 mm…', resultSummary: '6 matches: SHCS-M3X0.5-8-88Z, SHCS-M3X0.5-8-A2, SHCS-M3X0.5-10-88Z, SHCS-M3X0.5-10-A2…', delay: 700 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'bearing', filters: { boreMm: 8 } }, label: 'Searching bearing with bore 8 mm…', resultSummary: '5 matches: BRG-688-2RS, BRG-608-2RS, BRG-608-ZZ, BRG-F608-2RS…', delay: 700 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'shaft collar', filters: { boreMm: 8 } }, label: 'Searching shaft collar with bore 8 mm…', resultSummary: '2 matches: SC-8-SS-STL, SC-8-CL-AL', delay: 700 },
        { kind: 'reasoning', label: 'Shortlisting: aluminum mount matches the drawing material; 608-2RS is the standard sealed 8 mm bearing; M3x8 is the shortest screw that clears the 4 mm plate.', delay: 1300 },
        { kind: 'info', label: 'Validating the structured answer…', delay: 400 },
        { kind: 'final', label: 'Answer validated', delay: 200 },
      ],
      'A NEMA 17 stepper mounted to a 4 mm aluminum plate, driving an 8 mm shaft that needs a support bearing and an axial collar.',
      'Front view: 42 mm plate, Ø22.5 pilot bore, 4× Ø3.4 THRU on 31 mm square — matches NEMA 17. Ø8 shaft at centre. Side view shows t = 4. Confident in the hole pattern; plate size inferred.',
      0.86,
      [
        { need: 'NEMA 17 motor mount', category: 'motor mount', requirement: { unitSystem: 'metric', motorFrame: 'NEMA 17', material: 'Aluminum' }, candidates: [['MM-NEMA17-L-AL', 0.93, 'NEMA 17, 31 mm pattern, 22.5 mm pilot, 4 mm aluminum like the drawing.'], ['MM-NEMA17-L-STL', 0.78, 'Same pattern in 3 mm steel; STEP only.']] },
        { need: 'M3 motor screws (×4)', category: 'fastener', requirement: { unitSystem: 'metric', thread: 'M3x0.5', clampThicknessMm: 4, tappedMaterial: 'aluminum', standard: 'ISO 4762' }, candidates: [['SHCS-M3X0.5-8-88Z', 0.82, 'M3x0.5 ISO 4762, 8 mm clears the 4 mm plate.'], ['SHCS-M3X0.5-10-88Z', 0.8, 'M3x0.5, 10 mm gives more engagement.']] },
        { need: 'Shaft support bearing', category: 'bearing', requirement: { unitSystem: 'metric', shaftDiameterMm: 8 }, candidates: [['BRG-608-2RS', 0.9, '8×22×7 sealed, standard 608.'], ['BRG-F608-2RS', 0.84, 'Flanged 608 if there is no shoulder in the housing.']] },
        { need: 'Shaft collar', category: 'shaft collar', requirement: { unitSystem: 'metric', shaftDiameterMm: 8 }, candidates: [['SC-8-SS-STL', 0.88, '8 mm bore DIN 705 set-screw collar.'], ['SC-8-CL-AL', 0.8, 'Clamp collar, no shaft marking.']] },
      ],
      [
        { kind: 'info', label: 'Reviewing the shortlist against the CAD rulebook…', delay: 500 },
        { kind: 'reasoning', label: 'Checking each top pick. The motor face is aluminum, so the 2×d engagement rule applies to the M3 screws.', delay: 1100 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('MM-NEMA17-L-AL') }, label: `Checking compatibility for ${id('MM-NEMA17-L-AL')}…`, resultSummary: 'MM-NEMA17-L-AL: PASS', delay: 600 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('SHCS-M3X0.5-8-88Z'), requirement: { thread: 'M3x0.5' } }, label: `Checking thread M3x0.5 for ${id('SHCS-M3X0.5-8-88Z')}…`, resultSummary: 'SHCS-M3X0.5-8-88Z: FAIL — fails thread_engagement', delay: 600 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('BRG-608-2RS'), requirement: { shaftDiameterMm: 8 } }, label: `Checking fit on Ø8 mm shaft for ${id('BRG-608-2RS')}…`, resultSummary: 'BRG-608-2RS: PASS', delay: 600 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('SC-8-SS-STL'), requirement: { shaftDiameterMm: 8 } }, label: `Checking fit on Ø8 mm shaft for ${id('SC-8-SS-STL')}…`, resultSummary: 'SC-8-SS-STL: PASS', delay: 600 },
        { kind: 'reasoning', label: 'M3x8 only gives 4 mm of thread in the aluminum motor face; need ≥ 6 mm. Checking the 10 mm alternate.', delay: 1000 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('SHCS-M3X0.5-10-88Z'), requirement: { thread: 'M3x0.5' } }, label: `Checking thread M3x0.5 for ${id('SHCS-M3X0.5-10-88Z')}…`, resultSummary: 'SHCS-M3X0.5-10-88Z: PASS', delay: 700 },
        { kind: 'info', label: 'Validating the structured answer…', delay: 400 },
        { kind: 'final', label: 'Answer validated', delay: 200 },
        { kind: 'info', label: 'Applied deterministic guardrails (rule re-check, confidence and safety thresholds)', delay: 200 },
      ],
      [
        { need: 'NEMA 17 motor mount', pn: 'MM-NEMA17-L-AL', verdict: 'APPROVE', notes: 'Pattern, pilot and material match the drawing; STEP and SLDPRT available.' },
        { need: 'M3 motor screws (×4)', pn: 'SHCS-M3X0.5-10-88Z', original: 'SHCS-M3X0.5-8-88Z', verdict: 'SWAP', notes: 'M3x8 leaves 4 mm engagement in the aluminum motor face (< 2×d = 6 mm). Swapped to M3x10: 6 mm engagement. Check motor thread depth is ≥ 6 mm.' },
        { need: 'Shaft support bearing', pn: 'BRG-608-2RS', verdict: 'APPROVE', notes: '8 mm bore exact; sealed for dust. Housing bore must be Ø22 H7.' },
        { need: 'Shaft collar', pn: 'SC-8-SS-STL', verdict: 'APPROVE_WITH_NOTES', notes: 'Set-screw collar marks a hardened shaft; use the clamp collar if the shaft must stay unmarked.' },
      ],
      0.84,
      [],
    ),

  shaft: () =>
    build(
      [
        { kind: 'info', label: 'Reading your screenshot and description…', delay: 500 },
        { kind: 'reasoning', label: 'Section view: Ø12 h6 shaft, Ø28 H7 bearing seat 8 mm deep in an aluminum housing, collar location marked. 12×28×8 is a 6001 bearing.', delay: 1400 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'bearing', filters: { boreMm: 12, outerDiameterMm: 28 } }, label: 'Searching bearing with bore 12 mm, OD 28 mm…', resultSummary: '1 match: BRG-6001-2RS', delay: 800 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'shaft collar', filters: { boreMm: 12 } }, label: 'Searching shaft collar with bore 12 mm…', resultSummary: '2 matches: SC-12-SS-STL, SC-12-CL-AL', delay: 700 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'shaft', filters: { boreMm: 12, minLengthMm: 150 } }, label: 'Searching shaft with bore 12 mm, length 150–… mm…', resultSummary: '1 match: SFT-12H6-200-CS', delay: 700 },
        { kind: 'info', label: 'Validating the structured answer…', delay: 400 },
        { kind: 'final', label: 'Answer validated', delay: 200 },
      ],
      'An idler shaft support: a 12 mm shaft running in a sealed bearing pressed into a Ø28 seat, located axially by a collar, under ~2 kN belt load.',
      'Read "Ø12 h6", "Ø28 H7 bearing seat", seat depth "8.0", and "Belt load ≈ 2 kN radial". Collar position marked with a question. High confidence on dimensions; shaft length inferred from the description.',
      0.8,
      [
        { need: 'Sealed bearing for Ø28 seat', category: 'bearing', requirement: { unitSystem: 'metric', shaftDiameterMm: 12, housingBoreMm: 28, minLoadN: 2000 }, candidates: [['BRG-6001-2RS', 0.95, '12×28×8 — exactly matches shaft, seat and depth.'], ['BRG-6201-2RS', 0.4, '12 mm bore but 32 mm OD; would need a different seat.']] },
        { need: 'Axial locating collar', category: 'shaft collar', requirement: { unitSystem: 'metric', shaftDiameterMm: 12 }, candidates: [['SC-12-SS-STL', 0.85, '12 mm bore DIN 705 collar.'], ['SC-12-CL-AL', 0.82, 'Clamp collar, does not mark the shaft.']] },
        { need: 'Ø12 idler shaft', category: 'shaft', requirement: { unitSystem: 'metric', shaftDiameterMm: 12, minLengthMm: 150, maxLengthMm: 250 }, candidates: [['SFT-12H6-200-CS', 0.83, 'Ø12 h6, 200 mm, hardened.']] },
      ],
      [
        { kind: 'info', label: 'Reviewing the shortlist against the CAD rulebook…', delay: 500 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('BRG-6001-2RS'), requirement: { shaftDiameterMm: 12 } }, label: `Checking fit on Ø12 mm shaft for ${id('BRG-6001-2RS')}…`, resultSummary: 'BRG-6001-2RS: PASS', delay: 700 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('SC-12-SS-STL'), requirement: { shaftDiameterMm: 12 } }, label: `Checking fit on Ø12 mm shaft for ${id('SC-12-SS-STL')}…`, resultSummary: 'SC-12-SS-STL: PASS', delay: 600 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('SFT-12H6-200-CS'), requirement: { shaftDiameterMm: 12 } }, label: `Checking fit on Ø12 mm shaft for ${id('SFT-12H6-200-CS')}…`, resultSummary: 'SFT-12H6-200-CS: PASS', delay: 600 },
        { kind: 'reasoning', label: 'All rules pass. 6001 C = 5.1 kN vs 2 kN gives SF 2.55. The collar is a set-screw type on a hardened shaft — use the clamp collar instead.', delay: 1100 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('SC-12-CL-AL'), requirement: { shaftDiameterMm: 12 } }, label: `Checking fit on Ø12 mm shaft for ${id('SC-12-CL-AL')}…`, resultSummary: 'SC-12-CL-AL: PASS', delay: 600 },
        { kind: 'info', label: 'Validating the structured answer…', delay: 400 },
        { kind: 'final', label: 'Answer validated', delay: 200 },
        { kind: 'info', label: 'Applied deterministic guardrails (rule re-check, confidence and safety thresholds)', delay: 200 },
      ],
      [
        { need: 'Sealed bearing for Ø28 seat', pn: 'BRG-6001-2RS', verdict: 'APPROVE', notes: 'Bore, OD and width match the seat; dynamic rating 5.1 kN gives SF 2.55 on 2 kN.' },
        { need: 'Axial locating collar', pn: 'SC-12-CL-AL', original: 'SC-12-SS-STL', verdict: 'SWAP', notes: 'A set screw on a hardened h6 shaft will not bite and will raise a burr; clamp collar holds without marking.' },
        { need: 'Ø12 idler shaft', pn: 'SFT-12H6-200-CS', verdict: 'APPROVE_WITH_NOTES', notes: 'Length 200 mm is inferred from "~200 mm"; confirm against the assembly before release.' },
      ],
      0.82,
      [],
    ),

  hoist: () =>
    build(
      [
        { kind: 'info', label: 'Reading your screenshot and description…', delay: 500 },
        { kind: 'reasoning', label: 'Top view: 8 mm S355 plate, 4× M6x1 tapped 12 deep on a 40 × 20 pattern, a 50×50×5 steel L-bracket footprint, hoist load ≈ 6 kN. This is a lifting application.', delay: 1500 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'fastener', filters: { thread: 'M6x1', minLengthMm: 14 } }, label: 'Searching fastener with thread M6x1, length 14–… mm…', resultSummary: '11 matches: HB-M6X1-16-88Z, HB-M6X1-20-88Z, HB-M6X1-25-88Z, HB-M6X1-30-88Z…', delay: 800 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'washer', filters: { thread: 'M6' } }, label: 'Searching washer with thread M6…', resultSummary: '1 match: FW-M6-A2', delay: 600 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'bracket', query: 'L-bracket 50' }, label: 'Searching bracket…', resultSummary: '6 matches: LB-50X50X5-STL, LB-50X50X5-AL, LB-40X40X4-STL, LB-40X40X4-AL…', delay: 700 },
        { kind: 'info', label: 'Validating the structured answer…', delay: 400 },
        { kind: 'final', label: 'Answer validated', delay: 200 },
      ],
      'A steel L-bracket bolted to a base plate with 4× M6 into tapped holes, carrying a ~6 kN hoist load — a safety-critical lifting joint.',
      'Read "4× M6x1 ↧ 12 THREAD", "Plate t = 8, S355", the 40 / 20 hole spacing and "Hoist load ≈ 6 kN". The bracket thickness (5 mm) comes from the description. Confident on threads; load path not shown.',
      0.74,
      [
        { need: 'M6 bracket bolts (×4)', category: 'fastener', requirement: { unitSystem: 'metric', thread: 'M6x1', clampThicknessMm: 5, tappedMaterial: 'steel', maxLengthMm: 17, minLoadN: 1500, matingMaterial: 'steel', safetyCritical: true }, candidates: [['HB-M6X1-20-88Z', 0.8, 'M6x1 ISO 4017 class 8.8, 20 mm.'], ['HB-M6X1-20-AL', 0.55, 'M6x1 20 mm, lightweight aluminum.'], ['HB-M6X1-16-88Z', 0.78, 'M6x1 class 8.8, 16 mm.']] },
        { need: 'M6 flat washers (×4)', category: 'washer', requirement: { unitSystem: 'metric', thread: 'M6' }, candidates: [['FW-M6-A2', 0.88, 'DIN 125 M6 washer.']] },
        { need: 'Steel L-bracket 50×50×5', category: 'bracket', requirement: { unitSystem: 'metric', material: 'Steel', minLoadN: 6000, safetyCritical: true }, candidates: [['LB-50X50X5-STL', 0.82, '50×50×5 steel, M6 clearance holes — matches the footprint.'], ['LB-50X50X5-AL', 0.5, 'Same size in aluminum.']] },
      ],
      [
        { kind: 'info', label: 'Reviewing the shortlist against the CAD rulebook…', delay: 500 },
        { kind: 'reasoning', label: 'Hoist = lifting load, so the rulebook says escalate regardless. Still checking numbers so the reviewer has evidence.', delay: 1000 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('HB-M6X1-20-88Z'), requirement: { thread: 'M6x1' } }, label: `Checking thread M6x1 for ${id('HB-M6X1-20-88Z')}…`, resultSummary: 'HB-M6X1-20-88Z: FAIL — fails length — warns safety_critical', delay: 700 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('HB-M6X1-20-AL'), requirement: { thread: 'M6x1' } }, label: `Checking thread M6x1 for ${id('HB-M6X1-20-AL')}…`, resultSummary: 'HB-M6X1-20-AL: FAIL — fails length, material_conflict', delay: 600 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('LB-50X50X5-STL'), requirement: { minLoadN: 6000 } }, label: `Checking load rating for 6000 N for ${id('LB-50X50X5-STL')}…`, resultSummary: 'LB-50X50X5-STL: FAIL — fails load_rating — warns safety_critical', delay: 700 },
        { kind: 'reasoning', label: '20 mm bolt would bottom out in a 12 mm deep thread (5 + 12 = 17 mm max). Checking 16 mm.', delay: 900 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('HB-M6X1-16-88Z'), requirement: { thread: 'M6x1' } }, label: `Checking thread M6x1 for ${id('HB-M6X1-16-88Z')}…`, resultSummary: 'HB-M6X1-16-88Z: WARN — warns safety_critical', delay: 600 },
        { kind: 'tool', tool: 'search_catalog', args: { category: 'bracket', filters: { minLoadN: 6000 } }, label: 'Searching bracket with load ≥ 6000 N…', resultSummary: 'No matches', delay: 700 },
        { kind: 'tool', tool: 'check_compatibility', args: { partId: id('FW-M6-A2'), requirement: { thread: 'M6' } }, label: `Checking thread M6 for ${id('FW-M6-A2')}…`, resultSummary: 'FW-M6-A2: PASS', delay: 500 },
        { kind: 'info', label: 'Validating the structured answer…', delay: 400 },
        { kind: 'final', label: 'Answer validated', delay: 200 },
        { kind: 'info', label: 'Applied deterministic guardrails (rule re-check, confidence and safety thresholds)', delay: 200 },
      ],
      [
        { need: 'M6 bracket bolts (×4)', pn: 'HB-M6X1-16-88Z', original: 'HB-M6X1-20-88Z', verdict: 'ESCALATE_TO_HUMAN', notes: 'Swapped 20 → 16 mm (20 mm bottoms out in 12 mm thread). 11 mm engagement ≥ 9 mm; 12 kN proof vs 1.5 kN per bolt. Lifting joint — needs engineer sign-off. Aluminum option rejected.' },
        { need: 'M6 flat washers (×4)', pn: 'FW-M6-A2', verdict: 'APPROVE_WITH_NOTES', notes: 'Fits M6. Stainless washer under zinc-plated head is acceptable indoors.' },
        { need: 'Steel L-bracket 50×50×5', pn: 'LB-50X50X5-STL', verdict: 'ESCALATE_TO_HUMAN', notes: 'Catalog rating 2.25 kN is below the 6 kN hoist load and no bracket in the library is rated ≥ 6 kN. Needs a custom or heavier bracket and a structural calc.' },
      ],
      0.62,
      [
        'Safety-critical lifting application (hoist ≈ 6 kN) — always requires engineer sign-off',
        'Steel L-bracket 50×50×5: LB-50X50X5-STL fails load_rating (2250 N < 6000 N); no rated alternative in the library',
        'Fit Checker confidence 0.62 is below 0.70',
      ],
    ),
}

export function getDemoRun(id: ExamplePrompt['id']): DemoRun {
  return RUNS[id]()
}

/** Replays steps with their recorded delays. Resolves when all steps have been emitted. */
export async function replay(steps: DemoStep[], onStep: (s: TraceStep) => void, signal?: AbortSignal) {
  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) return
    const { delay, ...rest } = steps[i]
    await new Promise((r) => setTimeout(r, delay))
    onStep({ ...rest, index: i, at: new Date().toISOString() })
  }
}
