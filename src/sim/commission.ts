import { ELEMENTALS, elementalKg, normalize, share, transfer } from './alchemy'
import type { Rng } from './rng'
import { slumpTarget, type TableEntry } from './table'
import type { Elemental, Pool } from './types'

// One commission: mud (the source, the opponent) into clay (the target, the puzzle).

/** Mud: earth and water, with a little air and fire from its organics. */
export const MUD_START: Pool[] = normalize([
  { elemental: 'earth', grade: 1, kg: 18 },
  { elemental: 'water', grade: 0, kg: 18 },
  { elemental: 'air', grade: 1, kg: 2 },
  { elemental: 'fire', grade: 1, kg: 2 },
])

/** A share band, as fractions. A min of 0 or a max of 1 leaves that side open. Bounds are strict. */
export interface Range {
  min: number
  max: number
}

export type Target = Record<Elemental, Range>

const ANY: Range = { min: 0, max: 1 }

/** Clay: 75–85% earth, with air and fire each between 1% and 3%. */
export const CLAY_TARGET: Target = {
  earth: { min: 0.75, max: 0.85 },
  water: { ...ANY },
  air: { min: 0.01, max: 0.03 },
  fire: { min: 0.01, max: 0.03 },
}

export const cloneTarget = (t: Target): Target => ({
  earth: { ...t.earth },
  water: { ...t.water },
  air: { ...t.air },
  fire: { ...t.fire },
})

export const constrained = (r: Range) => r.min > 0 || r.max < 1
export const within = (s: number, r: Range) => (r.min <= 0 || s > r.min) && (r.max >= 1 || s < r.max)

export const earthShare = (pools: Pool[]) => share(pools, 'earth')
export const shares = (pools: Pool[]): Record<Elemental, number> =>
  Object.fromEntries(ELEMENTALS.map((e) => [e, share(pools, e)])) as Record<Elemental, number>

export function inBand(pools: Pool[], target: Target = CLAY_TARGET): boolean {
  return ELEMENTALS.every((e) => within(share(pools, e), target[e]))
}

/**
 * How far the amalgam is from the target: for each constrained element, the
 * gap outside its band, in band widths. 0 when every share is in band.
 */
export function miss(pools: Pool[], target: Target = CLAY_TARGET): number {
  let total = 0
  for (const e of ELEMENTALS) {
    const r = target[e]
    if (!constrained(r)) continue
    const s = share(pools, e)
    const lo = r.min > 0 ? r.min : 0
    const hi = r.max < 1 ? r.max : 1
    const width = Math.max(0.005, hi - lo)
    total += Math.max(0, lo - s, s - hi) / width
  }
  return total
}

/** The amalgam's name: clay when it meets the target, otherwise a region along the earth share. */
export function substanceName(pools: Pool[], target: Target = CLAY_TARGET): string {
  if (inBand(pools, target)) return 'Clay'
  const s = earthShare(pools)
  const band = target.earth
  if (within(s, band)) {
    const high = (['air', 'fire'] as const).some((e) => constrained(target[e]) && target[e].max < 1 && share(pools, e) >= target[e].max)
    return high ? 'Organic clay' : 'Lean clay'
  }
  if (s < 0.35) return 'Slurry'
  if (s < Math.min(0.65, band.min)) return 'Mud'
  if (band.min > 0 && s <= band.min) return 'Loam'
  return 'Hardpan'
}

// ---------------------------------------------------------------------------
// Mud's action pool: a shallow weighted pool, rolled and revealed each term.

export type IntentKind = 'flare' | 'seep' | 'harden' | 'slump'

export interface Intent {
  kind: IntentKind
  /** Instability this term, before Ward and table strain. */
  flare: number
  /** Kg affected, for seep and harden. */
  kg: number
  title: string
  detail: string
}

export interface IntentSettings {
  flareScale: number
}

const SEEP_KG = 0.5
const HARDEN_KG = 2

export function rollIntent(rng: Rng, term: number, pools: Pool[], table: TableEntry[], settings: IntentSettings): Intent {
  const weakWater = pools.find((p) => p.elemental === 'water' && p.grade === 0)?.kg ?? 0
  const weights: [IntentKind, number][] = [
    ['flare', 60 + 5 * (term - 1)],
    ['seep', elementalKg(pools, 'earth') > 0.5 ? 20 : 0],
    ['harden', weakWater >= 0.5 ? 15 : 0],
    ['slump', slumpTarget(table) ? 15 : 0],
  ]
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng.float() * total
  let kind: IntentKind = 'flare'
  for (const [k, w] of weights) {
    if (roll < w) {
      kind = k
      break
    }
    roll -= w
  }

  if (kind === 'flare') {
    const flare = Math.max(1, Math.round((rng.int(11, 15) + (term - 1)) * settings.flareScale))
    return { kind, flare, kg: 0, title: `Flare ${flare}`, detail: 'The mud destabilizes. Ward absorbs it; the rest costs quintessence.' }
  }
  if (kind === 'seep') {
    const kg = Math.min(SEEP_KG, elementalKg(pools, 'earth'))
    return { kind, flare: 0, kg, title: 'Seep', detail: `${fmtKg(kg)} of earth turns back to weak water.` }
  }
  if (kind === 'harden') {
    const kg = Math.min(HARDEN_KG, weakWater)
    return { kind, flare: 0, kg, title: 'Harden', detail: `${fmtKg(kg)} of weak water firms up to medium.` }
  }
  return { kind, flare: 0, kg: 0, title: 'Slump', detail: 'The rune holding the table most level slips off. Entwined runes hold.' }
}

export interface IntentResult {
  pools: Pool[]
  table: TableEntry[]
  removed?: TableEntry
  note: string
}

/** What the commission does at the end of a term. */
export function applyIntent(intent: Intent, pools: Pool[], table: TableEntry[]): IntentResult {
  if (intent.kind === 'seep') {
    const source = pools.filter((p) => p.elemental === 'earth').sort((a, b) => b.kg - a.kg)[0]
    if (!source) return { pools, table, note: 'Nothing left to seep.' }
    const kg = Math.min(intent.kg, source.kg)
    return {
      pools: transfer(pools, source, kg, { elemental: 'water', grade: 0 }, kg),
      table,
      note: `Seep: ${fmtKg(kg)} of earth turned to water.`,
    }
  }
  if (intent.kind === 'harden') {
    const source = pools.find((p) => p.elemental === 'water' && p.grade === 0)
    if (!source) return { pools, table, note: 'Nothing left to harden.' }
    const kg = Math.min(intent.kg, source.kg)
    return {
      pools: transfer(pools, source, kg, { elemental: 'water', grade: 1 }, kg),
      table,
      note: `Harden: ${fmtKg(kg)} of water is now medium.`,
    }
  }
  if (intent.kind === 'slump') {
    const removed = slumpTarget(table)
    if (!removed) return { pools, table, note: 'Slump: every rune held.' }
    return { pools, table: table.filter((e) => e !== removed), removed, note: 'Slump: a rune slipped off the table.' }
  }
  return { pools, table, note: '' }
}

export const fmtKg = (kg: number) => `${kg.toFixed(1)} kg`
