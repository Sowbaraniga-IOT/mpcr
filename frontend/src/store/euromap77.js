// Which EUROMAP 77 node (FANUC ROBOSHOT OPC UA) each parameter comes from. The server owns the
// mapping (backend/integrations/fanuc/euromap77.py) and sends it with the first load.

let doc = { root: '', params: {}, live: {}, machineInfo: {} }

export function hydrateEuromap77(data) {
  if (data) doc = { ...doc, ...data }
}

// The node for a parameter-sheet code (TMP_Z1, MON_CYCLE …), or null if the machine doesn't publish it.
export const euromapNode = (code) => doc.params[code] ?? null

// One line for a tooltip: the path, its namespace and anything to check on the machine.
export function euromapTitle(code) {
  const n = euromapNode(code)
  if (!n) return 'No EUROMAP 77 node: entered by hand'
  const lines = [`EUROMAP 77 (ns ${n.ns}): ${n.path}`]
  if (n.setpoint) lines.push(`Setpoint: ${n.setpoint}`)
  if (n.note) lines.push(n.note)
  if (n.verify) lines.push('Check this node on the machine before relying on it.')
  return lines.join('\n')
}

// The short form shown under a code: the last two parts of the path.
export function euromapShort(code) {
  const n = euromapNode(code)
  return n ? n.path.split('/').slice(-2).join('/') : null
}
