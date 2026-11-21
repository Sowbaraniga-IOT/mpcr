// Standard-vs-actual report across machines and days, worked out by the server
// (POST /api/report/): what was actually recorded, deviations first. The server sends one page of
// rows at a time; each is matched here to the machine's parameter rows for limits and wording.
import { MACHINES } from './machines.js'
import { activeShifts } from './shifts.js'
import { allRows, check, describe, productionDate, sectionsFor, shiftOf } from './parameterLog.js'
import { api } from '../api/client.js'

// Every parameter the sheets can hold, for the parameter filter: the machines' rows, merged in sheet order.
export function parameterList() {
  const seen = new Map()
  for (const m of MACHINES) for (const r of allRows(sectionsFor(m))) if (!r.na && !seen.has(r.key)) seen.set(r.key, r)
  return [...seen.values()]
}

export const STATUS_ORDER = ['open', 'rejected', 'awaiting', 'supervised', 'closed']

const toInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromInput = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function defaultFilters(now = new Date()) {
  const to = productionDate(now)
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  return {
    from: toInput(from),
    to: toInput(to),
    shifts: activeShifts().map((s) => s.code),
    machines: [], // empty = all
    mold: 'all',
    part: 'all',
    param: 'all',
    values: 'both', // 'standard' | 'actual' | 'both'
    status: 'all', // 'all' | 'deviations' | 'open' | 'awaiting' | 'supervised' | 'closed'
  }
}

export const MAX_DAYS = 366

// ---------- Wording shared by the table and the exports ----------

export const STATUS_LABELS = { open: 'Open', rejected: 'Rejected', awaiting: 'Awaiting supervisor', supervised: 'Awaiting manager', closed: 'Closed' }

// 'limit' (outside limits), 'changed' (off standard, no tolerance) or 'ok'
export const kindOf = (r) => (r.flag ? (r.row.zeroTol ? 'changed' : 'limit') : 'ok')

export function wordsFor(r) {
  if (r.flag) return describe(r.row, r.value)
  return r.row.zeroTol || r.row.text ? 'Matches standard' : 'Within limits'
}

export function reasonFor(d) {
  if (!d) return ''
  if (!d.reason) return '— no reason yet'
  return [d.reason, d.lot, d.by].filter(Boolean).join(' · ')
}

// A server row → what the table and the exports show.
function rowMaker() {
  const rowsByMachine = new Map()
  return (r) => {
    const machine = MACHINES.find((m) => m.id === r.machineId) ?? { id: r.machineId, mold: '', partNo: '' }
    if (!rowsByMachine.has(machine.id)) rowsByMachine.set(machine.id, machine.name ? allRows(sectionsFor(machine)) : [])
    // A parameter the recipe no longer has keeps its reading, without limits.
    const row = rowsByMachine.get(machine.id).find((x) => x.key === r.key) ?? { key: r.key, label: r.key, unit: '', digits: 2, tolText: '—' }
    const date = fromInput(r.date)
    const deviation = r.deviation && { ...r.deviation, date, machine, row }
    return { date, hour: r.hour, machine, row, value: r.value, flag: check(row, r.value), deviation }
  }
}

// Runs the report and returns its first page; `rowsAt(start, count)` fetches any other stretch.
export async function runReport(filters, pageSize = 25) {
  const toRow = rowMaker()
  const fetchRows = (offset, limit) => api.post('/report/', { filters, offset, limit })
  const first = await fetchRows(0, pageSize)
  const firstRows = first.rows.map(toRow)
  return {
    stats: first.stats,
    deviationCount: first.deviationCount,
    withinCount: first.withinCount,
    total: first.total,
    async rowsAt(start, count) {
      if (start === 0 && count <= firstRows.length) return firstRows.slice(0, count)
      const rows = []
      // Big exports come in pieces the server is happy to send.
      for (let at = start; at < start + count; at += 5000) {
        const page = await fetchRows(at, Math.min(5000, start + count - at))
        rows.push(...page.rows.map(toRow))
        if (page.rows.length === 0) break
      }
      return rows
    },
    shiftOf,
  }
}
