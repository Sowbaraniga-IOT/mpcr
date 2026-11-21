// The 31 parameters on the hourly sheet, as in the template's Parameter_List sheet.
// `key` is what saved logs use; `code` is what the Excel template uses.
// `check` is the default check type; `std` / `tol` / `tolUp` are the default standards
// a new recipe starts from. `step` is how far past a limit a seeded deviation lands.

export const CHECK_TYPES = ['RANGE', 'EXACT', 'MAX ONLY', 'MIN ONLY', 'TEXT', 'NA']

export const GROUPS = [
  { key: 'TEMPERATURE', title: 'Temperature' },
  { key: 'INJECTION', title: 'Injection' },
  { key: 'MONITOR', title: 'Monitor' },
]

const T = { group: 'TEMPERATURE', unit: '°C', digits: 1 }
const I = { group: 'INJECTION' }
const M = { group: 'MONITOR' }

export const PARAM_DEFS = [
  { ...T, key: 'nozzle', code: 'TMP_NOZ', label: 'Nozzle temperature', check: 'RANGE', std: 255, tol: 5 },
  { ...T, key: 'zone1', code: 'TMP_Z1', label: 'Zone 1 temperature', check: 'RANGE', std: 255, tol: 5 },
  { ...T, key: 'zone2', code: 'TMP_Z2', label: 'Zone 2 temperature', check: 'RANGE', std: 250, tol: 5 },
  { ...T, key: 'zone3', code: 'TMP_Z3', label: 'Zone 3 temperature', check: 'RANGE', std: 245, tol: 5 },
  { ...T, key: 'throat', code: 'TMP_HTH', label: 'Hopper throat temp', check: 'RANGE', std: 55, tol: 10 },
  { ...T, key: 'hrtc1', code: 'TMP_HRTC1', label: 'HRTC temperature zone-1', check: 'NA' },
  { ...T, key: 'hrtc2', code: 'TMP_HRTC2', label: 'HRTC temperature zone-2', check: 'NA' },
  { ...T, key: 'hrtc3', code: 'TMP_HRTC3', label: 'HRTC temperature zone-3', check: 'NA' },
  { ...T, key: 'hrtc4', code: 'TMP_HRTC4', label: 'HRTC temperature zone-4', check: 'NA' },
  { ...T, key: 'mtc', code: 'TMP_MTC', label: 'MTC temperature', check: 'RANGE', std: 60, tol: 5 },
  { ...T, key: 'mold', code: 'TMP_MOLD', label: 'Mold temperature', check: 'RANGE', std: 60, tol: 5 },
  { ...T, key: 'dryer', code: 'TMP_DRY', label: 'Hopper dryer temp', check: 'RANGE', std: 140, tol: 10 },

  { ...I, key: 'injVel1', code: 'INJ_VEL1', label: 'Inject velocity 1', unit: 'mm/s', check: 'EXACT', std: 60 },
  { ...I, key: 'injSwitch1', code: 'INJ_SWPOS1', label: 'Inject switch position 1', unit: 'mm', check: 'NA' },
  { ...I, key: 'injVel2', code: 'INJ_VEL2', label: 'Inject velocity 2', unit: 'mm/s', check: 'NA' },
  { ...I, key: 'maxInjPress', code: 'INJ_MAXPRS', label: 'Max inject pressure', unit: 'MPa', check: 'EXACT', std: 150 },
  { ...I, key: 'transfer', code: 'INJ_POSTR', label: 'Position transfer', unit: 'mm', check: 'EXACT', std: 6 },
  { ...I, key: 'hrMode', code: 'INJ_HRMODE', label: 'HR mode', unit: '', check: 'TEXT', std: 'STD' },
  { ...I, key: 'hold1', code: 'INJ_HOLDP1', label: 'Hold pressure 1', unit: 'MPa', check: 'EXACT', std: 55 },
  { ...I, key: 'holdTime1', code: 'INJ_HOLDT1', label: 'Hold time 1', unit: 's', check: 'EXACT', std: 3 },
  { ...I, key: 'back', code: 'INJ_BACKP', label: 'Back pressure', unit: 'MPa', check: 'EXACT', std: 10 },
  { ...I, key: 'rotation', code: 'INJ_ROT', label: 'Rotation', unit: 'min⁻¹', check: 'EXACT', std: 120 },
  { ...I, key: 'shotSize', code: 'INJ_SHOT', label: 'Shot size', unit: 'mm', check: 'EXACT', std: 39.8, step: 0.4 },
  { ...I, key: 'decompDist', code: 'INJ_DECD', label: 'Decompression distance', unit: 'mm', check: 'EXACT', std: 5 },
  { ...I, key: 'decompVel', code: 'INJ_DECV', label: 'Decompression velocity', unit: 'mm/s', check: 'EXACT', std: 5 },
  { ...I, key: 'cooling', code: 'INJ_COOLT', label: 'Cooling time', unit: 's', check: 'EXACT', std: 18 },

  // A machine's own last shot sets these when a default recipe is generated for it.
  { ...M, key: 'cycle', code: 'MON_CYCLE', label: 'Total cycle time', unit: 's', check: 'MAX ONLY', std: 26.15, tolUp: 1, step: 0.5 },
  { ...M, key: 'cushion', code: 'MON_CUSH', label: 'Cushion (actual)', unit: 'mm', check: 'RANGE', std: 3.7, tol: 1, step: 0.3 },
  { ...M, key: 'injection', code: 'MON_INJT', label: 'Injection time', unit: 's', check: 'RANGE', std: 0.668, tol: 0.05, step: 0.02 },
  { ...M, key: 'peakPressure', code: 'MON_PEAKP', label: 'Peak pressure', unit: 'MPa', check: 'RANGE', std: 115, tol: 20, step: 5 },
  { ...M, key: 'recovery', code: 'MON_RCVT', label: 'Recovery time', unit: 's', check: 'RANGE', std: 5.2, tol: 3, step: 0.5 },
]

export const DEF_BY_KEY = Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p]))
export const DEF_BY_CODE = Object.fromEntries(PARAM_DEFS.map((p) => [p.code, p]))

// ---------- Repeating parameters ----------
// Zones and profile stages come in numbered sets. A recipe chooses how many of each its
// machine has (1…max); the rows for stage 1…n are made from the pattern below.
// The defaults above are the template's counts.
const stageStd = (first, stepBy, min) => (i) => Math.max(min, first - stepBy * (i - 1))

// prettier-ignore
export const SERIES = [
  { key: 'zone', label: 'Barrel temperature zones', max: 12, make: (i) => ({ ...T, key: `zone${i}`, code: `TMP_Z${i}`, label: `Zone ${i} temperature`, check: 'RANGE', std: stageStd(255, 5, 200)(i), tol: 5 }) },
  { key: 'hrtc', label: 'Hot runner (HRTC) zones', max: 24, make: (i) => ({ ...T, key: `hrtc${i}`, code: `TMP_HRTC${i}`, label: `HRTC temperature zone-${i}`, check: 'NA' }) },
  { key: 'injVel', label: 'Injection velocity stages', max: 10, make: (i) => ({ ...I, key: `injVel${i}`, code: `INJ_VEL${i}`, label: `Inject velocity ${i}`, unit: 'mm/s', check: i === 1 ? 'EXACT' : 'NA', std: 60 }) },
  { key: 'injSwitch', label: 'Injection switch positions', max: 10, make: (i) => ({ ...I, key: `injSwitch${i}`, code: `INJ_SWPOS${i}`, label: `Inject switch position ${i}`, unit: 'mm', check: 'NA' }) },
  { key: 'hold', label: 'Hold pressure stages', max: 10, make: (i) => ({ ...I, key: `hold${i}`, code: `INJ_HOLDP${i}`, label: `Hold pressure ${i}`, unit: 'MPa', check: 'EXACT', std: stageStd(55, 5, 10)(i) }) },
  { key: 'holdTime', label: 'Hold time stages', max: 10, make: (i) => ({ ...I, key: `holdTime${i}`, code: `INJ_HOLDT${i}`, label: `Hold time ${i}`, unit: 's', check: 'EXACT', std: 3 }) },
]

const seriesOf = (code) => {
  for (const s of SERIES) {
    const prefix = s.make(1).code.slice(0, -1)
    const n = code.startsWith(prefix) && /^\d+$/.test(code.slice(prefix.length)) ? Number(code.slice(prefix.length)) : 0
    if (n >= 1 && n <= s.max) return { series: s, n }
  }
  return null
}

// The definition of any parameter code, including stages past the template's count (TMP_Z7).
export function defOf(code) {
  if (DEF_BY_CODE[code]) return DEF_BY_CODE[code]
  const hit = seriesOf(code)
  return hit ? hit.series.make(hit.n) : null
}

// How many of each set a list of rows (or codes) has: { zone: 3, hrtc: 4, … }.
export function countsOf(rows) {
  const counts = Object.fromEntries(SERIES.map((s) => [s.key, 0]))
  for (const r of rows) {
    const hit = seriesOf(typeof r === 'string' ? r : r.code)
    if (hit) counts[hit.series.key] = Math.max(counts[hit.series.key], hit.n)
  }
  return counts
}

export const DEFAULT_COUNTS = countsOf(PARAM_DEFS)

// The parameters in sheet order for these counts; each set stays where its stage 1 sits.
export function defsFor(counts = DEFAULT_COUNTS) {
  const out = []
  for (const def of PARAM_DEFS) {
    const hit = seriesOf(def.code)
    if (!hit) out.push(def)
    else if (hit.n === 1) {
      const n = Math.min(hit.series.max, Math.max(1, counts[hit.series.key] ?? DEFAULT_COUNTS[hit.series.key]))
      for (let i = 1; i <= n; i++) out.push(defOf(`${def.code.slice(0, -1)}${i}`))
    }
  }
  return out
}

export const decimals = (n) => (typeof n === 'number' ? (String(n).split('.')[1] ?? '').length : 0)
export const fix = (n, d) => Number(n.toFixed(d))
