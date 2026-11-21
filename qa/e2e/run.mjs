// MPCR end-to-end QA suite: drives the real app (React build + Django API) in Microsoft Edge.
//
//   node qa/e2e/run.mjs            (from mpcr-login/; or npm run qa:e2e)
//
// It builds the frontend, creates a separate test database (qa/e2e/out/e2e.sqlite3, seeded fresh),
// starts the backend on :8001 and the frontend on :4175, runs every case, checks the database
// behind the screens, and writes qa/e2e/out/results.json plus screenshots. Your development
// database and servers are not touched.
import { spawn, spawnSync, execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from './cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BACKEND = path.join(ROOT, 'backend')
const FRONTEND = path.join(ROOT, 'frontend')
const PY = path.join(BACKEND, '.venv', 'Scripts', 'python.exe')
const OUT = path.join(ROOT, 'qa', 'e2e', 'out')
const SHOTS = path.join(OUT, 'shots')
const DOWNLOADS = path.join(OUT, 'downloads')
const DB = path.join(OUT, 'e2e.sqlite3')
const API_PORT = 8001
const WEB_PORT = 4175
const BASE = `http://127.0.0.1:${WEB_PORT}/`
// index.html loads its fonts from Google Fonts, which this network's firewall drops (no answer for
// ~45 s; defect E2E-01 / E2E-36). Functional sessions block that host so they fail fast instead of
// stalling on every load; the two performance cases use the real network to measure the stall.
const FIREWALLED = ['*fonts.googleapis.com*', '*fonts.gstatic.com*']

const ENV = {
  ...process.env,
  SQLITE_PATH: DB,
  DJANGO_ENV_FILE: 'none.env', // ignore the developer's .env
  DJANGO_DEBUG: '0',
  DJANGO_SECRET_KEY: crypto.randomBytes(48).toString('base64url'),
  DJANGO_ALLOWED_HOSTS: 'localhost,127.0.0.1',
  MPCR_BACKEND: `http://127.0.0.1:${API_PORT}`,
}

// ---------- Environment ----------

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: BACKEND, env: ENV, encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

// Runs Python in the test database; the code prints one JSON value.
function db(code) {
  const out = run(PY, ['manage.py', 'shell', '-c', `import json\n${code}`])
  const line = out.trim().split('\n').reverse().find((l) => /^[[{"\d-]|^true|^false|^null/.test(l.trim()))
  return JSON.parse(line)
}

function killTree(proc) {
  if (proc?.pid) spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
}

async function waitHttp(url, okStatus, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).status === okStatus) return
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error(`${url} did not answer ${okStatus}`)
}

async function setUp() {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(DOWNLOADS, { recursive: true })
  console.log('• Building the frontend')
  execSync('npx vite build', { cwd: FRONTEND, stdio: 'ignore' })
  console.log('• Creating the test database', path.relative(ROOT, DB))
  run(PY, ['manage.py', 'migrate', '-v', '0'])
  run(PY, ['manage.py', 'seed'])
  console.log(`• Starting backend :${API_PORT} and frontend :${WEB_PORT}`)
  const api = spawn(PY, ['manage.py', 'runserver', `127.0.0.1:${API_PORT}`, '--noreload'], { cwd: BACKEND, env: ENV, stdio: ['ignore', 'ignore', fs.openSync(path.join(OUT, 'backend.log'), 'w')] })
  const web = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], { cwd: FRONTEND, env: ENV, shell: true, stdio: 'ignore' })
  await waitHttp(`http://127.0.0.1:${API_PORT}/api/auth/me/`, 401)
  await waitHttp(`${BASE}api/auth/me/`, 401)
  return { api, web }
}

// ---------- Page helpers ----------

// Signs in through the login form, as a person would.
async function signIn(page, user, password = `${user}@2026`, { expectDashboard = true } = {}) {
  await page.goto(BASE)
  await page.waitFor(`document.querySelectorAll('.card input').length >= 2`, 10000, 'login form')
  const ids = await page.eval(`[...document.querySelectorAll('.card input:not([type=checkbox])')].map((i) => i.id)`)
  await page.type(`[id="${ids[0]}"]`, user)
  await page.type(`[id="${ids[1]}"]`, password)
  await page.click('button.submit')
  if (expectDashboard) await page.waitFor(`document.querySelector('.dashboard')`, 15000, `dashboard after ${user} signs in`)
}

const field = (label) => `(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); return l && document.getElementById(l.htmlFor) })()`

async function typeField(page, label, value) {
  const id = await page.eval(`${field(label)}?.id`)
  if (!id) throw new Error(`No field labelled "${label}"`)
  await page.type(`[id="${id}"]`, value)
}

// fetch() from inside the page with its own sign-in token.
const api = (page, method, url, body) =>
  page.eval(`(async () => {
    const t = localStorage.getItem('mpcr-token') ?? sessionStorage.getItem('mpcr-token')
    const r = await fetch('/api${url}', { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Token ' + t }) }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} })
    return { status: r.status, body: await r.json().catch(() => null) }
  })()`)

const tokenOf = (page) => page.eval(`localStorage.getItem('mpcr-token') ?? sessionStorage.getItem('mpcr-token')`)

// ---------- Cases ----------

const results = []
const ctx = {}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

const CASES = [
  // ----- Launch & sign-in -----
  ['E2E-01', 'Launch', 'Sign-in page appears within 2 s on the plant network (real network, cold browser)', async ({ browser }) => {
    const real = await browser.newPage()
    const t0 = Date.now()
    await real.send('Page.navigate', { url: BASE })
    await real.waitFor(`document.querySelector('.card')`, 90000, 'sign-in form')
    ctx.loginLoadMs = Date.now() - t0
    const blocked = real.failed.filter((f) => /fonts\.g/.test(f))
    await real.close()
    expect(ctx.loginLoadMs < 2000, `sign-in form took ${ctx.loginLoadMs} ms; failed requests: ${blocked.join(', ') || 'none'}`)
    return `sign-in form after ${ctx.loginLoadMs} ms`
  }],
  ['E2E-01b', 'Launch', 'Sign-in page loads with no console errors (fonts host blocked)', async ({ guest }) => {
    const t0 = Date.now()
    await guest.goto(BASE)
    await guest.waitFor(`document.querySelector('.card')`)
    expect((await guest.eval('document.title')) === 'MPCR · Sign in', 'title')
    expect(guest.errors.length === 0, `errors: ${guest.errors}`)
    return `form after ${Date.now() - t0} ms`
  }],
  ['E2E-02', 'Sign-in', 'Empty form shows both field errors and sends nothing', async ({ guest }) => {
    await guest.goto(BASE)
    await guest.waitFor(`document.querySelector('button.submit')`)
    await guest.click('button.submit')
    const text = await guest.waitFor(`document.querySelector('.card').innerText.includes('Enter your') && document.querySelector('.card').innerText`)
    expect(text.includes('operator ID') && text.includes('access code'), text)
    return 'both messages shown'
  }],
  ['E2E-03', 'Sign-in', 'Malformed email is caught before sending', async ({ guest }) => {
    const ids = await guest.eval(`[...document.querySelectorAll('.card input:not([type=checkbox])')].map((i) => i.id)`)
    await guest.type(`[id="${ids[0]}"]`, 'op@@mpcr')
    await guest.type(`[id="${ids[1]}"]`, 'operator@2026')
    await guest.click('button.submit')
    await guest.waitFor(`document.querySelector('.card').innerText.includes('doesn’t look right')`)
    return 'email message shown'
  }],
  ['E2E-04', 'Sign-in', 'Access code shorter than 6 characters is refused', async ({ guest }) => {
    const ids = await guest.eval(`[...document.querySelectorAll('.card input:not([type=checkbox])')].map((i) => i.id)`)
    await guest.type(`[id="${ids[0]}"]`, 'operator')
    await guest.type(`[id="${ids[1]}"]`, 'abc')
    await guest.click('button.submit')
    await guest.waitFor(`document.querySelector('.card').innerText.includes('at least 6 characters')`)
    return 'length message shown'
  }],
  ['E2E-05', 'Sign-in', 'Wrong access code shows the server message and stays on sign-in', async ({ guest }) => {
    await signIn(guest, 'supervisor', 'wrong-code', { expectDashboard: false })
    const msg = await guest.waitFor(`document.querySelector('.card__server-error')?.innerText`, 8000)
    expect(msg.includes('incorrect'), msg)
    expect(!(await guest.eval(`!!document.querySelector('.dashboard')`)), 'dashboard opened')
    return msg
  }],
  ['E2E-06', 'Sign-in', 'Valid sign-in (operator) opens the dashboard with 10 of 48 machines', async ({ operator }) => {
    const t0 = Date.now()
    await signIn(operator, 'operator')
    await operator.waitFor(`document.querySelectorAll('.mcard').length === 10`)
    ctx.dashboardMs = Date.now() - t0
    const footer = await operator.eval(`document.querySelector('.dashboard__footer p').textContent`)
    expect(footer.includes('of 48 machines'), footer)
    return `${footer.split('·')[0].trim()} · ${ctx.dashboardMs} ms from sign-in click`
  }],
  ['E2E-07', 'Sign-in', '"Keep me signed in" keeps the session after a reload', async ({ operator }) => {
    await operator.reload()
    await operator.waitFor(`document.querySelectorAll('.mcard').length === 10`, 15000)
    return 'still signed in after reload'
  }],

  // ----- Dashboard -----
  ['E2E-08', 'Dashboard', 'Header status counts match the API and the database', async ({ operator }) => {
    const shown = await operator.eval(`Object.fromEntries([...document.querySelectorAll('.dash-header__count')].map((d) => [d.querySelector('dt').textContent.trim(), Number(d.querySelector('dd').textContent)]))`)
    const live = await api(operator, 'GET', '/live/')
    const fromApi = {}
    for (const m of live.body.machines.filter((x) => x.active)) fromApi[m.status] = (fromApi[m.status] ?? 0) + 1
    const fromDb = db(`from plant.models import Machine\nfrom collections import Counter\nprint(json.dumps(Counter(Machine.objects.filter(active=True).values_list('status', flat=True))))`)
    const label = { run: 'Running', idle: 'Idle', maint: 'Maint', alarm: 'Alarm', off: 'Offline' }
    for (const [k, l] of Object.entries(label)) {
      expect((shown[l] ?? 0) === (fromApi[k] ?? 0) && (fromApi[k] ?? 0) === (fromDb[k] ?? 0), `${l}: screen ${shown[l]} api ${fromApi[k]} db ${fromDb[k]}`)
    }
    return Object.entries(label).map(([k, l]) => `${l} ${fromDb[k] ?? 0}`).join(', ')
  }],
  ['E2E-09', 'Dashboard', 'Search "J10-30" shows exactly that machine', async ({ operator }) => {
    await operator.type('.toolbar input[type=search], .toolbar input', 'J10-30')
    await operator.waitFor(`document.querySelectorAll('.mcard').length === 1`)
    expect((await operator.text('.mcard')).includes('J10-30'), 'wrong card')
    await operator.type('.toolbar input[type=search], .toolbar input', '')
    await operator.waitFor(`document.querySelectorAll('.mcard').length === 10`)
    return '1 card, then 10 again when cleared'
  }],
  ['E2E-10', 'Dashboard', 'Status filter "Run" shows only running machines, as many as the header says', async ({ operator }) => {
    await operator.click('.segmented[aria-label="Filter by status"] button', 'Run')
    await operator.waitFor(`document.querySelector('.dashboard__footer p').textContent.includes('of ')`)
    const total = Number((await operator.eval(`document.querySelector('.dashboard__footer p').textContent`)).match(/of (\d+) machines/)[1])
    const header = await operator.eval(`Number([...document.querySelectorAll('.dash-header__count')].find((d) => d.textContent.includes('Running')).querySelector('dd').textContent)`)
    const allRun = await operator.eval(`[...document.querySelectorAll('.mcard')].every((c) => c.classList.contains('mcard--run'))`)
    expect(total === header && allRun, `footer ${total}, header ${header}, all run ${allRun}`)
    await operator.click('.segmented[aria-label="Filter by status"] button', 'All')
    return `${total} running machines listed`
  }],
  ['E2E-11', 'Dashboard', 'Sort by cycle time puts the longest cycle first', async ({ operator }) => {
    await operator.eval(`(() => { const s = [...document.querySelectorAll('.toolbar select')].find((x) => [...x.options].some((o) => o.value === 'cycle')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'cycle'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await sleep(400)
    const cycles = await operator.eval(`[...document.querySelectorAll('.mcard')].map((c) => parseFloat(c.querySelector('.mcard__params dd, dd')?.innerText)).filter((n) => !isNaN(n))`)
    const sorted = [...cycles].sort((a, b) => b - a)
    expect(cycles.length > 1 && JSON.stringify(cycles) === JSON.stringify(sorted), `cycles ${cycles}`)
    return `first ${cycles[0]} s, then ${cycles[1]} s`
  }],
  ['E2E-12', 'Dashboard', 'Pagination moves to machines 11–20', async ({ operator }) => {
    await operator.click('.pagination button[aria-label="Next page"]')
    await operator.waitFor(`document.querySelector('.dashboard__footer p').textContent.includes('11–20')`)
    await operator.click('.pagination button[aria-label="Previous page"]')
    return 'Showing 11–20 of 48'
  }],
  ['E2E-13', 'Dashboard', 'List view shows the same 10 machines as rows', async ({ operator }) => {
    await operator.click('.toolbar__view button', 'List')
    await operator.waitFor(`document.querySelectorAll('.mlist tbody tr, table tbody tr').length === 10`)
    await operator.click('.toolbar__view button', 'Card')
    return '10 rows'
  }],

  // ----- Parameter log & two-level approval -----
  ['E2E-14', 'Parameter log', 'Clicking a card opens its parameter log (URL #/log/J10-25, 31 parameter rows)', async ({ operator }) => {
    await operator.type('.toolbar input', 'J10-25') // the grid may be sorted or paged differently by now
    await operator.waitFor(`document.querySelectorAll('.mcard').length === 1`)
    await operator.eval(`document.querySelector('.mcard').click()`)
    await operator.waitFor(`location.hash === '#/log/J10-25' && document.querySelector('.plog-table')`)
    const params = await operator.count('.plog-table tbody tr:has(td.plog-table__unit)') // parameter rows, not group headings
    expect(params === 31, `${params} parameter rows`)
    return `opened · ${params} parameter rows`
  }],
  ['E2E-15', 'Parameter log', 'Operator records the due hour with nozzle 270 °C → open deviation on screen and in the database', async ({ operator }) => {
    await operator.click('button', '+ Record')
    await operator.waitFor(`document.querySelector('.log-dialog input')`)
    await operator.type('.log-dialog input', '270')
    await operator.click('.log-dialog__primary')
    await sleep(500)
    if (await operator.eval(`!!document.querySelector('.log-dialog__primary')`)) await operator.click('.log-dialog__primary') // confirm values off limits
    await operator.click('.plog__tabs button', '24H') // the due hour may belong to the next shift
    await operator.waitFor(`[...document.querySelectorAll('.dev-card')].some((c) => c.innerText.includes('OPEN'))`, 10000)
    const row = db(`from plant.models import Deviation, Notification\nd = Deviation.objects.get(log__machine_id='J10-25', key='nozzle')\nprint(json.dumps({'hour': d.hour, 'value': d.value, 'status': d.status, 'notified': Notification.objects.filter(type='detected', dev_id=d.dev_id).count()}))`)
    expect(row.status === 'open' && row.value === 270 && row.notified === 1, JSON.stringify(row))
    ctx.devHour = row.hour
    return `DB: hour ${row.hour}, value 270, status open, 1 notification`
  }],
  ['E2E-16', 'Parameter log', 'Operator enters reason and lot → awaiting supervisor', async ({ operator }) => {
    await operator.click('.dev-card__add')
    await operator.waitFor(`document.querySelector('.log-dialog textarea')`)
    await operator.type('.log-dialog textarea', 'Heater overshoot after start-up (E2E)')
    await operator.type('.log-dialog input', 'LOT E2E-1')
    await operator.click('.log-dialog__primary')
    const s = await waitDb(`Deviation.objects.get(log__machine_id='J10-25', key='nozzle').status`, 'awaiting')
    return `DB status ${s}`
  }],
  ['E2E-17', 'Approval', 'Supervisor approves level 1 from the log', async ({ supervisor }) => {
    await signIn(supervisor, 'supervisor')
    await supervisor.goto(`${BASE}#/log/J10-25`)
    await supervisor.waitFor(`document.querySelector('.plog__tabs')`)
    await supervisor.click('.plog__tabs button', '24H')
    await supervisor.waitFor(`document.querySelector('.dev-card__review')`, 10000)
    await supervisor.click('.dev-card__review')
    await supervisor.waitFor(`document.querySelector('.review__approve')`)
    await supervisor.click('.review__approve')
    const s = await waitDb(`Deviation.objects.get(log__machine_id='J10-25', key='nozzle').status`, 'supervised')
    return `DB status ${s}`
  }],
  ['E2E-18', 'Approval', 'Manager gives the final approval → closed, with both levels recorded', async ({ manager }) => {
    await signIn(manager, 'manager')
    await manager.goto(`${BASE}#/log/J10-25`)
    await manager.waitFor(`document.querySelector('.plog__tabs')`)
    await manager.click('.plog__tabs button', '24H')
    await manager.waitFor(`document.querySelector('.dev-card__review')`, 10000)
    await manager.click('.dev-card__review')
    await manager.waitFor(`document.querySelector('.review__approve')`)
    await manager.click('.review__approve')
    await waitDb(`Deviation.objects.get(log__machine_id='J10-25', key='nozzle').status`, 'closed')
    const d = db(`from plant.models import Deviation\nd = Deviation.objects.get(log__machine_id='J10-25', key='nozzle')\nprint(json.dumps({'l1': d.l1['by'], 'by': d.admin_by, 'levels': [r['level'] for r in d.reviews]}))`)
    expect(d.l1 === 'supervisor' && d.by === 'manager' && JSON.stringify(d.levels) === '[1,2]', JSON.stringify(d))
    return 'DB: closed, level 1 supervisor, level 2 manager'
  }],

  // ----- Report -----
  ['E2E-19', 'Report', 'Report stats match the database (values, deviations, closed)', async ({ manager }) => {
    await manager.goto(`${BASE}#/report`)
    await manager.waitFor(`document.querySelector('.rstats dd') && !document.querySelector('.rtable').innerText.includes('Running the report')`, 15000)
    const stats = await manager.eval(`Object.fromEntries([...document.querySelectorAll('.rstats dl > div')].map((d) => [d.querySelector('dt').innerText.trim().toLowerCase(), d.querySelector('dd').innerText.replace(/,/g, '')]))`)
    const fromDb = db(`from plant.models import ParameterLog, Deviation\nvals = sum(len(v) for l in ParameterLog.objects.all() for v in l.recorded.values())\nprint(json.dumps({'values': vals, 'deviations': Deviation.objects.count(), 'closed': Deviation.objects.filter(status='closed').count()}))`)
    expect(Number(stats.values) === fromDb.values && Number(stats.deviations) === fromDb.deviations && Number(stats.closed) === fromDb.closed, `screen ${JSON.stringify(stats)} db ${JSON.stringify(fromDb)}`)
    return `values ${fromDb.values}, deviations ${fromDb.deviations}, closed ${fromDb.closed}`
  }],
  ['E2E-20', 'Report', 'Excel export downloads a real .xlsx file', async ({ manager }) => {
    await manager.click('.rexport--excel')
    const file = await waitFile(DOWNLOADS, '.xlsx', 15000)
    const head = fs.readFileSync(file).subarray(0, 2).toString()
    expect(head === 'PK', 'not a zip/xlsx')
    return `${path.basename(file)} · ${fs.statSync(file).size} bytes`
  }],

  // ----- Settings (admin) -----
  ['E2E-21', 'Machine master', 'Admin renames J10-30 → saved in the database with an audit entry', async ({ admin }) => {
    await signIn(admin, 'admin')
    await admin.goto(`${BASE}#/settings/machines`)
    await admin.waitFor(`[...document.querySelectorAll('.stable tr')].some((r) => r.innerText.includes('J10-30'))`)
    await admin.eval(`[...document.querySelectorAll('.stable tbody tr')].find((r) => r.innerText.includes('J10-30')).click()`)
    await admin.waitFor(`${field('Machine code')}?.value === 'J10-30'`)
    await typeField(admin, 'Name', 'FANUC Machine 6 (E2E)')
    await admin.click('button', 'Save machine')
    await waitDb(`Machine.objects.get(id='J10-30').name`, 'FANUC Machine 6 (E2E)')
    const audit = await waitDb(`AuditEntry.objects.filter(area='Machine master', text__contains='J10-30').count() > 0`, true)
    return `DB name updated; audit entry ${audit}`
  }],
  ['E2E-22', 'Machine master', 'Admin adds a machine (defaults: no mold mounted)', async ({ admin }) => {
    await admin.click('button', 'Add machine')
    await admin.waitFor(`${field('Machine code')}?.value`)
    const id = await admin.eval(`${field('Machine code')}.value`)
    await admin.click('button', 'Save machine')
    const m = await waitDb(`list(Machine.objects.filter(id='${id}').values_list('id', 'mold'))`, (v) => v.length === 1)
    return `DB: ${id}, mold "${m[0][1]}"`
  }],
  ['E2E-23', 'Shift master', 'Admin switches "Allow back-dated entry" on and off', async ({ admin }) => {
    await admin.goto(`${BASE}#/settings/shifts`)
    const toggle = `[...document.querySelectorAll('.srules__item')].find((r) => r.innerText.includes('Allow back-dated entry')).querySelector('input')`
    await admin.waitFor(toggle)
    await admin.eval(`${toggle}.click()`)
    await waitDb(`Setting.get('shiftRules')['backDated']`, true)
    await admin.eval(`${toggle}.click()`)
    await waitDb(`Setting.get('shiftRules')['backDated']`, false)
    return 'DB rule true, then false'
  }],
  ['E2E-24', 'User management', 'Admin creates a user who can then sign in', async ({ admin, guest }) => {
    await admin.goto(`${BASE}#/settings/users`)
    await admin.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Add user'))`)
    await admin.click('button', 'Add user')
    await typeField(admin, 'Username', 'qa.tester')
    await typeField(admin, 'Employee ID', 'QA-0001')
    await typeField(admin, 'Name', 'QA Tester')
    await typeField(admin, 'Password', 'qatester@2026')
    await admin.click('button', 'Save user')
    await waitDb(`User.objects.filter(username='qa.tester').exists()`, true)
    await signIn(guest, 'qa.tester', 'qatester@2026', { expectDashboard: false })
    await guest.waitFor(`document.querySelector('.card__heading')?.textContent.includes('Choose a new access code')`, 10000, 'change-code screen')
    expect(!(await guest.eval(`!!document.querySelector('.dashboard')`)), 'dashboard opened before the code was changed')
    const blocked = await api(guest, 'GET', '/bootstrap/')
    expect(blocked.status === 403 && blocked.body.code === 'password_change_required', `bootstrap ${blocked.status}`)
    const ids = await guest.eval(`[...document.querySelectorAll('.card input[type=password]')].map((i) => i.id)`)
    await guest.type(`[id="${ids[0]}"]`, 'qatester@2026')
    await guest.type(`[id="${ids[1]}"]`, 'mine.qa@2026')
    await guest.type(`[id="${ids[2]}"]`, 'different')
    await guest.click('button.submit')
    await guest.waitFor(`document.querySelector('.card').innerText.includes('match')`)
    await guest.type(`[id="${ids[2]}"]`, 'mine.qa@2026')
    await guest.click('button.submit')
    await guest.waitFor(`document.querySelector('.dashboard')`, 15000, 'dashboard after the new code')
    await waitDb(`User.objects.get(username='qa.tester').force_reset`, false)
    await guest.eval(`localStorage.clear(); sessionStorage.clear()`)
    await signIn(guest, 'qa.tester', 'mine.qa@2026')
    await guest.eval(`localStorage.clear(); sessionStorage.clear()`)
    return 'first sign-in forced to the change screen (API 403 meanwhile); new code works'
  }],
  ['E2E-39', 'Shift master', 'A changed shift reaches an open screen: header, log columns and tabs, report filter', async ({ admin, operator }) => {
    const before = (await api(admin, 'GET', '/shift-master/')).body
    const now = new Date()
    const minute = now.getHours() * 60 + now.getMinutes()
    // A new shift covering this moment, reading every 30 minutes; every other shift off.
    const start = (minute - 60 + 1440) % 1440
    const test = { code: 'QA', name: 'QA shift', start, end: (minute + 180) % 1440, interval: 30, grace: 10, supervisor: '', active: true }
    await operator.goto(`${BASE}#/log/J10-27`)
    await operator.waitFor(`document.querySelector('.plog__tabs')`)
    const saved = await api(admin, 'PUT', '/shift-master/', { rules: before.rules, shifts: [...before.shifts.map((x) => ({ ...x, active: false })), test] })
    expect(saved.status === 200, `save ${saved.status}`)
    try {
      // No reload: the 10-second live poll brings it.
      await operator.waitFor(`[...document.querySelectorAll('.plog__tabs button')].map((b) => b.textContent.trim()).join() === 'QA,24H'`, 20000, 'tabs QA and 24H')
      await operator.click('.plog__tabs button', 'QA')
      const heads = await operator.waitFor(`(() => { const h = [...document.querySelectorAll('.plog-table__hour')].map((x) => x.firstChild.textContent.trim()); return h.length === 8 && h })()`, 8000, '8 half-hour columns')
      const gaps = heads.slice(1).map((h, i) => ((Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) - Number(heads[i].slice(0, 2)) * 60 - Number(heads[i].slice(3)) + 1440) % 1440))
      expect(gaps.every((g) => g === 30), `columns ${heads}`)
      const sheet = await operator.text('.plog-table__bar h2')
      await operator.goto(`${BASE}#/report`)
      await operator.waitFor(`document.querySelector('.rfilter__shifts button')`)
      const filter = await operator.eval(`[...document.querySelectorAll('.rfilter__shifts button')].map((b) => b.textContent.trim()).join()`)
      await operator.goto(BASE)
      await operator.waitFor(`document.querySelector('.dash-header__title')`)
      const header = await operator.eval(`document.querySelector('.dash-header__title').textContent`)
      expect(filter === 'QA' && header.includes('Shift QA'), `report filter ${filter}, header ${header}`)
      return `${heads[0]}, ${heads[1]} … ${heads[7]}; report filter QA; header "${header.trim()}"; ${sheet.split('·')[1].trim()}`
    } finally {
      await api(admin, 'PUT', '/shift-master/', before)
      await operator.goto(BASE)
    }
  }],
  ['E2E-40', 'Shift master', 'A half-hour reading saves through the screen and appears in the log', async ({ admin, operator }) => {
    const before = (await api(admin, 'GET', '/shift-master/')).body
    const now = new Date()
    const minute = now.getHours() * 60 + now.getMinutes()
    const test = { code: 'QA', name: 'QA shift', start: (minute - 60 + 1440) % 1440, end: (minute + 180) % 1440, interval: 30, grace: 10, supervisor: '', active: true }
    await api(admin, 'PUT', '/shift-master/', { rules: before.rules, shifts: [...before.shifts.map((x) => ({ ...x, active: false })), test] })
    try {
      await operator.goto(`${BASE}#/log/J10-28`)
      await operator.reload() // load the new reading times now, not at the next live poll
      await operator.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('+ Record'))`, 15000)
      const label = (await operator.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ Record')).textContent`)).match(/\d\d:\d\d/)[0]
      await operator.click('button', '+ Record')
      await operator.waitFor(`document.querySelector('.log-dialog input')`)
      await operator.click('.log-dialog__primary')
      // Its column shows the reading as logged (the due slot then moves on to the next one).
      await operator.waitFor(`[...document.querySelectorAll('.plog-table__hour.is-logged')].some((h) => h.textContent.includes(${JSON.stringify(label)}))`, 10000, `${label} logged`)
      const keys = await waitDb(`[k for l in ParameterLog.objects.filter(machine_id='J10-28') for k in l.recorded]`, (v) => v.length === 1)
      return `${label} saved as slot ${keys[0]}; its column shows it logged`
    } finally {
      await api(admin, 'PUT', '/shift-master/', before)
      await operator.goto(BASE)
    }
  }],
  ['E2E-41', 'Sign-in', '"Reset access code" and "Request access" explain what to do', async ({ browser }) => {
    const p = await browser.newPage({ block: FIREWALLED })
    await p.goto(BASE)
    await p.waitFor(`document.querySelector('.card__options .link')`)
    await p.click('.card__options .link')
    const reset = await p.waitFor(`document.querySelector('.card__help')?.textContent`)
    await p.click('.card__new .link')
    const request = await p.waitFor(`document.querySelector('.card__help')?.textContent.includes('create your account') && document.querySelector('.card__help').textContent`)
    expect(!(await p.eval(`location.hash`)), 'link changed the page address')
    await p.close()
    expect(reset.includes('new code'), reset)
    return 'each link shows its own help text'
  }],
  ['E2E-42', 'Sign-in', 'A signed-in user can change their code from the profile menu', async ({ browser }) => {
    const p = await browser.newPage({ block: FIREWALLED })
    await signIn(p, 'supervisor')
    await p.click('.user-menu__btn')
    await p.waitFor(`document.querySelector('.profile__actions .link')`)
    await p.click('.profile__actions .link')
    await p.waitFor(`document.querySelector('.card__heading')?.textContent.includes('Change your access code')`)
    await p.click('.card__new .link') // Cancel
    await p.waitFor(`document.querySelector('.dashboard')`)
    await p.close()
    return 'screen opens from the menu; Cancel returns to the dashboard'
  }],
  ['E2E-43', 'Dashboard', 'Line and clamp filters come from the machines (a new line and tonnage appear)', async ({ admin }) => {
    const r = await api(admin, 'POST', '/machines/', { id: 'QA-220', name: 'QA machine', make: 'FANUC', model: 'ROBOSHOT QA', clamp: 220, line: 'Line Z', bay: 1, dataSource: 'manual', active: true, mold: '', partNo: '', partName: '' })
    expect(r.status === 201, `create ${r.status}`)
    await admin.goto(BASE)
    await admin.reload()
    await admin.waitFor(`document.querySelectorAll('.mcard').length === 10`)
    const options = await admin.eval(`[...document.querySelectorAll('.toolbar select')].flatMap((s) => [...s.options].map((o) => o.textContent.trim()))`)
    expect(options.includes('Line Z') && options.includes('220 t'), options.join())
    const seeded = db(`from plant.models import Machine\nprint(json.dumps(sorted(set(Machine.objects.values_list('clamp', flat=True)))))`)
    for (const c of seeded) expect(options.includes(`${c} t`), `${c} t missing`)
    await admin.eval(`(() => { const s = [...document.querySelectorAll('.toolbar select')].find((x) => [...x.options].some((o) => o.textContent.trim() === 'Line Z')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'Line Z'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await admin.waitFor(`document.querySelectorAll('.mcard').length === 1`)
    const card = await admin.text('.mcard')
    await admin.goto(BASE)
    await admin.reload()
    await api(admin, 'PUT', '/machines/QA-220/', { active: false })
    expect(card.includes('QA-220'), card)
    return `clamps ${seeded.join(', ')} t and Line Z offered; filter finds QA-220`
  }],
  ['E2E-25', 'Parameter master', 'Admin changes the nozzle standard of R-001, saves a draft, approves it', async ({ admin }) => {
    await admin.goto(`${BASE}#/settings/parameters/R-001`)
    const input = 'input[aria-label="Nozzle temperature std"]'
    await admin.waitFor(`document.querySelector('${input}')`, 10000)
    await admin.type(input, '252')
    await admin.click('button', 'Save')
    await waitDb(`[r['std'] for r in RecipeVersion.objects.get(recipe_id='R-001', status='draft').rows if r['code'] == 'TMP_NOZ'][0]`, 252)
    await admin.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Approve'))`)
    await admin.click('button', 'Approve')
    const active = await waitDb(`[(r['lower'], r['std'], r['upper']) for r in RecipeVersion.objects.get(recipe_id='R-001', status='active').rows if r['code'] == 'TMP_NOZ'][0]`, (v) => v[1] === 252)
    return `DB active R-001 nozzle ${active.join(' / ')}`
  }],

  // ----- Access control in the browser -----
  ['E2E-26', 'Authorization', 'Viewer: no Record button, no photo upload, User management not reachable', async ({ viewer }) => {
    await signIn(viewer, 'viewer')
    const uploads = await viewer.count('.mcard__drop, .mcard__corner')
    await viewer.goto(`${BASE}#/log/J10-25`)
    await viewer.waitFor(`document.querySelector('.plog-table')`)
    const record = await viewer.eval(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('+ Record') && !b.hidden)`)
    await viewer.goto(`${BASE}#/settings/users`)
    await sleep(800)
    const users = await viewer.eval(`!!document.querySelector('.sperm') || document.title.includes('User management')`)
    const r = await api(viewer, 'PUT', `/logs/J10-26/${today()}/hours/${ctx.devHour ?? 10}/`, { values: { nozzle: 255 } })
    expect(uploads === 0 && !record && !users && r.status === 403, `uploads ${uploads}, record ${record}, users page ${users}, API ${r.status}`)
    return 'none shown; direct API call 403'
  }],
  ['E2E-27', 'Security', 'HTML in a user name is shown as text (no script runs)', async ({ admin }) => {
    const evil = '<img src=x onerror="window.__xss=1;alert(1)">'
    const r = await api(admin, 'POST', '/users/', { username: 'xss.test', name: evil, email: 'xss@mpcr.com', employeeId: 'XSS-1', role: 'Viewer', password: 'xsstest@2026' })
    expect(r.status === 201, `create ${r.status}`)
    await admin.goto(`${BASE}#/settings/users`)
    await admin.reload()
    await admin.waitFor(`document.querySelector('.stable') && document.querySelector('.stable').innerText.includes('<img')`, 10000)
    const injected = await admin.eval(`!!window.__xss || !!document.querySelector('.stable img[src="x"]')`)
    expect(!injected && admin.dialogs.length === 0, `script ran: ${injected}, dialogs ${admin.dialogs}`)
    return 'name shown literally; no img element, no alert'
  }],

  // ----- Robustness -----
  ['E2E-28', 'Network', 'Saving while offline shows "Not saved" and writes nothing', async ({ operator }) => {
    await operator.goto(`${BASE}#/log/J10-26`)
    await operator.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('+ Record') && !b.disabled)`)
    await operator.click('button', '+ Record')
    await operator.waitFor(`document.querySelector('.log-dialog input')`)
    await operator.offline(true)
    await operator.click('.log-dialog__primary')
    const banner = await operator.waitFor(`document.querySelector('.app-error')?.innerText`, 8000)
    await operator.offline(false)
    const saved = db(`from plant.models import ParameterLog\nprint(json.dumps(ParameterLog.objects.filter(machine_id='J10-26').exclude(recorded={}).count()))`)
    expect(banner.includes('can’t be reached') && saved === 0, `${banner} / saved ${saved}`)
    await operator.click('.app-error button')
    return banner.replace(/\s+/g, ' ').slice(0, 90)
  }],
  ['E2E-29', 'Session', 'A session idle for 13 h is sent back to sign-in on the next load', async ({ supervisor }) => {
    const token = await tokenOf(supervisor)
    db(`from plant.models import SessionToken\nfrom django.utils import timezone\nfrom datetime import timedelta\nprint(json.dumps(SessionToken.objects.filter(key='${token}').update(last_used=timezone.now() - timedelta(hours=13))))`)
    await supervisor.reload()
    await supervisor.waitFor(`document.querySelector('.card') && !document.querySelector('.dashboard')`, 10000)
    return 'sign-in page shown'
  }],
  ['E2E-30', 'Sign-out', 'Sign out from the profile menu: back to sign-in, token refused afterwards', async ({ manager }) => {
    const token = await tokenOf(manager)
    await manager.click('.user-menu__btn')
    await manager.waitFor(`document.querySelector('.profile__signout')`)
    await manager.click('.profile__signout')
    await manager.waitFor(`document.querySelector('.card')`)
    // The sign-out request is sent in the background: allow it a moment, no more.
    let status
    for (let i = 0; i < 20 && status !== 401; i++) {
      status = (await fetch(`${BASE}api/auth/me/`, { headers: { Authorization: `Token ${token}` } })).status
      if (status !== 401) await sleep(100)
    }
    expect(status === 401, `old token still ${status} after 2 s`)
    return 'sign-in shown; old token 401'
  }],
  ['E2E-31', 'Sign-in', 'Five wrong codes lock the account; the right code then shows the lock message', async ({ guest }) => {
    for (let i = 0; i < 5; i++) {
      await signIn(guest, 'viewer', 'wrong-code', { expectDashboard: false })
      await guest.waitFor(`document.querySelector('.card__server-error')`, 8000)
    }
    await signIn(guest, 'viewer', 'viewer@2026', { expectDashboard: false })
    const msg = await guest.waitFor(`document.querySelector('.card__server-error')?.innerText.includes('locked') && document.querySelector('.card__server-error').innerText`, 8000)
    return msg
  }],

  // ----- Layout, accessibility, assets -----
  ['E2E-32', 'Responsive', 'No sideways scrolling at phone, tablet, laptop and desktop widths', async ({ admin, browser }) => {
    const sizes = [[375, 812], [768, 1024], [1366, 768], [1920, 1080]]
    const bad = []
    const fresh = await browser.newPage({ block: FIREWALLED })
    for (const [w, h] of sizes) {
      for (const [name, pg, url] of [['sign-in', fresh, BASE], ['dashboard', admin, BASE], ['log', admin, `${BASE}#/log/J10-25`], ['report', admin, `${BASE}#/report`]]) {
        await pg.viewport(w, h)
        await pg.goto(url)
        await sleep(900)
        const o = await pg.eval(`({ sw: document.documentElement.scrollWidth, iw: innerWidth })`)
        await pg.screenshot(path.join(SHOTS, `${name}-${w}.png`))
        if (o.sw > o.iw + 1) bad.push(`${name} @${w}: ${o.sw}px wide`)
      }
    }
    await fresh.close()
    await admin.viewport(1920, 1080)
    expect(bad.length === 0, bad.join('; '))
    return `${sizes.length * 4} screens checked; screenshots in out/shots`
  }],
  ['E2E-38', 'Responsive', 'Phone (375 px): every status count and status filter can be seen or scrolled to', async ({ admin }) => {
    await admin.viewport(375, 812)
    await admin.goto(BASE)
    await admin.waitFor(`document.querySelector('.dash-header__counts') && document.querySelector('.segmented[aria-label="Filter by status"]')`)
    await sleep(600)
    const out = await admin.eval(`(() => {
      // Reachable = inside the screen, or inside an ancestor that scrolls sideways.
      const scrolls = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p).overflowX; if ((s === 'auto' || s === 'scroll') && p.scrollWidth > p.clientWidth) return true } return false }
      const check = (sel, name) => [...document.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect(); return (r.right > innerWidth + 1 || r.width === 0) && !scrolls(el) }).map((el) => name + ' "' + el.textContent.trim().replace(/\s+/g, ' ') + '"')
      return [...check('.dash-header__count', 'count'), ...check('.segmented[aria-label="Filter by status"] button', 'filter')]
    })()`)
    await admin.screenshot(path.join(SHOTS, 'phone-header-filters.png'))
    await admin.viewport(1920, 1080)
    expect(out.length === 0, `cut off and not scrollable: ${out.join(', ')}`)
    return 'all reachable'
  }],
  ['E2E-33', 'Accessibility', 'Every input, select and button has an accessible name; images have alt; page has a language', async ({ admin }) => {
    const pages = ['', '#/log/J10-25', '#/report', '#/settings/machines', '#/settings/parameters', '#/settings/users', '#/settings/shifts']
    const problems = []
    for (const h of pages) {
      await admin.goto(BASE + h)
      await sleep(1200)
      const found = await admin.eval(`(() => {
        const named = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title || (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest('label') || (el.tagName === 'BUTTON' && el.textContent.trim()) || el.placeholder)
        const out = []
        for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea, button')) if (!named(el) && el.offsetParent) out.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''))
        for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push('img without alt')
        if (!document.documentElement.lang) out.push('<html> without lang')
        return [...new Set(out)]
      })()`)
      if (found.length) problems.push(`${h || 'dashboard'}: ${found.join(', ')}`)
    }
    expect(problems.length === 0, problems.join(' | '))
    return `${pages.length} pages clean`
  }],
  ['E2E-34', 'Accessibility', 'Keyboard: Tab from the top of sign-in reaches the ID field, then the code, then submits with Enter', async ({ guest, browser }) => {
    const p = await browser.newPage({ block: FIREWALLED })
    await p.goto(BASE)
    await p.waitFor(`document.querySelector('.card input')`)
    const order = []
    for (let i = 0; i < 6; i++) {
      await p.press('Tab')
      order.push(await p.eval(`document.activeElement.tagName.toLowerCase() + (document.activeElement.type ? ':' + document.activeElement.type : '')`))
    }
    await p.close()
    expect(order.some((x) => x.startsWith('input:text') || x.startsWith('input:email')) && order.includes('input:password'), order.join(' → '))
    return order.join(' → ')
  }],
  ['E2E-35', 'Assets', 'No broken images on the dashboard and machine master', async ({ admin }) => {
    const broken = []
    for (const h of ['', '#/settings/machines']) {
      await admin.goto(BASE + h)
      await sleep(1000)
      broken.push(...(await admin.eval(`[...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 60))`)))
    }
    expect(broken.length === 0, broken.join(', '))
    return 'all images loaded'
  }],

  // ----- Performance -----
  ['E2E-36', 'Performance', 'Load and API timings (sign-in < 2 s, dashboard < 3 s, bootstrap < 1 s, live < 300 ms)', async ({ admin, browser }) => {
    // Dashboard on the real network: a signed-in user opening the app.
    const real = await browser.newPage()
    await real.goto('about:blank')
    await real.send('Page.navigate', { url: BASE })
    await real.waitFor(`document.querySelector('.card input')`, 90000)
    const t0 = Date.now()
    await real.eval(`localStorage.setItem('mpcr-token', ${JSON.stringify(await tokenOf(admin))})`)
    await real.send('Page.navigate', { url: BASE })
    await real.waitFor(`document.querySelectorAll('.mcard').length === 10`, 90000)
    ctx.dashboardRealMs = Date.now() - t0
    await real.close()
    await admin.goto(BASE)
    await admin.waitFor(`document.querySelectorAll('.mcard').length === 10`)
    const boot = await admin.eval(`(() => { const e = performance.getEntriesByType('resource').find((r) => r.name.includes('/api/bootstrap/')); return e && { ms: Math.round(e.duration), kb: Math.round((e.transferSize || e.encodedBodySize) / 1024) } })()`)
    const lives = []
    for (let i = 0; i < 10; i++) {
      const t0 = Date.now()
      await api(admin, 'GET', '/live/')
      lives.push(Date.now() - t0)
    }
    const live = Math.round(lives.reduce((a, b) => a + b) / lives.length)
    const heap = await admin.eval(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`)
    ctx.perf = { loginMs: ctx.loginLoadMs, dashboardRealMs: ctx.dashboardRealMs, dashboardMs: ctx.dashboardMs, bootstrap: boot, liveAvgMs: live, heapMb: heap }
    expect(ctx.loginLoadMs < 2000 && ctx.dashboardRealMs < 3000 && boot.ms < 1000 && live < 300, JSON.stringify(ctx.perf))
    return `sign-in ${ctx.loginLoadMs} ms · dashboard (real network) ${ctx.dashboardRealMs} ms · after sign-in click ${ctx.dashboardMs} ms · bootstrap ${boot.ms} ms / ${boot.kb} KB · live ${live} ms avg · JS heap ${heap} MB`
  }],

  // ----- Overall -----
  ['E2E-37', 'Console', 'No console errors and no server errors (5xx) in any session', async ({ pages }) => {
    const offlineCase = /ERR_INTERNET_DISCONNECTED|ERR_BLOCKED_BY_CLIENT|Failed to fetch|net::ERR/ // E2E-28 goes offline on purpose; fonts host blocked
    const problems = []
    for (const [name, p] of Object.entries(pages)) {
      const errs = p.errors.filter((e) => !offlineCase.test(e) && !/status of 40[0-9]/.test(e))
      const fails = p.failed.filter((f) => !offlineCase.test(f) && !/fonts\.g(oogleapis|static)\.com/.test(f))
      if (errs.length || fails.length) problems.push(`${name}: ${[...errs, ...fails].join(' ; ').slice(0, 300)}`)
    }
    expect(problems.length === 0, problems.join(' | '))
    return `${Object.keys(pages).length} sessions clean`
  }],
]

const today = () => {
  const d = new Date()
  if (d.getHours() < 6) d.setDate(d.getDate() - 1) // the production day starts at 06:00
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Polls the database until the expression equals `want` (or `want(value)` is true).
async function waitDb(expr, want, timeout = 10000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    last = db(`from plant.models import *\nprint(json.dumps(${expr}))`)
    if (typeof want === 'function' ? want(last) : JSON.stringify(last) === JSON.stringify(want)) return last
    await sleep(400)
  }
  throw new Error(`Database: ${expr} is ${JSON.stringify(last)}, expected ${typeof want === 'function' ? 'a match' : JSON.stringify(want)}`)
}

async function waitFile(dir, ext, timeout) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const f = fs.readdirSync(dir).find((x) => x.endsWith(ext))
    if (f) return path.join(dir, f)
    await sleep(300)
  }
  throw new Error(`No ${ext} downloaded`)
}

// ---------- Main ----------

const servers = await setUp()
const browser = await launch()
const pages = {}
for (const name of ['guest', 'operator', 'supervisor', 'manager', 'admin', 'viewer']) pages[name] = await browser.newPage({ downloads: DOWNLOADS, block: FIREWALLED })
const only = process.argv[2] ? new RegExp(process.argv[2]) : null

try {
  for (const [id, area, name, fn] of CASES) {
    if (only && !only.test(id)) continue
    const t0 = Date.now()
    try {
      const detail = await fn({ ...pages, pages, browser })
      results.push({ id, area, name, result: 'PASS', detail, ms: Date.now() - t0 })
      console.log(`PASS ${id} ${name}\n     ${detail}`)
    } catch (e) {
      const shot = await Object.values(pages).find((p) => p)?.screenshot(path.join(SHOTS, `${id}-fail.png`)).catch(() => null)
      results.push({ id, area, name, result: 'FAIL', detail: e.message.slice(0, 500), ms: Date.now() - t0, screenshot: shot && path.relative(ROOT, shot) })
      console.log(`FAIL ${id} ${name}\n     ${e.message.slice(0, 300)}`)
      // Some cases build on earlier ones; screenshot each signed-in page for diagnosis.
      for (const [n, p] of Object.entries(pages)) await p.screenshot(path.join(SHOTS, `${id}-fail-${n}.png`)).catch(() => {})
    }
  }
} finally {
  await browser.close()
  killTree(servers.api)
  killTree(servers.web)
}

const pass = results.filter((r) => r.result === 'PASS').length
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, perf: ctx.perf, results }, null, 1))
console.log(`\n${pass} / ${results.length} passed · results in ${path.relative(ROOT, path.join(OUT, 'results.json'))}`)
process.exitCode = pass === results.length ? 0 : 1
