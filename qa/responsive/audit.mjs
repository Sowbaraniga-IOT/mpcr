// Responsive audit: opens every page at phone, tablet, laptop and desktop sizes, reports anything
// that makes the page scroll sideways or sticks out of the window, and saves a screenshot of each.
//   node qa/responsive/audit.mjs [--no-build] [--only 390,820] [--pages signin,dashboard]
// Uses its own throw-away SQLite database (qa/responsive/out/), like the e2e run.
import { spawn, spawnSync, execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../e2e/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BACKEND = path.join(ROOT, 'backend')
const FRONTEND = path.join(ROOT, 'frontend')
const PY = path.join(BACKEND, '.venv', 'Scripts', 'python.exe')
const OUT = path.join(ROOT, 'qa', 'responsive', 'out')
const SHOTS = path.join(OUT, 'shots')
const API_PORT = 8003
const WEB_PORT = 4176
const BASE = `http://127.0.0.1:${WEB_PORT}/`
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null }

// name, width, height, touch device?
const DEVICES = [
  ['android-360', 360, 780, true],
  ['iphone-se-375', 375, 667, true],
  ['iphone-15-393', 393, 852, true],
  ['iphone-max-430', 430, 932, true],
  ['iphone-landscape-852', 852, 393, true],
  ['ipad-mini-768', 768, 1024, true],
  ['ipad-air-820', 820, 1180, true],
  ['ipad-pro-1024', 1024, 1366, true],
  ['ipad-landscape-1180', 1180, 820, true],
  ['laptop-1280', 1280, 800, false],
  ['laptop-1366', 1366, 768, false],
  ['macbook-1440', 1440, 900, false],
  ['macbook-1512', 1512, 982, false],
  ['desktop-1920', 1920, 1080, false],
  ['desktop-2560', 2560, 1440, false],
]
const PAGES = [
  ['signin', null],
  ['dashboard', ''],
  ['log', '#/log/J10-25'],
  ['report', '#/report'],
  ['shifts', '#/settings/shifts'],
  ['machines', '#/settings/machines'],
  ['parameters', '#/settings/parameters'],
  ['users', '#/settings/users'],
  ['audit', '#/settings/audit'],
]

const ENV = {
  ...process.env,
  SQLITE_PATH: path.join(OUT, 'responsive.sqlite3'),
  DJANGO_ENV_FILE: 'none.env',
  DJANGO_DEBUG: '0',
  DJANGO_SECRET_KEY: crypto.randomBytes(48).toString('base64url'),
  DJANGO_ALLOWED_HOSTS: 'localhost,127.0.0.1',
  MPCR_BACKEND: `http://127.0.0.1:${API_PORT}`,
}

const run = (args) => {
  const r = spawnSync(PY, args, { cwd: BACKEND, env: ENV, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${args.join(' ')} failed:\n${r.stderr}`)
}
const killTree = (p) => p?.pid && spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
async function waitHttp(url, status) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).status === status) return } catch { /* not up */ }
    await sleep(300)
  }
  throw new Error(`${url} never answered ${status}`)
}

// Measured in the page: sideways scroll, and the elements that stick out furthest past the right edge.
const MEASURE = `(() => {
  const vw = window.innerWidth, doc = document.documentElement
  const zoom = parseFloat(getComputedStyle(doc).zoom) || 1
  const scroll = doc.scrollWidth - doc.clientWidth
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true } return false }
  const out = []
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const s = getComputedStyle(el)
    if (s.position === 'fixed' && s.visibility === 'hidden') continue
    if (r.right > vw + 1 || r.left < -1) if (!clipped(el)) out.push({ el: name(el), left: Math.round(r.left), right: Math.round(r.right) })
  }
  // keep only outermost offenders
  const tiny = [...document.querySelectorAll('button, a, input, select, [role=button], label.checkbox')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 24 || r.width < 24) && getComputedStyle(el).visibility !== 'hidden' }).length
  const inputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')].filter((el) => el.getBoundingClientRect().width).map((el) => parseFloat(getComputedStyle(el).fontSize) * zoom)
  return { vw, zoom: +zoom.toFixed(3), scroll, offenders: out.slice(0, 6), tinyTargets: tiny, smallestInputFont: inputs.length ? Math.min(...inputs).toFixed(1) : null }
})()`

async function main() {
  // A fresh database each run; screenshots from earlier (partial --only) runs are kept.
  for (const f of ['responsive.sqlite3', 'responsive.sqlite3-wal', 'responsive.sqlite3-shm']) fs.rmSync(path.join(OUT, f), { force: true })
  fs.mkdirSync(SHOTS, { recursive: true })
  if (!process.argv.includes('--no-build')) { console.log('• Building'); execSync('npx vite build', { cwd: FRONTEND, stdio: 'ignore' }) }
  run(['manage.py', 'migrate', '-v', '0'])
  run(['manage.py', 'seed'])
  const api = spawn(PY, ['manage.py', 'runserver', `127.0.0.1:${API_PORT}`, '--noreload'], { cwd: BACKEND, env: ENV, stdio: 'ignore' })
  const web = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], { cwd: FRONTEND, env: ENV, shell: true, stdio: 'ignore' })
  const browser = await launch({ port: 9343 })
  const results = []
  try {
    await waitHttp(`${BASE}api/auth/me/`, 401)
    const only = arg('--only')?.split(',').map(Number)
    const pages = arg('--pages')?.split(',')
    for (const [dev, w, h, touch] of DEVICES.filter((d) => !only || only.includes(d[1]))) {
      const page = await browser.newPage({ width: w, height: h, block: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] })
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: touch })
      await page.send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
      for (const [name, hash] of PAGES.filter((p) => !pages || pages.includes(p[0]))) {
        if (name === 'signin') {
          await page.goto(BASE)
          await page.waitFor(`document.querySelectorAll('.card input').length >= 2`, 10000)
        } else {
          if (!(await page.eval(`!!document.querySelector('.dashboard')`))) {
            const ids = await page.eval(`[...document.querySelectorAll('.card input:not([type=checkbox])')].map((i) => i.id)`)
            await page.type(`[id="${ids[0]}"]`, 'admin')
            await page.type(`[id="${ids[1]}"]`, 'admin@2026')
            await page.click('button.submit')
            await page.waitFor(`document.querySelector('.dashboard')`, 15000)
          }
          await page.eval(`location.hash = ${JSON.stringify(hash)}`)
        }
        await sleep(700)
        const m = await page.eval(MEASURE)
        await page.screenshot(path.join(SHOTS, `${name}--${dev}.png`))
        const bad = m.scroll > 1 || m.offenders.length
        results.push({ page: name, device: dev, ...m })
        console.log(`${bad ? '✗' : '✓'} ${name.padEnd(10)} ${dev.padEnd(22)} zoom ${String(m.zoom).padEnd(5)} sideways ${String(m.scroll).padStart(4)}px  tiny ${String(m.tinyTargets).padStart(3)}  inputFont ${m.smallestInputFont ?? '-'}${m.offenders.length ? '  ← ' + m.offenders.map((o) => `${o.el} [${o.left}..${o.right}]`).join(', ') : ''}`)
      }
      await page.close()
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
    await browser.close()
    killTree(api)
    killTree(web)
  }
  const failing = results.filter((r) => r.scroll > 1 || r.offenders.length)
  console.log(`\n${results.length - failing.length}/${results.length} page × device combinations fit without sideways scrolling`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
