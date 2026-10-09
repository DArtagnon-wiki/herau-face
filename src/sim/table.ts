import { ELEMENTALS } from './alchemy'
import type { Elemental, Glyph, Rune } from './types'

/** A rune that has been cast and now sits on the rune table. */
export interface TableEntry {
  id: number
  term: number
  rune: Rune
}

export const glyphsOf = (rune: Rune): Glyph[] => [rune.anchor, ...rune.joins.map((j) => j.glyph)]

/** How many elements of each elemental sit on the table. Neutral elements don't count. */
export function tally(table: TableEntry[]): Record<Elemental, number> {
  const counts = Object.fromEntries(ELEMENTALS.map((e) => [e, 0])) as Record<Elemental, number>
  for (const entry of table) for (const g of glyphsOf(entry.rune)) if (g.affinity !== 'none') counts[g.affinity] += 1
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

export const isEntwined = (entry: TableEntry) => entry.rune.joins.some((j) => j.kind === 'entwine')

/**
 * The rune a slump knocks loose: the one whose loss leaves the table most
 * lopsided. Entwined runes hold. Ties go to the most recent.
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
