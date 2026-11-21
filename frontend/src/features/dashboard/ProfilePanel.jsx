import { useState } from 'react'
import { currentShift } from '../../store/shifts.js'
import { DISPLAY_SIZES, getDisplaySize, setDisplaySize } from '../../utils/scale.js'
import './ProfilePanel.css'

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

// The panel that drops down from the user button in the header.
export default function ProfilePanel({ id, user, onSignOut, onChangePassword }) {
  const shift = currentShift()
  const [size, setSize] = useState(getDisplaySize)

  const details = [
    { label: 'Operator ID', value: user.displayName, accent: true },
    { label: 'Role', value: user.role },
    { label: 'Plant', value: 'Plant 01' },
    { label: 'Shift', value: `${shift.key} · ${shift.hours}` },
    { label: 'Signed in', value: user.signedInAt ? formatTime(user.signedInAt) : '—' },
    { label: 'Session', value: user.remember ? 'This device' : 'This tab only' },
  ]

  return (
    <section id={id} className="profile" aria-label="Your profile">
      <div className="profile__bar mono">
        <span>Operator profile</span>
        <span className="profile__live">
          <span className="profile__dot" aria-hidden="true" /> On shift
        </span>
      </div>

      <div className="profile__identity">
        <span className="profile__avatar" aria-hidden="true">
          {user.displayName[0]}
        </span>
        <div className="profile__who">
          <p className="profile__name">{user.displayName}</p>
          <p className="profile__email">{user.name}</p>
          <span className="profile__role mono">{user.role}</span>
        </div>
      </div>

      <dl className="profile__details">
        {details.map((d) => (
          <div key={d.label}>
            <dt className="mono">{d.label}</dt>
            <dd className={d.accent ? 'is-accent' : undefined}>{d.value}</dd>
          </div>
        ))}
      </dl>

      <div className="profile__shift">
        <p className="profile__shift-label mono">
          <span>Shift {shift.key} progress</span>
          <span>{formatDuration(shift.minutesLeft)} left</span>
        </p>
        <div
          className="profile__track"
          role="progressbar"
          aria-label={`Shift ${shift.key} progress`}
          aria-valuenow={Math.round(shift.elapsed * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${shift.elapsed * 100}%` }} />
        </div>
      </div>

      <div className="profile__size">
        <span className="mono">Display size</span>
        <div className="profile__size-options mono" role="group" aria-label="Display size">
          {DISPLAY_SIZES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={size === s.key}
              onClick={() => {
                setDisplaySize(s.key)
                setSize(s.key)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="profile__actions">
        <button type="button" className="link" onClick={onChangePassword}>
          Change access code →
        </button>
        <button type="button" className="profile__signout mono" onClick={onSignOut}>
          <span>Sign out</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
