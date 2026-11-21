import { useEffect, useRef } from 'react'
import { describe, hourLabel } from '../../store/parameterLog.js'

const BADGES = {
  open: 'Open',
  rejected: 'Rejected',
  awaiting: 'Awaiting supervisor',
  supervised: 'Awaiting manager',
  closed: 'Closed',
}

// `reviewable(d)`: whether the signed-in user approves this deviation at the step it is at.
function DeviationCard({ deviation: d, row, focused, reviewable, canRecord, onReason, onReview }) {
  const ref = useRef(null)

  // A click on a flagged reading in the sheet brings its card into view.
  useEffect(() => {
    if (focused) ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focused])

  return (
    <article ref={ref} className={`dev-card is-${d.status} ${focused ? 'is-focused' : ''}`}>
      <header className="dev-card__head mono">
        <span>
          {hourLabel(d.hour)} · {row.label}
        </span>
        <span className="dev-card__badge">{BADGES[d.status]}</span>
      </header>

      <p className={`dev-card__value mono is-${row.zeroTol ? 'changed' : 'limit'}`}>
        {d.value.toFixed(row.digits)} <small>{row.unit}</small>
      </p>
      <p className={`dev-card__why is-${row.zeroTol ? 'changed' : 'limit'}`}>{describe(row, d.value)}</p>

      {d.status === 'open' ? (
        <>
          <p className="dev-card__reason is-empty">No reason entered yet. Deviation stays open.</p>
          {canRecord && (
            <button type="button" className="dev-card__add mono" onClick={() => onReason(d)}>
              + Add reason &amp; lot no.
            </button>
          )}
        </>
      ) : (
        <>
          <p className="dev-card__reason">{d.reason}</p>
          <p className="dev-card__by mono">
            {d.by} · {d.role} · {d.at} · {d.lot}
          </p>
          {d.status === 'rejected' && (
            <div className="dev-card__row">
              <p className="dev-card__state is-rejected">
                ✕ Rejected by {d.adminBy ?? 'approver'} ({(d.rejectedBy ?? 'Supervisor').toLowerCase()}): {d.adminNote}
              </p>
              {canRecord && (
                <button type="button" className="dev-card__edit mono" onClick={() => onReason(d)}>
                  Edit reason
                </button>
              )}
            </div>
          )}
          {d.status === 'supervised' && (
            <p className="dev-card__state is-closed">
              ✓ Level 1 · approved by {d.l1?.by ?? 'supervisor'} · {d.l1?.at}
            </p>
          )}
          {(d.status === 'awaiting' || d.status === 'supervised') &&
            (reviewable(d) ? (
              <button type="button" className="dev-card__review mono" onClick={() => onReview(d)}>
                {d.status === 'awaiting' ? 'Review · level 1 →' : 'Final approval · level 2 →'}
              </button>
            ) : (
              <p className="dev-card__state is-awaiting">
                ⧗{' '}
                {d.status === 'awaiting'
                  ? 'Waiting for supervisor approval (level 1)'
                  : 'Waiting for manager approval (level 2)'}
              </p>
            ))}
          {d.status === 'closed' && (
            <p className="dev-card__state is-closed">
              ✓ Approved by {d.l1?.by ?? 'supervisor'} (supervisor) and {d.adminBy ?? 'manager'} (manager) ·{' '}
              {d.approvedAt}
              {d.masterChange && ' · master change requested'}
            </p>
          )}
          {!reviewable(d) && (
            <button type="button" className="dev-card__details mono" onClick={() => onReview(d)}>
              Details &amp; history
            </button>
          )}
        </>
      )}
    </article>
  )
}

export default function DeviationPanel({
  shift,
  rows,
  deviations,
  focusId,
  reviewable,
  canRecord,
  onReason,
  onReview,
}) {
  const latestFirst = [...deviations].sort((a, b) => b.hour - a.hour)

  return (
    <section id="deviations" className="dev-panel" tabIndex={-1} aria-labelledby="dev-panel-title">
      <h2 id="dev-panel-title" className="plog__side-title mono">
        Deviations · {shift === '24H' ? '24 h' : `Shift ${shift}`}
        <span>{deviations.length}</span>
      </h2>
      <p className="dev-panel__flow mono">Open → Reason → Supervisor approves → Manager approves → Closed</p>

      {latestFirst.length === 0 ? (
        <p className="dev-panel__none">No deviations in this shift.</p>
      ) : (
        <div className="dev-panel__list">
          {latestFirst.map((d) => (
            <DeviationCard
              key={d.id}
              deviation={d}
              row={rows.find((r) => r.key === d.key)}
              focused={d.id === focusId}
              reviewable={reviewable}
              canRecord={canRecord}
              onReason={onReason}
              onReview={onReview}
            />
          ))}
        </div>
      )}
    </section>
  )
}
