import './ThemeToggle.css'

const OPTIONS = [
  { value: 'paper', label: 'Paper', icon: '☀' },
  { value: 'night', label: 'Night', icon: '☾' },
]

// Controlled component: it doesn't own the theme, it receives it
// from App (`theme`) and reports clicks back up (`onChange`).
export default function ThemeToggle({ theme, onChange }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="theme-toggle__btn mono"
          aria-pressed={theme === opt.value}
          onClick={() => onChange(opt.value)}
        >
          <span aria-hidden="true">{opt.icon}</span> {opt.label}
        </button>
      ))}
    </div>
  )
}
