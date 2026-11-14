import { useEffect, useState } from 'react'
import { SCALE_CHANGED, getZoom } from '../utils/scale.js'
import './TitleBlock.css'

// "27.10.2026"
const fmtDate = (d) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

// The screen scale as a drawing scale: zoom 0.75 → "0.75:1", full size → "1:1".
const fmtScale = (zoom) => `${Number(zoom.toFixed(2))}:1`

// Whoever signed in last on this computer (saved at sign-in; the user list is only loaded after it).
function lastSignedIn() {
  try {
    return localStorage.getItem('mpcr-last-user') ?? '—'
  } catch {
    return '—'
  }
}

// Data first, markup second: add a row here and the table grows.
// Each value is live: today's date, the app version, the current screen scale.
function cells(now, zoom) {
  return [
    { label: 'Dwg no.', value: 'MPCR-LGN-001', accent: true },
    { label: 'Rev', value: __APP_VERSION__.split('.').slice(0, 2).join('.') },
    { label: 'Scale', value: fmtScale(zoom) },
    { label: 'Date', value: fmtDate(now) },
    { label: 'Drawn', value: lastSignedIn() },
    { label: 'Sheet', value: '1 / 1' },
  ]
}

export default function TitleBlock() {
  const [now, setNow] = useState(() => new Date())
  const [zoom, setZoom] = useState(getZoom)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000) // the date rolls over at midnight
    const onResize = () => setZoom(getZoom())
    window.addEventListener(SCALE_CHANGED, onResize)
    return () => {
      clearInterval(timer)
      window.removeEventListener(SCALE_CHANGED, onResize)
    }
  }, [])

  return (
    <dl className="title-block">
      {cells(now, zoom).map((cell) => (
        <div key={cell.label} className="title-block__cell">
          <dt className="mono">{cell.label}</dt>
          <dd className={cell.accent ? 'is-accent' : undefined}>{cell.value}</dd>
        </div>
      ))}
    </dl>
  )
}
