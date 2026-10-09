import { elementalKg, normalize, share, transfer } from './alchemy'
import type { Rng } from './rng'
import { slumpTarget, type TableEntry } from './table'
import type { Pool } from './types'

// One commission: mud (the source, the opponent) into clay (the target, the puzzle).

export const MUD_START: Pool[] = normalize([
  { elemental: 'earth', grade: 1, kg: 24 },
  { elemental: 'water', grade: 0, kg: 24 },
])

/** Clay: 75–85% earth by mass, any grade. */
export const CLAY_BAND: [number, number] = [0.75, 0.85]

/** Named regions along the earth share. Clay is the target. */
const REGIONS: { below: number; name: string }[] = [
  { below: 0.35, name: 'Slurry' },
  { below: 0.65, name: 'Mud' },
  { below: CLAY_BAND[0], name: 'Loam' },
  { below: CLAY_BAND[1], name: 'Clay' },
  { below: Infinity, name: 'Hardpan' },
]

const EPS = 1e-9
export const earthShare = (pools: Pool[]) => share(pools, 'earth')
export const inBand = (pools: Pool[]) => {
  const s = earthShare(pools)
  return s >= CLAY_BAND[0] - EPS && s <= CLAY_BAND[1] + EPS
}

export function substanceName(pools: Pool[]): string {
  const s = earthShare(pools)
  if (inBand(pools)) return 'Clay'
  return REGIONS.find((r) => s < r.below)!.name
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
    const flare = Math.max(1, Math.round((rng.int(10, 14) + (term - 1)) * settings.flareScale))
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
