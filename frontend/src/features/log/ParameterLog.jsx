import { useEffect, useId, useMemo, useRef, useState } from 'react'
import LogTable from './LogTable.jsx'
import DeviationPanel from './DeviationPanel.jsx'
import RecordDialog from './RecordDialog.jsx'
import ReasonDialog from './ReasonDialog.jsx'
import DeviationReview from './DeviationReview.jsx'
import { exportExcel, exportPdf } from './exportLog.js'
import {
  LOG_CHANGED,
  allRows,
  check,
  describe,
  dueSlot,
  fetchLog,
  formatDate,
  formatReading,
  giveReason,
  hourLabel,
  hoursOf,
  canReview,
  logFor,
  partNameFor,
  partNoFor,
  productionDate,
  recordHour,
  recipeRef,
  reviewDeviation,
  sectionsFor,
  sheetHours,
  shiftTabs,
} from '../../store/parameterLog.js'
import { SHIFT_MASTER } from '../../store/shiftMaster.js'
import { currentShift, shiftHour } from '../../store/shifts.js'
import { can } from '../../store/users.js'
import { save } from '../../api/client.js'
import './ParameterLog.css'

// Re-render every 30 s so the countdown and the due column move on their own.
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const STATUS_TEXT = {
  open: 'Open',
  rejected: 'Rejected by admin',
  awaiting: 'Awaiting supervisor',
  supervised: 'Awaiting manager',
  closed: 'Closed (approved)',
}

const FORMATS = [
  { key: 'excel', label: 'Excel', ext: '.xlsx' },
  { key: 'pdf', label: 'PDF', ext: '.pdf' },
]

// "Export" button with an Excel / PDF menu. `onExport(format)` returns a promise.
function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const menuRef = useRef(null)
  const menuId = useId()

  // While the menu is open, a click outside it or Escape closes it.
  useEffect(() => {
    if (!open) return
    function close(e) {
      if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  async function run(format) {
    setOpen(false)
    setBusy(format)
    setError('')
    try {
      await onExport(format)
    } catch {
      setError('Export failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="plog-export" ref={menuRef}>
      <button
        type="button"
        className="plog__btn mono"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={Boolean(busy)}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        {busy ? `Exporting ${busy === 'pdf' ? 'PDF' : 'Excel'}…` : 'Export'}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="icon plog-export__chevron">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul id={menuId} className="plog-export__menu" role="list">
          {FORMATS.map((f) => (
            <li key={f.key}>
              <button type="button" className="mono" onClick={() => run(f.key)}>
                <span className={`plog-export__tag is-${f.key}`}>{f.ext}</span>
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="plog-export__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// recordedBy of readings the machine reported itself (backend: logic.AUTO_RECORDER).
const AUTO_RECORDER = 'opc-ua'

// Who recorded an hour, as the column header shows it: "operator" → "OP"; automatic readings → "AUTO".
const initialsOf = (by) => (!by ? '' : by === AUTO_RECORDER ? 'AUTO' : by.slice(0, 2).toUpperCase())

export default function ParameterLog({ machine, user }) {
  const now = useNow()
  const nowAt = shiftHour(now)
  const date = productionDate(now)
  const shiftNow = currentShift(now)

  const sections = useMemo(() => sectionsFor(machine), [machine])
  const rows = useMemo(() => allRows(sections), [sections])

  const tabs = shiftTabs()
  const [pickedTab, setShift] = useState(shiftNow.key)
  // A shift switched off in the Shift Master (or no shift right now) falls back to the whole day.
  const shift = tabs.some((t) => t.key === pickedTab) ? pickedTab : '24H'
  // The sheet lives on the server. It is re-read every 30 s (other users, automatic readings)
  // and after every save; a screen left open past 06:00 moves to the new production day.
  const [, setVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const log = logFor(machine, date)
  const dayKey = formatDate(date)
  useEffect(() => {
    let live = true
    fetchLog(machine, date)
      .then(() => live && setLoadError(''))
      .catch((err) => live && setLoadError(err.message))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read on each tick of `now`
  }, [machine, dayKey, now])
  useEffect(() => {
    const changed = () => setVersion((v) => v + 1)
    window.addEventListener(LOG_CHANGED, changed)
    return () => window.removeEventListener(LOG_CHANGED, changed)
  }, [])
  const [dialog, setDialog] = useState(null) // { type: 'record' | 'reason' | 'review', deviation? }
  // What the signed-in role may do here (Settings → User Management → role permissions).
  const canRecord = can(user, 'record')
  const canEdit = can(user, 'editAfterSubmit')
  const canExport = can(user, 'export')
  const masterRef = recipeRef(machine)
  const [focusId, setFocusId] = useState(null)

  // An hour only the machine (OPC UA) has filled is still open for a person to complete:
  // the readings the gateway doesn't send are added by hand, the machine's values are kept.
  const isAutoHour = (h) => Boolean(log.recorded[h]) && log.recordedBy?.[h]?.by === AUTO_RECORDER
  const isAutoValue = (row, h) => (log.recordedBy?.[h]?.auto ?? []).includes(row.key)
  const machineLimitsAt = (row, h) => log.recordedBy?.[h]?.machineLimits?.[row.key] ?? null
  const byPerson = Object.fromEntries(Object.entries(log.recorded).filter(([h]) => !isAutoHour(h)))

  // The Shift Master decides when readings are due.
  const dueHour = dueSlot(byPerson, now)
  const minutesToDue = dueHour == null ? 0 : Math.round((dueHour - nowAt) * 60)
  const hours = sheetHours(shift, log.recorded)
  const shiftDevs = log.deviations.filter((d) => hours.includes(d.hour))
  const dueRecorded = dueHour != null && Boolean(byPerson[dueHour])
  const dueAuto = dueHour != null && isAutoHour(dueHour)

  // Past hours nobody recorded are "missed"; with back-dated entries allowed they can still be added.
  function hourState(h) {
    if (log.recorded[h]) return 'logged'
    if (h === dueHour) return 'due'
    return h <= nowAt ? 'missed' : 'later'
  }

  const valueAt = (row, h) => log.recorded[h]?.[row.key]

  // The server checks every value against the active recipe, opens a deviation for each one
  // outside its limits and tells the approvers. Edits keep the reasons of values that didn't change.
  const handleRecord = (values) => save(recordHour(machine, date, dueHour, values))
  const handleEdit = (h, values) => save(recordHour(machine, date, h, values))
  const handleReason = (id, values) => save(giveReason(machine, date, id, values))
  const handleReview = (id, review) => save(reviewDeviation(machine, date, id, review))

  const canBackfill = canRecord && SHIFT_MASTER.rules.backDated
  function editAction(h) {
    const state = hourState(h)
    if (isAutoHour(h) && canRecord && (h === dueHour || canBackfill))
      return () => setDialog({ type: 'complete', hour: h })
    if ((state === 'logged' && canEdit) || (state === 'missed' && canBackfill))
      return () => setDialog({ type: 'edit', hour: h })
    return null
  }

  // The sheet as it's shown on screen, for the Excel and PDF exports.
  function buildSheet() {
    const fixed = (r, v) => (r.na ? 'NA' : (r.text ?? v ?? '—'))
    let index = 0
    const exportSections = sections.map((s) => ({
      title: s.title,
      rows: s.rows.map((r) => {
        const i = index++
        const flags = {}
        const readings = hours.map((h, col) => {
          if (hourState(h) !== 'logged') return ''
          if (r.na) return 'NA'
          const value = valueAt(r, h, i)
          const dir = check(r, value)
          if (dir)
            flags[7 + col] = {
              kind: r.zeroTol ? 'changed' : 'limit',
              dir: dir.toUpperCase(),
              label: describe(r, value),
            }
          return value ?? ''
        })
        const cells = [
          r.label,
          r.unit,
          fixed(r, r.std),
          r.na ? 'NA' : (r.tolText ?? '—'),
          fixed(r, r.lower),
          fixed(r, r.std),
          fixed(r, r.upper),
        ]
        return { cells: [...cells, ...readings], digits: r.digits, na: r.na, flags }
      }),
    }))

    const shiftName = shift === '24H' ? '24 h' : `Shift ${shift}`
    return {
      filename: `${machine.id}_${formatDate(date)}_${shift === '24H' ? '24h' : `shift-${shift}`}_parameter-log`,
      title: `${machine.name} · ${machine.id} · Parameter log · ${shiftName}`,
      footer: `Limits come from parameter master ${masterRef} · Exported ${now.toLocaleString()} by ${user.displayName}`,
      info: [...info.map((f) => [f.label, f.value]), ['Shift', shiftName]],
      head: [
        'Parameter',
        'Unit',
        'Set value',
        'Tolerance',
        'Lower limit',
        'Standard',
        'Upper limit',
        ...hours.map(hourLabel),
      ],
      sections: exportSections,
      deviations: [...shiftDevs]
        .sort((a, b) => a.hour - b.hour)
        .map((d) => {
          const r = rows.find((x) => x.key === d.key)
          return {
            time: hourLabel(d.hour),
            parameter: r.label,
            value: `${formatReading(r, d.value)} ${r.unit}`,
            detail: describe(r, d.value),
            status: STATUS_TEXT[d.status],
            reason: d.reason ?? '',
            lot: d.lot ?? '',
            by: d.by ? `${d.by} · ${d.role} · ${d.at}` : '',
          }
        }),
    }
  }

  const handleExport = (format) => (format === 'pdf' ? exportPdf : exportExcel)(buildSheet())

  const currentHours = hoursOf(shiftNow.key)
  const loggedCount = currentHours.filter((h) => hourState(h) === 'logged').length

  const info = [
    { label: 'Machine', value: machine.id, accent: true },
    { label: 'Mold', value: machine.mold },
    { label: 'Part name', value: partNameFor(machine) },
    { label: 'Part no.', value: partNoFor(machine) },
    { label: 'Date', value: formatDate(date) },
  ]

  return (
    <section className="plog" aria-label={`${machine.name} parameter log`}>
      <div className="plog__top">
        <dl className="plog__info">
          {info.map((f) => (
            <div key={f.label}>
              <dt className="mono">{f.label}</dt>
              <dd className={`mono ${f.accent ? 'is-accent' : ''}`}>{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="plog__shift">
          <span className="mono">Shift</span>
          <div className="plog__tabs" role="group" aria-label="Shift">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className="mono"
                aria-pressed={shift === t.key}
                onClick={() => setShift(t.key)}
              >
                {t.key}
              </button>
            ))}
          </div>
        </div>

        <div className="plog__actions">
          {canExport && <ExportMenu onExport={handleExport} />}
          <button
            type="button"
            className="plog__btn plog__btn--primary mono"
            onClick={() => setDialog(dueAuto ? { type: 'complete', hour: dueHour } : { type: 'record' })}
            hidden={!canRecord}
            disabled={dueRecorded || dueHour == null}
          >
            {dueHour == null
              ? 'No reading due'
              : dueRecorded
                ? `✓ ${hourLabel(dueHour)} recorded`
                : dueAuto
                  ? `+ Complete ${hourLabel(dueHour)}`
                  : `+ Record ${hourLabel(dueHour)}`}
          </button>
        </div>
      </div>

      {loadError && (
        <p className="plog__error mono" role="alert">
          Couldn’t load this sheet from the server: {loadError}
        </p>
      )}

      <div className="plog__body">
        <LogTable
          sections={sections}
          shift={shift}
          hours={hours}
          deviations={shiftDevs}
          hourState={hourState}
          valueAt={valueAt}
          initials={(h) => initialsOf(log.recordedBy?.[h]?.by)}
          minutesToDue={minutesToDue}
          onFocusDeviation={setFocusId}
          onEditHour={editAction}
          isAutoHour={isAutoHour}
          isAutoValue={isAutoValue}
          machineLimitsAt={machineLimitsAt}
        />

        <aside className="plog__side">
          <div className="plog__next">
            <h2 className="plog__side-title mono">Next reading</h2>
            <div className="plog__next-body">
              <span className="plog__next-time mono">{dueHour == null ? '—' : hourLabel(dueHour)}</span>
              <span className="plog__next-meta mono">
                <span className={dueRecorded ? 'is-done' : 'is-due'}>
                  {dueRecorded
                    ? 'Recorded ✓'
                    : dueAuto
                      ? 'Machine values in · complete the rest'
                      : dueHour == null
                      ? 'No reading due'
                      : minutesToDue > 0
                        ? `Due in ${minutesToDue} min`
                        : `Late by ${-minutesToDue} min`}
                </span>
                <span>
                  Shift {shiftNow.key} · {loggedCount} of {currentHours.length} logged
                </span>
                <span className="plog__next-track">
                  <span style={{ width: `${(loggedCount / (currentHours.length || 1)) * 100}%` }} />
                </span>
              </span>
            </div>
          </div>

          <DeviationPanel
            shift={shift}
            rows={rows}
            deviations={shiftDevs}
            focusId={focusId}
            reviewable={(d) => canReview(user, d)}
            canRecord={canRecord}
            onReason={(deviation) => setDialog({ type: 'reason', deviation })}
            onReview={(deviation) => setDialog({ type: 'review', deviation })}
          />
        </aside>
      </div>

      <footer className="plog__legend mono">
        <span>
          <i className="plog__swatch plog__swatch--limit" /> Outside lower / upper limit
        </span>
        <span>
          <i className="plog__swatch plog__swatch--changed" /> Changed from standard (no tolerance)
        </span>
        <span>
          <i className="plog__swatch plog__swatch--due" /> Reading due · Limits come from parameter master {masterRef}
        </span>
      </footer>

      {dialog?.type === 'record' && (
        <RecordDialog
          machine={machine}
          hour={dueHour}
          sections={sections}
          onSave={handleRecord}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'edit' && (
        <RecordDialog
          machine={machine}
          hour={dialog.hour}
          sections={sections}
          current={log.recorded[dialog.hour] && Object.fromEntries(rows.map((r) => [r.key, valueAt(r, dialog.hour)]))}
          onSave={(values) => handleEdit(dialog.hour, values)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'complete' && (
        <RecordDialog
          machine={machine}
          hour={dialog.hour}
          sections={sections}
          prefill={log.recorded[dialog.hour]}
          autoKeys={log.recordedBy?.[dialog.hour]?.auto ?? []}
          onSave={(values) => handleEdit(dialog.hour, values)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'reason' && (
        <ReasonDialog
          deviation={dialog.deviation}
          row={rows.find((r) => r.key === dialog.deviation.key)}
          onSave={(values) => handleReason(dialog.deviation.id, values)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'review' && (
        <DeviationReview
          deviation={dialog.deviation}
          row={rows.find((r) => r.key === dialog.deviation.key)}
          machine={machine}
          date={date}
          user={user}
          onDecision={(review) => handleReview(dialog.deviation.id, review)}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}
