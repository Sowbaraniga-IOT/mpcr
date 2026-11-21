// Excel and PDF exports of the hourly parameter sheet.
// The libraries are large, so each loads only when its export is first used.
//
// `sheet` = {
//   filename, title, footer, info: [[label, value]], head: [text],
//   sections: [{ title, rows: [{ cells: [value], digits, na, flags: { [col]: { kind, dir, label } } }] }],
//   deviations: [{ time, parameter, value, detail, status, reason, lot, by }],
// }
// A flag's `kind` is 'limit' (outside limits) or 'changed' (off standard, no tolerance); `dir` is LOW / HIGH.

export const COLORS = {
  ink: '1A1A1A',
  muted: '5E5A55',
  accent: 'E3241F',
  limitFill: 'FCE4E3',
  changed: 'B86E00',
  changedFill: 'FDEFD6',
  sectionFill: 'EBE6DC',
  stdFill: 'F0EDE7',
  rule: 'CFC9BF',
}
const STD_COL = 5 // "Standard" column, shaded like on screen

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- Excel ----------

export async function exportExcel(sheet) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MPCR'
  wb.created = new Date()

  const ws = wb.addWorksheet('Parameter log', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const cols = sheet.head.length
  const border = { style: 'thin', color: { argb: COLORS.rule } }
  const box = { top: border, left: border, bottom: border, right: border }
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

  ws.addRow([sheet.title]).font = { bold: true, size: 14, color: { argb: COLORS.accent } }
  ws.mergeCells(1, 1, 1, cols)
  for (const [label, value] of sheet.info) {
    const r = ws.addRow([label, value])
    r.getCell(1).font = { size: 9, color: { argb: COLORS.muted } }
    r.getCell(2).font = { bold: true }
  }
  ws.addRow([])

  const head = ws.addRow(sheet.head)
  head.height = 30
  head.eachCell((c, i) => {
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFF' } }
    c.fill = fill(COLORS.ink)
    c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center', wrapText: true }
    c.border = box
  })
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: head.number }]

  for (const section of sheet.sections) {
    const s = ws.addRow([section.title.toUpperCase()])
    ws.mergeCells(s.number, 1, s.number, cols)
    s.getCell(1).font = { bold: true, size: 9, color: { argb: COLORS.accent } }
    s.getCell(1).fill = fill(COLORS.sectionFill)

    for (const row of section.rows) {
      const r = ws.addRow(row.cells)
      r.eachCell({ includeEmpty: true }, (c, i) => {
        const col = i - 1
        c.border = box
        c.alignment = { horizontal: col === 0 ? 'left' : 'center' }
        if (typeof c.value === 'number' && col >= 2) c.numFmt = row.digits ? `0.${'0'.repeat(row.digits)}` : '0'
        if (row.na) c.font = { color: { argb: COLORS.muted } }
        if (col === 2 || col === STD_COL) c.font = { ...c.font, bold: true }
        if (col === STD_COL) c.fill = fill(COLORS.stdFill)
        const flag = row.flags[col]
        if (flag) {
          const color = flag.kind === 'limit' ? COLORS.accent : COLORS.changed
          c.fill = fill(flag.kind === 'limit' ? COLORS.limitFill : COLORS.changedFill)
          c.font = { bold: true, color: { argb: color } }
          c.note = flag.label // e.g. "1.0 °C above upper limit (260)"
        }
      })
    }
  }

  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 28 : i === 1 ? 8 : 10
  })

  if (sheet.deviations.length) {
    const dv = wb.addWorksheet('Deviations')
    const dh = dv.addRow(['Time', 'Parameter', 'Value', 'Deviation', 'Status', 'Reason', 'Lot no.', 'Entered by'])
    dh.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFF' } }
      c.fill = fill(COLORS.accent)
      c.border = box
    })
    for (const d of sheet.deviations) {
      dv.addRow([d.time, d.parameter, d.value, d.detail, d.status, d.reason, d.lot, d.by]).eachCell((c) => {
        c.border = box
        c.alignment = { vertical: 'top', wrapText: true }
      })
    }
    dv.columns = [8, 24, 12, 34, 16, 40, 16, 26].map((width) => ({ width }))
    dv.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  download(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${sheet.filename}.xlsx`,
  )
}

// ---------- PDF ----------

export const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
// The built-in PDF fonts have no superscripts or check marks.
export const pdfText = (v) =>
  String(v ?? '').replaceAll('⁻¹', '-1').replaceAll('✓', '').replaceAll(' → ', ' to ').replaceAll('→', '-')

export async function exportPdf(sheet) {
  const [{ jsPDF }, tables] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  // The ES build exports the function as default; the CommonJS build nests it one level deeper.
  const autoTable = tables.default?.default ?? tables.default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const cols = sheet.head.length
  // 24 hour columns need a smaller font to fit across an A4 page.
  const fontSize = cols > 20 ? 5.2 : 7.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...rgb(COLORS.accent))
  doc.text('MPCR', 10, 13)
  doc.setTextColor(...rgb(COLORS.ink))
  doc.text(pdfText(sheet.title), 30, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...rgb(COLORS.muted))
  doc.text(sheet.info.map(([l, v]) => `${l}: ${v}`).join('    '), 10, 19)

  const body = sheet.sections.flatMap((section) => [
    [
      {
        content: section.title.toUpperCase(),
        colSpan: cols,
        styles: { fillColor: rgb(COLORS.sectionFill), textColor: rgb(COLORS.accent), fontStyle: 'bold' },
      },
    ],
    ...section.rows.map((row) =>
      row.cells.map((cell, col) => {
        const flag = row.flags[col]
        const text = pdfText(typeof cell === 'number' && col >= 2 ? cell.toFixed(row.digits) : cell)
        if (flag) {
          const limit = flag.kind === 'limit'
          return {
            content: `${text} ${flag.dir}`,
            styles: {
              fillColor: rgb(limit ? COLORS.limitFill : COLORS.changedFill),
              textColor: rgb(limit ? COLORS.accent : COLORS.changed),
              fontStyle: 'bold',
            },
          }
        }
        const styles = {}
        if (row.na) styles.textColor = rgb(COLORS.muted)
        if (col === 2 || col === STD_COL) styles.fontStyle = 'bold'
        if (col === STD_COL) styles.fillColor = rgb(COLORS.stdFill)
        return { content: text, styles }
      }),
    ),
  ])

  autoTable(doc, {
    startY: 23,
    head: [sheet.head.map(pdfText)],
    body,
    theme: 'grid',
    margin: { left: 10, right: 10 },
    styles: { fontSize, cellPadding: 0.9, halign: 'center', lineColor: rgb(COLORS.rule), lineWidth: 0.1 },
    headStyles: { fillColor: rgb(COLORS.ink), textColor: 255, fontStyle: 'bold', valign: 'middle' },
    columnStyles: { 0: { halign: 'left', cellWidth: cols > 20 ? 30 : 40 } },
  })

  if (sheet.deviations.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Time', 'Parameter', 'Value', 'Deviation', 'Status', 'Reason', 'Lot no.', 'Entered by']],
      body: sheet.deviations.map((d) =>
        [d.time, d.parameter, d.value, d.detail, d.status, d.reason, d.lot, d.by].map(pdfText),
      ),
      theme: 'grid',
      margin: { left: 10, right: 10 },
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: rgb(COLORS.rule), lineWidth: 0.1 },
      headStyles: { fillColor: rgb(COLORS.accent), textColor: 255, fontStyle: 'bold' },
    })
  }

  // Page footer: where the limits come from + page numbers.
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(...rgb(COLORS.muted))
    doc.text(pdfText(sheet.footer), 10, 203)
    doc.text(`Page ${p} of ${pages}`, 287, 203, { align: 'right' })
  }

  doc.save(`${sheet.filename}.pdf`)
}
