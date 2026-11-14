import StatusBadge from '../../components/StatusBadge.jsx'
import { PARAMETERS, formatValue } from '../../store/machines.js'
import { alertLabel } from '../../store/parameterLog.js'
import './MachineList.css'

// `alertFor` (admins only) returns a machine's deviation state today; its row blinks or glows like the cards.
export default function MachineList({ machines, selectedId, alertFor, onOpenLog }) {
  return (
    <div className="mlist">
      <table>
        <thead className="mono">
          <tr>
            <th scope="col">Machine</th>
            <th scope="col">Status</th>
            <th scope="col">Line</th>
            <th scope="col">Mold</th>
            <th scope="col">Part no.</th>
            {PARAMETERS.map((p) => (
              <th key={p.key} scope="col" className="num">
                {p.label} ({p.unit})
              </th>
            ))}
            <th scope="col">Last log</th>
            <th scope="col">Dev</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m) => {
            const alert = alertFor?.(m)
            const rowClass = [
              m.id === selectedId && 'is-selected',
              alert?.level && `has-alert has-alert--${alert.level}`,
            ]
            return (
              <tr key={m.id} className={rowClass.filter(Boolean).join(' ') || undefined} onClick={() => onOpenLog(m)}>
                <th scope="row">
                  {m.name}
                  <span className="mlist__id mono">{m.id}</span>
                </th>
                <td>
                  <StatusBadge status={m.status} />
                </td>
                <td className="mono">{m.line}</td>
                <td className="mono">{m.mold}</td>
                <td className="mono">{m.part}</td>
                {PARAMETERS.map((p) => (
                  <td key={p.key} className="num mono">
                    {formatValue(m[p.key], p.digits)}
                  </td>
                ))}
                <td className="mono">{m.lastLog}</td>
                {alert ? (
                  <td className={`mono ${alert.level ? 'is-alert' : 'is-ok'}`}>
                    {alert.level ? `${alert.total} · ${alertLabel(alert)}` : '—'}
                  </td>
                ) : (
                  <td className={`mono ${m.deviations ? 'is-dev' : 'is-ok'}`}>{m.deviations || '—'}</td>
                )}
                <td>
                  <button
                    type="button"
                    className="mlist__action mono"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenLog(m)
                    }}
                  >
                    Log →
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
