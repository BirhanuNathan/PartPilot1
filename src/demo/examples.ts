import type { Constraints } from '../lib/types'

export type ExampleId = 'nema17' | 'enclosure' | 'idler' | 'pulley' | 'pressure'

/**
 * One-click example prompts. Each has a sample drawing in public/examples/ (PNG, rendered from the SVG source next to it).
 * The four "golden path" examples are routine, non-safety-critical builds with every dimension spelled out, so the
 * live agents can finish without a clarifying question and end in an approval. `npm run test:examples` checks that.
 * The edge case is deliberately safety-critical and always ends in human review.
 */
export interface ExamplePrompt {
  id: ExampleId
  kind: 'golden' | 'edge'
  title: string
  /** Short line shown on the example button. */
  summary: string
  description: string
  constraints: Constraints
  image: string
}

export const EXAMPLES: ExamplePrompt[] = [
  {
    id: 'nema17',
    kind: 'golden',
    title: 'NEMA 17 motor mount',
    summary: 'Flat plate, M3x0.5 screws, Ø5 flanged bushing, M3 standoffs',
    description:
      'Light-duty NEMA 17 stepper motor mount for a desktop plotter (not safety-critical). Parts needed: ' +
      '(1) one flat NEMA 17 motor mount plate, 4 mm thick aluminum 6061, 31 mm square bolt pattern, Ø22.5 pilot; ' +
      '(2) 4× M3x0.5 x 10 mm socket head cap screws, ISO 4762, steel 8.8, clamping the 4 mm plate to the motor face (M3 tapped holes in the aluminum motor face); ' +
      '(3) one flanged sleeve bushing, 5 mm bore x 8 mm OD x 6 mm long, for the Ø5 motor output shaft; ' +
      '(4) 4× M3x0.5 x 20 mm female-female hex standoffs to space the plate off the base.',
    constraints: { unitSystem: 'metric' },
    image: '/examples/nema17-motor-mount.png',
  },
  {
    id: 'enclosure',
    kind: 'golden',
    title: 'Aluminum enclosure lid',
    summary: 'M4x0.7 button heads, M4 standoffs, rubber feet',
    description:
      'Lid for a light-duty aluminum electronics enclosure (not safety-critical, no structural load). Parts needed: ' +
      '(1) 4× M4x0.7 x 10 mm button head socket screws, ISO 7380, steel 10.9 zinc plated, through the 2 mm aluminum lid into the standoffs; ' +
      '(2) 4× M4x0.7 x 20 mm female-female hex standoffs, aluminum, holding the lid above the PCB; ' +
      '(3) 4× rubber feet, Ø20 x 8 mm, NBR, with an M4 screw hole, on the enclosure base. All metric.',
    constraints: { unitSystem: 'metric' },
    image: '/examples/enclosure-lid.png',
  },
  {
    id: 'idler',
    kind: 'golden',
    title: 'Conveyor idler roller',
    summary: '6001 bearings, Ø12 shaft, clamp collars, M6x1 hex bolts',
    description:
      'Idler roller for a light-duty benchtop parcel conveyor (parcels under 2 kg, not safety-critical). Radial load is 150 N per bearing, far below the bearing rating. Parts needed: ' +
      '(1) 2× 6001-2RS deep groove ball bearings, 12 mm bore x 28 mm OD x 8 mm, pressed into the Ø28 roller bore; ' +
      '(2) one Ø12 h6 precision shaft, 200 mm long, hardened steel; ' +
      '(3) 2× one-piece clamp shaft collars, 12 mm bore, locating the bearings axially; ' +
      '(4) 4× M6x1 x 20 mm hex head bolts, ISO 4017, steel 8.8 zinc plated, fixing the 5 mm steel end brackets into M6 tapped holes in the steel frame (15 mm thread depth).',
    constraints: { unitSystem: 'metric' },
    image: '/examples/conveyor-idler.png',
  },
  {
    id: 'pulley',
    kind: 'golden',
    title: 'Timing belt pulley stage',
    summary: 'GT2 20T Ø5 pulley, Ø5 shaft, M3 set screws, flanged bushing',
    description:
      'Light-duty GT2 timing belt stage for a desktop camera slider (not safety-critical). Parts needed: ' +
      '(1) one GT2 20-tooth aluminum timing pulley, 5 mm bore, for a 6 mm wide belt; ' +
      '(2) one Ø5 h6 precision shaft, 100 mm long, hardened steel; ' +
      '(3) 2× M3x0.5 x 4 mm cup point set screws, ISO 4029, to lock the pulley hub on the shaft; ' +
      '(4) one flanged sleeve bushing, 5 mm bore x 8 mm OD x 6 mm long, supporting the shaft in the side plate.',
    constraints: { unitSystem: 'metric' },
    image: '/examples/gt2-pulley-stage.png',
  },
]

/** Shown under "More examples": demonstrates that safety-critical uses always go to a human. */
export const EDGE_EXAMPLE: ExamplePrompt = {
  id: 'pressure',
  kind: 'edge',
  title: 'Edge case: pressure vessel bracket (shows human review)',
  summary: 'Safety-critical: 10 bar air receiver bracket, 4× M8 bolts',
  description:
    'Mounting bracket that holds a 10 bar compressed-air receiver (pressure vessel, 25 kg) to a steel machine frame. ' +
    '4× M8x1.25 x 30 mm socket head cap screws through a 5 mm steel L-bracket into M8 tapped holes in the frame. ' +
    'The bracket must carry the vessel weight plus a 6 kN shock load.',
  constraints: { unitSystem: 'metric', material: 'steel' },
  image: '/examples/pressure-vessel-bracket.png',
}

export const ALL_EXAMPLES: ExamplePrompt[] = [...EXAMPLES, EDGE_EXAMPLE]
