import { useRef, useState } from 'react'
import { Field, Panel, ReadOnlyNote, Toggle } from './ui.jsx'
import ImportDialog from './ImportDialog.jsx'
import MachineIllustration from '../../components/MachineIllustration.jsx'
import { UploadIcon } from '../dashboard/MachineCard.jsx'
import { readWorkbook } from './excel.js'
import { MACHINES, MASTER_FIELDS, lineOptions, modelOptions, saveMachine } from '../../store/machines.js'
import { MOLDS, PARTS, partName } from '../../store/catalog.js'
import { activeVersion, createRecipe, defaultRows, draftVersion, recipeForMachine } from '../../store/recipes.js'
import { can, canChange } from '../../store/users.js'
import { logChange } from '../../store/store.js'

const shortModel = (model) => model?.replace('ROBOSHOT ', '') ?? '—'
// A new machine starts with a mold any machine may run (one that lists no machines), else none:
// most molds are set up for particular machines, and the server refuses a mold not set up for this one.
const openMold = () => MOLDS.find((m) => !m.machines?.length)

// Defaults for a new machine. A function: the molds are loaded from the server after sign-in.
const empty = () => ({
  id: '',
  name: '',
  make: 'FANUC',
  model: modelOptions()[0] ?? '',
  clamp: 100,
  line: lineOptions()[0] ?? '',
  bay: 1,
  dataSource: 'manual',
  active: true,
  mold: openMold()?.no ?? '',
  partNo: openMold()?.partNo ?? '',
})

// ---------- Excel: the template's "Machines" sheet ----------

const yes = (v) =>
  String(v ?? 'Y')
    .trim()
    .toUpperCase() !== 'N'

function planMachineImport(rows) {
  const [header = [], ...body] = rows
  const col = (name) =>
    header.findIndex((h) =>
      String(h ?? '')
        .toLowerCase()
        .startsWith(name.toLowerCase()),
    )
  const at = {
    id: col('Machine Code'),
    name: col('Machine Name'),
    make: col('Make'),
    model: col('Model'),
    clamp: col('Clamp Tonnage'),
    line: col('Line'),
    bay: col('Bay'),
    source: col('Data Source'),
    active: col('Active'),
  }
  if (at.id < 0 || at.name < 0)
    return {
      items: [],
      errors: [
        { line: 1, message: 'No "Machine Code" / "Machine Name" columns. Use the MPCR template, sheet "Machines".' },
      ],
    }

  const items = []
  const errors = []
  body.forEach((cells, i) => {
    const line = i + 2
    const get = (k) => (at[k] >= 0 ? cells[at[k]] : null)
    const id = String(get('id') ?? '').trim()
    if (!id) return
    if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/i.test(id))
      return errors.push({ line, message: `Machine code "${id}" isn't valid` })
    const clamp = Number(get('clamp'))
    if (get('clamp') != null && !(clamp > 0))
      return errors.push({ line, message: `${id}: tonnage "${get('clamp')}" isn't a number` })
    const current = MACHINES.find((m) => m.id === id)
    const make = String(get('make') ?? current?.make ?? 'FANUC').trim()
    const modelText = String(get('model') ?? '').trim()
    const fields = {
      ...(current
        ? Object.fromEntries(MASTER_FIELDS.map((f) => [f, current[f]]))
        : { ...empty(), partName: partName(empty().partNo) }),
      id,
      name: String(get('name') ?? current?.name ?? id).trim(),
      make,
      model: modelText
        ? modelText.startsWith(make)
          ? modelText.slice(make.length).trim()
          : modelText
        : (current?.model ?? empty().model),
      clamp: get('clamp') != null ? clamp : (current?.clamp ?? empty().clamp),
      line: String(get('line') ?? current?.line ?? empty().line).trim(),
      bay: get('bay') != null ? Number(get('bay')) : (current?.bay ?? 1),
      dataSource:
        get('source') != null
          ? String(get('source')).toUpperCase().startsWith('AUTO')
            ? 'auto'
            : 'manual'
          : (current?.dataSource ?? 'manual'),
      active: get('active') != null ? yes(get('active')) : (current?.active ?? true),
    }
    const changed = !current || MASTER_FIELDS.some((f) => fields[f] !== current[f])
    items.push({
      key: id,
      label: `${id} · ${fields.name}`,
      detail: `${shortModel(fields.model)} · ${fields.clamp} t · ${fields.line} · ${fields.bay} · ${fields.dataSource === 'auto' ? 'Auto (OPC UA)' : 'Manual'}`,
      action: !current ? 'new' : changed ? 'update' : 'unchanged',
      fields,
    })
  })
  return { items, errors }
}

// ---------- Page ----------

export default function MachineMaster({ user, canEdit, onChange, onOpenRecipe, onEditImage, imageFor }) {
  const [, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(() => ({ ...MACHINES[0], isNew: false }))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState('')
  const [importing, setImporting] = useState(null)
  const [importError, setImportError] = useState('')
  const fileInput = useRef(null)

  const q = query.trim().toLowerCase()
  const list = MACHINES.filter(
    (m) => !q || `${m.id} ${m.name} ${m.model} ${m.mold} ${m.partNo} ${m.line}`.toLowerCase().includes(q),
  )
  const set = (key) => (value) => setEditing((e) => ({ ...e, [key]: value }))
  const live = MACHINES.find((m) => m.id === editing.id && !editing.isNew)

  function select(machine) {
    setEditing({ ...machine, isNew: false })
    setErrors({})
    setSaved('')
  }

  function addMachine() {
    const last = MACHINES[MACHINES.length - 1].id.match(/^(.*?)(\d+)$/)
    setEditing({
      ...empty(),
      id: last ? `${last[1]}${Number(last[2]) + 1}` : '',
      name: `FANUC Machine ${MACHINES.length + 1}`,
      isNew: true,
    })
    setErrors({})
    setSaved('')
  }

  function handleSave() {
    const found = {}
    if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/i.test(editing.id)) found.id = 'Letters, digits and "-", e.g. J10-73'
    else if (editing.isNew && MACHINES.some((m) => m.id === editing.id)) found.id = `${editing.id} already exists`
    if (!editing.name.trim()) found.name = 'Give the machine a name'
    if (!(Number(editing.clamp) > 0)) found.clamp = 'Tonnage in tonnes, e.g. 100'
    if (!(Number(editing.bay) > 0)) found.bay = 'Bay number'
    if (!editing.model?.trim()) found.model = 'Enter the model'
    if (!editing.line?.trim()) found.line = 'Enter the line, e.g. Line A'
    // Same rule as the server: a mold set up for particular machines must list this one.
    const mold = MOLDS.find((m) => m.no === editing.mold)
    if (editing.mold && !mold) found.mold = `${editing.mold} isn’t in the mold master`
    else if (mold?.machines?.length && !mold.machines.includes(editing.id))
      found.mold = `${mold.no} is set up for ${mold.machines.join(', ')} only`
    setErrors(found)
    if (Object.keys(found).length) return

    const fields = {
      ...Object.fromEntries(MASTER_FIELDS.map((f) => [f, editing[f]])),
      name: editing.name.trim(),
      model: editing.model.trim(),
      line: editing.line.trim(),
      clamp: Number(editing.clamp),
      bay: Number(editing.bay),
      partName: partName(editing.partNo),
    }
    const before = live && { ...live }
    saveMachine(fields)
    const what = editing.isNew
      ? `Added machine ${fields.id} (${fields.name})`
      : `Updated ${fields.id}: ${
          MASTER_FIELDS.filter((f) => before[f] !== fields[f])
            .map((f) => `${f} ${before[f]} → ${fields[f]}`)
            .join(', ') || 'no changes'
        }`
    logChange(user, 'Machine master', what)
    setEditing({ ...MACHINES.find((m) => m.id === fields.id), isNew: false })
    setSaved(`${fields.id} saved.`)
    onChange()
    refresh()
  }

  function toggleActive(machine, active) {
    saveMachine({ ...machine, active })
    logChange(user, 'Machine master', `${machine.id} ${active ? 'activated' : 'deactivated'}`)
    if (editing.id === machine.id) setEditing((e) => ({ ...e, active }))
    onChange()
    refresh()
  }

  // Picking a mold fills in the part it makes.
  function pickMold(no) {
    const mold = MOLDS.find((m) => m.no === no)
    setEditing((e) => ({ ...e, mold: no, partNo: mold?.partNo ?? e.partNo }))
  }

  async function handleFile(file) {
    setImportError('')
    try {
      const sheets = await readWorkbook(file)
      const rows = sheets.Machines ?? Object.values(sheets)[0] ?? []
      setImporting({
        fileName: file.name,
        ...planMachineImport(rows),
        usedSheet: sheets.Machines ? 'Machines' : Object.keys(sheets)[0],
      })
    } catch (err) {
      setImportError(err.message)
    }
  }

  function applyImport() {
    const changes = importing.items.filter((i) => i.action !== 'unchanged')
    for (const i of changes) saveMachine(i.fields)
    logChange(
      user,
      'Machine master',
      `Excel upload ${importing.fileName}: ${changes.length} machine(s) added or updated`,
    )
    setSaved(`${changes.length} machine${changes.length > 1 ? 's' : ''} imported.`)
    onChange()
    refresh()
  }

  // The recipe (Parameter Master) that gives this machine its standards.
  const combo = { id: editing.id, partNo: editing.partNo, mold: editing.mold }
  const recipe = editing.id ? recipeForMachine(combo) : null
  const active = activeVersion(recipe)
  const draft = draftVersion(recipe)
  const image = live ? imageFor(live) : null
  const allowedMolds = MOLDS.filter(
    (m) => !m.machines?.length || m.machines.includes(editing.id) || m.no === editing.mold,
  )

  function createRecipeHere() {
    const created = createRecipe(
      { machineId: editing.id, partNo: editing.partNo, mold: editing.mold },
      defaultRows(live),
      user,
      'Created from Machine Master',
    )
    logChange(
      user,
      'Parameter master',
      `Created ${created.id} for ${editing.id} · ${editing.partNo} · ${editing.mold} (draft v1)`,
    )
    onOpenRecipe(created.id)
  }

  return (
    <div className="spage">
      <div className="spage__main">
        <header className="shead">
          <div>
            <h1>Machine Master</h1>
            <p>{MACHINES.length} machines · data source, current mold and parameter standards.</p>
          </div>
          {canEdit && (
            <div className="shead__actions">
              <button type="button" className="sbtn" onClick={() => fileInput.current.click()}>
                ⭱ Import Excel
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
              <button type="button" className="sbtn sbtn--primary" onClick={addMachine}>
                + Add machine
              </button>
            </div>
          )}
        </header>
        {!canEdit && <ReadOnlyNote>Only an admin can change machines. You can look, not edit.</ReadOnlyNote>}
        {importError && <p className="snotice snotice--bad">{importError}</p>}

        <input
          type="search"
          className="sinput ssearch"
          placeholder="Search code, name, model, mold, part no., line…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="stable stable--tall">
          <table>
            <thead className="mono">
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Model</th>
                <th className="num">Tonnage</th>
                <th>Line · Bay</th>
                <th>Data source</th>
                <th>Mold</th>
                <th>Recipe</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const r = recipeForMachine(m)
                const v = activeVersion(r)
                return (
                  <tr
                    key={m.id}
                    className={m.id === editing.id && !editing.isNew ? 'is-selected' : undefined}
                    onClick={() => select(m)}
                  >
                    <td className={`mono ${m.id === editing.id ? 'stable__accent' : ''}`}>{m.id}</td>
                    <td className="stable__strong">{m.name}</td>
                    <td className="mono">{shortModel(m.model)}</td>
                    <td className="num mono">{m.clamp} t</td>
                    <td className="mono">
                      {m.line.replace('Line ', '')} · {m.bay}
                    </td>
                    <td>
                      <span className={`sbadge ${m.dataSource === 'auto' ? 'sbadge--ink' : 'sbadge--muted'}`}>
                        {m.dataSource === 'auto' ? 'Auto · OPC' : 'Manual'}
                      </span>
                    </td>
                    <td className="mono">{m.mold}</td>
                    <td className="mono">
                      {v ? `${r.id} v${v.v}` : <span className="stable__warn">{r ? 'Draft only' : 'None'}</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={m.active !== false}
                        disabled={!canEdit}
                        onChange={(val) => toggleActive(m, val)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Panel
        title={editing.isNew ? 'Add machine' : `Edit machine · ${editing.id}`}
        footer={
          canEdit && (
            <>
              <button type="button" className="sbtn" onClick={() => select(live ?? MACHINES[0])}>
                Cancel
              </button>
              <button type="button" className="sbtn sbtn--primary" onClick={handleSave}>
                Save machine
              </button>
            </>
          )
        }
      >
        <div className="smachine__media">
          {image === 'default' ? (
            <MachineIllustration />
          ) : image ? (
            <img src={image.src} alt={editing.name} style={{ objectFit: image.fit }} />
          ) : (
            <span className="stable__muted">
              {editing.isNew ? 'Save the machine, then add a photo' : 'No photo yet'}
            </span>
          )}
        </div>
        <div className="spanel__row">
          <button
            type="button"
            className="sbtn sbtn--small"
            disabled={!live || !canEdit}
            onClick={() => onEditImage(live)}
          >
            <UploadIcon size={14} /> Photo
          </button>
          <button type="button" className="sbtn sbtn--small" disabled title="3D model upload comes with the 3D viewer">
            <UploadIcon size={14} /> 3D model .glb
          </button>
        </div>

        <div className="spanel__row">
          <Field label="Machine code" error={errors.id}>
            {(id) => (
              <input
                id={id}
                value={editing.id}
                disabled={!canEdit || !editing.isNew}
                onChange={(e) => set('id')(e.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field label="Tonnage (t)" error={errors.clamp}>
            {(id) => (
              <input
                id={id}
                type="number"
                min="1"
                value={editing.clamp}
                disabled={!canEdit}
                onChange={(e) => set('clamp')(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Name" error={errors.name}>
          {(id) => (
            <input id={id} value={editing.name} disabled={!canEdit} onChange={(e) => set('name')(e.target.value)} />
          )}
        </Field>
        <Field label={`Model (${editing.make})`} error={errors.model}>
          {(id) => (
            <>
              <input
                id={id}
                list={`${id}-list`}
                value={editing.model}
                disabled={!canEdit}
                onChange={(e) => set('model')(e.target.value)}
              />
              <datalist id={`${id}-list`}>
                {modelOptions().map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="spanel__row">
          <Field label="Line" error={errors.line}>
            {(id) => (
              <>
                <input
                  id={id}
                  list={`${id}-list`}
                  value={editing.line}
                  disabled={!canEdit}
                  onChange={(e) => set('line')(e.target.value)}
                />
                <datalist id={`${id}-list`}>
                  {lineOptions().map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Bay" error={errors.bay}>
            {(id) => (
              <input
                id={id}
                type="number"
                min="1"
                value={editing.bay}
                disabled={!canEdit}
                onChange={(e) => set('bay')(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="sfield">
          <span className="mono sfield__label">Data source</span>
          <div className="sseg" role="group" aria-label="Data source">
            {[
              ['manual', 'Manual entry'],
              ['auto', 'Auto (OPC UA)'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={editing.dataSource === key}
                disabled={!canEdit}
                onClick={() => set('dataSource')(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="spanel__row">
          <Field label="Current mold" error={errors.mold}>
            {(id) => (
              <select id={id} value={editing.mold} disabled={!canEdit} onChange={(e) => pickMold(e.target.value)}>
                <option value="">— No mold mounted —</option>
                {allowedMolds.map((m) => (
                  <option key={m.no} value={m.no}>
                    {m.no} · {m.description}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Part no.">
            {(id) => (
              <select
                id={id}
                value={editing.partNo}
                disabled={!canEdit}
                onChange={(e) => set('partNo')(e.target.value)}
              >
                <option value="">— None —</option>
                {PARTS.map((p) => (
                  <option key={p.partNo} value={p.partNo}>
                    {p.partNo}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <div className={`smachine__std ${active ? '' : 'is-missing'}`}>
          <span className="mono">Parameter standards</span>
          {active ? (
            <>
              <strong>
                {active.rows.length} parameters · {recipe.id} v{active.v} · {editing.mold}
              </strong>
              {draft && <span className="stable__warn">v{draft.v} draft waiting for approval</span>}
              {can(user, 'parameters') && (
                <button type="button" className="slink" onClick={() => onOpenRecipe(recipe.id)}>
                  Edit →
                </button>
              )}
            </>
          ) : recipe ? (
            <>
              <strong>
                {recipe.id} has only a draft (v{draft?.v}).
              </strong>
              <span>Until an admin approves it, this machine uses the default standards.</span>
              {can(user, 'parameters') && (
                <button type="button" className="slink" onClick={() => onOpenRecipe(recipe.id)}>
                  Open →
                </button>
              )}
            </>
          ) : (
            <>
              <strong>
                No recipe for {editing.id || 'this machine'} + {editing.partNo} + {editing.mold}.
              </strong>
              <span>The log uses the default standards until one is created and approved.</span>
              {canChange(user, 'parameters') && live && (
                <button type="button" className="slink" onClick={createRecipeHere}>
                  Create recipe →
                </button>
              )}
            </>
          )}
        </div>
        {saved && <p className="snotice snotice--ok">{saved}</p>}
      </Panel>

      {importing && (
        <ImportDialog
          title={`Import machines · sheet "${importing.usedSheet}"`}
          fileName={importing.fileName}
          items={importing.items}
          errors={importing.errors}
          onApply={applyImport}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  )
}
