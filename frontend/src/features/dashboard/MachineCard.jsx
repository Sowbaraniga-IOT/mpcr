import { useState } from 'react'
import MachineIllustration from '../../components/MachineIllustration.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { PARAMETERS, formatValue } from '../../store/machines.js'
import { ALERT_LEVELS, alertLabel } from '../../store/parameterLog.js'
import './MachineCard.css'

export function UploadIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="icon">
      <path d="M12 15V4M7 9l5-5 5 5M4 15v5h16v-5" />
    </svg>
  )
}

// `image` is 'default' (the drawing), { src, fit } (an uploaded photo) or null (none yet).
// Picking or dropping a file doesn't happen here: `onEditImage` opens the image dialog.
// Without `onEditImage` (the user may not change machine photos) the card shows the picture only.
// `alert` (admins only) is today's deviation state from the parameter log; it makes the card blink or glow.
export default function MachineCard({
  machine,
  image,
  selected,
  alert,
  onSelect,
  onEditImage,
  onRemoveImage,
  onOpenLog,
}) {
  const [dragging, setDragging] = useState(false)

  // Image controls sit inside the clickable card, so they stop the click from opening the log.
  const openDialog = (e) => {
    e.stopPropagation()
    onEditImage(machine)
  }

  const dropHandlers = {
    onDragOver: (e) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault()
      setDragging(false)
      onEditImage(machine, e.dataTransfer.files[0])
    },
  }

  const { status, deviations } = machine
  const editable = Boolean(onEditImage)

  return (
    <article
      className={`mcard mcard--${status} ${selected ? 'is-selected' : ''} ${alert?.level ? `has-alert has-alert--${alert.level}` : ''}`}
      onClick={() => onSelect(machine.id)}
    >
      {image || !editable ? (
        <div
          className={`mcard__media ${dragging ? 'is-dragging' : ''}`}
          onClick={editable ? (e) => e.stopPropagation() : undefined}
          {...(editable ? dropHandlers : {})}
        >
          {!image || image === 'default' ? (
            <MachineIllustration />
          ) : (
            <img src={image.src} alt={machine.name} style={{ objectFit: image.fit }} />
          )}

          {editable && (
            <>
              <button
                type="button"
                className="mcard__corner"
                onClick={openDialog}
                aria-label={`Change image for ${machine.name}`}
              >
                <UploadIcon />
              </button>

              <div className="mcard__overlay">
                <button type="button" className="mcard__change mono" onClick={openDialog} tabIndex={-1}>
                  <UploadIcon /> Change image
                </button>
                <span className="mcard__hint mono">JPG / PNG / WEBP · Max 5 MB</span>
                <button type="button" className="mcard__remove mono" onClick={() => onRemoveImage(machine.id)}>
                  {' '}
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={`mcard__drop ${dragging ? 'is-dragging' : ''}`}
          onClick={openDialog}
          {...dropHandlers}
        >
          <UploadIcon />
          <span className="mcard__drop-title mono">Upload machine image</span>
          <span className="mcard__drop-hint">Drag &amp; drop or click · JPG / PNG</span>
        </button>
      )}

      <div className="mcard__body">
        <div className="mcard__title">
          <h3>{machine.name}</h3>
          <StatusBadge status={status} />
        </div>
        <p className="mcard__meta mono">
          {machine.id} · {machine.mold}
        </p>

        <dl className="mcard__stats">
          {PARAMETERS.map((p) => (
            <div key={p.key}>
              <dt className="mono">{p.label}</dt>
              <dd>
                {formatValue(machine[p.key], p.digits)}
                {machine[p.key] != null && <span className="mcard__unit">{p.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>

        <div
          className="mcard__progress"
          role="progressbar"
          aria-label="Shift shot target"
          aria-valuenow={machine.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${machine.progress}%` }} />
        </div>

        <p className="mcard__log mono">
          <span>Last log {machine.lastLog}</span>
          {alert ? (
            <span
              className={alert.level ? 'is-alert' : 'is-ok'}
              title={ALERT_LEVELS.find((l) => l.key === alert.level)?.hint}
            >
              {alert.level ? `${alert.total} dev · ${alertLabel(alert)}` : 'No dev'}
            </span>
          ) : (
            <span className={deviations ? 'is-dev' : 'is-ok'}>{deviations ? `${deviations} dev` : 'No dev'}</span>
          )}
        </p>

        <button
          type="button"
          className="mcard__action mono"
          onClick={(e) => {
            e.stopPropagation()
            onOpenLog(machine)
          }}
        >
          Parameter log →
        </button>
      </div>
    </article>
  )
}
