// Sort orders for the machine grid / list. Each one has a natural direction, the most useful
// machines first (alarm before run, most deviations, longest cycle, largest tonnage, latest
// log); the toolbar's ↑/↓ button reverses it. Machines without a value (offline:
// no cycle time) always go last, whichever way round. Ties fall back to the machine code.

const STATUS_RANK = { alarm: 0, maint: 1, idle: 2, run: 3, off: 4 }
const ALERT_RANK = { open: 3, awaiting: 2, accepted: 1 }

// Admins: today's deviation state (no reason → awaiting → accepted), then how many.
// Everyone else: the machine's deviation count.
const deviationScore = (m, alerts) => {
  const a = alerts?.get(m.id)
  return a ? (ALERT_RANK[a.level] ?? 0) * 1000 + a.total : m.deviations
}

export const SORTS = [
  { key: 'code', label: 'Machine code', value: (m) => m.id },
  { key: 'name', label: 'Name', value: (m) => m.name },
  { key: 'status', label: 'Status', value: (m) => STATUS_RANK[m.status] },
  { key: 'deviations', label: 'Deviations', desc: true, value: deviationScore },
  { key: 'cycle', label: 'Cycle time', desc: true, value: (m) => m.cycle },
  { key: 'peakPressure', label: 'Peak pressure', desc: true, value: (m) => m.peakPressure },
  { key: 'clamp', label: 'Tonnage', desc: true, value: (m) => m.clamp },
  { key: 'line', label: 'Line · bay', value: (m) => `${m.line} ${String(m.bay).padStart(2, '0')}` },
  // "10:05" sorts as text; "Yesterday" / "—" count as no log today.
  {
    key: 'lastLog',
    label: 'Last log',
    desc: true,
    value: (m) => (/^\d\d:\d\d$/.test(m.lastLog) ? m.lastLog : null),
  },
]

const text = new Intl.Collator(undefined, { numeric: true })
const compare = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : text.compare(String(a), String(b)))

export function sortMachines(machines, key, reversed, alerts) {
  const sort = SORTS.find((s) => s.key === key) ?? SORTS[0]
  const sign = (sort.desc ? -1 : 1) * (reversed ? -1 : 1)
  return machines
    .map((m) => ({ m, v: sort.value(m, alerts) }))
    .sort((x, y) => {
      if (x.v == null || y.v == null) return x.v == null && y.v == null ? 0 : x.v == null ? 1 : -1
      return sign * compare(x.v, y.v) || text.compare(x.m.id, y.m.id)
    })
    .map((x) => x.m)
}
