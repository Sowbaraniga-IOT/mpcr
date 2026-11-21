import LogDialog from '../../components/LogDialog.jsx'

// Shows what an Excel upload would change, and every problem found, before anything is saved.
// items: [{ key, label, detail, action: 'new' | 'update' | 'draft' | 'unchanged' }]
const ACTIONS = {
  new: { label: 'New', tone: 'ok' },
  update: { label: 'Update', tone: 'ink' },
  draft: { label: 'New draft version', tone: 'warn' },
  unchanged: { label: 'Unchanged', tone: 'muted' },
}

export default function ImportDialog({ title, fileName, items, errors, note, onApply, onClose }) {
  const changes = items.filter((i) => i.action !== 'unchanged')
  return (
    <LogDialog
      title={title}
      wide
      onClose={onClose}
      actions={(close) => (
        <>
          <button type="button" className="log-dialog__secondary mono" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="log-dialog__primary mono"
            disabled={!changes.length}
            onClick={() => {
              onApply()
              close()
            }}
          >
            {changes.length ? `Apply ${changes.length} change${changes.length > 1 ? 's' : ''}` : 'Nothing to apply'}
          </button>
        </>
      )}
    >
      <p className="log-dialog__hint">
        <strong>{fileName}</strong> · {items.length} read · {changes.length} to change · {errors.length} problem
        {errors.length === 1 ? '' : 's'}
        {errors.length > 0 && ' (those rows are skipped)'}
      </p>
      {note && <p className="snotice snotice--warn">{note}</p>}

      {items.length > 0 && (
        <div className="simport">
          {items.map((i) => (
            <div key={i.key} className="simport__row">
              <span className={`sbadge sbadge--${ACTIONS[i.action].tone}`}>{ACTIONS[i.action].label}</span>
              <span className="mono">{i.label}</span>
              <span className="stable__muted">{i.detail}</span>
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="simport simport--errors">
          {errors.slice(0, 50).map((e, n) => (
            <p key={n}>
              <span className="mono">Row {e.line}</span> {e.message}
            </p>
          ))}
          {errors.length > 50 && <p>…and {errors.length - 50} more.</p>}
        </div>
      )}
    </LogDialog>
  )
}
