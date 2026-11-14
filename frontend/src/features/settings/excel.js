// Read an uploaded .xlsx into plain rows of cell values, one array per sheet.
// exceljs is large, so it loads only when a file is actually uploaded.

const MAX_BYTES = 10 * 1024 * 1024

function plain(value) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((t) => t.text).join('')
    if ('result' in value) return plain(value.result) // formula
    if (value.text != null) return value.text // hyperlink
    return null
  }
  return typeof value === 'string' ? value.trim() : value
}

export async function readWorkbook(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Upload an .xlsx file (the MPCR template).')
  if (file.size > MAX_BYTES) throw new Error('That file is over 10 MB.')
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const sheets = {}
  for (const ws of wb.worksheets) {
    const rows = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = []
      for (let c = 1; c <= ws.columnCount; c++) cells.push(plain(row.getCell(c).value))
      rows.push(cells)
    })
    sheets[ws.name] = rows
  }
  return sheets
}

export const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/MPCR_Parameter_Master_Template.xlsx`
