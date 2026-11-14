// Parameter Master: the only source of standard values.
// One recipe per Machine + Part No. + Mold; each recipe keeps numbered versions.
// Only the ACTIVE version is used by the parameter log, report and deviation alerts.
// A change is saved as a DRAFT version and needs admin approval before it becomes active.
//
// recipe  = { id: 'R-001', machineId, partNo, mold, versions: [version] }
// version = { v, status: 'active' | 'draft' | 'archived' | 'rejected', effectiveFrom, createdBy, createdAt,
//             approvedBy, approvedAt, note, rows: [{ code, check, lower, std, upper, applies }] }
import { MACHINES } from './machines.js'
import { countsOf, decimals, defOf, defsFor, fix } from './parameters.js'
import { replaceAll } from './store.js'
import { api, save } from '../api/client.js'

const today = () => new Date().toISOString().slice(0, 10)

// ---------- Rows ----------

// The default row for a parameter, optionally with a machine's own last-shot value as standard.
function defaultRow(def, machine) {
  if (def.check === 'NA') return { code: def.code, check: 'NA', lower: null, std: null, upper: null, applies: false }
  if (def.check === 'TEXT') return { code: def.code, check: 'TEXT', lower: def.std, std: def.std, upper: def.std, applies: true }
  const std = (def.group === 'MONITOR' && machine?.[def.key]) || def.std
  const d = Math.max(decimals(std), decimals(def.tol ?? def.tolUp ?? 0))
  if (def.check === 'EXACT') return { code: def.code, check: 'EXACT', lower: std, std, upper: std, applies: true }
  if (def.check === 'MAX ONLY') return { code: def.code, check: 'MAX ONLY', lower: null, std, upper: fix(std + def.tolUp, d), applies: true }
  return { code: def.code, check: 'RANGE', lower: fix(std - def.tol, d), std, upper: fix(std + def.tol, d), applies: true }
}

export const defaultRows = (machine, counts) => defsFor(counts).map((def) => defaultRow(def, machine))

export const defaultRowOf = (code) => defaultRow(defOf(code), null)

// Rows for new stage / zone counts: rows that stay keep their values, new stages start at defaults.
export function resizeRows(rows, counts, machine) {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  return defsFor(counts).map((def) => byCode.get(def.code) ?? defaultRow(def, machine))
}

// Change a standard and move its limits with it, so the tolerance stays the same.
export function withStandard(row, std) {
  if (row.check === 'TEXT' || row.check === 'NA') return { ...row, std, lower: std, upper: std }
  const d = Math.max(decimals(std), decimals(row.std), decimals(row.lower ?? 0), decimals(row.upper ?? 0))
  const delta = std - row.std
  const move = (v) => (v == null ? null : fix(v + delta, d))
  if (row.check === 'EXACT') return { ...row, std, lower: std, upper: std }
  return { ...row, std, lower: move(row.lower), upper: move(row.upper) }
}

const sameRow = (a, b) =>
  a.check === b.check && a.lower === b.lower && a.std === b.std && a.upper === b.upper && Boolean(a.applies) === Boolean(b.applies)
export const sameRows = (a, b) => a.length === b.length && a.every((row, i) => sameRow(row, b[i]))

// Loaded from the server after sign-in. Changes are shown at once and the server's copy of the
// recipe replaces the local one when the save comes back.
export const RECIPES = []
export const hydrateRecipes = (list) => replaceAll(RECIPES, list)

function sync(recipe, request) {
  return save(request).then((saved) => {
    if (saved) Object.assign(recipe, saved)
    return saved
  })
}

// ---------- Lookups ----------

export const recipeById = (id) => RECIPES.find((r) => r.id === id)
export const findRecipe = ({ machineId, partNo, mold }) =>
  RECIPES.find((r) => r.machineId === machineId && r.partNo === partNo && r.mold === mold)
export const recipeForMachine = (m) => findRecipe({ machineId: m.id, partNo: m.partNo, mold: m.mold })
export const activeVersion = (recipe) => recipe?.versions.find((v) => v.status === 'active') ?? null
export const draftVersion = (recipe) => recipe?.versions.find((v) => v.status === 'draft') ?? null
export const latestVersion = (recipe) => recipe.versions[recipe.versions.length - 1]

// "R-001 v3", or why there are no standards.
export function recipeRef(machine) {
  const recipe = recipeForMachine(machine)
  const active = activeVersion(recipe)
  return active ? `${recipe.id} v${active.v}` : recipe ? `${recipe.id} (not approved yet)` : 'default standards (no recipe)'
}

// Standards the log checks this machine against: its active recipe, else the plain defaults.
export function activeRowsFor(machine) {
  return activeVersion(recipeForMachine(machine))?.rows ?? defaultRows(machine)
}

// ---------- Changes ----------

const nextId = () => `R-${String(Math.max(0, ...RECIPES.map((r) => Number(r.id.slice(2)))) + 1).padStart(3, '0')}`
const stamp = (user) => ({ createdBy: user.displayName.toLowerCase(), createdAt: today() })

// Save rows as the recipe's draft (updating an existing draft rather than stacking a second one).
export function saveDraft(recipe, rows, user, note = '') {
  const draft = draftVersion(recipe)
  if (draft) Object.assign(draft, { rows, note: note || draft.note, ...stamp(user) })
  else recipe.versions.push({ v: latestVersion(recipe).v + 1, status: 'draft', rows, effectiveFrom: null, approvedBy: null, approvedAt: null, note, ...stamp(user) })
  sync(recipe, api.post(`/recipes/${recipe.id}/draft/`, { rows, note: note || draft?.note || '' }))
  return draftVersion(recipe)
}

export function createRecipe(combo, rows, user, note = '') {
  const recipe = { id: nextId(), ...combo, versions: [] }
  recipe.versions.push({ v: 1, status: 'draft', rows, effectiveFrom: null, approvedBy: null, approvedAt: null, note, ...stamp(user) })
  RECIPES.push(recipe)
  sync(recipe, api.post('/recipes/', { id: recipe.id, ...combo, rows, note }))
  return recipe
}

export function approveDraft(recipe, user) {
  const draft = draftVersion(recipe)
  if (!draft) return
  for (const v of recipe.versions) if (v.status === 'active') v.status = 'archived'
  Object.assign(draft, { status: 'active', approvedBy: user.displayName.toLowerCase(), approvedAt: today(), effectiveFrom: today() })
  sync(recipe, api.post(`/recipes/${recipe.id}/approve/`))
}

export function rejectDraft(recipe, user, note) {
  const draft = draftVersion(recipe)
  if (!draft) return
  Object.assign(draft, { status: 'rejected', approvedBy: user.displayName.toLowerCase(), approvedAt: today(), note: note || draft.note })
  sync(recipe, api.post(`/recipes/${recipe.id}/reject/`, { note }))
}

// Copy rows to another Machine + Part + Mold: a draft on its recipe, or a new recipe.
export function copyRows(rows, combo, user, note) {
  const target = findRecipe(combo)
  if (target) {
    saveDraft(target, rows, user, note)
    return target
  }
  return createRecipe(combo, rows, user, note)
}

// From an approved deviation: propose its actual value as the new standard.
export function draftFromDeviation(machine, key, value, user) {
  const recipe = recipeForMachine(machine)
  if (!recipe) return null
  const base = draftVersion(recipe)?.rows ?? activeVersion(recipe)?.rows ?? defaultRows(machine)
  const def = defsFor(countsOf(base)).find((p) => p.key === key)
  const rows = base.map((r) => (r.code === def.code ? withStandard(r, value) : r))
  return saveDraft(recipe, rows, user, `${def.label} standard → ${value} ${def.unit} (from an approved deviation)`)
}

// ---------- Excel upload (sheet "Parameter_Standards" of the template) ----------

const num = (v) => (v === '' || v == null ? null : typeof v === 'number' ? v : Number(String(v).replace(',', '.')))

// One sheet row → { row } or { error }. Implements the template's "How to fill" rules.
function parseRow(cells) {
  const [code, check0, lower0, std0, upper0, tol0, applies0] = cells
  const def = defOf(code)
  if (!def) return { error: `Unknown parameter code "${code}"` }
  const check = String(check0 ?? def.check).trim().toUpperCase()
  if (!['RANGE', 'EXACT', 'MAX ONLY', 'MIN ONLY', 'TEXT', 'NA'].includes(check)) return { error: `Check type "${check0}" isn't one of RANGE, EXACT, MAX ONLY, MIN ONLY, TEXT, NA` }
  const applies = String(applies0 ?? 'Y').trim().toUpperCase() !== 'N' && check !== 'NA'
  if (check === 'NA' || !applies) return { row: { code, check: 'NA', lower: null, std: null, upper: null, applies: false } }
  if (check === 'TEXT') {
    const std = String(std0 ?? '').trim()
    return std ? { row: { code, check, lower: std, std, upper: std, applies } } : { error: 'TEXT needs a standard value' }
  }

  const std = num(std0)
  if (std == null || Number.isNaN(std)) return { error: 'Standard value is missing or not a number' }
  if (check === 'EXACT') return { row: { code, check, lower: std, std, upper: std, applies } }

  // Tolerance: "5" = ±5, "+1.0" = upper only, "-2" = lower only.
  const tolText = tol0 == null ? '' : String(tol0).trim()
  const tol = tolText ? Math.abs(num(tolText)) : null
  const d = Math.max(decimals(std), decimals(tol ?? 0))
  let lower = num(lower0)
  let upper = num(upper0)
  if (tol != null && !Number.isNaN(tol)) {
    if (lower == null && check !== 'MAX ONLY' && !tolText.startsWith('+')) lower = fix(std - tol, d)
    if (upper == null && check !== 'MIN ONLY' && !tolText.startsWith('-')) upper = fix(std + tol, d)
  }
  if (check === 'MAX ONLY') lower = null
  if (check === 'MIN ONLY') upper = null
  if ([lower, upper].some((v) => v != null && Number.isNaN(v))) return { error: 'Lower / upper limit is not a number' }
  if (check === 'RANGE' && (lower == null || upper == null)) return { error: 'RANGE needs lower and upper limits, or a tolerance' }
  if (check === 'MAX ONLY' && upper == null) return { error: 'MAX ONLY needs an upper limit or a tolerance' }
  if (check === 'MIN ONLY' && lower == null) return { error: 'MIN ONLY needs a lower limit or a tolerance' }
  if ((lower != null && lower > std) || (upper != null && upper < std)) return { error: 'The standard is outside its own limits' }
  return { row: { code, check, lower, std, upper, applies } }
}

// rows: arrays of cell values from "Parameter_Standards", header first.
// Returns a plan per Machine + Part + Mold: what the upload would do, plus every problem found.
export function planStandardsImport(sheetRows, knownMachineIds) {
  const [header, ...body] = sheetRows
  const col = (name) => header.findIndex((h) => String(h ?? '').trim().toLowerCase() === name.toLowerCase())
  const need = ['Machine Code', 'Part No.', 'Mold No.', 'Parameter Code', 'Check Type', 'Lower Limit', 'Standard Value', 'Upper Limit', 'Tolerance (±)', 'Applies (Y/N)']
  const missing = need.filter((n) => col(n) < 0)
  if (missing.length) return { groups: [], errors: [{ line: 1, message: `Missing columns: ${missing.join(', ')}. Use the MPCR template.` }] }

  const at = Object.fromEntries([...need, 'Part Name', 'Recipe ID'].map((n) => [n, col(n)]))
  const errors = []
  const groups = new Map()
  body.forEach((cells, i) => {
    const line = i + 2
    const get = (n) => (at[n] >= 0 ? cells[at[n]] : null)
    if (cells.every((c) => c == null || c === '')) return
    const combo = { machineId: String(get('Machine Code') ?? '').trim(), partNo: String(get('Part No.') ?? '').trim(), mold: String(get('Mold No.') ?? '').trim() }
    if (!combo.machineId || !combo.partNo || !combo.mold) return errors.push({ line, message: 'Machine code, part no. and mold no. are all required' })
    if (!knownMachineIds.includes(combo.machineId)) return errors.push({ line, message: `Machine ${combo.machineId} isn't in the machine master yet` })
    const parsed = parseRow(['Parameter Code', 'Check Type', 'Lower Limit', 'Standard Value', 'Upper Limit', 'Tolerance (±)', 'Applies (Y/N)'].map((n) => get(n)))
    if (parsed.error) return errors.push({ line, message: `${get('Parameter Code') ?? '?'}: ${parsed.error}` })
    const key = `${combo.machineId}|${combo.partNo}|${combo.mold}`
    if (!groups.has(key)) groups.set(key, { combo, partName: String(get('Part Name') ?? '').trim(), sheetId: get('Recipe ID'), rows: new Map() })
    groups.get(key).rows.set(parsed.row.code, parsed.row)
  })

  const plan = [...groups.values()].map((g) => {
    const recipe = findRecipe(g.combo)
    const current = draftVersion(recipe)?.rows ?? activeVersion(recipe)?.rows ?? defaultRows(MACHINES.find((m) => m.id === g.combo.machineId))
    // A sheet with more stages than the recipe adds them; parameters left out keep their current values.
    const sheetCounts = countsOf([...g.rows.keys()])
    const counts = Object.fromEntries(Object.entries(countsOf(current)).map(([k, n]) => [k, Math.max(n, sheetCounts[k])]))
    const machine = MACHINES.find((m) => m.id === g.combo.machineId)
    const rows = resizeRows(current, counts, machine).map((r) => g.rows.get(r.code) ?? r)
    const missingCount = rows.length - g.rows.size
    const action = !recipe ? 'new' : sameRows(rows, activeVersion(recipe)?.rows ?? []) ? 'unchanged' : 'draft'
    return { ...g, recipe, rows, action, missingCount }
  })
  return { groups: plan, errors }
}

export function applyStandardsImport(plan, user) {
  for (const g of plan) {
    if (g.action === 'new') createRecipe(g.combo, g.rows, user, 'Uploaded from Excel')
    else if (g.action === 'draft') saveDraft(g.recipe, g.rows, user, 'Uploaded from Excel')
  }
}
