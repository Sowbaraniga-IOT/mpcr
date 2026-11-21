import ShiftMaster from './ShiftMaster.jsx'
import MachineMaster from './MachineMaster.jsx'
import ParameterMaster from './ParameterMaster.jsx'
import UserManagement from './UserManagement.jsx'
import AuditTrail from './AuditTrail.jsx'
import { can, canChange } from '../../store/users.js'
import './Settings.css'
import './SettingsPages.css'

export const SETTINGS_PAGES = [
  { key: 'shifts', label: 'Shift master', sub: 'Shifts & reading interval', permission: 'shiftMaster' },
  { key: 'machines', label: 'Machine master', sub: 'Machines, molds, standards', permission: 'machineMaster' },
  { key: 'parameters', label: 'Parameter master', sub: 'Standard values · limits', permission: 'parameters' },
  { key: 'users', label: 'User management', sub: 'Users, roles, access', permission: 'users' },
  { key: 'audit', label: 'Audit trail', sub: 'Every settings change', permission: 'audit' },
]

// Each role sees only the Settings pages it is ticked for (Settings → User Management → role permissions).
export const settingsPagesFor = (user) => SETTINGS_PAGES.filter((p) => can(user, p.permission))
export const canOpenSettings = (user) => settingsPagesFor(user).length > 0

export default function Settings({ page, recipeId, user, onNavigate, onOpenRecipe, onEditImage, imageFor, onChange }) {
  const pages = settingsPagesFor(user)
  const current = pages.find((p) => p.key === page) ?? pages[0]
  // Read-only roles open their pages without edit controls.
  const props = { user, canEdit: canChange(user, current.permission), onChange }

  return (
    <div className="settings">
      <nav className="snav" aria-label="Settings">
        <p className="snav__title mono">Settings</p>
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            className="snav__item"
            aria-current={p.key === current.key ? 'page' : undefined}
            onClick={() => onNavigate(p.key)}
          >
            <span className="mono">{p.label}</span>
            <span>{p.sub}</span>
          </button>
        ))}
        <p className="snav__foot">Changes are logged in the audit trail.</p>
      </nav>

      <div className="settings__page">
        {current.key === 'shifts' && <ShiftMaster {...props} />}
        {current.key === 'machines' && (
          <MachineMaster {...props} onOpenRecipe={onOpenRecipe} onEditImage={onEditImage} imageFor={imageFor} />
        )}
        {current.key === 'parameters' && <ParameterMaster key={recipeId} {...props} recipeId={recipeId} />}
        {current.key === 'users' && <UserManagement {...props} />}
        {current.key === 'audit' && <AuditTrail {...props} />}
      </div>
    </div>
  )
}
