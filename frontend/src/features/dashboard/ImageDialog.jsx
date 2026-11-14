import { useEffect, useId, useRef, useState } from 'react'
import MachineCard, { UploadIcon } from './MachineCard.jsx'
import { MACHINES } from '../../store/machines.js'
import './ImageDialog.css'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024
const MIN_WIDTH = 800
const MIN_HEIGHT = 450
// Photos are shrunk to this width before saving, so dozens fit in browser storage.
const STORED_WIDTH = 1280

const FITS = [
  { value: 'cover', label: 'Fill (crop)' },
  { value: 'contain', label: 'Fit (whole)' },
]

// Read a File into a data URL, reporting progress (0–100) as it goes.
function readFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file is not a readable image.'))
    img.src = src
  })
}

function shrink(img) {
  const scale = Math.min(1, STORED_WIDTH / img.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

// `current` is what the card shows now ('default', { src, fit } or null).
// `initialFile` is set when a photo was dropped straight onto the card.
export default function ImageDialog({ machine, current, initialFile, onSave, onClose }) {
  const dialogRef = useRef(null)
  const fileInput = useRef(null)
  const job = useRef(0) // bumps on every new file, so a slow old one can't overwrite it
  const titleId = useId()

  const [file, setFile] = useState(null) // { name, size, width?, height?, src? }
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [fit, setFit] = useState(current?.fit ?? 'cover')
  const [applyToModel, setApplyToModel] = useState(false)

  const sameModel = MACHINES.filter((m) => m.model === machine.model).length

  // Open as a modal: the browser handles the backdrop, focus trap and Escape.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
  }, [])

  async function handleFile(picked) {
    if (!picked) return
    const id = ++job.current
    setError('')
    if (!ACCEPTED_TYPES.includes(picked.type)) return setError('Use a JPG, PNG or WEBP file.')
    if (picked.size > MAX_BYTES) return setError(`That file is ${formatBytes(picked.size)}. The limit is 5 MB.`)

    setFile({ name: picked.name, size: picked.size })
    setProgress(0)
    try {
      const raw = await readFile(picked, (p) => id === job.current && setProgress(p))
      const img = await loadImage(raw)
      const { naturalWidth: width, naturalHeight: height } = img
      if (width < MIN_WIDTH || height < MIN_HEIGHT) {
        throw new Error(`This photo is ${width} × ${height} px. It needs to be at least ${MIN_WIDTH} × ${MIN_HEIGHT} px.`)
      }
      if (id === job.current) setFile({ name: picked.name, size: picked.size, width, height, src: shrink(img) })
    } catch (err) {
      if (id !== job.current) return
      setError(err.message)
      setFile(null)
    }
  }

  // A photo dropped on the card starts processing as soon as the dialog opens.
  useEffect(() => {
    if (initialFile) handleFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on open
  }, [])

  function clearFile() {
    job.current++
    setFile(null)
    setError('')
  }

  const close = () => dialogRef.current.close() // fires onClose below

  // The preview uses the new photo, or the existing one with the chosen fit.
  const newPhoto = file?.src ? { src: file.src, fit } : null
  const hasPhoto = current && current !== 'default'
  const preview = newPhoto ?? (hasPhoto ? { ...current, fit } : current)
  // Save needs a new photo, or a new fit for the photo already there.
  const canSave = Boolean(newPhoto) || (hasPhoto && fit !== current.fit)

  function handleSave() {
    onSave(preview, { applyToModel })
    close()
  }

  return (
    <dialog
      ref={dialogRef}
      className="img-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dimmed backdrop lands on the <dialog> itself.
      onClick={(e) => e.target === dialogRef.current && close()}
      // A photo dropped outside the drop zone must not make the browser open it.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <header className="img-dialog__bar">
        <h2 id={titleId} className="mono">
          Machine image · {machine.name} · {machine.id}
        </h2>
        <button type="button" className="img-dialog__close" onClick={close} aria-label="Close">
          ×
        </button>
      </header>

      <div className="img-dialog__body">
        {/* ---------- 1 · Upload ---------- */}
        <section className="img-dialog__upload">
          <h3 className="img-dialog__step mono">1 · Upload</h3>

          <div
            className={`img-drop ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFile(e.dataTransfer.files[0])
            }}
          >
            <span className="img-drop__icon">
              <UploadIcon size={52} />
            </span>
            <p className="img-drop__title">Drag &amp; drop the machine photo here</p>
            <p className="img-drop__or">or</p>
            <button type="button" className="img-dialog__primary mono" onClick={() => fileInput.current.click()}>
              Browse files
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="visually-hidden"
              tabIndex={-1}
              onChange={(e) => {
                handleFile(e.target.files[0])
                e.target.value = '' // allow picking the same file again
              }}
            />
          </div>

          <p className="img-dialog__hint">
            JPG, PNG or WEBP · max 5 MB · at least {MIN_WIDTH} × {MIN_HEIGHT} px · landscape works best
          </p>

          {error && (
            <p className="img-dialog__error" role="alert">
              {error}
            </p>
          )}

          {file && (
            <div className="img-file">
              <span className="img-file__thumb">{file.src && <img src={file.src} alt="" />}</span>
              <span className="img-file__info">
                <span className="img-file__name">{file.name}</span>
                <span className="img-file__meta mono">
                  {formatBytes(file.size)}
                  {file.width && ` · ${file.width} × ${file.height}`}
                </span>
              </span>
              <span className="img-file__status">
                <span className="img-file__track">
                  <span style={{ width: `${file.src ? 100 : progress}%` }} />
                </span>
                <span className={`mono ${file.src ? 'is-ready' : ''}`} role="status">
                  {file.src ? '✓ Ready' : `Processing… ${progress}%`}
                </span>
              </span>
              <button type="button" className="img-file__clear" onClick={clearFile} aria-label="Remove this file">
                ×
              </button>
            </div>
          )}

          <p className="img-dialog__note">
            The image is saved for this machine and shown on its dashboard card.
          </p>
        </section>

        {/* ---------- 2 · Preview ---------- */}
        <section className="img-dialog__preview">
          <h3 className="img-dialog__step mono">2 · Preview on card</h3>

          {/* `inert`: the preview card looks real but can't be clicked or focused */}
          <div className="img-dialog__card" inert>
            <MachineCard
              machine={machine}
              image={preview}
              selected={false}
              onSelect={() => {}}
              onEditImage={() => {}}
              onRemoveImage={() => {}}
              onOpenLog={() => {}}
            />
          </div>

          <p className="img-dialog__step mono">Fit</p>
          <div className="segmented" role="group" aria-label="How the photo fills the card">
            {FITS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="segmented__btn mono"
                aria-pressed={fit === f.value}
                onClick={() => setFit(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <label className="switch">
            <input type="checkbox" checked={applyToModel} onChange={(e) => setApplyToModel(e.target.checked)} />
            <span className="switch__track" aria-hidden="true" />
            Use for all {sameModel} machines of this model
            <span className="switch__model mono">{machine.model}</span>
          </label>
        </section>
      </div>

      <footer className="img-dialog__footer">
        <button type="button" className="img-dialog__secondary mono" onClick={close}>
          Cancel
        </button>
        <button type="button" className="img-dialog__primary mono" onClick={handleSave} disabled={!canSave}>
          Save image
        </button>
      </footer>
    </dialog>
  )
}
