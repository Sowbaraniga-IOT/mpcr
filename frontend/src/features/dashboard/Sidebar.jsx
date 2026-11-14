import './Sidebar.css'

const ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z' },
  { key: 'report', label: 'Report', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 17v-3M12 17v-6M15 17v-4' },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2l2 3 3.5-1 .5 3.5 3 2-2 3 2 3-3 2-.5 3.5-3.5-1-2 3-2-3-3.5 1-.5-3.5-3-2 2-3-2-3 3-2 .5-3.5 3.5 1z',
  },
]

// `hidden`: section keys the signed-in role may not open.
export default function Sidebar({ active, hidden = [], onChange }) {
  return (
    <nav className="sidebar" aria-label="Main">
      {ITEMS.filter((item) => !hidden.includes(item.key)).map((item) => (
        <button
          key={item.key}
          type="button"
          className="sidebar__item mono"
          aria-current={active === item.key ? 'page' : undefined}
          onClick={() => onChange(item.key)}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" className="icon">
            <path d={item.icon} />
          </svg>
          {item.label}
        </button>
      ))}
      <p className="sidebar__version mono">v{__APP_VERSION__}</p>
    </nav>
  )
}
