import type { Constraints } from '../lib/types'

/** The three one-click example prompts. Each has a built-in sample screenshot in public/examples/. */
export interface ExamplePrompt {
  id: 'nema17' | 'shaft' | 'hoist'
  title: string
  description: string
  constraints: Constraints
  image: string
}

export const EXAMPLES: ExamplePrompt[] = [
  {
    id: 'nema17',
    title: 'NEMA 17 motor mount',
    description:
      'Motor mount for a NEMA 17 stepper driving an 8 mm shaft with M3 bolts. The mount plate is 4 mm thick aluminum; the shaft needs a support bearing and a collar to stop it sliding.',
    constraints: { unitSystem: 'metric' },
    image: '/examples/nema17-motor-mount.svg',
  },
  {
    id: 'shaft',
    title: 'Idler shaft bearing seat',
    description:
      'Idler shaft support: 12 mm h6 shaft with a Ø28 H7 bearing seat, 8 mm deep, in an aluminum housing. Needs a sealed bearing, a collar to locate it axially, and the shaft itself (~200 mm). About 2 kN radial belt load.',
    constraints: { unitSystem: 'metric' },
    image: '/examples/shaft-bearing-seat.svg',
  },
  {
    id: 'hoist',
    title: 'Hoist base plate, 4× M6',
    description:
      'Bolting a steel L-bracket (5 mm thick) to an 8 mm S355 base plate with 4× M6 tapped holes, 12 mm thread depth. The bracket carries a hoist load of about 6 kN.',
    constraints: { unitSystem: 'metric', material: 'steel' },
    image: '/examples/plate-m6-holes.svg',
  },
]
