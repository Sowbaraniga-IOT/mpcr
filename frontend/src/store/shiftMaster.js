// Shift Master: shifts, how often readings are due, and the reading schedule rules.
// Times are minutes after midnight; an end at or before the start runs past midnight.
// Loaded from the server after sign-in; saveShiftMaster() sends the whole master back.
import { replaceAll } from './store.js'
import { api, save } from '../api/client.js'

export const INTERVALS = [30, 60, 120, 240]
export const GRACE_OPTIONS = [0, 5, 10, 15, 30]

// { shifts: [{ code, unitCode, name, start, end, interval, grace, supervisor, active, timeDiff }], rules: { … } }
// code / unitCode / start / end / timeDiff are the Shift_Master table (Shift_Code, Unit_code, start_tm,
// end_tm, time_diff) on the server; the rest are MPCR's reading settings for that shift.
export const SHIFT_MASTER = { shifts: [], rules: {} }
export const hydrateShiftMaster = (doc) => replaceAll(SHIFT_MASTER, structuredClone(doc))
export const saveShiftMaster = () => save(api.put('/shift-master/', SHIFT_MASTER))

const DAY = 24 * 60
export const durationOf = (s) => (s.end - s.start + DAY) % DAY || DAY
export const crossesMidnight = (s) => s.end <= s.start

export const toClock = (minutes) =>
  `${String(Math.floor((minutes % DAY) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
export function fromClock(text) {
  const [h, m] = text.split(':').map(Number)
  return h * 60 + m
}

// Reading slots: one per interval from the shift start (or from the first interval, if
// "first reading at shift start" is off), never at or past the shift end.
export function slotsOf(s, rules = SHIFT_MASTER.rules) {
  const first = rules.firstAtStart ? 0 : s.interval
  const slots = []
  for (let t = first; t < durationOf(s); t += s.interval) slots.push((s.start + t) % DAY)
  return slots
}

// Minutes of the day covered by more than one active shift, and minutes covered by none.
export function coverage(shifts) {
  const count = Array.from({ length: DAY }, () => 0)
  for (const s of shifts.filter((x) => x.active)) {
    for (let t = 0; t < durationOf(s); t++) count[(s.start + t) % DAY]++
  }
  return { overlap: count.filter((c) => c > 1).length, gap: count.filter((c) => c === 0).length }
}
