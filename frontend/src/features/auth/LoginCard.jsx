import { useId, useState } from 'react'
import TitleBlock from '../../components/TitleBlock.jsx'
import { signIn } from '../../store/session.js'
import './LoginCard.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Pure function: takes the form values, returns an object of errors.
// Empty object = form is valid.
function validate({ operatorId, accessCode }) {
  const errors = {}
  if (!operatorId.trim()) {
    errors.operatorId = 'Enter your operator ID or company email.'
  } else if (operatorId.includes('@') && !EMAIL_RE.test(operatorId)) {
    errors.operatorId = 'That email address doesn’t look right.'
  }
  if (!accessCode) {
    errors.accessCode = 'Enter your access code.'
  } else if (accessCode.length < 6) {
    errors.accessCode = 'Access codes are at least 6 characters.'
  }
  return errors
}

// `onLogin` comes from App: calling it swaps this page for the dashboard.
// `onBusy(true/false)` tells App a sign-in is running, so the machine drawing can speed up.
// `notice` is a message from App, e.g. why a saved sign-in couldn't be reopened.
export default function LoginCard({ onLogin, onBusy, notice }) {
  // One piece of state per thing that can change on screen.
  const [operatorId, setOperatorId] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [keepOnShift, setKeepOnShift] = useState(true)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'error'
  const [serverError, setServerError] = useState(notice ?? '')
  const [help, setHelp] = useState(null) // 'reset' | 'request': how to get a code or an account

  // useId gives unique ids so each <label htmlFor> matches its <input id>.
  const idField = useId()
  const codeField = useId()

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page

    const found = validate({ operatorId, accessCode })
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setStatus('loading')
    onBusy?.(true)
    setServerError('')
    try {
      // The server checks the access code; switched-off accounts are turned away there too.
      const user = await signIn(operatorId, accessCode, keepOnShift)
      await onLogin(user, { remember: keepOnShift })
    } catch (err) {
      setServerError(err.message)
      setStatus('error')
      onBusy?.(false)
    }
  }

  const isLoading = status === 'loading'

  return (
    <div className="card">
      <div className="card__bar mono">
        <span>Sheet 01 — Operator access</span>
        <span className="card__secure">
          <span className="card__dot" aria-hidden="true" /> Secure
        </span>
      </div>

      <div className="card__body">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="card__heading">Sign in to the floor.</h2>
          <p className="card__sub">Use your operator ID or company email.</p>

          {/* Field 01 */}
          <div className={`field ${errors.operatorId ? 'field--error' : ''}`}>
            <label htmlFor={idField} className="field__label mono">
              01 — Operator ID
            </label>
            <input
              id={idField}
              className="field__input"
              type="text"
              autoComplete="username"
              placeholder="operator@mpcr.com"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              aria-invalid={Boolean(errors.operatorId)}
              aria-describedby={errors.operatorId ? `${idField}-err` : undefined}
            />
            {errors.operatorId && (
              <p id={`${idField}-err`} className="field__error">
                {errors.operatorId}
              </p>
            )}
          </div>

          {/* Field 02 */}
          <div className={`field ${errors.accessCode ? 'field--error' : ''}`}>
            <label htmlFor={codeField} className="field__label mono">
              02 — Access code
            </label>
            <div className="field__row">
              <input
                id={codeField}
                className="field__input"
                type={showCode ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                aria-invalid={Boolean(errors.accessCode)}
                aria-describedby={errors.accessCode ? `${codeField}-err` : undefined}
              />
              <button
                type="button"
                className="field__reveal mono"
                onClick={() => setShowCode((s) => !s)}
                aria-pressed={showCode}
              >
                {showCode ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.accessCode && (
              <p id={`${codeField}-err`} className="field__error">
                {errors.accessCode}
              </p>
            )}
          </div>

          <div className="card__options">
            <label className="checkbox">
              <input type="checkbox" checked={keepOnShift} onChange={(e) => setKeepOnShift(e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true" />
              Keep me signed in
            </label>
            <button
              type="button"
              className="link"
              aria-expanded={help === 'reset'}
              onClick={() => setHelp(help === 'reset' ? null : 'reset')}
            >
              Reset access code →
            </button>
          </div>

          {help === 'reset' && (
            <p className="card__help" role="status">
              Ask your supervisor or an admin to set a new code in User Management. You will choose your own code the
              next time you sign in.
            </p>
          )}

          {serverError && (
            <p className="card__server-error" role="alert">
              {serverError}
            </p>
          )}

          <button type="submit" className="submit mono" disabled={isLoading}>
            <span>{isLoading ? 'Logging in…' : 'Login'}</span>
            <span className="submit__arrow" aria-hidden="true">
              →
            </span>
            {isLoading && <span className="submit__melt" aria-hidden="true" />}
          </button>

          <p className="card__new">
            New operator?{' '}
            <button
              type="button"
              className="link"
              aria-expanded={help === 'request'}
              onClick={() => setHelp(help === 'request' ? null : 'request')}
            >
              Request access →
            </button>
          </p>

          {help === 'request' && (
            <p className="card__help" role="status">
              Ask an admin to create your account in Settings → User Management. They will give you a username and a
              first access code.
            </p>
          )}
        </form>

        <p className="card__copy mono">
          © {new Date().getFullYear()} robis · MPCR v{__APP_VERSION__}
        </p>
      </div>

      <TitleBlock />
    </div>
  )
}
