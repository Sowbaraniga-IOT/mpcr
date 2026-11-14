import { useId, useState } from 'react'
import LogDialog from '../../components/LogDialog.jsx'
import {
  APPROVAL_STEPS,
  canReview,
  describe,
  formatDate,
  formatReading,
  hourLabel,
  partNoFor,
  shiftOf,
} from '../../store/parameterLog.js'
import { draftFromDeviation, draftVersion, latestVersion, recipeForMachine } from '../../store/recipes.js'
import { pad } from '../../store/shifts.js'
import { can } from '../../store/users.js'
import { logChange } from '../../store/store.js'

// "R-001 v4": the version an approved standard change would be saved as.
function nextRef(machine) {
  const recipe = recipeForMachine(machine)
  if (!recipe) return null
  return `${recipe.id} v${draftVersion(recipe)?.v ?? latestVersion(recipe).v + 1}`
}

function nowLabel() {
  const now = new Date()
  return `${pad(now.getHours())}:${String(now.getMinutes()).padStart(2, '0')}`
}

// Detected → Reason added → Supervisor (level 1) → Manager (level 2) → Closed, with where this deviation stands.
function historyOf(d) {
  const rejectedAt = (who) => d.status === 'rejected' && (d.rejectedBy ?? 'Supervisor') === who
  return [
    { state: 'done', title: `${hourLabel(d.hour)} · Deviation detected`, sub: 'Auto · from reading' },
    d.reason
      ? { state: 'done', title: `${d.at} · Reason added`, sub: `${d.by} · ${d.role}` }
      : { state: 'current', title: 'Now · Reason needed', sub: 'Waiting for the operator' },
    d.status === 'awaiting'
      ? { state: 'current', title: 'Now · Supervisor review (level 1)', sub: 'Supervisor' }
      : rejectedAt('Supervisor')
        ? { state: 'failed', title: `${d.adminAt ?? '—'} · Rejected by supervisor`, sub: d.adminBy ?? 'Supervisor' }
        : d.l1
          ? { state: 'done', title: `${d.l1.at} · Supervisor approved (level 1)`, sub: d.l1.by }
          : { state: 'todo', title: '— · Supervisor review (level 1)', sub: 'After a reason is added' },
    d.status === 'supervised'
      ? { state: 'current', title: 'Now · Manager approval (level 2)', sub: 'Manager' }
      : rejectedAt('Manager')
        ? { state: 'failed', title: `${d.adminAt ?? '—'} · Rejected by manager`, sub: d.adminBy ?? 'Manager' }
        : d.status === 'closed'
          ? {
              state: 'done',
              title: `${d.adminAt ?? d.approvedAt} · Manager approved (level 2)`,
              sub: d.adminBy ?? 'Manager',
            }
          : { state: 'todo', title: '— · Manager approval (level 2)', sub: 'After the supervisor approves' },
    d.status === 'closed'
      ? { state: 'done', title: `${d.approvedAt} · Closed`, sub: 'Deviation closed' }
      : { state: 'todo', title: '— · Closed', sub: 'After both approvals' },
  ]
}

// A supervisor approves or rejects first (level 1), then a manager (level 2); everyone else sees it read-only.
export default function DeviationReview({ deviation: d, row, machine, date, user, onDecision, onClose }) {
  const [comment, setComment] = useState('')
  const [masterChange, setMasterChange] = useState(false)
  const [error, setError] = useState('')
  const commentId = useId()

  const step = APPROVAL_STEPS[d.status]
  const mayReview = canReview(user, d)
  // A manager who approved level 1 (an admin can do both) must leave level 2 to someone else.
  const ownLevel1 = step?.level === 2 && !mayReview && can(user, step.permission)
  const nextMasterRef = nextRef(machine)
  const kind = row.zeroTol ? 'changed' : 'limit'
  const words = describe(row, d.value)
  const value = (v) => (v == null ? '—' : `${v} ${row.unit}`)

  function decide(decision, close) {
    const text = comment.trim()
    if (decision === 'reject' && !text) {
      setError('Say what the operator needs to fix before rejecting.')
      return
    }
    const requestMaster = decision === 'approve' && step.level === 2 && masterChange && nextMasterRef
    const review = {
      decision,
      comment: text,
      by: user.displayName.toLowerCase(),
      at: nowLabel(),
      masterChange: Boolean(requestMaster),
    }
    // The server applies it and tells the next approver, or the operator and the level-1 supervisor.
    onDecision(review)
    logChange(
      user,
      'Deviation',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} (level ${step.level}) ${machine.id} ${formatDate(date)} ${hourLabel(d.hour)} ${row.label} = ${d.value} ${row.unit}${text ? `: ${text}` : ''}`,
    )
    // The new standard goes to the Parameter Master as a draft; it needs admin approval there.
    if (requestMaster) {
      const draft = draftFromDeviation(machine, d.key, d.value, user)
      if (draft) logChange(user, 'Parameter master', `${recipeForMachine(machine).id} v${draft.v} draft: ${draft.note}`)
    }
    close()
  }

  return (
    <LogDialog
      title={`Deviation review · ${machine.id} · ${formatDate(date)} · ${hourLabel(d.hour)} · ${row.label}`}
      tone={kind === 'changed' ? 'amber' : 'accent'}
      wide
      onClose={onClose}
      actions={(close) =>
        mayReview ? (
          <>
            <button type="button" className="review__reject mono" onClick={() => decide('reject', close)}>
              × Reject
            </button>
            <button type="button" className="review__approve mono" onClick={() => decide('approve', close)}>
              {step.level === 1 ? '✓ Approve → manager' : '✓ Final approve & close'}
            </button>
          </>
        ) : (
          <button type="button" className="log-dialog__secondary mono" onClick={close}>
            Close
          </button>
        )
      }
    >
      <div className="review">
        <header>
          <h3 className="review__title">
            {row.label} is {words.replace(/ \([^)]*\)$/, '')}
          </h3>
          <p className="review__sub">
            {kind === 'changed' ? 'Set value changed (parameter has no tolerance).' : 'Reading outside its limits.'}{' '}
            Machine {machine.id} · Mold {machine.mold} · Part {partNoFor(machine)} · Shift {shiftOf(d.hour)}
          </p>
        </header>

        <dl className="review__values">
          <div>
            <dt className="mono">Lower limit</dt>
            <dd className="mono">{value(row.lower)}</dd>
          </div>
          <div>
            <dt className="mono">Standard value</dt>
            <dd className="mono">{value(row.std)}</dd>
          </div>
          <div>
            <dt className="mono">Upper limit</dt>
            <dd className="mono">{value(row.upper)}</dd>
          </div>
          <div className={`is-actual is-${kind}`}>
            <dt className="mono">Actual value</dt>
            <dd className="mono">
              {formatReading(row, d.value)} {row.unit}
            </dd>
          </div>
        </dl>

        <section>
          <h4 className="review__label mono">Reason for parameter change</h4>
          {d.reason ? (
            <div className="review__reason">
              <p>{d.reason}</p>
              <p className="review__meta">
                Entered by {d.by} ({d.role}) · {formatDate(date)} {d.at} · {d.lot}
              </p>
            </div>
          ) : (
            <p className="review__reason is-empty">
              No reason entered yet. The operator adds it from the parameter log.
            </p>
          )}
        </section>

        <section>
          <h4 className="review__label mono">History</h4>
          <ol className="review__history">
            {historyOf(d).map((step) => (
              <li key={step.title} className={`is-${step.state}`}>
                <span className="review__dot" aria-hidden="true" />
                <strong>{step.title}</strong>
                <span>{step.sub}</span>
              </li>
            ))}
          </ol>
        </section>

        {mayReview ? (
          <>
            <section>
              <label htmlFor={commentId} className="review__label mono">
                Approver comment
              </label>
              <textarea
                id={commentId}
                className={`review__comment ${error ? 'is-bad' : ''}`}
                rows={3}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value)
                  setError('')
                }}
                placeholder="Optional when approving. Required when rejecting: tell the operator what to fix."
              />
              {error && (
                <p className="review__error" role="alert">
                  {error}
                </p>
              )}
            </section>

            {step.level === 2 && nextMasterRef && (
              <label className="switch">
                <input type="checkbox" checked={masterChange} onChange={(e) => setMasterChange(e.target.checked)} />
                <span className="switch__track" aria-hidden="true" />
                Also update standard value in Parameter Master (creates {nextMasterRef}, needs admin approval)
              </label>
            )}
          </>
        ) : (
          <>
            {d.l1?.comment && (
              <section>
                <h4 className="review__label mono">Supervisor comment</h4>
                <p className="review__reason">{d.l1.comment}</p>
              </section>
            )}
            {(d.adminComment || d.adminNote) && (
              <section>
                <h4 className="review__label mono">
                  {d.status === 'rejected' ? `${d.rejectedBy ?? 'Supervisor'} comment` : 'Manager comment'}
                </h4>
                <p className={`review__reason ${d.status === 'rejected' ? 'is-rejected' : ''}`}>
                  {d.adminComment || d.adminNote}
                </p>
              </section>
            )}
          </>
        )}

        {d.masterChange && (
          <p className="review__note is-master">
            Standard change sent to the Parameter Master as a draft for admin approval.
          </p>
        )}
        <p className="review__note">
          {ownLevel1
            ? 'You approved level 1, so the final approval has to come from another manager.'
            : 'Two approvals: supervisor (level 1), then manager (level 2). A rejection at either level sends it back to the operator.'}
        </p>
      </div>
    </LogDialog>
  )
}
