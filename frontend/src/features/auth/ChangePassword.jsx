import { useId, useState } from 'react'
import { api } from '../../api/client.js'
import './LoginCard.css'

// Choosing a new access code. `required`: an admin asked for it, nothing else opens until it is done.
export default function ChangePassword({ username, required, onDone, onCancel, onSignOut }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()

  async function handleSubmit(event) {
    event.preventDefault()
    const found = {}
    if (!current) found.current = 'Enter your current access code.'
    if (next.length < 6) found.next = 'Access codes are at least 6 characters.'
    else if (next === current) found.next = 'Choose a code different from the current one.'
    if (repeat !== next) found.repeat = 'The two codes don’t match.'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    setServerError('')
    try {
      await api.post('/auth/password/', { current, password: next })
      await onDone()
    } catch (err) {
      setServerError(err.message)
      setBusy(false)
    }
  }

  const field = (key, label, value, onChange, autoComplete) => (
    <div className={`field ${errors[key] ? 'field--error' : ''}`}>
      <label htmlFor={`${id}-${key}`} className="field__label mono">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        className="field__input"
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${id}-${key}-err` : undefined}
      />
      {errors[key] && (
        <p id={`${id}-${key}-err`} className="field__error">
          {errors[key]}
        </p>
      )}
    </div>
  )

  return (
    <div className="card">
      <div className="card__bar mono">
        <span>Sheet 02 — Access code</span>
        <span className="card__secure">{username}</span>
      </div>

      <div className="card__body">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="card__heading">{required ? 'Choose a new access code.' : 'Change your access code.'}</h2>
          <p className="card__sub">
            {required
              ? 'An admin has asked you to replace this code before you continue.'
              : 'Your other devices will be signed out.'}
          </p>

          {field('current', '01 — Current access code', current, setCurrent, 'current-password')}
          {field('next', '02 — New access code', next, setNext, 'new-password')}
          {field('repeat', '03 — New access code again', repeat, setRepeat, 'new-password')}

          {serverError && (
            <p className="card__server-error" role="alert">
              {serverError}
            </p>
          )}

          <button type="submit" className="submit mono" disabled={busy}>
            <span>{busy ? 'Saving…' : 'Save access code'}</span>
            <span className="submit__arrow" aria-hidden="true">
              →
            </span>
          </button>

          <p className="card__new">
            <button type="button" className="link" onClick={required ? onSignOut : onCancel}>
              {required ? 'Sign out instead →' : 'Cancel →'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
