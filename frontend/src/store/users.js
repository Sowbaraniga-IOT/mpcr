// Users, roles and what each role may do. Loaded from the server after sign-in; passwords
// are checked and stored (hashed) only by the server.
import { MACHINES } from './machines.js'
import { replaceAll } from './store.js'
import { api, save } from '../api/client.js'

export const ROLES = [
  { key: 'Admin', short: 'Admin' },
  { key: 'Manager', short: 'Mgr' },
  { key: 'Supervisor', short: 'Supv' },
  { key: 'Operator', short: 'Oper' },
  { key: 'Viewer', short: 'View' },
]

export const PERMISSIONS = [
  { key: 'dashboard', label: 'View dashboard' },
  { key: 'model3d', label: 'View 3D model' },
  { key: 'record', label: 'Record param log' },
  { key: 'editAfterSubmit', label: 'Edit after submit' },
  { key: 'approve', label: 'Approve deviations · level 1' },
  { key: 'approveFinal', label: 'Approve deviations · level 2 (final)' },
  { key: 'monitor', label: 'Deviation alerts on dashboard' },
  { key: 'report', label: 'View report' },
  { key: 'export', label: 'Export Excel / PDF' },
  { key: 'shiftMaster', label: 'Shift master' },
  { key: 'machineMaster', label: 'Machine master' },
  { key: 'parameters', label: 'Parameter standards' },
  { key: 'users', label: 'User management' },
  { key: 'audit', label: 'Audit trail · admin only' },
]

// Machine access is 'all' or a list of machine ids.
export const USERS = []
export const MATRIX = {}

// Permissions only the Admin role holds, whatever was ticked: the audit trail.
export const ADMIN_ONLY = ['audit']

// Read-only roles never change anything, whatever is ticked (the server enforces the same).
// For them the master ticks only open the master pages, without edit controls.
export const READ_ONLY_ROLES = ['Viewer']
export const CHANGE_ONLY = ['record', 'editAfterSubmit', 'approve', 'approveFinal', 'users', 'audit']
const MASTER_PERMISSIONS = ['shiftMaster', 'machineMaster', 'parameters']
export const isReadOnly = (user) => READ_ONLY_ROLES.includes(user?.role)

export function hydrateUsers(users, matrix) {
  replaceAll(USERS, users)
  replaceAll(MATRIX, matrix)
  for (const [role, keys] of Object.entries(MATRIX)) {
    MATRIX[role] =
      role === 'Admin' ? [...new Set([...keys, ...ADMIN_ONLY])] : keys.filter((k) => !ADMIN_ONLY.includes(k))
  }
}

// Add or update one account. `password` is sent only when an admin sets a new one.
export async function saveUser(record, { isNew, password } = {}) {
  const body = { ...record, ...(password && { password }) }
  const saved = await (isNew
    ? api.post('/users/', body)
    : api.put(`/users/${encodeURIComponent(record.username)}/`, body))
  const i = USERS.findIndex((u) => u.username === saved.username)
  if (i >= 0) USERS[i] = saved
  else USERS.push(saved)
  return saved
}

export function saveMatrix() {
  save(api.put('/roles/', { matrix: MATRIX }))
}

export const findUser = (username) => USERS.find((u) => u.username === username) ?? null

export const can = (user, permission) =>
  Boolean(
    user &&
    MATRIX[user.role]?.includes(permission) &&
    (user.role === 'Admin' || !ADMIN_ONLY.includes(permission)) &&
    !(isReadOnly(user) && CHANGE_ONLY.includes(permission)),
  )

// May this user change things on a master page (not just open it)?
export const canChange = (user, permission) =>
  can(user, permission) && !(isReadOnly(user) && MASTER_PERMISSIONS.includes(permission))

export function canAccessMachine(user, machine) {
  return !user?.access || user.access === 'all' || user.access.includes(machine.id)
}

// ['J10-27','J10-28','J10-29','J10-30'] → "J10-27 – J10-30"
export function formatAccess(access) {
  if (!access || access === 'all') return 'All'
  if (!access.length) return 'None'
  // Machines this user can't see aren't loaded: list them by id after the known ones.
  const unknown = access.filter((id) => !MACHINES.some((m) => m.id === id))
  const idx = access
    .map((id) => MACHINES.findIndex((m) => m.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < idx.length; i++) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++
    parts.push(
      j - i >= 2
        ? `${MACHINES[idx[i]].id} – ${MACHINES[idx[j]].id}`
        : idx
            .slice(i, j + 1)
            .map((k) => MACHINES[k].id)
            .join(', '),
    )
    i = j
  }
  return [...parts, ...unknown].join(', ')
}
