import { useEffect, useId, useRef, useState } from 'react'
import { MACHINES } from '../../store/machines.js'
import { activeShifts } from '../../store/shifts.js'
import { partNoFor } from '../../store/parameterLog.js'
import { parameterList } from '../../store/report.js'

const VALUE_MODES = [
  { key: 'standard', label: 'Standard' },
  { key: 'actual', label: 'Actual' },
  { key: 'both', label: 'Standard + Actual' },
]
const STATUS_MODES = [
  { key: 'all', label: 'All' },
  { key: 'deviations', label: 'Deviations' },
  { key: 'open', label: 'Open' },
  { key: 'awaiting', label: 'Awaiting supv.' },
  { key: 'supervised', label: 'Awaiting mgr.' },
  { key: 'closed', label: 'Closed' },
]
const CHIPS_SHOWN = 3

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="rfilter__seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className="mono" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Select({ label, value, onChange, allLabel, options }) {
  const id = useId()
  return (
    <div className="rfilter__field">
      <label htmlFor={id} className="mono">
        {label}
      </label>
      <select id={id} className="rfilter__select mono" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Chips for the picked machines, plus a searchable checklist. No machines picked = all machines.
function MachinePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const listId = useId()

  // While the list is open, a click outside it or Escape closes it.
  useEffect(() => {
    if (!open) return
    function close(e) {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  const q = query.trim().toLowerCase()
  const shown = MACHINES.filter((m) => !q || `${m.id} ${m.name} ${m.mold}`.toLowerCase().includes(q))

  return (
    <div className="rfilter__field rfilter__field--machine" ref={ref}>
      <span className="mono" id={`${listId}-label`}>
        Machine
      </span>
      <div className="rpicker">
        <div className="rpicker__chips">
          {value.length === 0 && <span className="rpicker__all mono">All machines ({MACHINES.length})</span>}
          {value.slice(0, CHIPS_SHOWN).map((id) => (
            <button key={id} type="button" className="rpicker__chip mono" onClick={() => toggle(id)} aria-label={`Remove ${id}`}>
              {id} <span aria-hidden="true">×</span>
            </button>
          ))}
          {value.length > CHIPS_SHOWN && <span className="rpicker__more mono">+{value.length - CHIPS_SHOWN} more</span>}
        </div>
        <button
          type="button"
          className="rpicker__toggle"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${listId}-label`}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="icon">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div id={listId} className="rpicker__panel">
            <input
              type="search"
              className="rpicker__search"
              placeholder="Search machine or mold…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="rpicker__bulk mono">
              <button type="button" onClick={() => onChange([])}>
                All machines
              </button>
              <button type="button" onClick={() => onChange(shown.map((m) => m.id))}>
                Only these {shown.length}
              </button>
            </div>
            <ul className="rpicker__list">
              {shown.map((m) => (
                <li key={m.id}>
                  <label>
                    <input type="checkbox" checked={value.includes(m.id)} onChange={() => toggle(m.id)} />
                    <span className="mono">{m.id}</span>
                    <span className="rpicker__name">{m.name}</span>
                    <span className="rpicker__mold mono">{m.mold}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// Edits a draft; nothing changes in the report until "Apply filter".
export default function ReportFilters({ draft, onChange, onApply, onReset, dirty }) {
  const set = (key) => (value) => onChange({ ...draft, [key]: value })
  const toggleShift = (key) =>
    set('shifts')(draft.shifts.includes(key) ? draft.shifts.filter((s) => s !== key) : [...draft.shifts, key].sort())
  const rangeBad = draft.from > draft.to

  return (
    <form
      className="rfilter"
      onSubmit={(e) => {
        e.preventDefault()
        onApply()
      }}
    >
      <div className="rfilter__row">
        <fieldset className="rfilter__field">
          <legend className="mono">Date range</legend>
          <div className={`rfilter__dates ${rangeBad ? 'is-bad' : ''}`}>
            <input type="date" aria-label="From" value={draft.from} max={draft.to} onChange={(e) => set('from')(e.target.value)} required />
            <span aria-hidden="true">→</span>
            <input type="date" aria-label="To" value={draft.to} min={draft.from} onChange={(e) => set('to')(e.target.value)} required />
          </div>
        </fieldset>

        <fieldset className="rfilter__field">
          <legend className="mono">Shift</legend>
          <div className="rfilter__shifts">
            {activeShifts().map((s) => (
              <button
                key={s.code}
                type="button"
                className="mono"
                aria-pressed={draft.shifts.includes(s.code)}
                onClick={() => toggleShift(s.code)}
              >
                {s.code}
              </button>
            ))}
          </div>
        </fieldset>

        <MachinePicker value={draft.machines} onChange={set('machines')} />

        <Select
          label="Mold"
          value={draft.mold}
          onChange={set('mold')}
          allLabel="All molds"
          options={MACHINES.map((m) => ({ value: m.mold, label: `${m.mold} · ${m.id}` }))}
        />
        <Select
          label="Part no."
          value={draft.part}
          onChange={set('part')}
          allLabel="All parts"
          options={MACHINES.map((m) => ({ value: partNoFor(m), label: partNoFor(m) }))}
        />
        <Select
          label="Parameter"
          value={draft.param}
          onChange={set('param')}
          allLabel={`All ${parameterList().length}`}
          options={parameterList().map((p) => ({ value: p.key, label: p.label }))}
        />
      </div>

      <div className="rfilter__row rfilter__row--bottom">
        <div className="rfilter__field">
          <span className="mono">Values</span>
          <Segmented label="Values" options={VALUE_MODES} value={draft.values} onChange={set('values')} />
        </div>
        <div className="rfilter__field">
          <span className="mono">Deviation status</span>
          <Segmented label="Deviation status" options={STATUS_MODES} value={draft.status} onChange={set('status')} />
        </div>

        <div className="rfilter__actions">
          {(rangeBad || draft.shifts.length === 0) && (
            <p className="rfilter__error" role="alert">
              {rangeBad ? 'The start date is after the end date.' : 'Pick at least one shift.'}
            </p>
          )}
          <button type="button" className="rbtn mono" onClick={onReset}>
            Reset
          </button>
          <button type="submit" className="rbtn rbtn--primary mono" disabled={rangeBad || draft.shifts.length === 0}>
            {dirty ? 'Apply filter •' : 'Apply filter'}
          </button>
        </div>
      </div>
    </form>
  )
}
