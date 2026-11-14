import { useRef, useState } from 'react'
import { ReadOnlyNote, Toggle } from './ui.jsx'
import ImportDialog from './ImportDialog.jsx'
import { CopyDialog, HistoryDialog, NewRecipeDialog, STATUS, fmtDate } from './RecipeDialogs.jsx'
import { TEMPLATE_URL, readWorkbook } from './excel.js'
import { MACHINES } from '../../store/machines.js'
import { MOLDS, PARTS, partName, upsertMolds, upsertParts } from '../../store/catalog.js'
import { CHECK_TYPES, GROUPS, SERIES, countsOf, defOf } from '../../store/parameters.js'
import {
  RECIPES,
  activeVersion,
  applyStandardsImport,
  approveDraft,
  copyRows,
  createRecipe,
  defaultRowOf,
  defaultRows,
  draftVersion,
  findRecipe,
  latestVersion,
  planStandardsImport,
  recipeById,
  resizeRows,
  rejectDraft,
  sameRows,
  saveDraft,
  withStandard,
} from '../../store/recipes.js'
import { logChange } from '../../store/store.js'
import { euromapNode, euromapShort, euromapTitle } from '../../store/euromap77.js'

const num = (text) => (text === '' || text == null ? null : Number(text))

// What a row turns into when its check type changes.
function withCheck(row, check) {
  if (check === row.check) return row
  if (check === 'NA') return { ...row, check, applies: false }
  const base = row.check === 'NA' || row.check === 'TEXT' || check === 'TEXT' ? defaultRowOf(row.code) : row
  if (check === 'TEXT') return { ...row, check, lower: 'STD', std: 'STD', upper: 'STD', applies: true }
  const std = typeof base.std === 'number' ? base.std : 0
  if (check === 'EXACT') return { ...row, check, lower: std, std, upper: std, applies: true }
  if (check === 'MAX ONLY') return { ...row, check, lower: null, std, upper: base.upper ?? std, applies: true }
  if (check === 'MIN ONLY') return { ...row, check, lower: base.lower ?? std, std, upper: null, applies: true }
  return { ...row, check, lower: base.lower ?? std, std, upper: base.upper ?? std, applies: true }
}

// Problems that stop a save: limits that don't hold their standard, empty values.
function rowError(r) {
  if (!r.applies || r.check === 'NA') return null
  if (r.check === 'TEXT') return String(r.std ?? '').trim() ? null : 'Enter the mode, e.g. STD'
  if (r.std == null || Number.isNaN(r.std)) return 'Standard is required'
  if (r.check !== 'MAX ONLY' && (r.lower == null || Number.isNaN(r.lower))) return 'Lower limit is required'
  if (r.check !== 'MIN ONLY' && (r.upper == null || Number.isNaN(r.upper))) return 'Upper limit is required'
  if (r.lower != null && r.lower > r.std) return 'Lower limit is above the standard'
  if (r.upper != null && r.upper < r.std) return 'Upper limit is below the standard'
  return null
}

// "55 ± 10 → 45 / 65"
function toleranceHint(r) {
  if (r.check === 'EXACT') return `exact: any change from ${r.std} is a deviation`
  if (r.check === 'MAX ONLY') return `max only: up to ${r.upper}`
  if (r.check === 'MIN ONLY') return `min only: down to ${r.lower}`
  if (r.check === 'RANGE') {
    const up = +(r.upper - r.std).toFixed(4)
    const down = +(r.std - r.lower).toFixed(4)
    return up === down ? `tolerance auto-fills limits (${r.std} ± ${up} → ${r.lower} / ${r.upper})` : `limits ${r.lower} / ${r.upper}`
  }
  return ''
}

const versionToView = (recipe) => (draftVersion(recipe) ?? activeVersion(recipe) ?? latestVersion(recipe)).v

// How many zones and profile stages this recipe has. Changing a number adds or removes
// the numbered rows in the table below; new stages start from the default standards.
function StageCounts({ rows, saved, editable, onChange }) {
  const counts = countsOf(rows)
  const before = countsOf(saved)
  return (
    <section className="sbox sstages">
      <h2 className="sbox__title mono">Zones &amp; stages</h2>
      <div className="sstages__grid">
        {SERIES.map((s) => (
          <label key={s.key} className={`sstages__item ${counts[s.key] !== before[s.key] ? 'is-changed' : ''}`}>
            <span>{s.label}</span>
            {editable ? (
              <input
                className="sinput mono"
                type="number"
                min="1"
                max={s.max}
                value={counts[s.key]}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (n >= 1 && n <= s.max) onChange({ ...counts, [s.key]: n })
                }}
              />
            ) : (
              <strong className="mono">{counts[s.key]}</strong>
            )}
          </label>
        ))}
      </div>
    </section>
  )
}

// Machine → part → mold → recipe, for the recipes around the selected one.
function MatchDiagram({ recipe }) {
  const related = RECIPES.filter((r) => r.machineId === recipe.machineId || r.partNo === recipe.partNo)
    .sort((a, b) => a.machineId.localeCompare(b.machineId) || a.partNo.localeCompare(b.partNo) || a.mold.localeCompare(b.mold))
    .slice(0, 6)
  return (
    <section className="sbox smatch">
      <h2 className="sbox__title mono">How standards are matched</h2>
      <div className="smatch__rows">
        {related.map((r, i) => {
          const prev = related[i - 1]
          const sameMachine = prev?.machineId === r.machineId
          const samePart = sameMachine && prev?.partNo === r.partNo
          return (
            <div key={r.id} className="smatch__row mono">
              <span className={sameMachine ? 'is-cont' : ''}>{sameMachine ? '' : r.machineId}</span>
              <span className={samePart ? 'is-cont' : ''}>{samePart ? '' : r.partNo}</span>
              <span>{r.mold}</span>
              <span className={`smatch__recipe ${r.id === recipe.id ? 'is-current' : ''}`}>{r.id}</span>
            </div>
          )
        })}
      </div>
      <p className="mono smatch__legend">Machine → Part no. → Mold → Recipe</p>
      <p className="smatch__text">
        Same machine + same part + other mold = other recipe. Parameter Log, Report and alerts read limits only from here.
      </p>
    </section>
  )
}

export default function ParameterMaster({ user, canEdit, recipeId, onChange }) {
  const [, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  const isAdmin = user.role === 'Admin'
  const [filters, setFilters] = useState({ machine: 'all', part: 'all', mold: 'all' })
  const [selectedId, setSelectedId] = useState(() => recipeById(recipeId)?.id ?? RECIPES[0].id)
  const recipe = recipeById(selectedId)
  const [viewing, setViewing] = useState(() => versionToView(recipe))
  const version = recipe.versions.find((v) => v.v === viewing) ?? latestVersion(recipe)
  const [rows, setRows] = useState(() => structuredClone(version.rows))
  const [editingCode, setEditingCode] = useState(null)
  const [dialog, setDialog] = useState(null) // 'new' | 'copy' | 'history'
  const [importing, setImporting] = useState(null)
  const [message, setMessage] = useState(null) // { tone, text }
  const fileInput = useRef(null)

  const editable = canEdit && (version.status === 'active' || version.status === 'draft')
  const dirty = !sameRows(rows, version.rows)
  const errors = Object.fromEntries(rows.map((r) => [r.code, rowError(r)]).filter(([, e]) => e))
  const draft = draftVersion(recipe)
  const active = activeVersion(recipe)
  const nextV = draft ? draft.v : latestVersion(recipe).v + 1
  const machine = MACHINES.find((m) => m.id === recipe.machineId)
  const inUse = machine && machine.partNo === recipe.partNo && machine.mold === recipe.mold

  // Changes since the last save are lost when switching recipe or version.
  function open(id, v) {
    const r = recipeById(id)
    const nextVersion = v ?? versionToView(r)
    setSelectedId(id)
    setViewing(nextVersion)
    setRows(structuredClone(r.versions.find((x) => x.v === nextVersion).rows))
    setEditingCode(null)
    setMessage(null)
  }

  function confirmLeave() {
    return !dirty || window.confirm('Discard the changes you have not saved?')
  }

  function updateRow(code, change) {
    setRows((list) => list.map((r) => (r.code === code ? change(r) : r)))
    setEditingCode(code)
  }

  function handleSave() {
    if (Object.keys(errors).length) {
      setMessage({ tone: 'bad', text: `Fix ${Object.keys(errors).length} parameter${Object.keys(errors).length > 1 ? 's' : ''} first (marked in red).` })
      return
    }
    const oldCounts = countsOf(version.rows)
    const newCounts = countsOf(rows)
    const changed = [
      ...SERIES.filter((s) => oldCounts[s.key] !== newCounts[s.key]).map((s) => `${s.label} ${oldCounts[s.key]} → ${newCounts[s.key]}`),
      ...rows
        .filter((r) => {
          const old = version.rows.find((x) => x.code === r.code)
          return old && JSON.stringify(r) !== JSON.stringify(old)
        })
        .map((r) => defOf(r.code).label),
    ]
    const saved = saveDraft(recipe, structuredClone(rows), user, `Changed: ${changed.join(', ')}`)
    logChange(user, 'Parameter master', `${recipe.id} v${saved.v} draft saved (${changed.join(', ')})`)
    open(recipe.id, saved.v)
    setMessage({ tone: 'warn', text: `Saved as v${saved.v} draft. ${isAdmin ? 'Approve it to make it active.' : 'An admin has to approve it before it is used.'}` })
    onChange()
  }

  function handleApprove() {
    approveDraft(recipe, user)
    logChange(user, 'Parameter master', `${recipe.id} v${draft.v} approved and active`)
    open(recipe.id, draft.v)
    setMessage({ tone: 'ok', text: `v${draft.v} is now active. Parameter log and report use it from now on.` })
    onChange()
  }

  function handleReject() {
    const note = window.prompt(`Why is ${recipe.id} v${draft.v} rejected?`, '')
    if (note == null) return
    rejectDraft(recipe, user, note.trim() || 'Rejected by admin')
    logChange(user, 'Parameter master', `${recipe.id} v${draft.v} rejected${note.trim() ? `: ${note.trim()}` : ''}`)
    open(recipe.id)
    setMessage({ tone: 'bad', text: `v${draft.v} rejected.` })
  }

  function handleCreate(combo, from) {
    const existing = findRecipe(combo)
    if (existing) return open(existing.id)
    const base = from === 'source' ? rows : defaultRows(MACHINES.find((m) => m.id === combo.machineId))
    const created = createRecipe(combo, structuredClone(base), user, from === 'source' ? `Copied from ${recipe.id}` : 'Started from defaults')
    logChange(user, 'Parameter master', `Created ${created.id} for ${combo.machineId} · ${combo.partNo} · ${combo.mold} (draft v1)`)
    setFilters({ machine: 'all', part: 'all', mold: 'all' })
    open(created.id)
    setMessage({ tone: 'warn', text: `${created.id} created as draft v1.` })
  }

  function handleCopy(combo) {
    const target = copyRows(structuredClone(rows), combo, user, `Copied from ${recipe.id} v${version.v}`)
    logChange(user, 'Parameter master', `Copied ${recipe.id} v${version.v} → ${target.id} (${combo.machineId} · ${combo.partNo} · ${combo.mold}) as draft`)
    setFilters({ machine: 'all', part: 'all', mold: 'all' })
    open(target.id)
    setMessage({ tone: 'warn', text: `Copied to ${target.id} as draft v${draftVersion(target).v}.` })
  }

  async function handleFile(file) {
    setMessage(null)
    try {
      const sheets = await readWorkbook(file)
      if (!sheets.Parameter_Standards) throw new Error('No sheet called "Parameter_Standards". Use the MPCR template.')
      const { groups, errors: problems } = planStandardsImport(sheets.Parameter_Standards, MACHINES.map((m) => m.id))
      setImporting({ fileName: file.name, groups, errors: problems, sheets })
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    }
  }

  function applyImport() {
    const { groups, sheets, fileName } = importing
    // Molds and parts from the same workbook keep the dropdowns in step.
    const moldRows = (sheets.Molds ?? []).slice(1).filter((r) => r[0])
    upsertMolds(moldRows.map((r) => ({ no: String(r[0]), description: r[1] ?? '', cavities: Number(r[2]) || 1, partNo: String(r[3] ?? ''), machines: String(r[4] ?? '').split(',').map((s) => s.trim()).filter(Boolean), life: Number(r[5]) || null })))
    const partRows = (sheets.Parts ?? []).slice(1).filter((r) => r[0])
    upsertParts(partRows.map((r) => ({ partNo: String(r[0]), partName: r[1] ?? '', material: r[2] ?? '', customer: r[3] ?? '' })))
    for (const g of groups) if (g.partName && !PARTS.some((p) => p.partNo === g.combo.partNo)) upsertParts([{ partNo: g.combo.partNo, partName: g.partName }])
    applyStandardsImport(groups, user)
    const changed = groups.filter((g) => g.action !== 'unchanged')
    logChange(user, 'Parameter master', `Excel upload ${fileName}: ${changed.length} recipe(s) saved as draft for approval`)
    open(recipe.id)
    setMessage({ tone: 'warn', text: `${changed.length} recipe${changed.length === 1 ? '' : 's'} uploaded as draft${changed.length === 1 ? '' : 's'}. An admin approves each before it is used.` })
    refresh()
  }

  const list = RECIPES.filter(
    (r) =>
      (filters.machine === 'all' || r.machineId === filters.machine) &&
      (filters.part === 'all' || r.partNo === filters.part) &&
      (filters.mold === 'all' || r.mold === filters.mold),
  )
  const uniq = (key) => [...new Set(RECIPES.map((r) => r[key]))].sort()
  const editingRow = rows.find((r) => r.code === editingCode)

  return (
    <div className="spage spage--wide">
      <div className="spage__main">
        <header className="shead">
          <div>
            <h1>Parameter Master</h1>
            <p>The only source of standard values. One recipe per Machine + Part No. + Mold.</p>
          </div>
          <div className="shead__actions">
            <a className="sbtn" href={TEMPLATE_URL} download="MPCR_Parameter_Master_Template.xlsx">
              ⭳ Template .xlsx
            </a>
            {canEdit && (
              <>
                <button type="button" className="sbtn" onClick={() => fileInput.current.click()}>
                  ⭱ Upload Excel
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx"
                  className="visually-hidden"
                  tabIndex={-1}
                  onChange={(e) => {
                    if (e.target.files[0]) handleFile(e.target.files[0])
                    e.target.value = ''
                  }}
                />
                <button type="button" className="sbtn sbtn--primary" onClick={() => confirmLeave() && setDialog('new')}>
                  + New recipe
                </button>
              </>
            )}
          </div>
        </header>
        {!canEdit && <ReadOnlyNote>You can look at the standards. Changing them needs the “Parameter standards” permission.</ReadOnlyNote>}

        <div className="sparams">
          {/* ---------- Recipe list ---------- */}
          <div className="sparams__list">
            <div className="sparams__filters">
              {[
                ['machine', 'Machine', uniq('machineId')],
                ['part', 'Part no.', uniq('partNo')],
                ['mold', 'Mold', uniq('mold')],
              ].map(([key, label, options]) => (
                <select
                  key={key}
                  className="sinput mono"
                  aria-label={label}
                  value={filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                >
                  <option value="all">{label} ▾</option>
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ))}
            </div>
            <div className="sparams__cards">
              {list.map((r) => {
                const a = activeVersion(r)
                const d = draftVersion(r)
                const applied = (a ?? d ?? latestVersion(r)).rows.filter((x) => x.applies && x.check !== 'NA').length
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`srecipe ${r.id === selectedId ? 'is-selected' : ''}`}
                    onClick={() => r.id !== selectedId && confirmLeave() && open(r.id)}
                  >
                    <span className="srecipe__top">
                      <span className="mono srecipe__id">{r.id}</span>
                      <span className="mono srecipe__combo">
                        {r.machineId} · {r.mold}
                      </span>
                      {d ? <span className="sbadge sbadge--warn">v{d.v} draft</span> : a && <span className="sbadge sbadge--ok">v{a.v} active</span>}
                    </span>
                    <span className="srecipe__bottom">
                      <span>
                        Part {r.partNo} · {partName(r.partNo)}
                      </span>
                      <span className="mono">{d ? <em>needs approval</em> : `${applied} of ${(a ?? d ?? latestVersion(r)).rows.length} params`}</span>
                    </span>
                  </button>
                )
              })}
              {list.length === 0 && <p className="stable__muted">No recipe matches these filters.</p>}
            </div>
            <MatchDiagram recipe={recipe} />
          </div>

          {/* ---------- Selected recipe ---------- */}
          <div className="sparams__editor">
            <header className="sbox seditor__head">
              <div>
                <h2 className="mono">
                  {recipe.id} · {recipe.machineId} · {recipe.partNo} · {recipe.mold}
                </h2>
                <p>
                  {partName(recipe.partNo)} · v{version.v} <span className={`sbadge ${STATUS[version.status]}`}>{version.status}</span>
                  {version.status === 'active' && ` since ${fmtDate(version.effectiveFrom)} · approved by ${version.approvedBy}`}
                  {version.status === 'draft' && ` · by ${version.createdBy}${active ? ` · v${active.v} stays in use until approved` : ''}`}
                  {' · '}
                  {rows.length} parameters ·{' '}
                  {inUse ? <strong>in use on {machine.id}</strong> : <span className="stable__muted">not {machine?.id ?? 'the machine'}’s current mold</span>}
                </p>
              </div>
              <div className="seditor__actions">
                <button type="button" className="sbtn sbtn--small" disabled={!canEdit} onClick={() => setDialog('copy')}>
                  Copy to…
                </button>
                <button type="button" className="sbtn sbtn--small" onClick={() => confirmLeave() && setDialog('history')}>
                  History
                </button>
                {dirty && (
                  <button type="button" className="sbtn sbtn--small" onClick={() => open(recipe.id, version.v)}>
                    Discard
                  </button>
                )}
                {editable && (
                  <button type="button" className="sbtn sbtn--small sbtn--primary" disabled={!dirty} onClick={handleSave}>
                    {version.status === 'draft' ? `Save draft v${version.v}` : `Save as v${nextV}`}
                  </button>
                )}
                {isAdmin && version.status === 'draft' && !dirty && (
                  <>
                    <button type="button" className="sbtn sbtn--small" onClick={handleReject}>
                      Reject
                    </button>
                    <button type="button" className="sbtn sbtn--small sbtn--ok" onClick={handleApprove}>
                      ✓ Approve v{version.v}
                    </button>
                  </>
                )}
              </div>
            </header>
            {message && <p className={`snotice snotice--${message.tone}`}>{message.text}</p>}
            {version.status === 'active' && draft && (
              <p className="snotice snotice--warn">
                v{draft.v} is waiting for approval.{' '}
                <button type="button" className="slink" onClick={() => confirmLeave() && open(recipe.id, draft.v)}>
                  Open v{draft.v} →
                </button>
              </p>
            )}

            <StageCounts
              rows={rows}
              saved={version.rows}
              editable={editable}
              onChange={(counts) => {
                setRows((list) => resizeRows(list, counts, machine))
                setEditingCode(null)
              }}
            />

            <div className="stable sparams__table">
              <table>
                <thead className="mono">
                  <tr>
                    <th>Parameter</th>
                    <th>Code</th>
                    <th>Unit</th>
                    <th>Check</th>
                    <th className="num">Lower limit</th>
                    <th className="num">Standard</th>
                    <th className="num">Upper limit</th>
                    <th>Applies</th>
                  </tr>
                </thead>
                {GROUPS.map((g) => (
                  <tbody key={g.key}>
                    <tr className="sparams__group">
                      <th colSpan={8} className="mono">
                        {g.title}
                      </th>
                    </tr>
                    {rows
                      .filter((r) => defOf(r.code).group === g.key)
                      .map((r) => {
                        const def = defOf(r.code)
                        const off = !r.applies || r.check === 'NA'
                        const changed = JSON.stringify(r) !== JSON.stringify(version.rows.find((x) => x.code === r.code))
                        const cls = [off && 'is-off', changed && 'is-changed', errors[r.code] && 'is-error', editingCode === r.code && 'is-editing'].filter(Boolean).join(' ')
                        const numberInput = (key, value, disabled) =>
                          disabled || !editable ? (
                            <span>{off ? 'NA' : (value ?? '—')}</span>
                          ) : (
                            <input
                              className="sparams__input mono"
                              type="number"
                              step="any"
                              value={value ?? ''}
                              aria-label={`${def.label} ${key}`}
                              onFocus={() => setEditingCode(r.code)}
                              onChange={(e) =>
                                updateRow(r.code, (row) => (key === 'std' ? withStandard(row, num(e.target.value) ?? 0) : { ...row, [key]: num(e.target.value) }))
                              }
                            />
                          )
                        return (
                          <tr key={r.code} className={cls} title={errors[r.code] ?? undefined}>
                            <td>{def.label}</td>
                            <td className="mono stable__muted" title={euromapTitle(r.code)}>
                              {r.code}
                              {euromapShort(r.code) && (
                                <span className={`sparams__node${euromapNode(r.code).verify ? ' is-verify' : ''}`}>{euromapShort(r.code)}</span>
                              )}
                            </td>
                            <td className="mono stable__muted">{def.unit}</td>
                            <td>
                              {editable ? (
                                <select
                                  className="sparams__check mono"
                                  value={off ? 'NA' : r.check}
                                  aria-label={`${def.label} check type`}
                                  onChange={(e) => updateRow(r.code, (row) => withCheck(row, e.target.value))}
                                >
                                  {CHECK_TYPES.map((c) => (
                                    <option key={c}>{c}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="mono">{off ? 'NA' : r.check}</span>
                              )}
                            </td>
                            {r.check === 'TEXT' && !off ? (
                              <>
                                <td className="num mono">{r.std}</td>
                                <td className="num mono">
                                  {editable ? (
                                    <input
                                      className="sparams__input mono"
                                      value={r.std}
                                      aria-label={`${def.label} mode`}
                                      onFocus={() => setEditingCode(r.code)}
                                      onChange={(e) => updateRow(r.code, (row) => ({ ...row, std: e.target.value, lower: e.target.value, upper: e.target.value }))}
                                    />
                                  ) : (
                                    r.std
                                  )}
                                </td>
                                <td className="num mono">{r.std}</td>
                              </>
                            ) : (
                              <>
                                <td className="num mono">{numberInput('lower', r.lower, off || r.check === 'EXACT' || r.check === 'MAX ONLY')}</td>
                                <td className="num mono sparams__std">{numberInput('std', r.std, off)}</td>
                                <td className="num mono">{numberInput('upper', r.upper, off || r.check === 'EXACT' || r.check === 'MIN ONLY')}</td>
                              </>
                            )}
                            <td>
                              <Toggle
                                small
                                checked={!off}
                                disabled={!editable}
                                onChange={(on) => updateRow(r.code, (row) => (on ? withCheck({ ...row, check: 'NA' }, defaultRowOf(row.code).check === 'NA' ? 'RANGE' : defaultRowOf(row.code).check) : { ...row, applies: false, check: 'NA' }))}
                                label={off ? 'No' : 'Yes'}
                              />
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="sparams__footer mono">
              {editingRow
                ? `Editing: ${defOf(editingRow.code).label} · ${errors[editingRow.code] ?? toleranceHint(editingRow)}${editable ? ` · saving creates ${version.status === 'draft' ? `draft v${version.v}` : `v${nextV}`} for admin approval` : ''}`
                : editable
                  ? 'Click a value to edit. Changing a standard moves its limits with it (same tolerance).'
                  : `Viewing v${version.v} (${version.status}) · read only`}
            </p>
          </div>
        </div>
      </div>

      {dialog === 'new' && (
        <NewRecipeDialog
          start={{ machineId: recipe.machineId, partNo: recipe.partNo, mold: MOLDS.find((m) => !findRecipe({ ...recipe, mold: m.no }))?.no ?? recipe.mold }}
          source={recipe}
          onCreate={handleCreate}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'copy' && <CopyDialog recipe={recipe} onCopy={handleCopy} onClose={() => setDialog(null)} />}
      {dialog === 'history' && (
        <HistoryDialog
          recipe={recipe}
          viewing={version.v}
          onView={(v) => {
            open(recipe.id, v)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {importing && (
        <ImportDialog
          title='Upload Parameter Master · sheet "Parameter_Standards"'
          fileName={importing.fileName}
          items={importing.groups.map((g) => ({
            key: `${g.combo.machineId}|${g.combo.partNo}|${g.combo.mold}`,
            label: `${g.recipe?.id ?? 'New recipe'} · ${g.combo.machineId} · ${g.combo.partNo} · ${g.combo.mold}`,
            detail: g.missingCount > 0 ? `${g.missingCount} parameter(s) not in the sheet keep their current values` : `${g.rows.length} parameters`,
            action: g.action,
          }))}
          errors={importing.errors}
          note="Uploaded recipes become drafts. Nothing changes in the parameter log until an admin approves them."
          onApply={applyImport}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  )
}
