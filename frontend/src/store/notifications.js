// Notifications for deviations and their two-level approval. The server writes an event each time
// a deviation changes and decides who hears about it:
//   perms — everyone holding one of these permissions for the machine (e.g. all level-1 approvers)
//   users — named people (the operator who wrote the reason, the supervisor who approved level 1)
// Admins (the 'monitor' permission) see every event. Nobody is notified about their own action.
// Each item comes with `unread` and `action` (it still asks this user to do something).
import { replaceAll } from './store.js'
import { api, save } from '../api/client.js'

export const CHANGED = 'mpcr-notifications-changed' // window event after the list changes

// type → tone (dot colour) and whether it asks the recipient to do something
export const TYPES = {
  detected: { tone: 'red', label: 'Deviation' },
  reason: { tone: 'yellow', label: 'Reason entered' },
  l1: { tone: 'yellow', label: 'Level 1 approved' },
  rejected: { tone: 'red', label: 'Rejected' },
  approved: { tone: 'green', label: 'Closed' },
}

const LIST = []

export function hydrateNotifications(list) {
  replaceAll(LIST, list)
  window.dispatchEvent(new Event(CHANGED))
}

// Polled; a missed poll is simply retried next time.
export const refreshNotifications = () =>
  api
    .get('/notifications/')
    .then(hydrateNotifications)
    .catch(() => {})

// This user's notifications, newest first (the server already filtered them for whoever is signed in).
export const notificationsFor = () => [...LIST]

export function markRead(_user, ids) {
  const set = new Set(ids.map(String))
  hydrateNotifications(LIST.map((n) => (set.has(n.id) ? { ...n, unread: false } : n)))
  save(api.post('/notifications/read/', { ids: [...set] })).then((list) => list && hydrateNotifications(list))
}
