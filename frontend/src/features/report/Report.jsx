import { useEffect, useState } from 'react'
import ReportFilters from './ReportFilters.jsx'
import Pagination from '../../components/Pagination.jsx'
import { exportReportExcel, exportReportPdf, EXCEL_ROW_LIMIT, PDF_ROW_LIMIT } from './exportReport.js'
import { MACHINES } from '../../store/machines.js'
import DeviationReview from '../log/DeviationReview.jsx'
import {
  formatDate,
  formatReading,
  hourLabel,
  partNoFor,
  canReview,
  reviewDeviation,
  reviewStatuses,
  shiftOf,
} from '../../store/parameterLog.js'
import { can } from '../../store/users.js'
import { save } from '../../api/client.js'
import {
  STATUS_LABELS,
  parameterList,
  defaultFilters,
  kindOf,
  reasonFor,
  runReport,
  wordsFor,
} from '../../store/report.js'
import './Report.css'

const PAGE_SIZE = 25
const EMPTY_STATS = { machines: 0, days: 0, values: 0, deviations: 0, open: 0, awaiting: 0, supervised: 0, closed: 0, compliance: 100 }
const fmt = (n) => n.toLocaleString('en-IN')
const sameFilters = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// "2026-10-30" → "30.10.2026"
const inputDate = (s) => s.split('-').reverse().join('.')

// Human-readable filters for the export headers.
function describeFilters(f) {
  const pick = (key, list, label) =>
    f[key] === 'all' ? `All ${label}` : (list.find((x) => x.value === f[key])?.label ?? f[key])
  return [
    ['Date range', `${inputDate(f.from)} → ${inputDate(f.to)}`],
    ['Shifts', f.shifts.join(', ')],
    ['Machines', f.machines.length ? f.machines.join(', ') : `All (${MACHINES.length})`],
    ['Mold', f.mold === 'all' ? 'All molds' : f.mold],
    ['Part no.', f.part === 'all' ? 'All parts' : f.part],
    [
      'Parameter',
      pick(
        'param',
        parameterList().map((p) => ({ value: p.key, label: p.label })),
        'parameters',
      ),
    ],
    ['Deviation status', f.status === 'all' ? 'All' : f.status],
  ]
}

function ExportButton({ kind, label, onExport }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function run() {
    setBusy(true)
    setError(false)
    try {
      await onExport()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className={`rexport rexport--${kind} mono`} onClick={run} disabled={busy}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
      {busy ? 'Exporting…' : error ? 'Failed · retry' : label}
    </button>
  )
}

// The applied filters survive a trip to a parameter log and back (same tab only).
const FILTERS_KEY = 'mpcr-report-filters'
function savedFilters() {
  try {
    return { ...defaultFilters(), ...JSON.parse(sessionStorage.getItem(FILTERS_KEY)) }
  } catch {
    return defaultFilters()
  }
}

export default function Report({ user, openRequest, onOpenLog }) {
  const [draft, setDraft] = useState(savedFilters)
  const [applied, setApplied] = useState({ filters: draft, at: new Date() })
  const [page, setPage] = useState(1)
  const [reviewing, setReviewing] = useState(null) // a deviation row while its review dialog is open
  const approves = reviewStatuses(user)
  const canExport = can(user, 'export')

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(applied.filters))
    } catch {
      /* storage blocked: filters reset next visit */
    }
  }, [applied])

  // The server works the report out; each page of rows is fetched when it is shown.
  const [report, setReport] = useState(null)
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    let live = true
    setLoadError('')
    runReport(applied.filters, PAGE_SIZE)
      .then((r) => live && setReport(r))
      .catch((err) => live && setLoadError(err.message))
    return () => {
      live = false
    }
  }, [applied])
  const stats = report?.stats ?? EMPTY_STATS
  const values = applied.filters.values
  const showLimits = values !== 'actual'
  const showActual = values !== 'standard'

  async function handleReview(d, review) {
    await save(reviewDeviation(d.machine, d.date, d.id, review))
    setApplied((prev) => ({ ...prev, at: new Date() })) // re-run with the decision in place
  }

  function apply(filters = draft) {
    setDraft(filters)
    setApplied({ filters, at: new Date() })
    setPage(1)
  }

  // The header bell asks for the deviations that still need action.
  useEffect(() => {
    if (openRequest) apply({ ...applied.filters, status: approves[0] ?? 'open' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the bell is clicked
  }, [openRequest])

  const total = report?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * PAGE_SIZE
  useEffect(() => {
    if (!report) return
    let live = true
    report
      .rowsAt(start, PAGE_SIZE)
      .then((r) => live && setRows(r))
      .catch((err) => live && setLoadError(err.message))
    return () => {
      live = false
    }
  }, [report, start])
  const devRows = rows.filter((r) => r.deviation)
  const okRows = rows.filter((r) => !r.deviation)
  const columns = 12 - (showLimits ? 0 : 3) - (showActual ? 0 : 1)

  const exportMeta = () => {
    const f = applied.filters
    return {
      filename: `MPCR_report_${f.from}_to_${f.to}`,
      title: 'Report · Standard vs actual',
      filters: describeFilters(f),
      stats: [
        ['Machines', fmt(stats.machines)],
        ['Days', fmt(stats.days)],
        ['Values', fmt(stats.values)],
        ['Deviations', fmt(stats.deviations)],
        ['Open', fmt(stats.open)],
        ['Awaiting supervisor', fmt(stats.awaiting)],
        ['Awaiting manager', fmt(stats.supervised)],
        ['Closed', fmt(stats.closed)],
        ['Compliance', `${stats.compliance.toFixed(2)}%`],
      ],
      values,
      partNo: partNoFor,
    }
  }

  const statCards = [
    { label: 'Machines', value: fmt(stats.machines) },
    { label: 'Days', value: fmt(stats.days) },
    { label: 'Values', value: fmt(stats.values) },
    { label: 'Deviations', value: fmt(stats.deviations), tone: 'alarm' },
    { label: 'Open', value: fmt(stats.open), tone: 'alarm' },
    { label: 'Awaiting supv / mgr', value: `${fmt(stats.awaiting)} / ${fmt(stats.supervised)}`, tone: 'idle' },
    { label: 'Closed', value: fmt(stats.closed), tone: 'run' },
    { label: 'Compliance', value: `${stats.compliance.toFixed(2)}%`, tone: 'run' },
  ]

  function renderRow(r, i) {
    const kind = kindOf(r)
    const d = r.deviation
    return (
      <tr key={`${start + i}`} className={`is-${kind}`}>
        <td className="mono">{formatDate(r.date)}</td>
        <td className="mono">{shiftOf(r.hour)}</td>
        <td className="mono">{hourLabel(r.hour)}</td>
        <td className="mono">
          <button
            type="button"
            className="rtable__machine"
            onClick={() => onOpenLog(r.machine)}
            title="Open today's parameter log"
          >
            {r.machine.id}
          </button>
        </td>
        <td className="mono">{r.machine.mold}</td>
        <td className="mono">{partNoFor(r.machine)}</td>
        <td>{r.row.label}</td>
        <td className="mono rtable__unit">{r.row.unit}</td>
        {showLimits && (
          <>
            <td className="num mono rtable__muted">{r.row.text ?? r.row.lower ?? '—'}</td>
            <td className="num mono rtable__std">{r.row.text ?? r.row.std}</td>
            <td className="num mono rtable__muted">{r.row.text ?? r.row.upper}</td>
          </>
        )}
        {showActual && <td className={`num mono rtable__actual is-${kind}`}>{formatReading(r.row, r.value)}</td>}
        <td className={`rtable__words is-${kind}`}>{wordsFor(r)}</td>
        <td className={`rtable__reason ${d && !d.reason ? 'is-empty' : ''}`}>{reasonFor(d)}</td>
        <td>
          {d ? (
            <button
              type="button"
              className={`rbadge is-${d.status} mono`}
              onClick={() => setReviewing(d)}
              title={canReview(user, d) ? 'Review this deviation' : 'Details & history'}
            >
              {canReview(user, d) ? 'Review →' : STATUS_LABELS[d.status]}
            </button>
          ) : (
            <span className="rtable__muted">—</span>
          )}
        </td>
      </tr>
    )
  }

  const dirty = !sameFilters(draft, applied.filters)

  return (
    <section className="report" aria-label="Report">
      <ReportFilters
        draft={draft}
        onChange={setDraft}
        onApply={() => apply()}
        onReset={() => apply(defaultFilters())}
        dirty={dirty}
      />

      <div className="rstats">
        <dl>
          {statCards.map((s) => (
            <div key={s.label}>
              <dt className="mono">{s.label}</dt>
              <dd className={`mono ${s.tone ? `is-${s.tone}` : ''}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="rstats__exports">
          {canExport && report && (
            <ExportButton kind="excel" label="Excel (.xlsx)" onExport={() => exportReportExcel(report, exportMeta())} />
          )}
          {canExport && report && <ExportButton kind="pdf" label="PDF" onExport={() => exportReportPdf(report, exportMeta())} />}
        </div>
      </div>
      {total > PDF_ROW_LIMIT && (
        <p className="report__cap mono">
          PDF holds the first {fmt(PDF_ROW_LIMIT)} rows
          {total > EXCEL_ROW_LIMIT && `, Excel the first ${fmt(EXCEL_ROW_LIMIT)}`} · deviations always come first
        </p>
      )}

      <div className="rtable">
        <table>
          <thead className="mono">
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Sh</th>
              <th scope="col">Time</th>
              <th scope="col">Machine</th>
              <th scope="col">Mold</th>
              <th scope="col">Part no.</th>
              <th scope="col">Parameter</th>
              <th scope="col">Unit</th>
              {showLimits && (
                <>
                  <th scope="col" className="num">
                    Lower limit
                  </th>
                  <th scope="col" className="num rtable__std">
                    Standard value
                  </th>
                  <th scope="col" className="num">
                    Upper limit
                  </th>
                </>
              )}
              {showActual && (
                <th scope="col" className="num">
                  Actual value
                </th>
              )}
              <th scope="col">Deviation (in words)</th>
              <th scope="col">Reason · entered by</th>
              <th scope="col">Approval</th>
            </tr>
          </thead>

          {devRows.length > 0 && (
            <tbody>
              <tr className="rtable__group is-dev">
                <th scope="colgroup" colSpan={columns + 3} className="mono">
                  ⚠ Deviations first · {fmt(report.deviationCount)} in range · showing {devRows.length} · Open →
                  Rejected → Awaiting approval → Closed
                </th>
              </tr>
              {devRows.map(renderRow)}
            </tbody>
          )}
          {okRows.length > 0 && (
            <tbody>
              <tr className="rtable__group is-ok">
                <th scope="colgroup" colSpan={columns + 3} className="mono">
                  Within limits · {fmt(report?.withinCount ?? 0)} values
                </th>
              </tr>
              {okRows.map((r, i) => renderRow(r, devRows.length + i))}
            </tbody>
          )}
          {rows.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={columns + 3} className="rtable__none">
                  {loadError ? `Couldn’t run the report: ${loadError}` : report ? 'Nothing matches these filters.' : 'Running the report…'}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      <footer className="report__footer">
        <p className="mono">
          Showing {total ? `${fmt(start + 1)}–${fmt(start + rows.length)}` : 0} of {fmt(total)} values ·
          Deviations first, then by date, time, machine · Supervisor (level 1) and manager (level 2) approve from the
          parameter log or here
        </p>
        {pageCount > 1 && <Pagination page={current} pageCount={pageCount} onChange={setPage} />}
        {reviewing && (
          <DeviationReview
            deviation={reviewing}
            row={reviewing.row}
            machine={reviewing.machine}
            date={reviewing.date}
            user={user}
            onDecision={(review) => handleReview(reviewing, review)}
            onClose={() => setReviewing(null)}
          />
        )}
      </footer>
    </section>
  )
}
