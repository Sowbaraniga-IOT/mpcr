// Molds and parts, as in the template's "Molds" and "Parts" sheets. Loaded from the server;
// edits and Excel uploads are saved there.
import { replaceAll } from './store.js'
import { api, save } from '../api/client.js'

export const MOLDS = []
export const PARTS = []

export function hydrateCatalog(molds, parts) {
  replaceAll(MOLDS, molds)
  replaceAll(PARTS, parts)
}

export const partName = (partNo) => PARTS.find((p) => p.partNo === partNo)?.partName ?? ''

// Add or update molds / parts (e.g. from an Excel upload). Lists are updated in place.
export function upsertMolds(list) {
  for (const mold of list) {
    const i = MOLDS.findIndex((m) => m.no === mold.no)
    if (i >= 0) MOLDS[i] = { ...MOLDS[i], ...mold }
    else MOLDS.push(mold)
  }
  save(api.post('/molds/bulk/', { molds: list }))
}

export function upsertParts(list) {
  for (const part of list) {
    const i = PARTS.findIndex((p) => p.partNo === part.partNo)
    if (i >= 0) PARTS[i] = { ...PARTS[i], ...part }
    else PARTS.push(part)
  }
  save(api.post('/parts/bulk/', { parts: list }))
}
