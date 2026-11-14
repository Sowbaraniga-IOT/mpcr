import { STATUSES } from '../store/machines.js'
import './StatusBadge.css'

export default function StatusBadge({ status }) {
  const { short } = STATUSES.find((s) => s.key === status)
  return <span className={`status-badge status-badge--${status} mono`}>{short}</span>
}
