// The hourly parameter log. Each machine has one sheet per production day (06:00 → 06:00),
// kept by the server: readings, and the deviations it found in them with their approvals.
// Sheets that were opened are cached here, so screens can read them synchronously.
import { MACHINES } from './machines.js'
import { activeShifts, allSlots, clockOf, shiftAt, shiftHour, shiftSlots } from './shifts.js'
import { SHIFT_MASTER, toClock } from './shiftMaster.js'
import { GROUPS, countsOf, decimals, defsFor, fix } from './parameters.js'
import { activeRowsFor } from './recipes.js'
import { can } from './users.js'
import { api, isoDate } from '../api/client.js'

// Every reading is checked against the machine's ACTIVE recipe in the Parameter Master
// (Settings → Parameter Master). Machines without one fall back to the default standards.
export { recipeRef } from './recipes.js'

// A recipe row → what the log needs: limits, tolerance text, display digits.
// `na` rows aren't fitted on this mold; `text` rows hold a mode, not a number.
function resolve(def, r) {
  const base = { key: def.key, code: def.code, label: def.label, unit: def.unit, group: def.group, step: def.step }
  if (!r || !r.applies || r.check === 'NA') return { ...base, na: true }
  if (r.check === 'TEXT') return { ...base, text: String(r.std) }
  const { std, lower, upper } = r
  const d = def.digits ?? Math.max(decimals(std), decimals(lower ?? 0), decimals(upper ?? 0))
  const up = upper == null ? null : fix(upper - std, d)
  const down = lower == null ? null : fix(std - lower, d)
  const zeroTol = r.check === 'EXACT' || (up === 0 && down === 0)
  const tolText = zeroTol
    ? '0'
    : down == null
      ? `+${up}`
      : up == null
        ? `−${down}`
        : up === down
          ? `±${up}`
          : `−${down} / +${up}`
  return { ...base, std, lower, upper, digits: d, tolText, zeroTol }
}

export function sectionsFor(machine) {
  const active = activeRowsFor(machine)
  const rows = new Map(active.map((r) => [r.code, r]))
  // The recipe sets how many zones and stages the sheet shows.
  const defs = defsFor(countsOf(active))
  return GROUPS.map((g) => ({
    title: g.title,
    rows: defs.filter((def) => def.group === g.key).map((def) => resolve(def, rows.get(def.code))),
  }))
}

export const allRows = (sections) => sections.flatMap((s) => s.rows)
export const isNumeric = (row) => !row.na && !row.text

// 'low' | 'high' | null
export function check(row, value) {
  if (!isNumeric(row) || value == null || value === '') return null
  if (row.lower != null && value < row.lower) return 'low'
  if (row.upper != null && value > row.upper) return 'high'
  return null
}

// "1.0 °C below lower limit (45)" / "1 s above standard (18)"
export function describe(row, value) {
  const dir = check(row, value)
  if (!dir) return ''
  const limit = dir === 'low' ? row.lower : row.upper
  const diff = Math.abs(value - limit).toFixed(row.digits)
  const where = row.zeroTol ? 'standard' : dir === 'low' ? 'lower limit' : 'upper limit'
  const ref = row.zeroTol ? row.std : limit
  return `${diff} ${row.unit} ${dir === 'low' ? 'below' : 'above'} ${where} (${ref})`
}

export function formatReading(row, value) {
  if (row.na) return 'NA'
  if (value == null) return ''
  return typeof value === 'number' ? value.toFixed(row.digits) : value
}

// ---------- Hours ----------

// The active shifts of the Shift Master, plus the whole production day.
export const shiftTabs = () => [
  ...activeShifts().map((s) => ({ key: s.code, span: `${toClock(s.start)}–${toClock(s.end)}` })),
  { key: '24H', span: '06:00–06:00' },
]

// The reading slots of a tab ('24H' = all of them).
export function hoursOf(tab) {
  if (tab === '24H') return allSlots()
  const s = activeShifts().find((x) => x.code === tab)
  return s ? shiftSlots(s) : []
}

// The columns of a sheet: the reading times, plus readings taken before the Shift Master changed.
export function sheetHours(tab, recorded) {
  const taken = Object.keys(recorded)
    .map(Number)
    .filter((h) => tab === '24H' || shiftAt(h)?.code === tab)
  return [...new Set([...hoursOf(tab), ...taken])].sort((a, b) => a - b)
}

// The reading to take now: a slot still inside its shift's grace period, else the next slot.
export function dueSlot(recorded, now = new Date()) {
  const at = shiftHour(now)
  const graceOf = (h) => (SHIFT_MASTER.rules.grace ? (shiftAt(h)?.grace ?? 0) : 0)
  const slots = allSlots()
  return slots.find((h) => h <= at && !recorded[h] && (at - h) * 60 <= graceOf(h)) ?? slots.find((h) => h > at) ?? null
}

export const hourLabel = clockOf

// The production day starts at 06:00, so 02:00 still belongs to yesterday.
export function productionDate(now = new Date()) {
  const d = new Date(now)
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  return d
}

export const formatDate = (d) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

export const partNameFor = (machine) => machine.partName
export const partNoFor = (machine) => machine.partNo

// Whole days since 1970 for a production date.
export const dayNumber = (date) =>
  Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)

// Which shift an hour (6 → 29) falls in.
export const shiftOf = (hour) => shiftAt(hour)?.code ?? '—'

// ---------- Sheets from the server ----------
// log = { recorded: { [hour]: { [key]: value } }, recordedBy: { [hour]: { by, at } }, deviations: [...] }

const EMPTY_LOG = Object.freeze({ recorded: {}, recordedBy: {}, deviations: [] })
const LOGS = new Map()
const logKey = (machine, date) => `${machine.id ?? machine}|${typeof date === 'string' ? date : isoDate(date)}`

export const LOG_CHANGED = 'mpcr-log-changed' // window event after any sheet changes

function keep(machine, date, log) {
  LOGS.set(logKey(machine, date), log)
  window.dispatchEvent(new Event(LOG_CHANGED))
  return log
}

// Today's sheets for every machine come with the first load (for the dashboard alerts).
export function hydrateToday(date, logs) {
  for (const m of MACHINES) LOGS.set(logKey(m, date), logs[m.id] ?? EMPTY_LOG)
}

// What the dashboard polls: today's deviations per machine.
export function updateTodayDeviations(date, byMachine) {
  for (const m of MACHINES) {
    const key = logKey(m, date)
    LOGS.set(key, { ...(LOGS.get(key) ?? EMPTY_LOG), deviations: byMachine[m.id] ?? [] })
  }
}

// The sheet as last loaded (empty until it is).
export const logFor = (machine, date) => LOGS.get(logKey(machine, date)) ?? EMPTY_LOG

const logPath = (machine, date) => `/logs/${encodeURIComponent(machine.id)}/${isoDate(date)}`

export const fetchLog = async (machine, date) => keep(machine, date, await api.get(`${logPath(machine, date)}/`))

// Record (or edit) one hour. The server checks every value against the active recipe and
// opens a deviation for each one outside its limits.
export const recordHour = async (machine, date, hour, values) =>
  keep(machine, date, await api.put(`${logPath(machine, date)}/hours/${hour}/`, { values }))

export const giveReason = async (machine, date, id, { reason, lot }) =>
  keep(
    machine,
    date,
    await api.post(`${logPath(machine, date)}/deviations/${encodeURIComponent(id)}/reason/`, { reason, lot }),
  )

// review = { decision: 'approve' | 'reject', comment, masterChange }
export const reviewDeviation = async (machine, date, id, review) =>
  keep(machine, date, await api.post(`${logPath(machine, date)}/deviations/${encodeURIComponent(id)}/review/`, review))

// ---------- Dashboard alerts ----------
// The worst state among a machine's deviations today:
//   'open'     — a reading is off standard and has no accepted reason (none entered, or rejected)
//   'awaiting' — every deviation has a reason, at least one still waits for the supervisor or the manager
//   'accepted' — every deviation was approved by both the supervisor and the manager
export const ALERT_LEVELS = [
  { key: 'open', label: 'No reason', hint: 'Off standard · no reason entered' },
  { key: 'awaiting', label: 'Awaiting approval', hint: 'Reason entered · waiting for supervisor / manager' },
  { key: 'accepted', label: 'Reason accepted', hint: 'Off standard · approved by supervisor and manager' },
]

export function alertOf(deviations) {
  const count = (status) => deviations.filter((d) => status.includes(d.status)).length
  const open = count(['open', 'rejected'])
  const supervisor = count(['awaiting'])
  const manager = count(['supervised'])
  const level = open ? 'open' : supervisor + manager ? 'awaiting' : deviations.length ? 'accepted' : null
  return { level, total: deviations.length, open, supervisor, manager, accepted: count(['closed']) }
}

// "No reason", "Awaiting supervisor", "Awaiting manager" or "Reason accepted" for a card or list row.
export function alertLabel(alert) {
  if (alert.level === 'awaiting') return alert.supervisor ? 'Awaiting supervisor' : 'Awaiting manager'
  return ALERT_LEVELS.find((l) => l.key === alert.level)?.label
}

// ---------- Two-level approval ----------
// A deviation with a reason goes to a supervisor (level 1), then to a manager (level 2).
// Either can reject it, which sends it back to the operator for a new reason.
export const APPROVAL_STEPS = {
  awaiting: { level: 1, permission: 'approve', who: 'Supervisor' },
  supervised: { level: 2, permission: 'approveFinal', who: 'Manager' },
}

const nameOf = (user) => user.displayName.toLowerCase()

// Whether this user can approve or reject the deviation at the step it is at now.
// The final approval has to come from someone other than the supervisor who approved level 1.
// (The server applies the same rule.)
export function canReview(user, d) {
  const step = APPROVAL_STEPS[d.status]
  if (!step || !can(user, step.permission)) return false
  return step.level === 1 || d.l1?.by !== nameOf(user)
}

// The statuses this user approves, for the bell and the report's filter.
export const reviewStatuses = (user) =>
  Object.keys(APPROVAL_STEPS).filter((s) => can(user, APPROVAL_STEPS[s].permission))
