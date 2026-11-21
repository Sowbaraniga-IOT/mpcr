import { useState } from 'react'
import LogDialog from '../../components/LogDialog.jsx'
import { Field } from './ui.jsx'
import { MACHINES } from '../../store/machines.js'
import { MOLDS, PARTS, partName } from '../../store/catalog.js'
import { findRecipe } from '../../store/recipes.js'

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '—')
const STATUS = { active: 'sbadge--ok', draft: 'sbadge--warn', archived: 'sbadge--muted', rejected: 'sbadge--accent' }

// Machine + Part No. + Mold picker, used to start a recipe or copy one.
function ComboFields({ combo, onChange }) {
  const set = (key) => (e) => {
    const value = e.target.value
    // Picking a mold fills in the part it makes.
    if (key === 'mold') onChange({ ...combo, mold: value, partNo: MOLDS.find((m) => m.no === value)?.partNo ?? combo.partNo })
    else onChange({ ...combo, [key]: value })
  }
  return (
    <div className="scombo">
      <Field label="Machine">
        {(id) => (
          <select id={id} value={combo.machineId} onChange={set('machineId')}>
            {MACHINES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {m.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Mold no.">
        {(id) => (
          <select id={id} value={combo.mold} onChange={set('mold')}>
            {MOLDS.map((m) => (
              <option key={m.no} value={m.no}>
                {m.no} · {m.description}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Part no.">
        {(id) => (
          <select id={id} value={combo.partNo} onChange={set('partNo')}>
            {PARTS.map((p) => (
              <option key={p.partNo} value={p.partNo}>
                {p.partNo} · {p.partName}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  )
}

function comboNote(combo, sourceId) {
  const target = findRecipe(combo)
  if (!target) return { tone: 'ok', text: 'No recipe for this combination yet: a new recipe (draft v1) is created.' }
  if (target.id === sourceId) return { tone: 'bad', text: 'That is this recipe. Pick another machine, part or mold.' }
  return { tone: 'warn', text: `${target.id} already covers this combination: the values become its next draft version.` }
}

export function NewRecipeDialog({ start, source, onCreate, onClose }) {
  const [combo, setCombo] = useState(start)
  const [from, setFrom] = useState(source ? 'source' : 'defaults')
  const existing = findRecipe(combo)
  return (
    <LogDialog
      title="New recipe"
      submitLabel={existing ? `Open ${existing.id}` : 'Create draft v1'}
      onSubmit={() => {
        onCreate(combo, from)
        return true
      }}
      onClose={onClose}
    >
      <p className="log-dialog__hint">One recipe per Machine + Part No. + Mold. A new recipe starts as draft v1 and needs admin approval.</p>
      <ComboFields combo={combo} onChange={setCombo} />
      <p className="log-dialog__hint">
        Part name: <strong>{partName(combo.partNo) || '—'}</strong>
      </p>
      {existing ? (
        <p className="snotice snotice--warn">{existing.id} already covers this combination. Open it instead.</p>
      ) : (
        <div className="sseg" role="group" aria-label="Start from">
          <button type="button" aria-pressed={from === 'defaults'} onClick={() => setFrom('defaults')}>
            Start from defaults
          </button>
          {source && (
            <button type="button" aria-pressed={from === 'source'} onClick={() => setFrom('source')}>
              Copy {source.id}
            </button>
          )}
        </div>
      )}
    </LogDialog>
  )
}

export function CopyDialog({ recipe, onCopy, onClose }) {
  const [combo, setCombo] = useState({ machineId: recipe.machineId, partNo: recipe.partNo, mold: recipe.mold })
  const note = comboNote(combo, recipe.id)
  return (
    <LogDialog
      title={`Copy ${recipe.id} to…`}
      submitLabel="Copy as draft"
      onSubmit={() => {
        if (note.tone === 'bad') return false
        onCopy(combo)
        return true
      }}
      onClose={onClose}
    >
      <p className="log-dialog__hint">Copies the values on screen to another Machine + Part No. + Mold. Nothing is used until an admin approves it.</p>
      <ComboFields combo={combo} onChange={setCombo} />
      <p className={`snotice snotice--${note.tone}`}>{note.text}</p>
    </LogDialog>
  )
}

export function HistoryDialog({ recipe, viewing, onView, onClose }) {
  return (
    <LogDialog
      title={`History · ${recipe.id} · ${recipe.machineId} · ${recipe.mold}`}
      wide
      onClose={onClose}
      actions={(close) => (
        <button type="button" className="log-dialog__secondary mono" onClick={close}>
          Close
        </button>
      )}
    >
      <div className="stable">
        <table>
          <thead className="mono">
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Created</th>
              <th>Approved / decided</th>
              <th>Effective from</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...recipe.versions].reverse().map((v) => (
              <tr key={v.v} className={v.v === viewing ? 'is-selected' : undefined}>
                <td className="mono stable__strong">v{v.v}</td>
                <td>
                  <span className={`sbadge ${STATUS[v.status]}`}>{v.status}</span>
                </td>
                <td>
                  {v.createdBy} · {fmtDate(v.createdAt)}
                </td>
                <td>{v.approvedBy ? `${v.approvedBy} · ${fmtDate(v.approvedAt)}` : '—'}</td>
                <td className="mono">{fmtDate(v.effectiveFrom)}</td>
                <td className="stable__muted">{v.note || '—'}</td>
                <td>
                  <button type="button" className="slink" onClick={() => onView(v.v)}>
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LogDialog>
  )
}

export { fmtDate, STATUS }
