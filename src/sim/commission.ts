import { ELEMENTALS, elementalKg, normalize, share, transfer } from './alchemy'
import type { Rng } from './rng'
import { slumpTarget, type TableEntry } from './table'
import type { Elemental, Grade, Pool } from './types'

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
    blurb: 'A boss. 180 kilos of stubborn bog to fire into brick, 80–90% earth with air and fire each between 1% and 3%. It is restless: its elements act far more often than mud’s, every move carries a flare, its earth stiffens to double its resistance, its water binds you to one sigil a term, and its fire throws slag into your deck. Built for a late-run deck.',
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
// Combat: each elemental in the amalgam may act each term, and its purity sets
// the chance. Impure elementals are restless; pure ones settle. An elemental
// that acts draws one move from its own pool, so all four can act at once,
// and a calm term is possible. Moves land in proportion to the elemental's
// share of the amalgam, so a trace's moves are small. Everything a sigil
// transmutes comes out impure, so working an amalgam stirs it up; purifying
// is the defence.

export type MoveKind = 'flare' | 'seep' | 'evaporate' | 'scorch' | 'slump' | 'stiffen' | 'bind' | 'slag' | 'taint' | 'settle'

/**
 * How the commission fights. 'purity': every pool may stir, and its purity
 * decides what it does (impure flares, medium flares a little and taints,
 * pure lends Ward), scaled by its kilos. 'moves': every element may act and
 * draws a move from its own pool.
 */
export type CombatMode = 'purity' | 'moves'

/**
 * Purity effects. Each element stirs with its own chance, the same whatever
 * its purity; when it stirs, every one of its pools does what its purity does
 * (by purity: impure, medium, pure, perfect), for every `mass` kilos of it.
 */
export interface PurityEffects {
  /** Each element's chance to stir in a term. */
  chance: Record<Elemental, number>
  flare: number[]
  /** Ward lent to the player against this term's flares. */
  ward: number[]
  /** The share of the pool adulterated one grade. */
  taint: number[]
  /** The kilos each effect is quoted for: a pool twice this size does twice as much. */
  mass: number
}

/**
 * Every element stirs half the time. Per 18 kg of a pool: impure flares 15;
 * medium flares 5 and taints a tenth of itself to impure; pure and perfect
 * lend Ward 3.
 */
export const PURITY_EFFECTS: PurityEffects = {
  chance: { earth: 0.5, water: 0.5, air: 0.5, fire: 0.5 },
  flare: [15, 5, 0, 0],
  ward: [0, 0, 3, 3],
  taint: [0, 0.1, 0, 0],
  mass: 18,
}

/** One elemental's move this term. */
export interface Move {
  element: Elemental
  kind: MoveKind
  name: string
  /** Instability this move adds, before Ward and table strain. */
  flare: number
  /** Kg affected, for seep, evaporate, scorch and taint. */
  kg: number
  detail: string
  /** The pool that stirred, under purity effects. */
  grade?: Grade
  /** Ward a pure pool lends against this term's flares. */
  ward?: number
  /** Boss buffs, in force for the term the move is revealed. */
  resistanceMult?: number
  castLimit?: number
  /** Junk runes added to the draw pile when the term ends. */
  junk?: number
}

/** Everything the commission does this term: every elemental that acts, and the totals. */
export interface Intent {
  moves: Move[]
  /** Instability this term from every move, before Ward and table strain. */
  flare: number
  /** Ward the commission's own pure pools lend against this term's flares. */
  ward: number
  resistanceMult?: number
  castLimit?: number
  junk?: number
  title: string
  detail: string
}

/** The chance an elemental acts in a term, by purity: impure, medium, pure, perfect. */
export const ACT_CHANCE: number[] = [0.5, 0.25, 0.1, 0.03]

export interface IntentSettings {
  flareScale: number
  /** The small flare on moves that do something else (seep, evaporate, scorch, slump): this to this + 2. 0 for none. */
  debuffFlare?: number
  /** A flare move's size before its elemental's share scales it: flareMin to flareMax. */
  flareMin?: number
  flareMax?: number
  /** How much a flare grows each term (0). */
  flareRise?: number
  /** Chance to act by purity, overriding ACT_CHANCE. */
  actChance?: number[]
  /** How the commission fights (purity effects by default). */
  combat?: CombatMode
  /** Overrides for mud's purity effects. */
  purity?: Partial<PurityEffects>
}

/** How hard a boss presses; the simulator and Tuning can override any of it. */
export interface BossTuning {
  /** The material's resistance, as a multiple of the equation's base (mud is 1). */
  resistance: number
  /** Every boss move's flare before its elemental's share scales it: flareMin to flareMax. */
  flareMin: number
  flareMax: number
  /** Stiffen multiplies resistance by this for the term. */
  stiffen: number
  /** Slag adds this many junk runes to the draw pile. */
  junk: number
  /** A boss is restless: each of its elementals' chance to act, by purity (element moves only). */
  act: number[]
  /** Under purity effects, the boss's own effects: its pools are big, so each effect is quoted per more kilos. */
  purity: Partial<PurityEffects>
  /** Under purity effects, the chance an element that stirs also makes its signature move (earth stiffens, water binds, fire slags). */
  signature: number
}

/**
 * A restless boss: its elementals act far more often than mud's, mostly with
 * flares and a third of the time with a debuff. Tuned so the late-run deck
 * wins about two times in three, spending a median of about 63 quintessence
 * when it does, and the mid-run deck never wins.
 */
export const MIRE_TUNING: BossTuning = {
  resistance: 1,
  flareMin: 14,
  flareMax: 18,
  stiffen: 2,
  junk: 2,
  act: [0.9, 0.65, 0.35, 0.1],
  purity: { mass: 35 },
  signature: 1 / 3,
}

/** The material's resistance for the commission, before any stiffening. */
export const materialResistance = (key: CommissionKey, boss?: Partial<BossTuning>): number => (key === 'mire' ? (boss?.resistance ?? MIRE_TUNING.resistance) : 1)

interface MoveSpec {
  kind: MoveKind
  name: string
  weight: number
  /** Carries the small flare rather than a full one (mud only). */
  small?: boolean
  kg?: number
}

/** Each elemental's pool of moves, by commission. */
const MOVES: Record<CommissionKey, Record<Elemental, MoveSpec[]>> = {
  mud: {
    earth: [
      { kind: 'flare', name: 'Tremor', weight: 2 },
      { kind: 'slump', name: 'Slump', weight: 1, small: true },
    ],
    water: [
      { kind: 'flare', name: 'Swell', weight: 2 },
      { kind: 'seep', name: 'Seep', weight: 1, small: true, kg: 0.5 },
    ],
    air: [
      { kind: 'flare', name: 'Gust', weight: 2 },
      { kind: 'evaporate', name: 'Evaporate', weight: 1, small: true, kg: 0.5 },
    ],
    fire: [
      { kind: 'flare', name: 'Flare', weight: 2 },
      { kind: 'scorch', name: 'Scorch', weight: 1, small: true, kg: 0.5 },
    ],
  },
  mire: {
    earth: [
      { kind: 'stiffen', name: 'Stiffen', weight: 1 },
      { kind: 'flare', name: 'Tremor', weight: 2 },
    ],
    water: [
      { kind: 'bind', name: 'Bind', weight: 1 },
      { kind: 'flare', name: 'Swell', weight: 2 },
    ],
    air: [{ kind: 'flare', name: 'Gust', weight: 1 }],
    fire: [
      { kind: 'slag', name: 'Slag', weight: 1 },
      { kind: 'flare', name: 'Flare', weight: 2 },
    ],
  },
}

const NAME: Record<Elemental, string> = { earth: 'Earth', water: 'Water', air: 'Air', fire: 'Fire' }

/** How strongly an elemental's moves land, by its share of the amalgam. */
export const moveStrength = (share: number) => 0.4 + 1.2 * share

/** The chance this elemental acts this term: its pools' chances, weighted by kilos. */
export function actChance(pools: Pool[], e: Elemental, chances: number[] = ACT_CHANCE): number {
  const mine = pools.filter((p) => p.elemental === e && p.kg > 0)
  const kg = mine.reduce((sum, p) => sum + p.kg, 0)
  return kg > 0 ? mine.reduce((sum, p) => sum + p.kg * (chances[p.grade] ?? 0), 0) / kg : 0
}

export const actChances = (pools: Pool[], chances: number[] = ACT_CHANCE): Record<Elemental, number> =>
  Object.fromEntries(ELEMENTALS.map((e) => [e, actChance(pools, e, chances)])) as Record<Elemental, number>

function available(m: MoveSpec, pools: Pool[], table: TableEntry[]): boolean {
  if (m.kind === 'seep' || m.kind === 'scorch') return elementalKg(pools, 'earth') >= 0.5
  if (m.kind === 'evaporate') return elementalKg(pools, 'water') >= 0.5
  if (m.kind === 'slump') return !!slumpTarget(table)
  return true
}

type Settings = IntentSettings & { boss?: Partial<BossTuning> }

/** The flare range a move draws from, before share scaling. */
function flareRange(m: MoveSpec, term: number, settings: Settings, key: CommissionKey): [number, number] {
  if (key !== 'mud') {
    const t = { ...MIRE_TUNING, ...settings.boss }
    return [t.flareMin, t.flareMax]
  }
  if (m.small) {
    const d = settings.debuffFlare ?? 0
    return d > 0 ? [d, d + 2] : [0, 0]
  }
  const rise = (settings.flareRise ?? 0) * (term - 1)
  return [(settings.flareMin ?? 16) + rise, (settings.flareMax ?? 20) + rise]
}

function buildMove(rng: Rng, e: Elemental, m: MoveSpec, term: number, pools: Pool[], settings: Settings, key: CommissionKey): Move {
  const [lo, hi] = flareRange(m, term, settings, key)
  const strength = moveStrength(share(pools, e))
  const flare = hi > 0 ? Math.max(1, Math.round(rng.int(Math.round(lo), Math.round(hi)) * strength * settings.flareScale)) : 0
  const t = { ...MIRE_TUNING, ...settings.boss }
  const base = { element: e, kind: m.kind, name: m.name, flare, kg: 0 }
  switch (m.kind) {
    case 'seep': {
      const kg = Math.min(m.kg ?? 0.5, elementalKg(pools, 'earth'))
      return { ...base, kg, detail: `${fmtKg(kg)} of earth seeps into impure water.` }
    }
    case 'evaporate': {
      const kg = Math.min(m.kg ?? 0.5, elementalKg(pools, 'water'))
      return { ...base, kg, detail: `${fmtKg(kg)} of water evaporates into impure air.` }
    }
    case 'scorch': {
      const kg = Math.min(m.kg ?? 0.5, elementalKg(pools, 'earth'))
      return { ...base, kg, detail: `${fmtKg(kg)} of earth burns into impure fire.` }
    }
    case 'slump':
      return { ...base, detail: `The rune holding the table most level slips off; entwined runes hold.` }
    case 'stiffen':
      return { ...base, resistanceMult: t.stiffen, detail: `Resistance ×${t.stiffen} for every sigil this term.` }
    case 'bind':
      return { ...base, castLimit: 1, detail: `Only one sigil this term.` }
    case 'slag':
      return { ...base, junk: t.junk, detail: `${t.junk} slag runes join your draw pile when the term ends: power 1, no links.` }
    default:
      return { ...base, detail: `The ${e} destabilizes.` }
  }
}

/** Gather the term's moves into one intent. */
export function composeIntent(moves: Move[]): Intent {
  const mult = moves.reduce((m, x) => m * (x.resistanceMult ?? 1), 1)
  const limit = Math.min(...moves.map((x) => x.castLimit ?? Infinity))
  const junk = moves.reduce((n, x) => n + (x.junk ?? 0), 0)
  return {
    moves,
    flare: moves.reduce((sum, x) => sum + x.flare, 0),
    ...(mult !== 1 ? { resistanceMult: mult } : {}),
    ...(Number.isFinite(limit) ? { castLimit: limit } : {}),
    ...(junk ? { junk } : {}),
    ward: Math.round(moves.reduce((sum, x) => sum + (x.ward ?? 0), 0) * 10) / 10,
    title: moves.length ? moves.map((x) => `${NAME[x.element]}: ${x.name}${x.flare ? ` ${x.flare}` : ''}${x.ward ? ` Ward ${x.ward}` : ''}`).join(' · ') : 'Calm',
    detail: moves.length ? moves.map((x) => `${x.detail}${x.flare ? ` Flare ${x.flare}.` : ''}`).join(' ') : 'Nothing stirs this term.',
  }
}

/** The chances to act by purity for this commission: a boss's own under element moves, or the settings'. */
export const chancesFor = (settings: Settings, key: CommissionKey): number[] =>
  key === 'mud' || combatOf(settings) === 'purity' ? (settings.actChance ?? ACT_CHANCE) : (settings.boss?.act ?? MIRE_TUNING.act)

export const combatOf = (settings: Settings): CombatMode => settings.combat ?? 'purity'

/** The purity effects for this commission: mud's, or a boss's own on top. */
export function effectsFor(settings: Settings, key: CommissionKey): PurityEffects {
  const base = { ...PURITY_EFFECTS, ...settings.purity }
  const fx = key === 'mud' ? base : { ...base, ...MIRE_TUNING.purity, ...settings.boss?.purity }
  return { ...fx, chance: { ...PURITY_EFFECTS.chance, ...fx.chance } }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** What one pool does if it stirs, under purity effects. */
export function poolEffect(p: Pool, fx: PurityEffects, flareScale = 1): { flare: number; ward: number; taint: number } {
  const scale = p.kg / fx.mass
  return {
    flare: Math.round((fx.flare[p.grade] ?? 0) * scale * flareScale),
    ward: round1((fx.ward[p.grade] ?? 0) * scale),
    taint: p.grade > 0 ? round1((fx.taint[p.grade] ?? 0) * p.kg) : 0,
  }
}

/** Every pool's chance to stir next term (its element's) and what it would do. */
export function poolOdds(pools: Pool[], settings: Settings, key: CommissionKey = 'mud') {
  const fx = effectsFor(settings, key)
  return pools.filter((p) => p.kg > 0).map((p) => ({ pool: p, chance: fx.chance[p.elemental] ?? 0, ...poolEffect(p, fx, settings.flareScale) }))
}

/** Each element's chance to stir next term and what all its pools would do together. */
export function elementOdds(pools: Pool[], settings: Settings, key: CommissionKey = 'mud') {
  const odds = poolOdds(pools, settings, key)
  return ELEMENTALS.map((e) => {
    const mine = odds.filter((o) => o.pool.elemental === e)
    return {
      element: e,
      chance: effectsFor(settings, key).chance[e] ?? 0,
      kg: mine.reduce((n, o) => n + o.pool.kg, 0),
      flare: mine.reduce((n, o) => n + o.flare, 0),
      ward: round1(mine.reduce((n, o) => n + o.ward, 0)),
      taint: round1(mine.reduce((n, o) => n + o.taint, 0)),
    }
  }).filter((o) => o.kg > 0)
}

const SIGNATURE: Partial<Record<Elemental, MoveSpec>> = {
  earth: { kind: 'stiffen', name: 'Stiffen', weight: 1 },
  water: { kind: 'bind', name: 'Bind', weight: 1 },
  fire: { kind: 'slag', name: 'Slag', weight: 1 },
}

/** Purity effects: each element stirs by its own chance, and every pool of it does what its purity does. */
function rollPurity(rng: Rng, term: number, pools: Pool[], settings: Settings, key: CommissionKey): Intent {
  const fx = effectsFor(settings, key)
  const moves: Move[] = []
  const stirred = new Set<Elemental>()
  for (const e of ELEMENTALS) {
    const mine = pools.filter((q) => q.elemental === e && q.kg > 0).sort((a, b) => a.grade - b.grade)
    if (!mine.length || rng.float() >= (fx.chance[e] ?? 0)) continue
    for (const p of mine) {
      const { flare, ward, taint } = poolEffect(p, fx, settings.flareScale)
      if (!flare && !ward && !taint) continue
      stirred.add(e)
      const grade = GRADE_WORD[p.grade]
      if (p.grade === 0) moves.push({ element: e, kind: 'flare', name: 'Flare', grade: p.grade, flare, kg: 0, detail: `${fmtKg(p.kg)} of ${grade} ${e} flares.` })
      else if (taint > 0) moves.push({ element: e, kind: 'taint', name: 'Taint', grade: p.grade, flare, kg: taint, detail: `${fmtKg(p.kg)} of ${grade} ${e} stirs, and ${fmtKg(taint)} of it turns ${GRADE_WORD[p.grade - 1]}.` })
      else moves.push({ element: e, kind: 'settle', name: 'Settle', grade: p.grade, flare, kg: 0, ward, detail: `${fmtKg(p.kg)} of ${grade} ${e} settles, lending Ward ${ward} against this term’s flares.` })
    }
  }
  if (key !== 'mud') {
    const chance = settings.boss?.signature ?? MIRE_TUNING.signature
    for (const e of stirred) {
      const spec = SIGNATURE[e]
      if (spec && rng.float() < chance) moves.push(buildMove(rng, e, spec, term, pools, { ...settings, boss: { ...settings.boss, flareMin: 0, flareMax: 0 } }, key))
    }
  }
  return composeIntent(moves)
}

const GRADE_WORD = ['impure', 'medium', 'pure', 'perfect']

export function rollIntent(rng: Rng, term: number, pools: Pool[], table: TableEntry[], settings: Settings, key: CommissionKey = 'mud'): Intent {
  if (combatOf(settings) === 'purity') return rollPurity(rng, term, pools, settings, key)
  const moves: Move[] = []
  const chances = chancesFor(settings, key)
  for (const e of ELEMENTALS) {
    if (elementalKg(pools, e) <= 0) continue
    if (rng.float() >= actChance(pools, e, chances)) continue
    const specs = MOVES[key][e].filter((m) => available(m, pools, table))
    const total = specs.reduce((sum, m) => sum + m.weight, 0)
    if (!total) continue
    let roll = rng.float() * total
    let pick = specs[0]
    for (const m of specs) {
      if (roll < m.weight) {
        pick = m
        break
      }
      roll -= m.weight
    }
    moves.push(buildMove(rng, e, pick, term, pools, settings, key))
  }
  return composeIntent(moves)
}

/**
 * The instability the commission is expected to throw next term from this
 * amalgam: each elemental's chance to act times its moves' average flare.
 * What the simulated player weighs when it decides whether purifying pays.
 */
export function expectedThreat(pools: Pool[], table: TableEntry[], settings: Settings, key: CommissionKey = 'mud', term = 1): number {
  if (combatOf(settings) === 'purity') return poolOdds(pools, settings, key).reduce((sum, o) => sum + o.chance * (o.flare - o.ward), 0)
  let total = 0
  const chances = chancesFor(settings, key)
  for (const e of ELEMENTALS) {
    const p = actChance(pools, e, chances)
    if (!p) continue
    const specs = MOVES[key][e].filter((m) => available(m, pools, table))
    const w = specs.reduce((sum, m) => sum + m.weight, 0)
    if (!w) continue
    const strength = moveStrength(share(pools, e)) * settings.flareScale
    total += p * specs.reduce((sum, m) => {
      const [lo, hi] = flareRange(m, term, settings, key)
      return sum + (m.weight / w) * ((lo + hi) / 2) * strength
    }, 0)
  }
  return total
}

export interface IntentResult {
  pools: Pool[]
  table: TableEntry[]
  removed?: TableEntry
  note: string
}

/** What the commission does at the end of a term: every move in turn. */
export function applyIntent(intent: Intent, pools: Pool[], table: TableEntry[]): IntentResult {
  let removed: TableEntry | undefined
  const notes: string[] = []
  for (const m of intent.moves) {
    const shift = (from: Elemental, to: Elemental, verb: string) => {
      const source = pools.filter((p) => p.elemental === from).sort((a, b) => b.kg - a.kg)[0]
      if (!source) return
      const kg = Math.min(m.kg, source.kg)
      pools = transfer(pools, source, kg, { elemental: to, grade: 0 }, kg)
      notes.push(`${m.name}: ${fmtKg(kg)} of ${from} ${verb} impure ${to}.`)
    }
    if (m.kind === 'taint' && m.grade) {
      const source = pools.find((p) => p.elemental === m.element && p.grade === m.grade)
      if (source) {
        const kg = Math.min(m.kg, source.kg)
        pools = transfer(pools, source, kg, { elemental: m.element, grade: (m.grade - 1) as Grade }, kg)
        notes.push(`Taint: ${fmtKg(kg)} of ${GRADE_WORD[m.grade]} ${m.element} turned ${GRADE_WORD[m.grade - 1]}.`)
      }
    } else if (m.kind === 'seep') shift('earth', 'water', 'seeped into')
    else if (m.kind === 'evaporate') shift('water', 'air', 'evaporated into')
    else if (m.kind === 'scorch') shift('earth', 'fire', 'burned into')
    else if (m.kind === 'slump') {
      const r = slumpTarget(table)
      if (r) {
        removed = r
        table = table.filter((e) => e !== r)
        notes.push('Slump: a sigil slipped off the table.')
      } else notes.push('Slump: every sigil held.')
    }
  }
  return { pools, table, removed, note: notes.join(' ') }
}

export const fmtKg = (kg: number) => `${kg.toFixed(1)} kg`
