import { useState } from 'react'
import LogDialog from '../../components/LogDialog.jsx'
import { check, hourLabel, isNumeric } from '../../store/parameterLog.js'

// Every fitted parameter starts at its standard value (or, when editing, at what was recorded).
function initialValues(sections, current) {
  return Object.fromEntries(
    sections.flatMap((s) =>
      s.rows.filter((r) => !r.na).map((r) => [r.key, String(current?.[r.key] ?? r.text ?? r.std)]),
    ),
  )
}

// `current` is set when editing an hour that was already submitted.
export default function RecordDialog({ machine, hour, sections, current, onSave, onClose }) {
  const [values, setValues] = useState(() => initialValues(sections, current))

  const parsed = (row) => (isNumeric(row) && values[row.key] !== '' ? Number(values[row.key]) : values[row.key])
  const flagged = sections.flatMap((s) => s.rows).filter((r) => check(r, parsed(r)))

  function handleSubmit() {
    const reading = Object.fromEntries(
      sections.flatMap((s) => s.rows.filter((r) => !r.na).map((r) => [r.key, parsed(r)])),
    )
    onSave(reading)
    return true
  }

  return (
    <LogDialog
      title={`${current ? 'Edit' : 'Record'} ${hourLabel(hour)} reading · ${machine.name} · ${machine.id}`}
      submitLabel={
        flagged.length ? `Save · ${flagged.length} deviation${flagged.length > 1 ? 's' : ''}` : 'Save reading'
      }
      wide
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <p className="log-dialog__hint">
        {current
          ? 'Editing a submitted reading. Changes go to the audit trail; a new value outside its limits opens a new deviation.'
          : 'Values start at the standard. Anything outside its limits is saved as an open deviation that needs a reason.'}
      </p>

      {sections.map((section) => (
        <fieldset key={section.title} className="record-group">
          <legend className="mono">{section.title}</legend>
          {section.rows
            .filter((r) => !r.na)
            .map((row) => {
              const flag = check(row, parsed(row))
              return (
                <label
                  key={row.key}
                  className={`record-field ${flag ? `is-${row.zeroTol ? 'changed' : 'limit'}` : ''}`}
                >
                  <span className="record-field__label">{row.label}</span>
                  <span className="record-field__input">
                    <input
                      type={isNumeric(row) ? 'number' : 'text'}
                      step="any"
                      inputMode="decimal"
                      required
                      value={values[row.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))}
                    />
                    <span className="mono">{row.unit}</span>
                  </span>
                  <span className="record-field__limits mono">
                    {flag ? flag : isNumeric(row) ? `${row.lower ?? '—'} – ${row.upper}` : 'Mode'}
                  </span>
                </label>
              )
            })}
        </fieldset>
      ))}
    </LogDialog>
  )
}
