import { ELEMENTALS, elementalKg, normalize, share, transfer } from './alchemy'
import type { Rng } from './rng'
import { slumpTarget, type TableEntry } from './table'
import type { Elemental, Pool } from './types'

// Commissions: a source (the opponent) to bring to a target (the puzzle).
// Mud into clay is the everyday commission; the Mire into brick is a boss.

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

/** The Mire: a stubborn bog, four and a half times mud's weight. */
export const MIRE_START: Pool[] = normalize([
  { elemental: 'earth', grade: 1, kg: 67.5 },
  { elemental: 'water', grade: 0, kg: 90 },
  { elemental: 'air', grade: 1, kg: 11.25 },
  { elemental: 'fire', grade: 1, kg: 11.25 },
])

/** Brick: 80–90% earth, with air and fire each between 1% and 3%. */
export const BRICK_TARGET: Target = {
  earth: { min: 0.8, max: 0.9 },
  water: { ...ANY },
  air: { min: 0.01, max: 0.03 },
  fire: { min: 0.01, max: 0.03 },
}

export type CommissionKey = 'mud' | 'mire'

export interface Commission {
  key: CommissionKey
  /** The source, named as the opponent. */
  source: string
  /** What it becomes. */
  product: string
  boss: boolean
  start: Pool[]
  target: Target
  blurb: string
}

export const COMMISSIONS: Record<CommissionKey, Commission> = {
  mud: {
    key: 'mud',
    source: 'Mud',
    product: 'Clay',
    boss: false,
    start: MUD_START,
    target: CLAY_TARGET,
    blurb: 'Forty kilos of mud: mostly earth and water, with a little air and fire from its organics. Bring it to clay, 75–85% earth with air and fire each between 1% and 3%, before your quintessence runs out.',
  },
  mire: {
    key: 'mire',
    source: 'The Mire',
    product: 'Brick',
    boss: true,
    start: MIRE_START,
    target: BRICK_TARGET,
    blurb: 'A boss. 180 kilos of stubborn bog to fire into brick, 80–90% earth with air and fire each between 1% and 3%. Every move it makes comes with a flare of 32–36, and between flares it stiffens to double its resistance, binds you to one sigil a term, and throws slag into your deck. Built for a late-run deck.',
  },
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
export function substanceName(pools: Pool[], target: Target = CLAY_TARGET, key: CommissionKey = 'mud'): string {
  if (key === 'mire') {
    if (inBand(pools, target)) return 'Brick'
    return within(earthShare(pools), target.earth) ? 'Unfired brick' : earthShare(pools) < 0.6 ? 'Mire' : 'Peat'
  }
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

export type IntentKind = 'flare' | 'seep' | 'harden' | 'slump' | 'surge' | 'stiffen' | 'slag' | 'bind'

export interface Intent {
  kind: IntentKind
  /** Instability this term, before Ward and table strain. */
  flare: number
  /** Kg affected, for seep and harden. */
  kg: number
  title: string
  detail: string
  /** Boss buffs, in force for the term the move is revealed. */
  resistanceMult?: number
  castLimit?: number
  /** Junk runes added to the draw pile when the term ends. */
  junk?: number
}

export interface IntentSettings {
  flareScale: number
  /** A small flare on seep, harden and slump turns: this to this + 2, plus half a point a term. 0 for none. */
  debuffFlare?: number
  /** A flare's size before escalation: flareMin to flareMax (11–15). */
  flareMin?: number
  flareMax?: number
  /** How much a flare grows each term (1). */
  flareRise?: number
  /** How much more likely a flare becomes each term (weight +5 against seep 20, harden 15, slump 15). */
  flareWeightRise?: number
}

const SEEP_KG = 0.5
const HARDEN_KG = 2

/** How hard a boss presses; the simulator and Tuning can override any of it. */
export interface BossTuning {
  /** The material's resistance, as a multiple of the equation's base (mud is 1). */
  resistance: number
  /** Every move's flare: flareMin to flareMax, the same every term. */
  flareMin: number
  flareMax: number
  /** Stiffen multiplies resistance by this for the term. */
  stiffen: number
  /** Slag adds this many junk runes to the draw pile. */
  junk: number
  weights: { surge: number; stiffen: number; slag: number; bind: number }
}

/**
 * Tuned so the late-run deck wins about 70% of the time, paying a median of
 * 68 quintessence when it does, and the mid-run deck never wins.
 */
export const MIRE_TUNING: BossTuning = {
  resistance: 1,
  flareMin: 32,
  flareMax: 36,
  stiffen: 2,
  junk: 2,
  weights: { surge: 25, stiffen: 25, slag: 25, bind: 25 },
}

/** The material's resistance for the commission, before any stiffening. */
export const materialResistance = (key: CommissionKey, boss?: Partial<BossTuning>): number => (key === 'mire' ? (boss?.resistance ?? MIRE_TUNING.resistance) : 1)

function rollBoss(rng: Rng, settings: IntentSettings & { boss?: Partial<BossTuning> }): Intent {
  const t = { ...MIRE_TUNING, ...settings.boss, weights: { ...MIRE_TUNING.weights, ...settings.boss?.weights } }
  const weights = Object.entries(t.weights) as [keyof BossTuning['weights'], number][]
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng.float() * total
  let kind: keyof BossTuning['weights'] = 'surge'
  for (const [k, w] of weights) {
    if (roll < w) {
      kind = k
      break
    }
    roll -= w
  }
  const flare = Math.max(1, Math.round(rng.int(t.flareMin, t.flareMax) * settings.flareScale))
  if (kind === 'stiffen')
    return { kind, flare, kg: 0, resistanceMult: t.stiffen, title: `Stiffen + flare ${flare}`, detail: `The Mire sets hard: resistance ×${t.stiffen} for every sigil this term.` }
  if (kind === 'bind') return { kind, flare, kg: 0, castLimit: 1, title: `Bind + flare ${flare}`, detail: 'Roots close around the work: only one sigil this term.' }
  if (kind === 'slag')
    return { kind, flare, kg: 0, junk: t.junk, title: `Slag + flare ${flare}`, detail: `${t.junk} slag runes join your draw pile when the term ends. Slag has power 1 and no links.` }
  return { kind: 'surge', flare, kg: 0, title: `Surge ${flare}`, detail: 'The Mire heaves. Ward absorbs it; the rest costs quintessence.' }
}

export function rollIntent(
  rng: Rng,
  term: number,
  pools: Pool[],
  table: TableEntry[],
  settings: IntentSettings & { boss?: Partial<BossTuning> },
  key: CommissionKey = 'mud',
): Intent {
  if (key === 'mire') return rollBoss(rng, settings)
  const weakWater = pools.find((p) => p.elemental === 'water' && p.grade === 0)?.kg ?? 0
  const weights: [IntentKind, number][] = [
    ['flare', 60 + (settings.flareWeightRise ?? 5) * (term - 1)],
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
    const flare = Math.max(1, Math.round((rng.int(settings.flareMin ?? 11, settings.flareMax ?? 15) + (settings.flareRise ?? 1) * (term - 1)) * settings.flareScale))
    return { kind, flare, kg: 0, title: `Flare ${flare}`, detail: 'The mud destabilizes. Ward absorbs it; the rest costs quintessence.' }
  }
  const d = settings.debuffFlare ?? 0
  const small = d > 0 ? Math.max(1, Math.round((rng.int(d, d + 2) + (term - 1) / 2) * settings.flareScale)) : 0
  const plus = small ? ` Flare ${small} with it.` : ''
  const titled = (t: string) => (small ? `${t} + flare ${small}` : t)
  if (kind === 'seep') {
    const kg = Math.min(SEEP_KG, elementalKg(pools, 'earth'))
    return { kind, flare: small, kg, title: titled('Seep'), detail: `${fmtKg(kg)} of earth turns back to weak water.${plus}` }
  }
  if (kind === 'harden') {
    const kg = Math.min(HARDEN_KG, weakWater)
    return { kind, flare: small, kg, title: titled('Harden'), detail: `${fmtKg(kg)} of weak water firms up to medium.${plus}` }
  }
  return { kind, flare: small, kg: 0, title: titled('Slump'), detail: `The rune holding the table most level slips off. Entwined runes hold.${plus}` }
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
