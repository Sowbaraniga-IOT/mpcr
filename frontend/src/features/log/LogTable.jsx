import { allRows, check, formatReading, hourLabel, isNumeric, shiftTabs } from '../../store/parameterLog.js'
import { euromapTitle } from '../../store/euromap77.js'

const STATUS_LABELS = {
  open: 'open',
  rejected: 'rejected',
  awaiting: 'awaiting supervisor',
  supervised: 'awaiting manager',
}

const HOUR_TEXT = {
  due: (m) => (m > 0 ? `Due · ${m} min` : `Late · ${-m} min`),
  missed: () => 'Missed',
  later: () => '—',
}

// `onEdit` is set for a logged hour when the user may edit readings after they were submitted,
// for a missed hour when back-dated entries are allowed (Shift Master rules), and for an hour
// only the machine (OPC UA) has filled, so a person can complete it.
function HourHead({ hour, state, initials, minutesToDue, onEdit, auto }) {
  return (
    <th scope="col" className={`plog-table__hour is-${state}`}>
      {hourLabel(hour)}
      <span>{state === 'logged' ? `✓ ${initials}` : HOUR_TEXT[state](minutesToDue)}</span>
      {onEdit && (
        <button
          type="button"
          className="plog-table__edit mono"
          onClick={onEdit}
          aria-label={`${state === 'missed' ? 'Add' : auto ? 'Complete' : 'Edit'} the ${hourLabel(hour)} reading`}
        >
          {state === 'missed' ? '+ Add' : auto ? '+ Complete' : '✎ Edit'}
        </button>
      )}
    </th>
  )
}

export default function LogTable({
  sections,
  shift,
  hours,
  deviations,
  hourState,
  valueAt,
  initials,
  minutesToDue,
  onFocusDeviation,
  onEditHour,
  isAutoHour = () => false,
  isAutoValue = () => false,
  machineLimitsAt = () => null,
}) {
  const span = shiftTabs().find((t) => t.key === shift)?.span
  const total = allRows(sections).length
  const summary = Object.entries(STATUS_LABELS)
    .map(([key, label]) => [deviations.filter((d) => d.status === key).length, label])
    .filter(([n]) => n)
  const columns = 7 + hours.length
  let rowIndex = 0

  return (
    <div className="plog-table">
      <header className="plog-table__bar mono">
        <h2>
          Parameter sheet · {shift === '24H' ? '24 h' : `Shift ${shift}`} · {span} · All {total} parameters
        </h2>
        {deviations.length > 0 && (
          <p className="plog-table__alert">
            ⚠ {deviations.length} deviation{deviations.length > 1 ? 's' : ''}
            {summary.map(([n, label]) => ` · ${n} ${label}`)}
          </p>
        )}
      </header>

      <div className="plog-table__scroll">
        <table>
          <thead className="mono">
            <tr>
              <th scope="col" className="plog-table__param">
                Parameter
              </th>
              <th scope="col">Unit</th>
              <th scope="col" className="num">
                Set value
              </th>
              <th scope="col" className="num">
                Tole&shy;rance
              </th>
              <th scope="col" className="num">
                Lower limit
              </th>
              <th scope="col" className="num plog-table__std">
                Standard value
              </th>
              <th scope="col" className="num">
                Upper limit
              </th>
              {hours.map((h) => (
                <HourHead
                  key={h}
                  hour={h}
                  state={hourState(h)}
                  initials={initials(h)}
                  auto={isAutoHour(h)}
                  minutesToDue={minutesToDue}
                  onEdit={onEditHour?.(h) ? () => onEditHour(h)() : null}
                />
              ))}
            </tr>
          </thead>

          {sections.map((section) => (
            <tbody key={section.title}>
              <tr className="plog-table__section">
                <th scope="colgroup" colSpan={columns} className="mono">
                  <span>{section.title}</span>
                </th>
              </tr>
              {section.rows.map((row) => {
                const index = rowIndex++
                const fixed = (v) => (row.na ? 'NA' : (row.text ?? v ?? '—'))
                return (
                  <tr key={row.key} className={row.na ? 'is-na' : undefined}>
                    <th scope="row" className="plog-table__param" title={euromapTitle(row.code)}>
                      {row.label}
                    </th>
                    <td className="plog-table__unit mono">{row.unit}</td>
                    <td className="num mono plog-table__set">{fixed(row.std)}</td>
                    <td className="num mono">{row.na ? 'NA' : (row.tolText ?? '—')}</td>
                    <td className="num mono">{fixed(row.lower)}</td>
                    <td className="num mono plog-table__std plog-table__set">{fixed(row.std)}</td>
                    <td className="num mono">{fixed(row.upper)}</td>
                    {hours.map((h) => {
                      const state = hourState(h)
                      if (state === 'later') return <td key={h} />
                      if (state === 'missed') return <td key={h} className="is-missed" />
                      if (row.na)
                        return (
                          <td key={h} className={`num mono is-${state}`}>
                            NA
                          </td>
                        )
                      if (state === 'due') {
                        return (
                          <td key={h} className="is-due">
                            <span className="plog-table__slot" />
                          </td>
                        )
                      }
                      const value = valueAt(row, h, index)
                      const flag = isNumeric(row) && check(row, value)
                      const dev = flag && deviations.find((d) => d.hour === h && d.key === row.key)
                      const auto = value != null && isAutoValue(row, h)
                      // the machine's own monitor limits (shown only; the parameter master decides deviations)
                      const ml = machineLimitsAt(row, h)
                      const mlText = ml && `${ml.lower ?? '—'} – ${ml.upper ?? '—'}`
                      const title = [auto && 'From the machine (OPC UA)', ml && `Machine monitor limits: ${mlText}`]
                        .filter(Boolean)
                        .join('\n')
                      return (
                        <td key={h} className={`num mono${auto ? ' is-auto' : ''}`} title={title || undefined}>
                          {flag ? (
                            <button
                              type="button"
                              className={`plog-table__flag is-${row.zeroTol ? 'changed' : 'limit'}`}
                              onClick={() => dev && onFocusDeviation(dev.id)}
                              title={dev ? 'Show this deviation' : undefined}
                            >
                              {formatReading(row, value)} {flag}
                            </button>
                          ) : (
                            formatReading(row, value)
                          )}
                          {ml && <span className="plog-table__mlim">M {mlText}</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
