// Generates data/parts.json — the seed catalog that stands in for the company's parts library.
// Run with: npm run generate:catalog
// Dimensions follow published standards (ISO 4014/4017, ISO 4762, DIN 125, ISO 15, etc.)
// so the Fit Checker's deterministic rules have realistic data to work with.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const parts = []
let seq = 1

function add(p) {
  const id = `P${String(seq++).padStart(4, '0')}`
  parts.push({
    id,
    partNumber: p.partNumber,
    name: p.name,
    category: p.category,
    standard: p.standard,
    material: p.material,
    unitSystem: p.unitSystem ?? 'metric',
    dimensions: p.dimensions,
    ...(p.loadRatingN ? { loadRatingN: p.loadRatingN } : {}),
    tags: p.tags,
    cadFormats: p.cadFormats ?? ['STEP', 'SLDPRT', 'IGES'],
    // downloadUrl is rewritten at runtime from LIBRARY_BASE_URL in catalog.ts
    downloadUrl: `https://example-parts-library.com/part/${p.partNumber}`,
  })
}

// Tensile stress areas (mm²) for coarse metric threads, ISO 898-1
const stressArea = { M3: 5.03, M4: 8.78, M5: 14.2, M6: 20.1, M8: 36.6, M10: 58.0 }
const pitch = { M3: 0.5, M4: 0.7, M5: 0.8, M6: 1.0, M8: 1.25, M10: 1.5 }
// Proof stress (MPa) per property class / material
const proof = { 'Steel 8.8 zinc plated': 600, 'Stainless A2-70': 450, 'Stainless A4-80': 600, 'Aluminum 7075-T6': 240, 'Nylon PA66': 50 }
const matCode = { 'Steel 8.8 zinc plated': '88Z', 'Stainless A2-70': 'A2', 'Stainless A4-80': 'A4', 'Aluminum 7075-T6': 'AL', 'Nylon PA66': 'NY' }

// --- Hex head bolts M6x1 (ISO 4017), several lengths and materials
for (const mat of ['Steel 8.8 zinc plated', 'Stainless A2-70', 'Aluminum 7075-T6']) {
  for (const len of [12, 16, 20, 25, 30, 40]) {
    if (mat === 'Aluminum 7075-T6' && ![16, 20].includes(len)) continue
    add({
      partNumber: `HB-M6X1-${len}-${matCode[mat]}`,
      name: `Hex head bolt M6x1 x ${len} mm, ${mat}`,
      category: 'fastener',
      standard: 'ISO 4017',
      material: mat,
      dimensions: { thread: 'M6x1', nominalDiameterMm: 6, pitchMm: 1, lengthMm: len, headAcrossFlatsMm: 10, headHeightMm: 4 },
      loadRatingN: Math.round(stressArea.M6 * proof[mat]),
      tags: ['hex bolt', 'bolt', 'metric', 'coarse thread', 'M6'],
    })
  }
}
// Fine-pitch near-duplicates (a trap for wrong thread pitch)
for (const len of [16, 20]) {
  add({
    partNumber: `HB-M6X075-${len}-88Z`,
    name: `Hex head bolt M6x0.75 fine x ${len} mm, Steel 8.8`,
    category: 'fastener',
    standard: 'ISO 8676',
    material: 'Steel 8.8 zinc plated',
    dimensions: { thread: 'M6x0.75', nominalDiameterMm: 6, pitchMm: 0.75, lengthMm: len, headAcrossFlatsMm: 10, headHeightMm: 4 },
    loadRatingN: Math.round(22.0 * 600),
    tags: ['hex bolt', 'bolt', 'metric', 'fine thread', 'M6'],
  })
}

// --- Socket head cap screws (ISO 4762)
const shcs = [
  ['M3', [6, 8, 10, 12, 16, 20]],
  ['M4', [10, 16]],
  ['M5', [10, 16, 20]],
  ['M8', [20, 30]],
]
for (const [size, lens] of shcs) {
  const d = Number(size.slice(1))
  for (const len of lens) {
    for (const mat of size === 'M3' && [8, 10, 12].includes(len) ? ['Steel 8.8 zinc plated', 'Stainless A2-70'] : ['Steel 8.8 zinc plated']) {
      add({
        partNumber: `SHCS-${size}X${pitch[size]}-${len}-${matCode[mat]}`,
        name: `Socket head cap screw ${size}x${pitch[size]} x ${len} mm, ${mat}`,
        category: 'fastener',
        standard: 'ISO 4762',
        material: mat,
        dimensions: { thread: `${size}x${pitch[size]}`, nominalDiameterMm: d, pitchMm: pitch[size], lengthMm: len, headDiameterMm: d * 1.5 + (d <= 4 ? 1 : 0.5) },
        loadRatingN: Math.round(stressArea[size] * proof[mat]),
        tags: ['socket head cap screw', 'SHCS', 'cap screw', 'metric', 'coarse thread', size],
      })
    }
  }
}
// Nylon M6 screw (electrical isolation, very low load)
add({
  partNumber: 'SHCS-M6X1-16-NY',
  name: 'Socket head cap screw M6x1 x 16 mm, Nylon PA66',
  category: 'fastener',
  standard: 'DIN 912',
  material: 'Nylon PA66',
  dimensions: { thread: 'M6x1', nominalDiameterMm: 6, pitchMm: 1, lengthMm: 16, headDiameterMm: 10 },
  loadRatingN: Math.round(stressArea.M6 * proof['Nylon PA66']),
  tags: ['socket head cap screw', 'nylon', 'insulating', 'metric', 'M6'],
  cadFormats: ['STEP', 'IGES'],
})

// --- Imperial fasteners (ANSI/ASME B18)
for (const [thread, d, lens, area] of [
  ['1/4-20 UNC', 6.35, [0.5, 0.75, 1.0], 20.5],
  ['10-32 UNF', 4.83, [0.375, 0.5, 0.75], 12.9],
]) {
  for (const lenIn of lens) {
    add({
      partNumber: `SHCS-${thread.split(' ')[0].replace('/', '')}-${String(lenIn).replace('.', 'P')}IN-AS`,
      name: `Socket head cap screw ${thread} x ${lenIn} in, Alloy steel black oxide`,
      category: 'fastener',
      standard: 'ANSI B18.3',
      material: 'Alloy steel black oxide',
      unitSystem: 'imperial',
      dimensions: { thread, nominalDiameterMm: d, lengthMm: Math.round(lenIn * 25.4 * 10) / 10, lengthIn: lenIn },
      loadRatingN: Math.round(area * 830),
      tags: ['socket head cap screw', 'imperial', 'inch', thread.split(' ')[0]],
    })
  }
}

// --- Hex nuts (ISO 4032) and washers (DIN 125 / ISO 7089)
for (const size of ['M3', 'M4', 'M5', 'M6', 'M8']) {
  const d = Number(size.slice(1))
  const af = { M3: 5.5, M4: 7, M5: 8, M6: 10, M8: 13 }[size]
  const h = { M3: 2.4, M4: 3.2, M5: 4.7, M6: 5.2, M8: 6.8 }[size]
  add({
    partNumber: `HN-${size}X${pitch[size]}-88Z`,
    name: `Hex nut ${size}x${pitch[size]}, Steel class 8 zinc plated`,
    category: 'nut',
    standard: 'ISO 4032',
    material: 'Steel 8 zinc plated',
    dimensions: { thread: `${size}x${pitch[size]}`, nominalDiameterMm: d, pitchMm: pitch[size], acrossFlatsMm: af, thicknessMm: h },
    tags: ['hex nut', 'nut', 'metric', size],
  })
}
for (const size of ['M3', 'M4', 'M5', 'M6', 'M8']) {
  const [id, od, t] = { M3: [3.2, 7, 0.5], M4: [4.3, 9, 0.8], M5: [5.3, 10, 1], M6: [6.4, 12, 1.6], M8: [8.4, 16, 1.6] }[size]
  add({
    partNumber: `FW-${size}-A2`,
    name: `Flat washer ${size}, Stainless A2`,
    category: 'washer',
    standard: 'DIN 125',
    material: 'Stainless A2',
    dimensions: { innerDiameterMm: id, outerDiameterMm: od, thicknessMm: t, fitsThread: size },
    tags: ['flat washer', 'washer', 'metric', size],
  })
}

// --- Deep groove ball bearings (ISO 15). [designation, bore, OD, width, dynamic C (N)]
const bearings = [
  ['625', 5, 16, 5, 1730],
  ['626', 6, 19, 6, 2340],
  ['688', 8, 16, 5, 1430],
  ['608', 8, 22, 7, 3300],
  ['6800', 10, 19, 5, 1720],
  ['6000', 10, 26, 8, 4550],
  ['6200', 10, 30, 9, 5100],
  ['6001', 12, 28, 8, 5100],
  ['6201', 12, 32, 10, 6800],
  ['6002', 15, 32, 9, 5600],
  ['6202', 15, 35, 11, 7650],
  ['6204', 20, 47, 14, 12700],
]
for (const [des, bore, od, w, c] of bearings) {
  for (const seal of ['2RS', 'ZZ']) {
    if (seal === 'ZZ' && !['608', '6204'].includes(des)) continue
    add({
      partNumber: `BRG-${des}-${seal}`,
      name: `Deep groove ball bearing ${des}-${seal}, ${bore}x${od}x${w} mm`,
      category: 'bearing',
      standard: 'ISO 15',
      material: 'Chrome steel 52100',
      dimensions: { boreMm: bore, outerDiameterMm: od, widthMm: w, series: des, seal: seal === '2RS' ? 'rubber sealed' : 'metal shielded' },
      loadRatingN: c,
      tags: ['ball bearing', 'deep groove', 'radial bearing', `${des}`, seal],
    })
  }
}
// Flanged bearing and stainless 608
add({
  partNumber: 'BRG-F608-2RS',
  name: 'Flanged ball bearing F608-2RS, 8x22x7 mm, flange OD 25 mm',
  category: 'bearing',
  standard: 'ISO 15',
  material: 'Chrome steel 52100',
  dimensions: { boreMm: 8, outerDiameterMm: 22, widthMm: 7, flangeDiameterMm: 25, flangeThicknessMm: 1.5, series: 'F608' },
  loadRatingN: 3300,
  tags: ['ball bearing', 'flanged bearing', '608'],
})
add({
  partNumber: 'BRG-S608-2RS',
  name: 'Stainless ball bearing S608-2RS, 8x22x7 mm',
  category: 'bearing',
  standard: 'ISO 15',
  material: 'Stainless 440C',
  dimensions: { boreMm: 8, outerDiameterMm: 22, widthMm: 7, series: 'S608' },
  loadRatingN: 2850,
  tags: ['ball bearing', 'stainless', 'corrosion resistant', '608'],
})
// Imperial bearing R8
add({
  partNumber: 'BRG-R8-2RS',
  name: 'Inch ball bearing R8-2RS, 1/2 x 1-1/8 x 5/16 in',
  category: 'bearing',
  standard: 'ANSI/ABMA',
  material: 'Chrome steel 52100',
  unitSystem: 'imperial',
  dimensions: { boreMm: 12.7, outerDiameterMm: 28.575, widthMm: 7.938, boreIn: 0.5, series: 'R8' },
  loadRatingN: 5110,
  tags: ['ball bearing', 'inch', 'imperial', 'R8'],
})
// Pillow blocks
add({
  partNumber: 'PB-KP08',
  name: 'Pillow block bearing KP08, 8 mm bore, zinc alloy housing',
  category: 'bearing',
  standard: 'vendor',
  material: 'Zinc alloy housing / chrome steel insert',
  dimensions: { boreMm: 8, mountingHoleSpacingMm: 42, mountingHoleDiameterMm: 5, shaftHeightMm: 15 },
  loadRatingN: 2500,
  tags: ['pillow block', 'mounted bearing', 'KP08', '3D printer'],
})
add({
  partNumber: 'PB-UCP204',
  name: 'Pillow block bearing UCP204, 20 mm bore, cast iron housing',
  category: 'bearing',
  standard: 'ISO 3228',
  material: 'Cast iron housing / chrome steel insert',
  dimensions: { boreMm: 20, mountingHoleSpacingMm: 96, mountingHoleDiameterMm: 13, shaftHeightMm: 33.3 },
  loadRatingN: 12800,
  tags: ['pillow block', 'mounted bearing', 'UCP204', 'set screw lock'],
})

// --- Precision shafts (h6) and imperial shafts
for (const d of [5, 8, 10, 12]) {
  for (const len of d === 8 ? [100, 200, 300] : [100, 200]) {
    add({
      partNumber: `SFT-${d}H6-${len}-CS`,
      name: `Precision linear shaft Ø${d} h6 x ${len} mm, hardened chrome-plated steel`,
      category: 'shaft',
      standard: 'ISO 286 h6',
      material: 'Hardened steel Cf53 chrome plated',
      dimensions: { diameterMm: d, lengthMm: len, tolerance: 'h6' },
      tags: ['shaft', 'linear shaft', 'rod', 'precision', `${d} mm`],
    })
  }
}
add({
  partNumber: 'SFT-8H6-200-SS',
  name: 'Precision shaft Ø8 h6 x 200 mm, Stainless 440C',
  category: 'shaft',
  standard: 'ISO 286 h6',
  material: 'Stainless 440C',
  dimensions: { diameterMm: 8, lengthMm: 200, tolerance: 'h6' },
  tags: ['shaft', 'stainless', 'precision', '8 mm'],
})
for (const [frac, dIn] of [['0250', 0.25], ['0500', 0.5]]) {
  add({
    partNumber: `SFT-${frac}IN-12IN-CS`,
    name: `Precision shaft Ø${dIn} in x 12 in, case hardened steel`,
    category: 'shaft',
    standard: 'ANSI',
    material: 'Case hardened 1060 steel',
    unitSystem: 'imperial',
    dimensions: { diameterMm: Math.round(dIn * 25.4 * 100) / 100, diameterIn: dIn, lengthMm: 304.8, tolerance: 'Class L' },
    tags: ['shaft', 'imperial', 'inch'],
  })
}

// --- Shaft collars (DIN 705 set screw, clamp style)
for (const bore of [5, 8, 10, 12, 15, 20]) {
  const od = { 5: 10, 8: 16, 10: 20, 12: 22, 15: 25, 20: 32 }[bore]
  const w = { 5: 6, 8: 8, 10: 10, 12: 12, 15: 12, 20: 14 }[bore]
  add({
    partNumber: `SC-${bore}-SS-STL`,
    name: `Set screw shaft collar ${bore} mm bore, steel black oxide`,
    category: 'shaft collar',
    standard: 'DIN 705',
    material: 'Steel black oxide',
    dimensions: { boreMm: bore, outerDiameterMm: od, widthMm: w, setScrew: bore <= 8 ? 'M4' : 'M6' },
    tags: ['shaft collar', 'set screw collar', 'retaining', `${bore} mm`],
  })
  if ([8, 10, 12].includes(bore)) {
    add({
      partNumber: `SC-${bore}-CL-AL`,
      name: `One-piece clamp shaft collar ${bore} mm bore, aluminum 6061`,
      category: 'shaft collar',
      standard: 'vendor',
      material: 'Aluminum 6061-T6',
      dimensions: { boreMm: bore, outerDiameterMm: od + 4, widthMm: w + 1, clampScrew: 'M3' },
      tags: ['shaft collar', 'clamp collar', 'aluminum', `${bore} mm`],
    })
  }
}

// --- L-brackets and motor mounts
for (const [size, t, hole] of [[20, 2, 'M3'], [30, 3, 'M4'], [40, 4, 'M6'], [50, 5, 'M6']]) {
  for (const mat of size >= 40 ? ['Steel zinc plated', 'Aluminum 6061-T6'] : ['Aluminum 6061-T6']) {
    add({
      partNumber: `LB-${size}X${size}X${t}-${mat.startsWith('Steel') ? 'STL' : 'AL'}`,
      name: `L-bracket ${size}x${size}x${t} mm, ${mat}, ${hole} clearance holes`,
      category: 'bracket',
      standard: 'vendor',
      material: mat,
      dimensions: { legLengthMm: size, widthMm: size, thicknessMm: t, holeForThread: hole, holeDiameterMm: { M3: 3.4, M4: 4.5, M6: 6.6 }[hole], holeCount: 4 },
      loadRatingN: Math.round(size * t * (mat.startsWith('Steel') ? 9 : 5)),
      tags: ['L-bracket', 'angle bracket', 'corner bracket', 'mounting'],
    })
  }
}
add({
  partNumber: 'MM-NEMA17-L-AL',
  name: 'NEMA 17 stepper motor L-mount, aluminum 6061, 4 mm thick',
  category: 'motor mount',
  standard: 'vendor',
  material: 'Aluminum 6061-T6',
  dimensions: { motorFrame: 'NEMA 17', boltPatternMm: 31, pilotDiameterMm: 22.5, holeForThread: 'M3', thicknessMm: 4, baseSlotForThread: 'M5' },
  loadRatingN: 400,
  tags: ['motor mount', 'NEMA 17', 'stepper', 'L-bracket'],
})
add({
  partNumber: 'MM-NEMA17-L-STL',
  name: 'NEMA 17 stepper motor L-mount, steel 3 mm thick',
  category: 'motor mount',
  standard: 'vendor',
  material: 'Steel zinc plated',
  dimensions: { motorFrame: 'NEMA 17', boltPatternMm: 31, pilotDiameterMm: 22.5, holeForThread: 'M3', thicknessMm: 3, baseSlotForThread: 'M4' },
  loadRatingN: 600,
  tags: ['motor mount', 'NEMA 17', 'stepper', 'L-bracket'],
  cadFormats: ['STEP'],
})
add({
  partNumber: 'MM-NEMA23-L-STL',
  name: 'NEMA 23 stepper motor L-mount, steel 5 mm thick',
  category: 'motor mount',
  standard: 'vendor',
  material: 'Steel zinc plated',
  dimensions: { motorFrame: 'NEMA 23', boltPatternMm: 47.14, pilotDiameterMm: 38.1, holeForThread: 'M5', thicknessMm: 5, baseSlotForThread: 'M6' },
  loadRatingN: 1500,
  tags: ['motor mount', 'NEMA 23', 'stepper', 'L-bracket'],
})

// --- Flanged bushings (ISO 4379 style)
for (const [bore, od, fl, len, mat] of [
  [8, 10, 14, 8, 'Sintered bronze SAE 841'],
  [8, 12, 16, 10, 'Sintered bronze SAE 841'],
  [10, 12, 16, 10, 'Sintered bronze SAE 841'],
  [12, 14, 18, 12, 'Sintered bronze SAE 841'],
  [8, 10, 15, 10, 'iglidur G polymer'],
  [10, 12, 18, 12, 'iglidur G polymer'],
]) {
  add({
    partNumber: `FB-${bore}X${od}X${len}-${mat.startsWith('Sintered') ? 'BRZ' : 'POLY'}`,
    name: `Flanged sleeve bushing ${bore}x${od}x${len} mm, ${mat}`,
    category: 'bushing',
    standard: mat.startsWith('Sintered') ? 'ISO 2795' : 'vendor',
    material: mat,
    dimensions: { boreMm: bore, outerDiameterMm: od, flangeDiameterMm: fl, lengthMm: len },
    tags: ['flanged bushing', 'sleeve bearing', 'plain bearing', 'oilite'],
  })
}

// --- Spacers and standoffs
for (const [bore, od, len] of [[3.2, 6, 5], [3.2, 6, 10], [6.4, 10, 5], [6.4, 10, 10], [8.2, 12, 10]]) {
  add({
    partNumber: `SP-${bore}X${od}X${len}-AL`,
    name: `Round spacer ID ${bore} x OD ${od} x ${len} mm, aluminum`,
    category: 'spacer',
    standard: 'vendor',
    material: 'Aluminum 6061-T6',
    dimensions: { boreMm: bore, outerDiameterMm: od, lengthMm: len },
    tags: ['spacer', 'round spacer', 'unthreaded'],
  })
}
for (const [thread, len, kind] of [['M3x0.5', 10, 'FF'], ['M3x0.5', 20, 'FF'], ['M3x0.5', 10, 'MF'], ['M4x0.7', 15, 'FF']]) {
  add({
    partNumber: `SO-${thread.split('x')[0]}-${len}-${kind}-BR`,
    name: `Hex standoff ${thread} x ${len} mm, ${kind === 'FF' ? 'female-female' : 'male-female'}, brass`,
    category: 'standoff',
    standard: 'vendor',
    material: 'Brass nickel plated',
    dimensions: { thread, lengthMm: len, acrossFlatsMm: thread.startsWith('M3') ? 5 : 7, gender: kind === 'FF' ? 'female-female' : 'male-female' },
    tags: ['standoff', 'PCB standoff', 'hex spacer', 'threaded'],
  })
}

// --- Timing pulleys and gears
for (const [profile, teeth, bore, beltW] of [['GT2', 16, 5, 6], ['GT2', 20, 5, 6], ['GT2', 20, 8, 6], ['GT2', 40, 8, 6], ['HTD5M', 15, 8, 15], ['HTD5M', 30, 12, 15]]) {
  const pitchMm = profile === 'GT2' ? 2 : 5
  add({
    partNumber: `PUL-${profile}-${teeth}T-${bore}B-AL`,
    name: `${profile} timing pulley ${teeth}T, ${bore} mm bore, for ${beltW} mm belt`,
    category: 'pulley',
    standard: 'vendor',
    material: 'Aluminum 6061-T6',
    dimensions: { profile, teeth, boreMm: bore, beltWidthMm: beltW, pitchDiameterMm: Math.round((teeth * pitchMm / Math.PI) * 100) / 100, setScrew: bore <= 5 ? 'M3' : 'M4' },
    tags: ['timing pulley', 'pulley', profile, 'belt drive'],
  })
}
for (const [mod, teeth, bore, mat] of [[1, 20, 8, 'Steel C45'], [1, 40, 8, 'Steel C45'], [1, 20, 6, 'POM acetal'], [1.5, 30, 12, 'Steel C45'], [1, 60, 10, 'POM acetal']]) {
  add({
    partNumber: `GR-M${mod}-${teeth}T-${bore}B-${mat.startsWith('Steel') ? 'STL' : 'POM'}`,
    name: `Spur gear module ${mod}, ${teeth}T, ${bore} mm bore, ${mat}`,
    category: 'gear',
    standard: 'ISO 53',
    material: mat,
    dimensions: { module: mod, teeth, boreMm: bore, pitchDiameterMm: mod * teeth, faceWidthMm: mod * 10, pressureAngleDeg: 20 },
    loadRatingN: mat.startsWith('Steel') ? Math.round(mod * 10 * mod * 120) : Math.round(mod * 10 * mod * 18),
    tags: ['spur gear', 'gear', 'module', `${teeth}T`],
  })
}

// --- O-rings / gaskets
for (const [id, cs, mat] of [[8, 1.5, 'NBR 70'], [10, 2, 'NBR 70'], [20, 2, 'NBR 70'], [20, 2, 'FKM Viton 75'], [47, 2.5, 'NBR 70']]) {
  add({
    partNumber: `OR-${id}X${cs}-${mat.startsWith('NBR') ? 'NBR' : 'FKM'}`,
    name: `O-ring ${id} x ${cs} mm, ${mat}`,
    category: 'gasket',
    standard: 'ISO 3601',
    material: mat,
    dimensions: { innerDiameterMm: id, crossSectionMm: cs, outerDiameterMm: id + 2 * cs },
    tags: ['O-ring', 'seal', 'gasket', 'pressure seal'],
    cadFormats: ['STEP', 'IGES'],
  })
}

// --- Threaded inserts (for thread engagement in soft materials)
for (const [thread, len] of [['M3x0.5', 5.7], ['M4x0.7', 8.1], ['M6x1', 12.7]]) {
  add({
    partNumber: `INS-${thread.split('x')[0]}-${String(len).replace('.', 'P')}-BR`,
    name: `Heat-set threaded insert ${thread}, ${len} mm long, brass`,
    category: 'insert',
    standard: 'vendor',
    material: 'Brass',
    dimensions: { thread, lengthMm: len },
    tags: ['threaded insert', 'heat-set insert', 'plastic', '3D printed'],
  })
}

mkdirSync(join(root, 'data'), { recursive: true })
writeFileSync(join(root, 'data', 'parts.json'), JSON.stringify(parts, null, 2) + '\n')
console.log(`Wrote ${parts.length} parts to data/parts.json`)
