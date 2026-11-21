// The app keeps the plant's data in memory (MACHINES, RECIPES, USERS …) so every screen can read
// it synchronously. It is filled from the server after sign-in (hydrate in session.js) and every
// change is sent back through the API; the server is the record.
import { api, save } from '../api/client.js'

// Swap a store's contents in place: other modules hold references to these arrays and objects.
export function replaceAll(target, items) {
  if (Array.isArray(target)) target.splice(0, target.length, ...items)
  else {
    for (const k of Object.keys(target)) delete target[k]
    Object.assign(target, items)
  }
  return target
}

// ---------- Audit trail: every settings change, newest first ----------

export const loadAudit = (limit = 500) => api.get(`/audit/?limit=${limit}`)

// area: 'Shift master' | 'Machine master' | 'Parameter master' | 'User management' | 'Deviation' | 'Parameter log'
// The server stamps who and when.
export function logChange(_user, area, text) {
  save(api.post('/audit/', { area, text }))
}
