// Signing in, the first load of the plant's data, and keeping it live afterwards.
import { api, setToken } from '../api/client.js'
import { hydrateCatalog } from './catalog.js'
import { hydrateMachines } from './machines.js'
import { hydrateNotifications, refreshNotifications } from './notifications.js'
import { hydrateToday, updateTodayDeviations } from './parameterLog.js'
import { hydrateRecipes } from './recipes.js'
import { hydrateShiftMaster } from './shiftMaster.js'
import { hydrateUsers } from './users.js'
import { hydrateEuromap77 } from './euromap77.js'

export const LIVE_CHANGED = 'mpcr-live-changed' // window event after each live refresh
const LIVE_EVERY = 10_000 // machine status, last shot, today's deviations
const NOTIFY_EVERY = 15_000

// Fills every store from GET /api/bootstrap/; returns the signed-in user's record.
export async function loadPlant() {
  const data = await api.get('/bootstrap/')
  hydrateUsers(data.users, data.matrix)
  hydrateMachines(data.machines)
  hydrateCatalog(data.molds, data.parts)
  hydrateShiftMaster(data.shiftMaster)
  hydrateRecipes(data.recipes)
  hydrateToday(data.today.date, data.today.logs)
  hydrateNotifications(data.notifications)
  hydrateEuromap77(data.euromap77)
  return { user: data.user, images: data.images }
}

export async function signIn(loginId, password, remember) {
  const { token, user } = await api.post('/auth/login/', { loginId, password })
  setToken(token, remember)
  try {
    localStorage.setItem('mpcr-last-user', user.username) // the title block's "Drawn"
  } catch {
    /* storage blocked */
  }
  return user
}

export function signOut() {
  api.post('/auth/logout/').catch(() => {})
  setToken(null)
}

// Polls the server while signed in. Returns a function that stops it.
export function startLive() {
  let stopped = false
  async function live() {
    try {
      const data = await api.get('/live/')
      if (stopped) return
      hydrateMachines(data.machines)
      updateTodayDeviations(data.date, data.deviations)
      hydrateShiftMaster(data.shiftMaster) // a shift changed elsewhere reaches this screen too
      window.dispatchEvent(new Event(LIVE_CHANGED))
    } catch {
      /* offline for a moment: the next poll tries again */
    }
  }
  const timers = [setInterval(live, LIVE_EVERY), setInterval(() => !stopped && refreshNotifications(), NOTIFY_EVERY)]
  return () => {
    stopped = true
    timers.forEach(clearInterval)
  }
}
