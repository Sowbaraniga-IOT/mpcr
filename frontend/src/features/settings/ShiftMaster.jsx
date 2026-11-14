import { useState } from 'react'
import { Field, Panel, ReadOnlyNote, Toggle } from './ui.jsx'
import {
  GRACE_OPTIONS,
  INTERVALS,
  SHIFT_MASTER,
  coverage,
  crossesMidnight,
  durationOf,
  fromClock,
  saveShiftMaster,
  slotsOf,
  toClock,
} from '../../store/shiftMaster.js'
import { USERS } from '../../store/users.js'
import { logChange } from '../../store/store.js'

const TONES = { A: 'accent', B: 'ink', C: 'grey' }
const toneOf = (code) => TONES[code] ?? 'maint'
const hoursText = (s) => `${+(durationOf(s) / 60).toFixed(1)} h`
const userName = (username) => USERS.find((u) => u.username === username)?.name ?? username ?? '—'

// 24-hour bar: each active shift as a block; one that runs past midnight is drawn in two parts.
function CoverageBar({ shifts }) {
  const blocks = shifts
    .filter((s) => s.active)
    .flatMap((s) =>
      crossesMidnight(s)
        ? [
            { s, from: s.start, to: 1440 },
            { s, from: 0, to: s.end },
          ]
        : [{ s, from: s.start, to: s.end }],
    )
  return (
    <div className="scover">
      <div className="scover__track">
        {blocks.map((b, i) => (
          <span
            key={i}
            className={`scover__block is-${toneOf(b.s.code)}`}
            style={{ left: `${(b.from / 1440) * 100}%`, width: `${((b.to - b.from) / 1440) * 100}%` }}
            title={`${b.s.name} · ${toClock(b.s.start)}–${toClock(b.s.end)}`}
          >
            {b.to - b.from >= 180 ? `Shift ${b.s.code}` : b.s.code}
          </span>
        ))}
      </div>
      <div className="scover__scale mono" aria-hidden="true">
        {Array.from({ length: 13 }, (_, i) => (
          <span key={i} style={{ left: `${(i / 12) * 100}%` }}>
            {String(i * 2).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  )
}

const RULES = [
  { key: 'firstAtStart', title: 'First reading at shift start', sub: (s) => `Reading 1 of shift ${s.code} is due at ${toClock(slotsOf(s)[0] ?? s.start)}` },
  { key: 'grace', title: 'Grace period', sub: (s) => `Reading counts as on time up to ${s.grace} min late` },
  { key: 'overdueAlert', title: 'Overdue alert to supervisor', sub: () => `Notify after ${SHIFT_MASTER.rules.overdueMinutes} min overdue` },
  { key: 'backDated', title: 'Allow back-dated entry', sub: () => 'Supervisor can fill a missed slot with a reason' },
]

const EMPTY = { code: '', name: '', start: 480, end: 960, interval: 60, grace: 10, supervisor: '', active: true }

export default function ShiftMaster({ user, canEdit }) {
  const [, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  const [editing, setEditing] = useState(() => ({ ...SHIFT_MASTER.shifts[0], isNew: false, original: SHIFT_MASTER.shifts[0].code }))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState('')

  const { shifts, rules } = SHIFT_MASTER
  const cover = coverage(shifts)
  const supervisors = USERS.filter((u) => u.role === 'Supervisor' || u.role === 'Admin')
  const set = (key) => (value) => setEditing((e) => ({ ...e, [key]: value }))

  function select(shift) {
    setEditing({ ...shift, isNew: false, original: shift.code })
    setErrors({})
    setSaved('')
  }

  function addShift() {
    setEditing({ ...EMPTY, isNew: true, original: null })
    setErrors({})
    setSaved('')
  }

  function validate(e) {
    const found = {}
    if (!/^[A-Z0-9]{1,3}$/.test(e.code)) found.code = '1–3 letters or digits, e.g. A'
    else if (shifts.some((s) => s.code === e.code && s.code !== e.original)) found.code = `Shift ${e.code} already exists`
    if (!e.name.trim()) found.name = 'Give the shift a name'
    if (e.start === e.end) found.end = 'End must differ from start'
    return found
  }

  function handleSave() {
    const found = validate(editing)
    setErrors(found)
    if (Object.keys(found).length) return
    const { isNew, original, ...shift } = editing
    shift.name = shift.name.trim()
    if (isNew) shifts.push(shift)
    else Object.assign(shifts.find((s) => s.code === original), shift)
    saveShiftMaster()
    logChange(user, 'Shift master', `${isNew ? 'Added' : 'Updated'} shift ${shift.code} (${shift.name}) ${toClock(shift.start)}–${toClock(shift.end)}, every ${shift.interval} min`)
    setEditing({ ...shift, isNew: false, original: shift.code })
    setSaved(`Shift ${shift.code} saved.`)
    refresh()
  }

  function toggleActive(shift, active) {
    shift.active = active
    saveShiftMaster()
    logChange(user, 'Shift master', `Shift ${shift.code} ${active ? 'switched on' : 'switched off'}`)
    if (editing.original === shift.code) setEditing((e) => ({ ...e, active }))
    refresh()
  }

  function toggleRule(key, value) {
    rules[key] = value
    saveShiftMaster()
    logChange(user, 'Shift master', `Rule "${RULES.find((r) => r.key === key).title}" ${value ? 'on' : 'off'}`)
    refresh()
  }

  const slots = editing.start !== editing.end ? slotsOf(editing) : []
  const ruleShift = shifts.find((s) => s.code === editing.original) ?? shifts[0]

  return (
    <div className="spage">
      <div className="spage__main">
        <header className="shead">
          <div>
            <h1>Shift Master</h1>
            <p>Define shifts and how often parameter readings are due.</p>
          </div>
          {canEdit && (
            <div className="shead__actions">
              <button type="button" className="sbtn sbtn--primary" onClick={addShift}>
                + Add shift
              </button>
            </div>
          )}
        </header>
        {!canEdit && <ReadOnlyNote>Only an admin can change shifts. You can look, not edit.</ReadOnlyNote>}

        <section className="sbox">
          <h2 className="sbox__title mono">24-hour coverage</h2>
          <CoverageBar shifts={shifts} />
          {(cover.overlap > 0 || cover.gap > 0) && (
            <p className={`snotice ${cover.gap ? 'snotice--bad' : 'snotice--warn'}`}>
              {cover.gap > 0 && `${Math.round(cover.gap / 6) / 10} h of the day has no active shift. `}
              {cover.overlap > 0 && `${Math.round(cover.overlap / 6) / 10} h is covered by two shifts at once.`}
            </p>
          )}
        </section>

        <div className="stable">
          <table>
            <thead className="mono">
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
                <th>Readings</th>
                <th>Interval</th>
                <th>Supervisor</th>
                <th>Active</th>
                <th>
                  <span className="visually-hidden">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.code} className={s.code === editing.original ? 'is-selected' : undefined} onClick={() => select(s)}>
                  <td>
                    <span className={`scode sbadge--${toneOf(s.code) === 'maint' ? 'muted' : toneOf(s.code)}`}>{s.code}</span>
                  </td>
                  <td className="stable__strong">{s.name}</td>
                  <td className="mono">{toClock(s.start)}</td>
                  <td className="mono">
                    {toClock(s.end)} {crossesMidnight(s) && <span className="stable__muted">+1</span>}
                  </td>
                  <td className="mono">{hoursText(s)}</td>
                  <td className="mono">{s.active ? slotsOf(s).length : '—'}</td>
                  <td className="mono">{s.active ? `${s.interval} min` : '—'}</td>
                  <td>{userName(s.supervisor)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={s.active} disabled={!canEdit} onChange={(v) => toggleActive(s, v)} />
                  </td>
                  <td className="stable__muted" aria-hidden="true">
                    ✎
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="sbox srules">
          <h2 className="sbox__title mono">Reading schedule rules</h2>
          {RULES.map((r) => (
            <div key={r.key} className="srules__item">
              <Toggle checked={rules[r.key]} disabled={!canEdit} onChange={(v) => toggleRule(r.key, v)} />
              <div>
                <strong>{r.title}</strong>
                <span>{r.sub(ruleShift)}</span>
              </div>
            </div>
          ))}
        </section>
      </div>

      <Panel
        title={editing.isNew ? 'Add shift' : `Edit shift ${editing.original}`}
        footer={
          canEdit && (
            <>
              <button type="button" className="sbtn" onClick={() => select(shifts.find((x) => x.code === editing.original) ?? shifts[0])}>
                Cancel
              </button>
              <button type="button" className="sbtn sbtn--primary" onClick={handleSave}>
                Save shift
              </button>
            </>
          )
        }
      >
        <div className="spanel__row">
          <Field label="Shift code" error={errors.code}>
            {(id) => (
              <input id={id} value={editing.code} maxLength={3} disabled={!canEdit} onChange={(e) => set('code')(e.target.value.toUpperCase())} />
            )}
          </Field>
        </div>
        <Field label="Shift name" error={errors.name}>
          {(id) => <input id={id} value={editing.name} disabled={!canEdit} onChange={(e) => set('name')(e.target.value)} />}
        </Field>
        <div className="spanel__row">
          <Field label="Start time">
            {(id) => (
              <input id={id} type="time" step={1800} value={toClock(editing.start)} disabled={!canEdit} onChange={(e) => e.target.value && set('start')(fromClock(e.target.value))} />
            )}
          </Field>
          <Field label="End time" error={errors.end}>
            {(id) => (
              <input id={id} type="time" step={1800} value={toClock(editing.end)} disabled={!canEdit} onChange={(e) => e.target.value && set('end')(fromClock(e.target.value))} />
            )}
          </Field>
        </div>
        <Field label="Reading interval">
          {(id) => (
            <select id={id} value={editing.interval} disabled={!canEdit} onChange={(e) => set('interval')(Number(e.target.value))}>
              {INTERVALS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Grace period">
          {(id) => (
            <select id={id} value={editing.grace} disabled={!canEdit} onChange={(e) => set('grace')(Number(e.target.value))}>
              {GRACE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Supervisor">
          {(id) => (
            <select id={id} value={editing.supervisor} disabled={!canEdit} onChange={(e) => set('supervisor')(e.target.value)}>
              <option value="">— none —</option>
              {supervisors.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.name} · {u.role}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="spanel__hint">
          {slots.length
            ? `Readings this shift: ${toClock(slots[0])} → ${toClock(slots[slots.length - 1])} (${slots.length} slot${slots.length > 1 ? 's' : ''})`
            : 'No reading slots: check the times.'}
        </p>
        <Toggle checked={editing.active} disabled={!canEdit} onChange={set('active')} label="Active" />
        {saved && <p className="snotice snotice--ok">{saved}</p>}
      </Panel>
    </div>
  )
}
