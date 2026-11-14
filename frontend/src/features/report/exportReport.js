// Excel and PDF exports of the standard-vs-actual report.
// A month can hold close to a million readings, more than a PDF (or a quick Excel
// download) should carry, so rows are capped. Deviations come first, so they're the rows kept.
import { COLORS, download, pdfText, rgb } from '../log/exportLog.js'
import { STATUS_LABELS, kindOf, reasonFor, wordsFor } from '../../store/report.js'
import { formatDate, formatReading, hourLabel, shiftOf } from '../../store/parameterLog.js'

const STATUS_COLORS = { open: COLORS.accent, rejected: COLORS.accent, awaiting: COLORS.changed, supervised: COLORS.changed, closed: '1F9D48' }

export const EXCEL_ROW_LIMIT = 50_000
export const PDF_ROW_LIMIT = 1_000

const HEAD = ['Date', 'Shift', 'Time', 'Machine', 'Mold', 'Part no.', 'Parameter', 'Unit', 'Lower limit', 'Standard', 'Upper limit', 'Actual', 'Deviation (in words)', 'Reason · entered by', 'Approval']

function cellsFor(r, partNo) {
  const fixed = (v) => (r.row.text ?? (v == null ? '—' : v))
  return [
    formatDate(r.date),
    shiftOf(r.hour),
    hourLabel(r.hour),
    r.machine.id,
    r.machine.mold,
    partNo(r.machine),
    r.row.label,
    r.row.unit,
    fixed(r.row.lower),
    fixed(r.row.std),
    fixed(r.row.upper),
    r.value,
    wordsFor(r),
    reasonFor(r.deviation),
    r.deviation ? STATUS_LABELS[r.deviation.status] : '—',
  ]
}

// Which columns the "Values" filter keeps: Standard hides Actual, Actual hides the limits.
function visibleColumns(values) {
  return HEAD.map((_, i) => i).filter((i) => !(values === 'standard' && i === 11) && !(values === 'actual' && i >= 8 && i <= 10))
}

// `report` is what runReport returned; `meta` = { filename, title, filters: [[label, value]], stats: [[label, value]], values, partNo }
export async function exportReportExcel(report, meta) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MPCR'
  wb.created = new Date()
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const border = { style: 'thin', color: { argb: COLORS.rule } }
  const box = { top: border, left: border, bottom: border, right: border }
  const cols = visibleColumns(meta.values)
  const count = Math.min(report.total, EXCEL_ROW_LIMIT)

  // ---------- Summary ----------
  const sum = wb.addWorksheet('Summary')
  sum.addRow([meta.title]).font = { bold: true, size: 14, color: { argb: COLORS.accent } }
  sum.addRow([])
  for (const [label, value] of [...meta.filters, [], ...meta.stats]) {
    const r = sum.addRow(label ? [label, value] : [])
    r.getCell(1).font = { color: { argb: COLORS.muted } }
    r.getCell(2).font = { bold: true }
  }
  if (count < report.total) {
    sum.addRow([])
    sum.addRow([`The Report sheet holds the first ${count.toLocaleString()} of ${report.total.toLocaleString()} rows (all deviations come first). Narrow the filters to export the rest.`]).font = { italic: true, color: { argb: COLORS.accent } }
  }
  sum.columns = [{ width: 22 }, { width: 48 }]

  // ---------- Rows ----------
  const ws = wb.addWorksheet('Report', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const head = ws.addRow(cols.map((i) => HEAD[i]))
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFF' } }
    c.fill = fill(COLORS.ink)
    c.border = box
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }

  for (let start = 0; start < count; start += 1000) {
    for (const r of await report.rowsAt(start, Math.min(1000, count - start))) {
      const all = cellsFor(r, meta.partNo)
      const row = ws.addRow(cols.map((i) => all[i]))
      const kind = kindOf(r)
      const actualCol = cols.indexOf(11) + 1
      const wordsCol = cols.indexOf(12) + 1
      const approvalCol = cols.indexOf(14) + 1
      if (actualCol && typeof r.value === 'number') row.getCell(actualCol).numFmt = r.row.digits ? `0.${'0'.repeat(r.row.digits)}` : '0'
      if (kind !== 'ok') {
        const color = kind === 'limit' ? COLORS.accent : COLORS.changed
        row.eachCell((c) => (c.fill = fill(kind === 'limit' ? COLORS.limitFill : COLORS.changedFill)))
        if (actualCol) row.getCell(actualCol).font = { bold: true, color: { argb: color } }
        row.getCell(wordsCol).font = { bold: true, color: { argb: color } }
        row.getCell(approvalCol).font = { bold: true, color: { argb: 'FFFFFF' } }
        row.getCell(approvalCol).fill = fill(STATUS_COLORS[r.deviation.status])
      } else {
        row.getCell(wordsCol).font = { color: { argb: '1F9D48' } }
      }
    }
  }
  const WIDTHS = [11, 6, 7, 9, 8, 13, 24, 7, 10, 10, 10, 10, 30, 44, 15]
  ws.columns = cols.map((i) => ({ width: WIDTHS[i] }))

  const buffer = await wb.xlsx.writeBuffer()
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${meta.filename}.xlsx`)
}

export async function exportReportPdf(report, meta) {
  const [{ jsPDF }, tables] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  // The ES build exports the function as default; the CommonJS build nests it one level deeper.
  const autoTable = tables.default?.default ?? tables.default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const cols = visibleColumns(meta.values)
  const count = Math.min(report.total, PDF_ROW_LIMIT)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...rgb(COLORS.accent))
  doc.text('MPCR', 10, 13)
  doc.setTextColor(...rgb(COLORS.ink))
  doc.text(pdfText(meta.title), 30, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...rgb(COLORS.muted))
  doc.text(pdfText(meta.filters.map(([l, v]) => `${l}: ${v}`).join('    ')), 10, 19, { maxWidth: 277 })

  // Stats strip as a one-row table.
  autoTable(doc, {
    startY: 24,
    head: [meta.stats.map(([l]) => l)],
    body: [meta.stats.map(([, v]) => v)],
    theme: 'grid',
    margin: { left: 10, right: 10 },
    styles: { fontSize: 9, cellPadding: 1.5, lineColor: rgb(COLORS.rule), lineWidth: 0.1 },
    headStyles: { fillColor: rgb(COLORS.sectionFill), textColor: rgb(COLORS.muted), fontSize: 7 },
    bodyStyles: { fontStyle: 'bold' },
  })

  const body = (await report.rowsAt(0, count)).map((r) => {
    const all = cellsFor(r, meta.partNo)
    all[11] = formatReading(r.row, r.value)
    const kind = kindOf(r)
    return cols.map((i) => {
      const styles = {}
      if (kind !== 'ok') {
        styles.fillColor = rgb(kind === 'limit' ? COLORS.limitFill : COLORS.changedFill)
        if (i === 11 || i === 12) styles.textColor = rgb(kind === 'limit' ? COLORS.accent : COLORS.changed)
        if (i === 11 || i === 12 || i === 14) styles.fontStyle = 'bold'
        if (i === 14) styles.textColor = rgb(STATUS_COLORS[r.deviation.status])
      } else if (i === 12) {
        styles.textColor = [31, 157, 72]
      }
      if (i === 9) styles.fontStyle = 'bold'
      return { content: pdfText(all[i]), styles }
    })
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [cols.map((i) => HEAD[i])],
    body,
    theme: 'grid',
    margin: { left: 10, right: 10 },
    styles: { fontSize: 6.3, cellPadding: 0.9, lineColor: rgb(COLORS.rule), lineWidth: 0.1, overflow: 'linebreak' },
    headStyles: { fillColor: rgb(COLORS.ink), textColor: 255, fontStyle: 'bold' },
  })

  const note =
    count < report.total
      ? `Showing the first ${count.toLocaleString()} of ${report.total.toLocaleString()} rows (deviations first). Use Excel or narrower filters for the full list.`
      : `${report.total.toLocaleString()} rows.`
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(...rgb(COLORS.muted))
    doc.text(pdfText(note), 10, 203)
    doc.text(`Page ${p} of ${pages}`, 287, 203, { align: 'right' })
  }

  doc.save(`${meta.filename}.pdf`)
}
