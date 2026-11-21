import { useEffect, useRef, useState } from 'react'
import { Field, Panel, ReadOnlyNote, Toggle, formatWhen } from './ui.jsx'
import { MACHINES } from '../../store/machines.js'
import { SHIFT_MASTER } from '../../store/shiftMaster.js'
import {
  ADMIN_ONLY,
  CHANGE_ONLY,
  MATRIX,
  PERMISSIONS,
  READ_ONLY_ROLES,
  ROLES,
  USERS,
  formatAccess,
  saveMatrix,
  saveUser,
} from '../../store/users.js'
import { logChange } from '../../store/store.js'

// Admins always keep user management and the admin-only permissions; no other role can be given those.
// Read-only roles (Viewer) can't be given permissions that only change things.
const isLocked = (role, key) =>
  role === 'Admin'
    ? key === 'users' || ADMIN_ONLY.includes(key)
    : ADMIN_ONLY.includes(key) || (READ_ONLY_ROLES.includes(role) && CHANGE_ONLY.includes(key))

const ROLE_BADGE = {
  Admin: 'sbadge--accent',
  Manager: 'sbadge--ink',
  Supervisor: 'sbadge--ink',
  Operator: 'sbadge--grey',
  Viewer: 'sbadge--muted',
}
const STATUS_BADGE = {
  active: 'sbadge--outline-ok',
  invited: 'sbadge--outline-warn',
  disabled: 'sbadge--outline-muted',
}
const EMPTY = {
  username: '',
  name: '',
  employeeId: '',
  email: '',
  role: 'Operator',
  shift: 'A',
  access: [],
  status: 'invited',
  canLogin: true,
  forceReset: true,
  lastLogin: null,
}

const statusOf = (u) => (!u.canLogin ? 'disabled' : u.status)
const activeAdmins = (except) => USERS.filter((u) => u.role === 'Admin' && u.canLogin && u.username !== except).length

function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="smenu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="smenu__btn"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <ul className="smenu__list">
          {items.map((i) => (
            <li key={i.label}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  i.onClick()
                }}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function UserManagement({ user, canEdit }) {
  const [, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  const me = user.username
  const [editing, setEditing] = useState(() => ({
    ...(USERS.find((u) => u.username === me) ?? USERS[0]),
    isNew: false,
  }))
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const set = (key) => (value) => setEditing((e) => ({ ...e, [key]: value }))
  const record = USERS.find((u) => u.username === editing.username && !editing.isNew)
  // Only an admin creates, edits or appoints admins, and changes the role matrix.
  const isAdmin = user.role === 'Admin'
  const mayEdit = (u) => canEdit && (isAdmin || u?.role !== 'Admin')
  const formEdit = editing.isNew ? canEdit : mayEdit(record)

  function select(u) {
    setEditing({ ...u, isNew: false })
    setErrors({})
    setMessage(null)
  }

  function addUser() {
    setEditing({ ...EMPTY, isNew: true })
    setErrors({})
    setMessage(null)
  }

  async function handleSave() {
    const found = {}
    const username = editing.username.trim().toLowerCase()
    if (!/^[a-z0-9._-]{2,30}$/.test(username)) found.username = 'Lower-case letters, digits, . _ -'
    else if (editing.isNew && USERS.some((u) => u.username === username)) found.username = 'That username is taken'
    if (!editing.name.trim()) found.name = 'Enter the person’s name'
    if (!editing.employeeId.trim()) found.employeeId = 'Enter the employee ID'
    else if (
      USERS.some(
        (u) =>
          u.employeeId.toLowerCase() === editing.employeeId.trim().toLowerCase() && u.username !== editing.username,
      )
    )
      found.employeeId = 'Another user has this ID'
    // Never lock the plant out of user management.
    const losingAdmin = record?.role === 'Admin' && (editing.role !== 'Admin' || !editing.canLogin)
    if (losingAdmin && activeAdmins(record.username) === 0) found.role = 'Keep at least one admin who can log in'
    if (record?.username === me && editing.role !== user.role) found.role = 'You can’t change your own role'
    if (record?.username === me && !editing.canLogin) found.canLogin = 'You can’t switch off your own login'
    const password = editing.password ?? ''
    if (password && password.length < 6) found.password = 'At least 6 characters'
    else if (editing.isNew && !password) found.password = 'Set a password for the new user'
    setErrors(found)
    if (Object.keys(found).length) return

    const { isNew, password: _typed, ...fields } = editing
    // The server stores the password hashed; it never comes back.
    let saved
    try {
      saved = await saveUser(
        {
          ...fields,
          username,
          name: fields.name.trim(),
          employeeId: fields.employeeId.trim().toUpperCase(),
          email: fields.email.trim() || `${username}@mpcr.com`,
        },
        { isNew, password },
      )
    } catch (err) {
      return setMessage({ tone: 'bad', text: err.message })
    }
    logChange(
      user,
      'User management',
      `${isNew ? 'Added' : 'Updated'} ${saved.name} (${saved.role}, access ${formatAccess(saved.access)}${saved.canLogin ? '' : ', login off'}${password ? ', password set' : ''})`,
    )
    setEditing({ ...saved, isNew: false })
    setMessage({
      tone: 'ok',
      text: isNew
        ? `${saved.name} added. They can sign in as “${username}”.`
        : `${saved.name} saved. Changes apply at their next sign-in or page reload.`,
    })
    refresh()
  }

  // Changes to one account are sent to the server; a refusal is shown and nothing changes here.
  async function update(u, changes) {
    try {
      await saveUser({ ...u, ...changes })
      return true
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
      return false
    }
  }

  async function resetPassword(u) {
    if (!(await update(u, { forceReset: true }))) return
    logChange(user, 'User management', `Password reset requested for ${u.name}`)
    if (u.username === editing.username) setEditing((e) => ({ ...e, forceReset: true }))
    setMessage({ tone: 'warn', text: `${u.name} must set a new password at their next sign-in.` })
    refresh()
  }

  async function setLogin(u, canLogin) {
    if (u.username === me) return setMessage({ tone: 'bad', text: 'You can’t switch off your own login.' })
    if (!canLogin && u.role === 'Admin' && activeAdmins(u.username) === 0)
      return setMessage({ tone: 'bad', text: 'Keep at least one admin who can log in.' })
    if (!(await update(u, { canLogin }))) return
    logChange(user, 'User management', `${u.name}: login ${canLogin ? 'switched on' : 'switched off'}`)
    if (u.username === editing.username) setEditing((e) => ({ ...e, canLogin }))
    refresh()
  }

  function togglePermission(role, key, on) {
    if (isLocked(role, key)) return
    MATRIX[role] = on ? [...MATRIX[role], key] : MATRIX[role].filter((k) => k !== key)
    saveMatrix()
    logChange(
      user,
      'User management',
      `${role}: “${PERMISSIONS.find((p) => p.key === key).label}” ${on ? 'allowed' : 'removed'}`,
    )
    refresh()
  }

  const allAccess = editing.access === 'all'
  const accessList = allAccess ? [] : editing.access
  const toggleMachine = (id) =>
    set('access')(accessList.includes(id) ? accessList.filter((x) => x !== id) : [...accessList, id])

  return (
    <div className="spage">
      <div className="spage__main">
        <header className="shead">
          <div>
            <h1>User Management</h1>
            <p>
              {USERS.length} users · {ROLES.length} roles. Roles decide what each person can do.
            </p>
          </div>
          {canEdit && (
            <div className="shead__actions">
              <button type="button" className="sbtn sbtn--primary" onClick={addUser}>
                + Add user
              </button>
            </div>
          )}
        </header>
        {!canEdit && <ReadOnlyNote>Only an admin can change users and roles.</ReadOnlyNote>}
        {canEdit && !isAdmin && (
          <ReadOnlyNote>Admin accounts and the role permissions can only be changed by an admin.</ReadOnlyNote>
        )}

        <div className="stable">
          <table>
            <thead className="mono">
              <tr>
                <th>User</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Shift</th>
                <th>Machine access</th>
                <th>Last login</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {USERS.map((u) => (
                <tr
                  key={u.username}
                  className={u.username === editing.username && !editing.isNew ? 'is-selected' : undefined}
                  onClick={() => select(u)}
                >
                  <td>
                    <span className="suser">
                      <span className={`suser__avatar ${u.username === me ? 'is-you' : ''}`}>{u.name[0]}</span>
                      <span>
                        <span className="stable__strong">
                          {u.name}
                          {u.username === me && ' (you)'}
                        </span>
                        <span className="stable__sub mono">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="mono">{u.employeeId}</td>
                  <td>
                    <span className={`sbadge ${ROLE_BADGE[u.role]}`}>{u.role}</span>
                  </td>
                  <td className="mono">{u.shift ?? '—'}</td>
                  <td>{formatAccess(u.access)}</td>
                  <td className="mono">{formatWhen(u.lastLogin)}</td>
                  <td>
                    <span className={`sbadge ${STATUS_BADGE[statusOf(u)]}`}>{statusOf(u)}</span>
                  </td>
                  <td>
                    {mayEdit(u) && (
                      <RowMenu
                        items={[
                          { label: 'Reset password', onClick: () => resetPassword(u) },
                          {
                            label: u.canLogin ? 'Switch off login' : 'Switch on login',
                            onClick: () => setLogin(u, !u.canLogin),
                          },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Panel
        title={editing.isNew ? 'Add user' : 'Role permissions'}
        footer={
          formEdit && (
            <>
              <button
                type="button"
                className="sbtn"
                disabled={editing.isNew}
                onClick={() => record && resetPassword(record)}
              >
                Reset PW
              </button>
              <button type="button" className="sbtn sbtn--primary" onClick={handleSave}>
                Save user
              </button>
            </>
          )
        }
      >
        <div>
          <h3 className="sperm__title">What each role can do</h3>
          <p className="spanel__hint">
            {editing.isNew ? 'New user' : `Selected user ${editing.name}`} is{' '}
            {/^[AEIOU]/.test(editing.role) ? 'an' : 'a'} {editing.role}.
          </p>
        </div>
        <table className="sperm">
          <thead className="mono">
            <tr>
              <th>
                <span className="visually-hidden">Permission</span>
              </th>
              {ROLES.map((r) => (
                <th key={r.key} className={r.key === editing.role ? 'is-role' : undefined}>
                  {r.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                {ROLES.map((r) => {
                  const on = MATRIX[r.key].includes(p.key)
                  const locked = !canEdit || !isAdmin || isLocked(r.key, p.key)
                  return (
                    <td key={r.key} className={r.key === editing.role ? 'is-role' : undefined}>
                      {canEdit || on ? (
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          aria-label={`${r.key}: ${p.label}`}
                          title={ADMIN_ONLY.includes(p.key) ? 'Admin only' : undefined}
                          onChange={(e) => togglePermission(r.key, p.key, e.target.checked)}
                        />
                      ) : (
                        <span className="sperm__no">–</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {editing.isNew && (
          <>
            <div className="spanel__row">
              <Field label="Username" error={errors.username}>
                {(id) => (
                  <input
                    id={id}
                    value={editing.username}
                    onChange={(e) => set('username')(e.target.value)}
                    placeholder="operator"
                  />
                )}
              </Field>
              <Field label="Employee ID" error={errors.employeeId}>
                {(id) => (
                  <input
                    id={id}
                    value={editing.employeeId}
                    onChange={(e) => set('employeeId')(e.target.value)}
                    placeholder="EMP-1300"
                  />
                )}
              </Field>
            </div>
            <Field label="Name" error={errors.name}>
              {(id) => (
                <input
                  id={id}
                  value={editing.name}
                  onChange={(e) => set('name')(e.target.value)}
                  placeholder="Operator"
                />
              )}
            </Field>
            <Field label="Email (optional)">
              {(id) => (
                <input
                  id={id}
                  value={editing.email}
                  onChange={(e) => set('email')(e.target.value)}
                  placeholder={`${editing.username || 'name'}@plant01`}
                />
              )}
            </Field>
          </>
        )}

        <div className="spanel__row">
          <Field label={`Role${editing.isNew ? '' : ` for ${editing.name}`}`} error={errors.role}>
            {(id) => (
              <select id={id} value={editing.role} disabled={!formEdit} onChange={(e) => set('role')(e.target.value)}>
                {ROLES.filter((r) => isAdmin || r.key !== 'Admin' || editing.role === 'Admin').map((r) => (
                  <option key={r.key}>{r.key}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Shift">
            {(id) => (
              <select
                id={id}
                value={editing.shift ?? ''}
                disabled={!formEdit}
                onChange={(e) => set('shift')(e.target.value || null)}
              >
                <option value="">—</option>
                {SHIFT_MASTER.shifts.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <div className="sfield">
          <span className="mono sfield__label">Machine access · {formatAccess(editing.access)}</span>
          <Toggle
            checked={allAccess}
            disabled={!formEdit}
            onChange={(on) => set('access')(on ? 'all' : [])}
            label="All machines"
          />
          {!allAccess && (
            <div className="saccess" role="group" aria-label="Machines this user can use">
              {MACHINES.map((m) => (
                <label key={m.id}>
                  <input
                    type="checkbox"
                    checked={accessList.includes(m.id)}
                    disabled={!formEdit}
                    onChange={() => toggleMachine(m.id)}
                  />
                  {m.id}
                </label>
              ))}
            </div>
          )}
        </div>

        <Field label={editing.isNew ? 'Password' : 'New password'} error={errors.password}>
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              disabled={!formEdit}
              value={editing.password ?? ''}
              onChange={(e) => {
                const password = e.target.value
                // A code set for someone else is temporary, unless the box below is unticked again.
                setEditing((x) => ({ ...x, password, forceReset: password && x.username !== me ? true : x.forceReset }))
              }}
              placeholder={editing.isNew ? 'At least 6 characters' : 'Leave empty to keep the current password'}
            />
          )}
        </Field>

        <Toggle checked={editing.canLogin} disabled={!formEdit} onChange={set('canLogin')} label="Can log in" />
        {errors.canLogin && <p className="sfield__error">{errors.canLogin}</p>}
        <Toggle
          checked={editing.forceReset}
          disabled={!formEdit}
          onChange={set('forceReset')}
          label="Force password reset"
        />
        {message && <p className={`snotice snotice--${message.tone}`}>{message.text}</p>}
      </Panel>
    </div>
  )
}
