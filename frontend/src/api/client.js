// The Django backend (../backend/). In development Vite forwards /api to it (vite.config.js).
// The sign-in token lives in localStorage ("Keep me signed in") or sessionStorage (this tab only).

const BASE = import.meta.env.VITE_API_URL ?? '/api'
const TOKEN_KEY = 'mpcr-token'

export const API_ERROR = 'mpcr-api-error' // window event: a save failed; detail = message
export const SIGNED_OUT = 'mpcr-signed-out' // window event: the server no longer accepts the token
export const PASSWORD_REQUIRED = 'mpcr-password-required' // window event: an admin asked for a new access code

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
  } catch {
    /* storage blocked: signed in for this page view only */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  const token = getToken()
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Token ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('The MPCR server can’t be reached. Check the network and that the backend is running.', 0)
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (res.ok) return data
  if (res.status === 401 && token) window.dispatchEvent(new Event(SIGNED_OUT))
  if (data?.code === 'password_change_required') window.dispatchEvent(new Event(PASSWORD_REQUIRED))
  throw new ApiError(data?.detail ?? `The server answered ${res.status}.`, res.status)
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
}

// For saves made in the background (the screen already shows the change): a failure is
// announced app-wide instead of thrown, and the promise resolves to null.
export function save(promise) {
  return promise.catch((err) => {
    window.dispatchEvent(new CustomEvent(API_ERROR, { detail: err.message }))
    return null
  })
}

// "2026-11-03" for a Date, as the API's URLs and filters use.
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
