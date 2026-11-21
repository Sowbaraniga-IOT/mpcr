// The plant's machines: master data from the Machine Master and each machine's live values
// (status and last shot, from the OPC UA gateway). Loaded after sign-in, refreshed by refreshLive().
import { replaceAll } from './store.js'
import { api, save } from '../api/client.js'

export const STATUSES = [
  { key: 'run', label: 'Running', short: 'Run' },
  { key: 'idle', label: 'Idle', short: 'Idle' },
  { key: 'maint', label: 'Maint', short: 'Maint' },
  { key: 'alarm', label: 'Alarm', short: 'Alarm' },
  { key: 'off', label: 'Offline', short: 'Off' },
]

// { id, name, make, model, clamp, line, bay, dataSource, active, mold, partNo, partName,
//   status, cycle, cushion, injection, peakPressure, recovery, progress, lastLog, deviations, hasPhoto }
// Other modules keep references to MACHINES, so it is updated in place, never replaced.
export const MACHINES = []

export const MASTER_FIELDS = [
  'id',
  'name',
  'make',
  'model',
  'clamp',
  'line',
  'bay',
  'dataSource',
  'active',
  'mold',
  'partNo',
  'partName',
]
const masterOf = (m) => Object.fromEntries(MASTER_FIELDS.map((f) => [f, m[f]]))

// Server rows → MACHINES, keeping each machine's object (and so every reference to it).
export function hydrateMachines(list) {
  const byId = new Map(MACHINES.map((m) => [m.id, m]))
  replaceAll(
    MACHINES,
    list.map((row) => Object.assign(byId.get(row.id) ?? {}, row)),
  )
}

// A machine added in the machine master has no live data until it reports.
function newMachine(fields) {
  return {
    ...fields,
    status: 'off',
    cycle: null,
    cushion: null,
    injection: null,
    peakPressure: null,
    recovery: null,
    progress: 0,
    lastLog: '—',
    deviations: 0,
    hasPhoto: false,
  }
}

// Shown at once; the server's copy replaces it when the save comes back.
export function saveMachine(fields) {
  const machine = MACHINES.find((m) => m.id === fields.id)
  const isNew = !machine
  if (machine) Object.assign(machine, fields)
  else MACHINES.push(newMachine(fields))
  const body = masterOf(fields)
  return save(isNew ? api.post('/machines/', body) : api.put(`/machines/${encodeURIComponent(fields.id)}/`, body)).then(
    (row) => {
      if (row) Object.assign(MACHINES.find((m) => m.id === row.id) ?? {}, row)
      return row
    },
  )
}

export const activeMachines = () => MACHINES.filter((m) => m.active !== false)

// Filter choices and suggestions come from the machines themselves, so they always match.
const naturally = new Intl.Collator(undefined, { numeric: true })
const distinct = (machines, pick) => [...new Set(machines.map(pick).filter(Boolean))]

export const lineOptions = (machines = MACHINES) => distinct(machines, (m) => m.line).sort(naturally.compare)
export const clampOptions = (machines = MACHINES) => distinct(machines, (m) => m.clamp).sort((a, b) => a - b)
export const modelOptions = (machines = MACHINES) => distinct(machines, (m) => m.model).sort(naturally.compare)

// The parameters shown on each card and in the list, in display order.
export const PARAMETERS = [
  { key: 'cycle', label: 'Cycle time', unit: 's', digits: 2 },
  { key: 'cushion', label: 'M-cushion', unit: 'mm', digits: 2 },
  { key: 'injection', label: 'Inj. time', unit: 's', digits: 2 },
  { key: 'peakPressure', label: 'Peak press.', unit: 'MPa', digits: 0 },
  { key: 'recovery', label: 'RCV time', unit: 's', digits: 2 },
  { key: 'clamp', label: 'Tonnage', unit: 't', digits: 0 },
]

export function formatValue(value, digits) {
  return value == null ? '—' : value.toFixed(digits)
}
