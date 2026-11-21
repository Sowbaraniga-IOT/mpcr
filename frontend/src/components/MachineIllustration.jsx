import './MachineIllustration.css'

// Isometric projection: a 3D point (x along the machine, y across it, z up)
// becomes a 2D point on screen.
function iso(x, y, z) {
  return `${((x - y) * 0.866).toFixed(1)},${((x + y) * 0.5 - z).toFixed(1)}`
}

// A box shows three faces: top, the side facing left (+y) and the end facing right (+x).
function Box({ x, y, z, w, d, h, tone }) {
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const side = [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const end = [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)]
  return (
    <g className={`iso iso--${tone}`}>
      <polygon points={top.join(' ')} className="iso__top" />
      <polygon points={side.join(' ')} className="iso__side" />
      <polygon points={end.join(' ')} className="iso__end" />
    </g>
  )
}

// Listed back to front, so nearer parts paint over farther ones.
const PARTS = [
  { x: 0, y: 0, z: 0, w: 200, d: 40, h: 16, tone: 'bed' },
  { x: 10, y: 4, z: 16, w: 8, d: 32, h: 42, tone: 'metal' }, // rear platen
  { x: 18, y: 10, z: 24, w: 36, d: 20, h: 24, tone: 'metal' }, // toggle clamp
  { x: 54, y: 4, z: 16, w: 8, d: 32, h: 42, tone: 'metal' }, // moving platen
  { x: 62, y: 10, z: 22, w: 12, d: 20, h: 30, tone: 'mould' },
  { x: 74, y: 4, z: 16, w: 8, d: 32, h: 42, tone: 'metal' }, // fixed platen
  { x: 82, y: 16, z: 32, w: 60, d: 8, h: 8, tone: 'metal' }, // barrel
  { x: 108, y: 14, z: 40, w: 12, d: 12, h: 18, tone: 'bed' }, // hopper
  { x: 140, y: 8, z: 16, w: 34, d: 24, h: 30, tone: 'bed' }, // drive unit
  { x: 180, y: 2, z: 16, w: 18, d: 14, h: 52, tone: 'bed' }, // control cabinet
]

export default function MachineIllustration() {
  return (
    <svg viewBox="-42 -62 220 186" className="machine-illustration" role="img" aria-label="Injection moulding machine">
      {PARTS.map((part, i) => (
        <Box key={i} {...part} />
      ))}
      {/* Operator screen on the cabinet */}
      <polygon
        points={[iso(184, 16, 44), iso(194, 16, 44), iso(194, 16, 58), iso(184, 16, 58)].join(' ')}
        className="iso__screen"
      />
    </svg>
  )
}
