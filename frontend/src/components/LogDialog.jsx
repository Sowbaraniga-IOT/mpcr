import { useEffect, useId, useRef } from 'react'
import './LogDialog.css'

// Modal form shell shared by the record, reason and review dialogs.
// `onSubmit` returns true when the form is valid and the dialog should close.
// `actions(close)` replaces the Cancel / submit pair with custom buttons.
// `tone` colours the title bar: 'accent' (red) or 'amber'.
export default function LogDialog({ title, submitLabel, wide = false, tone = 'accent', onSubmit, actions, onClose, children }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  // Open as a modal: the browser handles the backdrop, focus trap and Escape.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
  }, [])

  const close = () => dialogRef.current.close() // fires onClose below

  return (
    <dialog
      ref={dialogRef}
      className={`log-dialog log-dialog--${tone} ${wide ? 'log-dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dimmed backdrop lands on the <dialog> itself.
      onClick={(e) => e.target === dialogRef.current && close()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (onSubmit?.()) close()
        }}
      >
        <header className="log-dialog__bar">
          <h2 id={titleId} className="mono">
            {title}
          </h2>
          <button type="button" className="log-dialog__close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        <div className="log-dialog__body">{children}</div>

        <footer className="log-dialog__footer">
          {actions ? (
            actions(close)
          ) : (
            <>
              <button type="button" className="log-dialog__secondary mono" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="log-dialog__primary mono">
                {submitLabel}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  )
}
