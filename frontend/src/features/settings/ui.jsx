import { useId } from 'react'

// Small form pieces shared by the settings pages.

export function Field({ label, children, wide = false, error }) {
  const id = useId()
  return (
    <div className={`sfield ${wide ? 'sfield--wide' : ''} ${error ? 'is-bad' : ''}`}>
      <label htmlFor={id} className="mono">
        {label}
      </label>
      {children(id)}
      {error && <p className="sfield__error">{error}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled = false, small = false }) {
  return (
    <label className={`stoggle ${small ? 'stoggle--small' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="stoggle__track" aria-hidden="true" />
      {label && <span className="stoggle__label">{label}</span>}
    </label>
  )
}

// Red-headed edit panel on the right of each settings page.
export function Panel({ title, onClose, children, footer }) {
  return (
    <aside className="spanel">
      <header className="spanel__bar mono">
        <h2>{title}</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </header>
      <div className="spanel__body">{children}</div>
      {footer && <footer className="spanel__footer">{footer}</footer>}
    </aside>
  )
}

export function ReadOnlyNote({ children }) {
  return <p className="sreadonly mono">🔒 {children}</p>
}

// "2026-10-30T06:02:00Z" → "Today 06:02" / "Yesterday 21:58" / "27.06.2026"
export function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86_400_000)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
