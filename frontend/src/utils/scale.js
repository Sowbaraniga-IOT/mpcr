// Fit the whole app to the window. Every page is laid out at 1920 px wide, so on a smaller
// screen everything shrinks in proportion (like a drawing sheet scaled to fit) instead of
// wrapping and crowding; on a large screen it grows a little.
// CSS zoom also shrinks vh/vw, so the real window size is handed to CSS as --app-h / --app-w.
const DESIGN_WIDTH = 1920
const MIN = 0.8 // below this the smallest labels get hard to read
const MAX = 1.25
const PHONE = 900 // narrower windows use the phone layout at full size

const KEY = 'mpcr-display-size'
export const DISPLAY_SIZES = [
  { key: 'small', label: 'Smaller', factor: 0.9 },
  { key: 'auto', label: 'Auto', factor: 1 },
  { key: 'large', label: 'Larger', factor: 1.1 },
]

export function getDisplaySize() {
  try {
    return localStorage.getItem(KEY) ?? 'auto'
  } catch {
    return 'auto'
  }
}

export function setDisplaySize(key) {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
  applyScale(key)
}

let zoom = 1
export const SCALE_CHANGED = 'mpcr-scale'
export const getZoom = () => zoom

function applyScale(size = getDisplaySize()) {
  const width = window.innerWidth
  const fit = width < PHONE ? 1 : Math.min(MAX, Math.max(MIN, width / DESIGN_WIDTH))
  zoom = fit * (DISPLAY_SIZES.find((s) => s.key === size)?.factor ?? 1)
  const root = document.documentElement
  root.style.zoom = String(zoom)
  root.style.setProperty('--app-h', `${window.innerHeight / zoom}px`)
  root.style.setProperty('--app-w', `${width / zoom}px`)
  window.dispatchEvent(new Event(SCALE_CHANGED)) // anything showing the scale updates
}

export function startScaling() {
  applyScale()
  window.addEventListener('resize', () => applyScale())
}
