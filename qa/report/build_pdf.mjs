// Builds the Phase 2 QA report (browser end-to-end + performance) from the test results:
//   node qa/report/build_pdf.mjs
// Reads qa/e2e/out/results.json, qa/perf/out/results.json and qa/report/findings.json
// (defects found by inspection: screenshots, layout, accessibility), writes qa-reports/.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// jspdf lives in frontend/node_modules, which Node does not search from qa/report/.
const fromFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url))
const load = (name) => import(pathToFileURL(fromFrontend.resolve(name)).href)
const { jsPDF } = await load('jspdf')
const autoTableMod = (await load('jspdf-autotable')).default

const autoTable = autoTableMod.default ?? autoTableMod
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const e2e = read('qa/e2e/out/results.json')
const perf = fs.existsSync(path.join(ROOT, 'qa/perf/out/results.json')) ? read('qa/perf/out/results.json') : null
const findings = read('qa/report/findings.json')
const day = e2e.ranAt.slice(0, 10)
const OUT = path.join(ROOT, 'qa-reports', `MPCR_QA_Phase2_E2E_Performance_${day}.pdf`)

const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
const font = (f) => fs.readFileSync(`C:/Windows/Fonts/${f}`).toString('base64')
doc.addFileToVFS('arial.ttf', font('arial.ttf'))
doc.addFont('arial.ttf', 'Arial', 'normal')
doc.addFileToVFS('arialbd.ttf', font('arialbd.ttf'))
doc.addFont('arialbd.ttf', 'Arial', 'bold')

const W = doc.internal.pageSize.getWidth()
const H = doc.internal.pageSize.getHeight()
const M = 40
const RED = [227, 36, 31]
const INK = [26, 26, 26]
const MUTED = [94, 90, 85]
const FILL = { PASS: [223, 242, 229], FAIL: [252, 225, 223], BLOCKED: [253, 240, 214] }
const SEV = { Critical: [160, 0, 0], High: RED, Medium: [196, 110, 0], Low: [47, 111, 224] }
let y = M

function heading(text, size = 14) {
  if (y > H - 120) {
    doc.addPage()
    y = M
  }
  doc.setFont('Arial', 'bold').setFontSize(size).setTextColor(...INK).text(text, M, y)
  y += size + 8
}
function para(text, size = 9.5, color = INK) {
  doc.setFont('Arial', 'normal').setFontSize(size).setTextColor(...color)
  const lines = doc.splitTextToSize(text, W - 2 * M)
  doc.text(lines, M, y)
  y += lines.length * (size + 3) + 6
}
function table(opts) {
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 40 },
    styles: { font: 'Arial', fontSize: 8, cellPadding: 4, textColor: INK, lineColor: [207, 201, 191], lineWidth: 0.4, overflow: 'linebreak' },
    headStyles: { font: 'Arial', fontStyle: 'bold', fillColor: INK, textColor: 255 },
    ...opts,
  })
  y = doc.lastAutoTable.finalY + 18
}

// ---------- Title ----------
doc.setFillColor(...RED).rect(0, 0, W, 6, 'F')
doc.setFont('Arial', 'bold').setFontSize(22).setTextColor(...RED).text('MPCR', M, y + 14)
doc.setTextColor(...INK).setFontSize(16).text('QA Audit · Phase 2 – Browser end-to-end, UI, accessibility & performance', M + 70, y + 14)
y += 34
doc.setFont('Arial', 'normal').setFontSize(9).setTextColor(...MUTED)
doc.text(`Executed ${new Date(e2e.ranAt).toLocaleString('en-GB')} · Microsoft Edge (headless, DevTools protocol) · React build + Django 5.2 API · separate test databases (qa/e2e/out, qa/perf/out)`, M, y)
y += 22

// ---------- Summary ----------
const pass = e2e.results.filter((r) => r.result === 'PASS').length
const fail = e2e.results.length - pass
const byArea = {}
for (const r of e2e.results) {
  byArea[r.area] ??= { PASS: 0, FAIL: 0 }
  byArea[r.area][r.result]++
}
heading('1. Summary')
para(
  `${e2e.results.length} automated browser cases executed against the real application: ${pass} passed, ${fail} failed. ` +
    `${findings.length} further defects were found by inspecting the screenshots and pages (section 4). ` +
    (perf ? `The load test built ${perf.days} days of plant history (${perf.data.values.toLocaleString()} recorded values) and ran ${perf.users} concurrent users for ${perf.seconds} s (section 5). ` : '') +
    'Every result below comes from an executed test; nothing is assumed. No application code was changed in this phase.',
)
table({
  head: [['Area', 'Cases', 'Passed', 'Failed']],
  body: [...Object.entries(byArea).map(([a, c]) => [a, c.PASS + c.FAIL, c.PASS, c.FAIL]), [{ content: 'Total', styles: { fontStyle: 'bold' } }, e2e.results.length, pass, fail]],
  tableWidth: 420,
})
table({
  head: [['Defects found in this phase', ...Object.keys(SEV)]],
  body: [['Count', ...Object.keys(SEV).map((s) => findings.filter((f) => f.severity === s).length)]],
  tableWidth: 420,
  didParseCell: (d) => d.section === 'head' && d.column.index > 0 && (d.cell.styles.fillColor = Object.values(SEV)[d.column.index - 1]),
})

// ---------- How ----------
heading('2. Method')
table({
  head: [['Item', 'Detail']],
  columnStyles: { 0: { cellWidth: 150, fontStyle: 'bold' } },
  body: [
    ['Tooling', 'qa/e2e/run.mjs drives the installed Microsoft Edge over the Chrome DevTools Protocol (the protocol Playwright uses). Playwright itself cannot be installed: the network blocks registry.npmjs.org.'],
    ['Isolation', 'Each run builds the frontend, creates and seeds qa/e2e/out/e2e.sqlite3, starts the API on :8001 and the frontend on :4175, and stops both afterwards. The development database is untouched.'],
    ['Realism', 'People sign in through the form, type with keyboard input events, click buttons; operator, supervisor, manager, admin and viewer each use their own browser context (separate sessions) at the same time.'],
    ['Database checks', 'After each action the test reads the test database directly (Django shell) and compares it with what the screen shows.'],
    ['Network note', 'fonts.googleapis.com is dropped by the plant firewall. Functional sessions block it (fail fast); E2E-01 and E2E-36 use the real network to measure its effect.'],
    ['Re-run', 'npm run qa:e2e   ·   backend\\.venv\\Scripts\\python qa\\perf\\load.py   ·   node qa/report/build_pdf.mjs'],
  ],
})

// ---------- Cases ----------
heading('3. Automated browser cases')
table({
  head: [['ID', 'Area', 'Test case', 'Result', 'Evidence / actual']],
  columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 82 }, 2: { cellWidth: 250 }, 3: { cellWidth: 44, fontStyle: 'bold' } },
  body: e2e.results.map((r) => [r.id, r.area, r.name, r.result, r.detail]),
  didParseCell: (d) => d.section === 'body' && d.column.index === 3 && (d.cell.styles.fillColor = FILL[e2e.results[d.row.index].result]),
})

// ---------- Findings ----------
doc.addPage()
y = M
heading('4. Defects found in this phase')
para('Not fixed: per the audit plan, fixes wait for approval. Ordered by severity.', 9, MUTED)
const order = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity])
table({
  head: [['ID / severity', 'Module', 'Defect & steps', 'Expected → actual', 'Root cause', 'Recommended fix']],
  columnStyles: { 0: { cellWidth: 66 }, 1: { cellWidth: 70 }, 2: { cellWidth: 170 }, 3: { cellWidth: 130 }, 4: { cellWidth: 150 } },
  body: sorted.map((f) => [`${f.id}\n${f.severity}`, f.module, `${f.title}\n${f.steps}`, `${f.expected} → ${f.actual}`, f.cause, f.fix]),
  didParseCell: (d) => {
    if (d.section === 'body' && d.column.index === 0) {
      d.cell.styles.textColor = SEV[sorted[d.row.index].severity]
      d.cell.styles.fontStyle = 'bold'
    }
  },
})

// ---------- Performance ----------
if (perf) {
  heading('5. Performance and load')
  para(`Test plant: ${perf.data.sheets.toLocaleString()} machine-day sheets, ${perf.data.values.toLocaleString()} recorded values, ${perf.data.deviations.toLocaleString()} deviations, database ${perf.data.dbMb} MB (built in ${perf.backfillSeconds} s). Server: Django development server (threaded) on this PC, SQLite in WAL mode.`)
  table({
    head: [['Single request on the full data', 'Status', 'Time (ms)', 'Size (KB)']],
    body: Object.entries(perf.single).map(([k, v]) => [k + (v.totalRows ? ` · ${v.totalRows.toLocaleString()} rows in range` : ''), v.status, v.ms.toLocaleString(), v.kb.toLocaleString()]),
    tableWidth: 560,
  })
  table({
    head: [[`${perf.users} concurrent users · ${perf.seconds} s`, 'Requests', 'p50 ms', 'p95 ms', 'p99 ms', 'max ms', 'Errors']],
    body: [
      ...Object.entries(perf.load.byKind).map(([k, v]) => [k, v.requests, v.p50, v.p95, v.p99, v.max, Object.entries(v.errors).map(([c, n]) => `${c}: ${n}`).join(', ') || '0']),
      [{ content: `Total · ${perf.load.throughputPerSec} requests/s`, styles: { fontStyle: 'bold' } }, perf.load.totalRequests, '', '', '', '', perf.load.errors],
    ],
    tableWidth: 640,
  })
  if (e2e.perf) {
    table({
      head: [['Browser timing (E2E-01, E2E-36)', 'Measured']],
      body: [
        ['Sign-in form visible, cold browser, real network', `${e2e.perf.loginMs} ms`],
        ['Dashboard for a signed-in user, real network', `${e2e.perf.dashboardRealMs} ms`],
        ['Sign-in click → 10 machine cards', `${e2e.perf.dashboardMs} ms`],
        ['/api/bootstrap/ (first load)', `${e2e.perf.bootstrap.ms} ms · ${e2e.perf.bootstrap.kb} KB`],
        ['/api/live/ average of 10', `${e2e.perf.liveAvgMs} ms`],
        ['JavaScript heap', `${e2e.perf.heapMb} MB`],
      ],
      tableWidth: 460,
    })
  }
}

// ---------- Not covered ----------
heading('6. Not tested in this phase')
table({
  head: [['Area', 'Why', 'Next step']],
  body: [
    ['PostgreSQL', 'Docker / Postgres not started; all runs used SQLite', 'docker compose up -d mpcr-postgres, DB_ENGINE=postgres, re-run backend tests + load test'],
    ['Production web server', 'Django development server used for the load test', 'Repeat the load test behind waitress / IIS with several workers'],
    ['Other browsers', 'Only Microsoft Edge (Chromium) available here', 'Firefox / Safari smoke test if those are used on the floor'],
    ['npm dependency audit', 'registry.npmjs.org blocked (BASE-04b)', 'Run npm audit from a network with access'],
    ['Screen-reader walkthrough', 'Automated checks only (names, alt, lang, keyboard order)', 'Manual NVDA / Narrator pass on sign-in, log, report'],
  ],
})

const pages = doc.getNumberOfPages()
for (let i = 1; i <= pages; i++) {
  doc.setPage(i)
  doc.setFont('Arial', 'normal').setFontSize(8).setTextColor(...MUTED)
  doc.text(`MPCR QA Audit · Phase 2 · ${day}`, M, H - 20)
  doc.text(`Page ${i} / ${pages}`, W - M, H - 20, { align: 'right' })
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer')))
console.log(`written ${path.relative(ROOT, OUT)} · ${pages} pages · ${pass}/${e2e.results.length} cases passed · ${findings.length} findings`)
