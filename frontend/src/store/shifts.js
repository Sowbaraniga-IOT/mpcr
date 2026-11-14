// Shifts and reading slots, worked out from the Shift Master (shiftMaster.js).
// A slot is an hour of the production day, which runs from 06:00: 6 … below 30, so 06:30 is 6.5 and
// 02:00 after midnight is 26. The server does the same calculation (backend/plant/logic.py).
import { SHIFT_MASTER, durationOf, slotsOf, toClock } from './shiftMaster.js'

const DAY = 24 * 60
const DAY_START = 6 * 60

export const pad = (h) => String(h % 24).padStart(2, '0')

export const activeShifts = () => SHIFT_MASTER.shifts.filter((s) => s.active)

const toHour = (minuteOfDay) => (minuteOfDay < DAY_START ? minuteOfDay + DAY : minuteOfDay) / 60

// 26.5 → "02:30"
export const clockOf = (hour) => toClock(Math.round(hour * 60) % DAY)

const inShift = (s, hour) => (Math.round(hour * 60) - s.start + DAY) % DAY < durationOf(s)

// The active shift a slot falls in, or undefined.
export const shiftAt = (hour) => activeShifts().find((s) => inShift(s, hour))

export const shiftSlots = (s) => slotsOf(s).map(toHour).sort((a, b) => a - b)

// Every reading slot of the production day, across the active shifts.
export const allSlots = () => [...new Set(activeShifts().flatMap(shiftSlots))].sort((a, b) => a - b)

// Hours since midnight on the production day: 6 → 30, so 02:30 is 26.5.
export function shiftHour(now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60
  return hour < 6 ? hour + 24 : hour
}

export function currentShift(now = new Date()) {
  const hour = shiftHour(now)
  const shift = shiftAt(hour)
  if (!shift) return { key: '—', hours: 'No active shift', elapsed: 0, minutesLeft: 0 }
  const into = (Math.round(hour * 60) - shift.start + DAY) % DAY
  const duration = durationOf(shift)
  return {
    key: shift.code,
    hours: `${toClock(shift.start)}–${toClock(shift.end)}`,
    elapsed: into / duration, // 0 → 1
    minutesLeft: duration - into,
  }
}
