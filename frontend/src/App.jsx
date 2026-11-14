import { useEffect, useState } from 'react'
import SheetFrame from './components/SheetFrame.jsx'
import Brand from './components/Brand.jsx'
import MachineDrawing from './components/MachineDrawing.jsx'
import LoginCard from './features/auth/LoginCard.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import Dashboard from './features/dashboard/Dashboard.jsx'
import ChangePassword from './features/auth/ChangePassword.jsx'
import { API_ERROR, PASSWORD_REQUIRED, SIGNED_OUT, api, getToken } from './api/client.js'
import { loadPlant, signOut, startLive } from './store/session.js'
import './App.css'

// Read the saved theme once, when the app first loads.
function getInitialTheme() {
  try {
    return localStorage.getItem('mpcr-theme') ?? 'paper'
  } catch {
    return 'paper'
  }
}

// "Keep me signed in" keeps the sign-in token in localStorage (survives closing the browser);
// otherwise sessionStorage keeps it only until the tab closes.
function rememberedHere() {
  try {
    return Boolean(localStorage.getItem('mpcr-token'))
  } catch {
    return false
  }
}

// The server's record → the signed-in user the screens work with. Role, permissions and
// machine access come from User Management on the server, so changes there apply on reload.
function toUser(record, remember) {
  return {
    name: record.email,
    username: record.username,
    displayName: record.username.toUpperCase(),
    role: record.role,
    access: record.access ?? 'all',
    signedInAt: record.lastLogin ? Date.parse(record.lastLogin) : Date.now(),
    remember, // shown in the profile panel as the session type
  }
}

export default function App() {
  // The theme lives here (the top) because both the toggle and the
  // whole page depend on it. This is called "lifting state up".
  const [theme, setTheme] = useState(getInitialTheme)
  // Same idea for the signed-in user: it decides which page App shows.
  // A saved token means "signed in": the plant's data is loaded before the dashboard shows.
  const [session, setSession] = useState(() => (getToken() ? { loading: true } : null))
  const [signingIn, setSigningIn] = useState(false) // the drawing runs fast cycles meanwhile
  const [saveError, setSaveError] = useState('')
  const user = session?.user ?? null

  // Side effect: whenever `theme` changes, write it onto <html>
  // so the CSS variables in index.css switch over.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('mpcr-theme', theme)
    } catch {
      /* storage blocked: the toggle still works for this visit */
    }
  }, [theme])

  useEffect(() => {
    document.title = user ? 'MPCR · Dashboard' : 'MPCR · Sign in'
  }, [user])

  // The open page lives in the URL hash (#/log/J10-25, #/settings/users …). Signing in or out
  // clears it, so every sign-in starts on the dashboard instead of where the last user left off.
  function clearPage() {
    history.replaceState(null, '', location.pathname + location.search)
  }

  // Load the plant's data for the signed-in token. Returns an error message, or '' when it worked.
  async function open(remember) {
    try {
      // Waiting for a new access code: nothing else opens until it is chosen.
      const me = await api.get('/auth/me/')
      if (me.forceReset) {
        setSession({ mustChange: true, username: me.username, remember })
        return ''
      }
      const { user: record, images } = await loadPlant()
      setSession({ user: toUser(record, remember), images })
      return ''
    } catch (err) {
      signOut()
      const message = err.status === 401 ? '' : err.message
      setSession({ error: message })
      return message || 'Signed out. Sign in again.'
    }
  }

  // Reopening the app with a saved sign-in.
  useEffect(() => {
    if (session?.loading) open(rememberedHere())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on first load
  }, [])

  function handleSignOut() {
    signOut()
    try {
      sessionStorage.clear() // per-tab state such as report filters
    } catch {
      /* nothing saved */
    }
    clearPage()
    setSession(null)
  }

  // While signed in: live data, the server turning the token away, an admin asking for a new
  // access code, and failed saves.
  const mustChange = Boolean(session?.mustChange)
  useEffect(() => {
    if (!user && !mustChange) return
    const stop = user ? startLive() : () => {}
    const onSignedOut = () => handleSignOut()
    const onError = (e) => setSaveError(e.detail)
    const onPasswordRequired = () =>
      user && setSession({ mustChange: true, username: user.username, remember: user.remember })
    window.addEventListener(SIGNED_OUT, onSignedOut)
    window.addEventListener(API_ERROR, onError)
    window.addEventListener(PASSWORD_REQUIRED, onPasswordRequired)
    return () => {
      stop()
      window.removeEventListener(SIGNED_OUT, onSignedOut)
      window.removeEventListener(API_ERROR, onError)
      window.removeEventListener(PASSWORD_REQUIRED, onPasswordRequired)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per signed-in user
  }, [user, mustChange])

  // LoginCard has signed in; a failure to load is shown on the card.
  async function handleLogin(_record, { remember }) {
    clearPage()
    const error = await open(remember)
    if (error) throw new Error(error)
  }

  if (session?.loading) {
    return (
      <SheetFrame>
        <p className="app-loading mono">Loading the plant…</p>
      </SheetFrame>
    )
  }

  if (mustChange || session?.changing) {
    return (
      <SheetFrame>
        <div className="layout">
          <section className="layout__left">
            <Brand />
            <MachineDrawing />
          </section>
          <section className="layout__right">
            <ThemeToggle theme={theme} onChange={setTheme} />
            <ChangePassword
              username={user?.username ?? session.username}
              required={mustChange}
              onDone={() => (mustChange ? open(session.remember) : setSession({ ...session, changing: false }))}
              onCancel={() => setSession({ ...session, changing: false })}
              onSignOut={handleSignOut}
            />
          </section>
        </div>
      </SheetFrame>
    )
  }

  if (user) {
    return (
      <SheetFrame fixed>
        {saveError && (
          <div className="app-error" role="alert">
            <span>
              <strong>Not saved.</strong> {saveError} Reload the page to see what the server has.
            </span>
            <button type="button" className="mono" onClick={() => setSaveError('')}>
              Dismiss
            </button>
          </div>
        )}
        <Dashboard
          user={user}
          initialImages={session.images}
          theme={theme}
          onThemeChange={setTheme}
          onSignOut={handleSignOut}
          onChangePassword={() => setSession({ ...session, changing: true })}
        />
      </SheetFrame>
    )
  }

  return (
    <SheetFrame>
      <div className="layout">
        <section className="layout__left">
          <Brand />
          <MachineDrawing running={signingIn} />
          <p className="layout__footer mono">
            © {new Date().getFullYear()} robis · MPCR v{__APP_VERSION__}
          </p>
        </section>

        <section className="layout__right">
          <ThemeToggle theme={theme} onChange={setTheme} />
          <LoginCard onLogin={handleLogin} onBusy={setSigningIn} notice={session?.error} />
        </section>
      </div>
    </SheetFrame>
  )
}
