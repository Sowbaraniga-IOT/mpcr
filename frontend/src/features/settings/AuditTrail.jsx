import { useEffect, useState } from 'react'
import { loadAudit } from '../../store/store.js'

const AREAS = ['All', 'Shift master', 'Machine master', 'Parameter master', 'User management', 'Deviation', 'Parameter log']

function when(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Every settings change, newest first (the server keeps them all; the last 2,000 are shown).
export default function AuditTrail() {
  const [area, setArea] = useState('All')
  const [all, setAll] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    loadAudit(2000)
      .then(setAll)
      .catch((err) => setError(err.message))
  }, [])
  const entries = (all ?? []).filter((e) => area === 'All' || e.area === area)
  return (
    <div className="spage spage--wide">
      <div className="spage__main">
        <header className="shead">
          <div>
            <h1>Audit Trail</h1>
            <p>{error ? `Couldn’t load the audit trail: ${error}` : all ? 'Who changed which setting, and when. Newest first.' : 'Loading…'}</p>
          </div>
          <select className="sinput mono" style={{ width: 240 }} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </header>
        <div className="stable stable--tall">
          <table>
            <thead className="mono">
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Area</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{when(e.at)}</td>
                  <td>
                    {e.by} <span className="stable__muted">· {e.role}</span>
                  </td>
                  <td>{e.area}</td>
                  <td style={{ whiteSpace: 'normal' }}>{e.text}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="stable__muted">
                    No changes recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
