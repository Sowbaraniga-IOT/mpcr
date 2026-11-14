import { useEffect, useState } from 'react'
import './MachineDrawing.css'

// Numbered balloons. `at` = where the balloon sits, `to` = what it points at.
// Each balloon lights up while its part is working in the cycle (see callout-* keyframes).
const CALLOUTS = [
  { n: 1, label: 'Hopper', at: [625, 312], to: [761, 427] },
  { n: 2, label: 'Heater bands', at: [937, 344], to: [864, 547] },
  { n: 3, label: 'Screw', at: [1041, 490], to: [916, 583] },
  { n: 4, label: 'Mould', at: [416, 344], to: [520, 525] },
  { n: 5, label: 'Toggle clamp', at: [187, 344], to: [343, 499] },
]

const HEATER_X = [696, 743, 791, 839, 887]
const FEET_X = [157, 428, 698, 970]

// One moulding cycle, in step with the keyframes in MachineDrawing.css (percent of CYCLE_MS).
const CYCLE_MS = 6000
const PHASES = [
  { key: 'close', label: 'Clamp closing' },
  { key: 'inject', label: 'Injecting' },
  { key: 'hold', label: 'Holding pressure' },
  { key: 'cool', label: 'Cooling · screw recovery' },
  { key: 'open', label: 'Mould opening' },
  { key: 'eject', label: 'Ejecting part' },
]
const PELLETS = [
  [770, 0],
  [786, 0.25],
  [778, 0.5],
  [795, 0.75],
]

// Injection pressure over one cycle: [percent of the cycle, pressure 0–1]. Drawn as the "process monitor" chart.
const PRESSURE = [
  [0, 0],
  [12, 0],
  [14, 0.05],
  [22, 0.8],
  [28, 1],
  [30, 0.88],
  [31, 0.6],
  [40, 0.55],
  [42, 0.12],
  [46, 0.1],
  [58, 0.1],
  [60, 0],
  [100, 0],
]
const CHART = { x: 420, y: 975, w: 410, h: 90 }
const PRESSURE_PATH = PRESSURE.map(
  ([p, v], i) => `${i ? 'L' : 'M'}${CHART.x + (p / 100) * CHART.w} ${CHART.y - v * CHART.h}`,
).join(' ')
const CHART_MARKS = [
  [6, 'CLOSE'],
  [21, 'INJECT'],
  [35, 'HOLD'],
  [51, 'COOL'],
  [68, 'OPEN'],
  [87, 'EJECT'],
]

// Build the screw flight zigzag as an SVG "points" string.
const SCREW_POINTS = Array.from({ length: 11 }, (_, i) => {
  const x = 688 + i * 23
  const y = i % 2 === 0 ? 600 : 566
  return `${x},${y}`
}).join(' ')

function Callout({ n, label, at, to }) {
  const [cx, cy] = at
  const [tx, ty] = to
  return (
    <g className={`callout callout--${n}`}>
      <line x1={cx} y1={cy} x2={tx} y2={ty} className="accent-thin" />
      <circle cx={tx} cy={ty} r="3.5" className="accent-fill" />
      <circle cx={cx} cy={cy} r="16" className="balloon" />
      <text x={cx} y={cy + 5} className="balloon__num">
        {n}
      </text>
      <text x={cx + 25} y={cy - 12} className="label">
        {label.toUpperCase()}
      </text>
    </g>
  )
}

// The mould cavity (the red "]" shape). Reused in the detail view, scaled up.
function Cavity(props) {
  return <path {...props} className="cavity" d="M0 0 H24 V44 H0 V36 H16 V8 H0 Z M24 22 H44" />
}

// `running` speeds the cycle up while a sign-in is in progress.
export default function MachineDrawing({ running = false }) {
  // Shot counter beside the drawing: one shot per cycle, faster while signing in.
  const [shots, setShots] = useState(12480)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setShots((n) => n + 1), running ? CYCLE_MS / 5 : CYCLE_MS)
    return () => clearInterval(timer)
  }, [running])

  return (
    <figure className={`drawing ${running ? 'is-running' : ''}`}>
      {/* viewBox uses the same coordinates as the design file,
          so numbers can be copied straight from the mockup. */}
      <svg viewBox="60 270 1080 760" role="img" aria-labelledby="drawing-title" className="drawing__svg">
        <title id="drawing-title">
          Injection moulding machine: toggle clamp, mould, hopper, heater bands and screw
        </title>

        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0 1 L10 5 L0 9 z" className="dim-fill" />
          </marker>
        </defs>

        {/* Centre line */}
        <line x1="115" y1="583" x2="1095" y2="583" className="centerline" />

        {/* Motor */}
        <rect x="146" y="510" width="124" height="146" rx="4" className="ink" />

        {/* Platens: rear and fixed stay put, the moving platen travels with the clamp */}
        {[271, 615].map((x) => (
          <g key={x}>
            <rect x={x} y="468" width="31" height="229" className="ink" />
            <line x1={x} y1="490" x2={x + 31} y2="490" className="ink" />
            <line x1={x} y1="677" x2={x + 31} y2="677" className="ink" />
          </g>
        ))}

        {/* Tie bars */}
        <line x1="302" y1="490" x2="615" y2="490" className="ink" />
        <line x1="302" y1="677" x2="615" y2="677" className="ink" />

        {/* Toggle linkage: folds as the clamp opens */}
        <g className="anim-toggle">
          <polyline points="302,500 370,551 437,500" className="ink" />
          <polyline points="302,665 370,614 437,665" className="ink" />
          <circle cx="370" cy="551" r="5" className="ink" />
          <circle cx="370" cy="614" r="5" className="ink" />
          <line x1="370" y1="556" x2="370" y2="567" className="ink" />
          <line x1="370" y1="598" x2="370" y2="609" className="ink" />
          <rect x="344" y="567" width="52" height="31" className="ink" />
          <line x1="302" y1="583" x2="344" y2="583" className="ink" />
          <line x1="396" y1="583" x2="438" y2="583" className="ink" />
        </g>

        {/* Moving platen and moving mould half */}
        <g className="anim-clamp">
          <rect x="438" y="468" width="31" height="229" className="ink" />
          <line x1="438" y1="490" x2="469" y2="490" className="ink" />
          <line x1="438" y1="677" x2="469" y2="677" className="ink" />
          <rect x="469" y="520" width="72" height="126" className="ink" />
        </g>

        {/* Fixed mould half */}
        <rect x="541" y="520" width="74" height="126" className="ink" />

        {/* The moulded part: fills during injection, drops out on ejection */}
        <g className="anim-part">
          <Cavity transform="translate(519 550) scale(1 1.5)" />
        </g>
        <circle cx="541" cy="583" r="65" className="accent-dashed" />

        {/* Melt pushed through the nozzle while injecting */}
        <line x1="688" y1="583" x2="563" y2="583" className="anim-melt" />

        {/* Nozzle */}
        <polygon points="646,575 677,560 677,606 646,591" className="ink" />

        {/* Barrel, heater bands, screw */}
        <rect x="677" y="551" width="260" height="63" className="ink" />
        {HEATER_X.map((x) => (
          <rect key={x} x={x} y="543" width="30" height="79" className="ink heater" />
        ))}
        {/* Screw: pushes forward to inject, turns back while it doses the next shot */}
        <g className="anim-screw">
          <g className="anim-screw__turn">
            <polyline points={SCREW_POINTS} className="ink" />
          </g>
        </g>

        {/* Hopper */}
        <polygon points="719,416 844,416 803,520 761,520" className="ink" />
        <line x1="761" y1="520" x2="761" y2="551" className="ink" />
        <line x1="803" y1="520" x2="803" y2="551" className="ink" />
        {PELLETS.map(([x, delay]) => (
          <circle key={x} cx={x} cy="470" r="4" className="anim-pellet" style={{ animationDelay: `${delay}s` }} />
        ))}

        {/* Drive unit */}
        <rect x="937" y="531" width="115" height="104" rx="4" className="ink" />
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={955 + i * 13} y1="542" x2={955 + i * 13} y2="624" className="ink-thin" />
        ))}

        {/* Machine bed */}
        <rect x="125" y="718" width="958" height="52" className="ink" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={166 + i * 125} y1="728" x2={208 + i * 125} y2="760" className="ink-thin" />
        ))}
        {FEET_X.map((x) => (
          <rect key={x} x={x} y="770" width="62" height="17" className="ink" />
        ))}

        {/* Dimensions */}
        <line x1="104" y1="490" x2="104" y2="677" className="dim" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
        <text x="80" y="588" className="label label--center">
          460
        </text>

        <line x1="677" y1="651" x2="937" y2="651" className="dim" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
        <text x="807" y="642" className="label label--center">
          Ø40 SCREW · L/D 22
        </text>

        <line x1="125" y1="832" x2="854" y2="832" className="dim" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
        <text x="490" y="824" className="label label--center">
          CLAMP 180 t · SHOT 285 cm³
        </text>

        {/* Process monitor: the injection pressure trace is revealed left to right, level with the cursor */}
        <g className="pchart">
          <text x={CHART.x} y={CHART.y - CHART.h - 12} className="label pchart__title">
            INJECTION PRESSURE · bar
          </text>
          <text x={CHART.x + CHART.w} y={CHART.y - CHART.h - 12} className="label label--accent pchart__peak">
            PEAK 1 180
          </text>
          <line x1={CHART.x} y1={CHART.y} x2={CHART.x + CHART.w} y2={CHART.y} className="dim" />
          <line x1={CHART.x} y1={CHART.y} x2={CHART.x} y2={CHART.y - CHART.h - 4} className="dim" />
          <line
            x1={CHART.x}
            y1={CHART.y - CHART.h}
            x2={CHART.x + CHART.w}
            y2={CHART.y - CHART.h}
            className="pchart__grid"
          />
          {CHART_MARKS.map(([p, label]) => (
            <text
              key={label}
              x={CHART.x + (p / 100) * CHART.w}
              y={CHART.y + 16}
              className="label label--center pchart__mark"
            >
              {label}
            </text>
          ))}
          <path d={PRESSURE_PATH} className="pchart__ghost" />
          <clipPath id="pchart-reveal">
            <rect
              x={CHART.x}
              y={CHART.y - CHART.h - 6}
              width={CHART.w}
              height={CHART.h + 12}
              className="pchart__reveal"
            />
          </clipPath>
          <path d={PRESSURE_PATH} clipPath="url(#pchart-reveal)" className="pchart__trace" />
          <line x1={CHART.x} y1={CHART.y + 4} x2={CHART.x} y2={CHART.y - CHART.h - 4} className="pchart__cursor" />
        </g>

        {/* Cycle status: the step the animation is on, and a running shot count */}
        <g className="cycle-status">
          <circle cx="133" cy="887" r="5" className="cycle-status__dot" />
          {PHASES.map((p) => (
            <text key={p.key} x="148" y="892" className={`label cycle-status__phase cycle-status__phase--${p.key}`}>
              {p.label.toUpperCase()}
            </text>
          ))}
          <text x="148" y="918" className="label cycle-status__shots">
            {running ? 'SIGNING IN · ' : ''}SHOTS {shots.toLocaleString('en-US')} · CYCLE {running ? '1.2' : '6.0'} s
          </text>
        </g>

        {/* Callouts */}
        {CALLOUTS.map((c) => (
          <Callout key={c.n} {...c} />
        ))}

        {/* Detail A: zoomed cavity */}
        <line x1="594" y1="627" x2="930" y2="830" className="accent-thin" />
        <circle cx="1000" cy="895" r="94" className="accent-ring" />
        <rect x="937" y="833" width="125" height="125" className="ink" />
        <line x1="1000" y1="828" x2="1000" y2="963" className="accent-dashed" />
        <g className="anim-detail">
          <Cavity transform="translate(970 862) scale(1.4 1.5)" />
        </g>
        <text x="1000" y="1016" className="label label--center label--accent">
          DETAIL A · 2:1 · CAVITY
        </text>
      </svg>
    </figure>
  )
}
