import { useEffect, useId, useRef, useState } from 'react'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import NotificationBell from './NotificationBell.jsx'
import { STATUSES } from '../../store/machines.js'
import { currentShift } from '../../store/shifts.js'
import './DashboardHeader.css'

function UserMenu({ user, onSignOut, onChangePassword }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const panelId = useId()

  // While the menu is open, a click outside it or Escape closes it.
  useEffect(() => {
    if (!open) return
    function close(e) {
      if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    // Cleanup: React runs this when the menu closes, removing the listeners.
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu__btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="user-menu__avatar" aria-hidden="true">
          {user.displayName[0]}
        </span>
        <span className="user-menu__text">
          <span className="user-menu__name mono">{user.displayName}</span>
          <span className="user-menu__role">
            {user.role} · {user.role === 'Admin' || user.role === 'Manager' ? 'Plant 01' : `Shift ${currentShift().key}`}
          </span>
        </span>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="icon user-menu__chevron">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && <ProfilePanel id={panelId} user={user} onSignOut={onSignOut} onChangePassword={onChangePassword} />}
    </div>
  )
}

// `machine` is set while its parameter log is open: the header then shows the breadcrumb.
// `heading` ({ title, subtitle }) is set on other pages, like the report.
// Either way the plant status counters give way to the page title. The notification bell is on every page;
// `onAlerts`, when set, lets it filter the current page to what needs the user.
export default function DashboardHeader({
  counts,
  theme,
  onThemeChange,
  user,
  onSignOut,
  onChangePassword,
  machine,
  onBack,
  heading,
  onAlerts,
  onOpenLog,
  onReport,
  reportActive = false,
}) {
  const subPage = Boolean(machine || heading)
  return (
    <header className={`dash-header ${subPage ? 'dash-header--log' : ''}`}>
      <div className="dash-header__brand">
        <span className="dash-header__logo">MPCR</span>
        {machine ? (
          <>
            <button type="button" className="dash-header__back" onClick={onBack} aria-label="Back to dashboard">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="icon">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <span className="dash-header__title mono">
              <nav aria-label="Breadcrumb" className="dash-header__crumbs">
                <button type="button" onClick={onBack}>
                  Dashboard
                </button>{' '}
                · {machine.name} · <span aria-current="page">Parameter log</span>
              </nav>
              <strong className="dash-header__page">
                {machine.name} · {machine.id} · Parameter log
              </strong>
            </span>
          </>
        ) : heading ? (
          <span className="dash-header__title mono">
            <strong className="dash-header__page">{heading.title}</strong>
            <span>{heading.subtitle}</span>
          </span>
        ) : (
          <span className="dash-header__title mono">
            <strong>Dashboard</strong>
            <span>Plant 01 · Shift {currentShift().key}</span>
          </span>
        )}
      </div>

      {!subPage && (
        <dl className="dash-header__counts">
          {STATUSES.map((s) => (
            <div key={s.key} className="dash-header__count">
              <dt className="mono">
                <span className={`dot dot--${s.key}`} aria-hidden="true" /> {s.label}
              </dt>
              <dd>{counts[s.key]}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="dash-header__actions">
        <NotificationBell user={user} onOpenLog={onOpenLog} onShowHere={onAlerts} />
        <ThemeToggle theme={theme} onChange={onThemeChange} />
        {onReport && (
          <button
            type="button"
            className="dash-header__report mono"
            onClick={onReport}
            aria-current={reportActive ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
              <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 17v-3M12 17v-6M15 17v-4" />
            </svg>
            Report
          </button>
        )}
        <UserMenu user={user} onSignOut={onSignOut} onChangePassword={onChangePassword} />
      </div>
    </header>
  )
}
