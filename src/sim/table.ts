import { ELEMENTALS } from './alchemy'
import { runesOf } from './sigil'
import type { Elemental, Sigil } from './types'

/** A sigil that has been cast and now sits on the table. */
export interface TableEntry {
  id: number
  term: number
  sigil: Sigil
}

/** How many runes of each element sit on the table. Elementless runes don't count. */
export function tally(table: TableEntry[]): Record<Elemental, number> {
  const counts = Object.fromEntries(ELEMENTALS.map((e) => [e, 0])) as Record<Elemental, number>
  for (const entry of table) for (const r of runesOf(entry.sigil)) if (r.affinity !== 'none') counts[r.affinity] += 1
  return counts
}

/** Opposites cancel: Earth against Air, Water against Fire. */
export function imbalance(table: TableEntry[]): number {
  const t = tally(table)
  return Math.abs(t.earth - t.air) + Math.abs(t.water - t.fire)
}

/** A little lopsidedness is free; past that, every 2 points add 1 instability a term. */
export const FREE_IMBALANCE = 2

export function strain(table: TableEntry[], enabled = true): number {
  if (!enabled) return 0
  return Math.floor(Math.max(0, imbalance(table) - FREE_IMBALANCE) / 2)
}

export const isEntwined = (entry: TableEntry) => entry.sigil.joins.some((j) => j.kind === 'entwine')

/**
 * The sigil a slump knocks loose: the one whose loss leaves the table most
 * lopsided. Entwined sigils hold. Ties go to the most recent.
 */
export function slumpTarget(table: TableEntry[]): TableEntry | undefined {
  let best: TableEntry | undefined
  let bestAfter = -1
  for (const entry of table) {
    if (isEntwined(entry)) continue
    const after = imbalance(table.filter((e) => e !== entry))
    if (after >= bestAfter) {
      best = entry
      bestAfter = after
    }
  }
  return best
}
