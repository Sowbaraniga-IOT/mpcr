import { useEffect, useId, useRef, useState } from 'react'
import { CHANGED, TYPES, markRead, notificationsFor } from '../../store/notifications.js'
import './NotificationBell.css'

// What happened, and what it means for the person reading it.
function headline(n) {
  const who = n.actorName === 'system' ? '' : `${n.actorName} (${n.actorRole.toLowerCase()})`
  switch (n.type) {
    case 'detected':
      return 'Deviation detected · reason needed from the operator'
    case 'reason':
      return `Reason entered by ${who} · waiting for supervisor (level 1)`
    case 'l1':
      return `Approved at level 1 by ${who} · waiting for manager (level 2)`
    case 'rejected':
      return `Rejected by ${who}${n.note ? `: “${n.note}”` : ''} · the operator must edit the reason`
    case 'approved':
      return `Final approval by ${who} · deviation closed`
    default:
      return ''
  }
}

const ACTION_TEXT = {
  detected: 'Add a reason',
  rejected: 'Edit the reason',
  reason: 'Review · level 1',
  l1: 'Final approval · level 2',
}

function when(ts, now) {
  const d = new Date(ts)
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const mins = Math.round((now - ts) / 60000)
  if (mins >= 0 && mins < 60) return `${clock} · ${mins < 1 ? 'just now' : `${mins} min ago`}`
  return d.toDateString() === new Date(now).toDateString() ? clock : `${d.getDate()}.${d.getMonth() + 1} ${clock}`
}

function useNotifications(user) {
  const [list, setList] = useState(() => notificationsFor(user))
  useEffect(() => {
    const refresh = () => setList(notificationsFor(user))
    refresh()
    // Saved from this tab, another tab, or simply time passing (actions get done elsewhere).
    window.addEventListener(CHANGED, refresh)
    window.addEventListener('storage', refresh)
    const timer = setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener(CHANGED, refresh)
      window.removeEventListener('storage', refresh)
      clearInterval(timer)
    }
  }, [user])
  return list
}

// Bell in the header: unread count, a drop-down list, and a pop-up when something new arrives.
// `onOpenLog(machineId)` opens the machine's parameter log; `onShowHere`, when set, filters the page to what needs action.
export default function NotificationBell({ user, onOpenLog, onShowHere }) {
  const list = useNotifications(user)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'action' | 'unread'
  const [toast, setToast] = useState(null)
  const seen = useRef(null) // ids already known in this session, so only new ones pop up
  const ref = useRef(null)
  const panelId = useId()

  const unread = list.filter((n) => n.unread)
  const actions = list.filter((n) => n.action)
  const shown = list.filter((n) => (filter === 'action' ? n.action : filter === 'unread' ? n.unread : true)).slice(0, 60)

  // A pop-up for each new arrival; on sign-in, one summary of what is waiting.
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(list.map((n) => n.id))
      if (unread.length) {
        setToast({ tone: actions.length ? 'red' : 'yellow', title: `${unread.length} unread notification${unread.length === 1 ? '' : 's'}`, text: actions.length ? `${actions.length} need your action` : 'Open the bell to read them' })
      }
      return
    }
    const fresh = list.filter((n) => !seen.current.has(n.id))
    fresh.forEach((n) => seen.current.add(n.id))
    if (fresh.length) {
      const n = fresh[0]
      setToast({ tone: TYPES[n.type].tone, title: `${n.machineId} · ${n.param}`, text: headline(n), id: n.id, machineId: n.machineId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the list changes
  }, [list])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  // Click outside or Escape closes the list.
  useEffect(() => {
    if (!open) return
    function close(e) {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  function openItem(n) {
    markRead(user, [n.id])
    setOpen(false)
    setToast(null)
    onOpenLog(n.machineId)
  }

  const now = Date.now()

  return (
    <div className="nbell" ref={ref}>
      <button
        type="button"
        className="dash-header__bell"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications: ${unread.length} unread, ${actions.length} need your action`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="icon">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
        </svg>
        {unread.length > 0 && <span className="dash-header__badge mono">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>

      {open && (
        <section id={panelId} className="npanel" aria-label="Notifications">
          <header className="npanel__head">
            <div>
              <h2 className="mono">Notifications</h2>
              <p>
                {unread.length} unread · {actions.length} need your action
              </p>
            </div>
            <button
              type="button"
              className="npanel__link mono"
              disabled={!unread.length}
              onClick={() => markRead(user, unread.map((n) => n.id))}
            >
              Mark all read
            </button>
          </header>

          <div className="npanel__tabs mono" role="group" aria-label="Show">
            {[
              ['all', `All ${list.length}`],
              ['action', `Needs me ${actions.length}`],
              ['unread', `Unread ${unread.length}`],
            ].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="npanel__empty">Nothing here.</p>
          ) : (
            <ul className="npanel__list">
              {shown.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`nitem nitem--${TYPES[n.type].tone} ${n.unread ? 'is-unread' : ''}`}
                    onClick={() => openItem(n)}
                  >
                    <span className="nitem__dot" aria-hidden="true" />
                    <span className="nitem__body">
                      <span className="nitem__top mono">
                        <strong>
                          {n.machineId} · {n.param}
                        </strong>
                        <span>{when(n.ts, now)}</span>
                      </span>
                      <span className="nitem__text">{headline(n)}</span>
                      <span className="nitem__detail mono">{n.detail}</span>
                      {n.action && <span className="nitem__action mono">Your action · {ACTION_TEXT[n.type]} →</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {onShowHere && actions.length > 0 && (
            <footer className="npanel__foot">
              <button
                type="button"
                className="npanel__link mono"
                onClick={() => {
                  setOpen(false)
                  onShowHere()
                }}
              >
                Show what needs me on this page →
              </button>
            </footer>
          )}
        </section>
      )}

      {toast && !open && (
        <div className={`ntoast ntoast--${toast.tone}`} role="status">
          <span className="nitem__dot" aria-hidden="true" />
          <button
            type="button"
            className="ntoast__body"
            onClick={() => {
              if (toast.machineId) openItem({ id: toast.id, machineId: toast.machineId })
              else setOpen(true)
              setToast(null)
            }}
          >
            <strong className="mono">{toast.title}</strong>
            <span>{toast.text}</span>
          </button>
          <button type="button" className="ntoast__close" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
