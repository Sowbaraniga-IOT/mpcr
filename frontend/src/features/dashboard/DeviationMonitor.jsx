import { ALERT_LEVELS } from '../../store/parameterLog.js'
import './DeviationMonitor.css'

// Admins only: how many machines are in each alert state today. Clicking a state filters the grid to it.
export default function DeviationMonitor({ alerts, value, onChange }) {
  const machinesAt = (level) => alerts.filter((a) => a.level === level).length
  const clear = alerts.filter((a) => !a.level).length

  return (
    <section className="dmon" aria-label="Deviation monitor">
      <div className="dmon__title">
        <h2 className="mono">Deviation monitor</h2>
        <p>Today · admin only · from the parameter logs</p>
      </div>

      <div className="dmon__levels">
        {ALERT_LEVELS.map((l) => (
          <button
            key={l.key}
            type="button"
            className={`dmon__level dmon__level--${l.key}`}
            aria-pressed={value === l.key}
            onClick={() => onChange(value === l.key ? 'all' : l.key)}
            title={value === l.key ? 'Show all machines' : `Show only: ${l.hint}`}
          >
            <span className="dmon__swatch" aria-hidden="true" />
            <strong>{machinesAt(l.key)}</strong>
            <span className="dmon__text">
              <span className="mono">{l.label}</span>
              <span>{l.hint}</span>
            </span>
          </button>
        ))}
        <p className="dmon__clear mono">
          {clear} machine{clear === 1 ? '' : 's'} on standard
        </p>
      </div>
    </section>
  )
}
