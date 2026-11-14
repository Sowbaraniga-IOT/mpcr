import { useId } from 'react'
import { STATUSES, activeMachines, clampOptions, lineOptions } from '../../store/machines.js'
import { SORTS } from './sorting.js'
import './Toolbar.css'

const STATUS_FILTERS = [{ key: 'all', short: 'All' }, ...STATUSES]

// A native <select> with a "LABEL:" prefix drawn next to it.
function FilterSelect({ label, value, options, onChange }) {
  const id = useId()
  return (
    <div className="filter-select mono">
      <label htmlFor={id}>{label}:</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Every value here comes from Dashboard; the toolbar only reports changes back up.
export default function Toolbar({ filters, onFilterChange, view, onViewChange }) {
  const set = (key) => (value) => onFilterChange(key, value)
  const sortId = useId()

  return (
    <div className="toolbar">
      <label className="toolbar__search">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="icon">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <span className="visually-hidden">Search</span>
        <input
          type="search"
          placeholder="Search machine, mold or part no…"
          value={filters.query}
          onChange={(e) => set('query')(e.target.value)}
        />
      </label>

      <div className="segmented" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.key}
            type="button"
            className="segmented__btn mono"
            aria-pressed={filters.status === s.key}
            onClick={() => set('status')(s.key)}
          >
            {s.key !== 'all' && <span className={`dot dot--${s.key}`} aria-hidden="true" />}
            {s.short}
          </button>
        ))}
      </div>

      <FilterSelect
        label="Line"
        value={filters.line}
        onChange={set('line')}
        options={lineOptions(activeMachines()).map((l) => ({ value: l, label: l }))}
      />
      <FilterSelect
        label="Clamp"
        value={filters.clamp}
        onChange={set('clamp')}
        options={clampOptions(activeMachines()).map((c) => ({ value: String(c), label: `${c} t` }))}
      />

      <div className="toolbar__sort">
        <div className="filter-select mono">
          <label htmlFor={sortId}>Sort:</label>
          <select id={sortId} value={filters.sort} onChange={(e) => set('sort')(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="toolbar__dir mono"
          aria-pressed={filters.reversed}
          title={filters.reversed ? 'Reversed order · click for the normal order' : 'Click to reverse the order'}
          onClick={() => set('reversed')(!filters.reversed)}
        >
          <span aria-hidden="true">{filters.reversed ? '↑' : '↓'}</span>
          <span className="visually-hidden">Reverse sort order</span>
        </button>
      </div>

      <div className="segmented toolbar__view" role="group" aria-label="Layout">
        {[
          { key: 'card', label: 'Card', icon: '▦' },
          { key: 'list', label: 'List', icon: '≡' },
        ].map((v) => (
          <button
            key={v.key}
            type="button"
            className="segmented__btn segmented__btn--accent mono"
            aria-pressed={view === v.key}
            onClick={() => onViewChange(v.key)}
          >
            <span aria-hidden="true">{v.icon}</span> {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
