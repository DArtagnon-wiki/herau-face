import { normalize, totalKg } from './alchemy'
import { CLAY_TARGET, MUD_START, applyIntent, cloneTarget, inBand, materialResistance, rollIntent, type BossTuning, type CombatMode, type CommissionKey, type Intent, type PurityEffects, type Target } from './commission'
import { DEFAULT_FORGE, buildDeck, cloneForge, makeRune, standardDeck, type Forge, type RuneSpec } from './deck'
import { makeRng, type Rng } from './rng'
import { canJoin, openLinks, resolve, runesOf, type Resolution } from './sigil'
import type { TableEntry } from './table'
import type { Pool, Rune, Sigil } from './types'
import { resolveEquation, type Equation } from './equation'

export interface Settings {
  /** Whether Force past the requirement multiplies Reach. */
  surplusForce: boolean
  flareScale: number
  stock: number
  handSize: number
  discards: number
  /** Most sigils a term; 0 means as many as the hand allows. */
  castsPerTerm: number
  /** The small flare on mud's moves that do something else (seep, evaporate, scorch, slump); 0 for none. */
  debuffFlare?: number
  /** Mud's flare moves, before the acting elemental's share scales them. */
  flareMin?: number
  flareMax?: number
  flareRise?: number
  /** Each elemental's chance to act in a term, by purity (see ACT_CHANCE). */
  actChance?: number[]
  /** How the commission fights: purity effects (the default) or element moves. */
  combat?: CombatMode
  /** Overrides for the purity effects (see PURITY_EFFECTS). */
  purity?: Partial<PurityEffects>
  /** When set, sigils resolve by the alchemical equation instead of Reach × Force. */
  equation?: Equation | null
  /** Overrides for a boss's pressure (see MIRE_TUNING). */
  boss?: Partial<BossTuning>
}

export const DEFAULT_SETTINGS: Settings = {
  surplusForce: true,
  flareScale: 1,
  stock: 100,
  handSize: 6,
  discards: 2,
  castsPerTerm: 0,
  // Mud's pressure, tuned with the equation and the 4-circle, 8-crescent deck:
  // each elemental acts by its purity, flare moves of 13–16 scaled by the
  // elemental's share, and small flares on its other moves.
  flareMin: 13,
  flareMax: 16,
  flareRise: 0,
  debuffFlare: 4,
  equation: null,
}

/** One sigil cast during a term. It resolves at once. */
export interface CastOutcome {
  term: number
  sigil: Sigil
  resolution: Resolution
  /** The amalgam right after this cast. */
  pools: Pool[]
  finished: boolean
}

/** What happens when the term ends: the commission acts, and Ward meets the instability. */
export interface EndOutcome {
  pools: Pool[]
  table: TableEntry[]
  intentNote: string
  flare: number
  /** Ward gathered over the term's casts, plus any the commission's pure pools lend. */
  ward: number
  absorbed: number
  paid: number
  /** The commission's own move left the amalgam in range, so the commission finishes once this term is paid. */
  finished: boolean
}

export interface TermOutcome extends EndOutcome {
  term: number
  intent: Intent
  casts: CastOutcome[]
}

export interface GameState {
  settings: Settings
  /** Which commission is being worked. */
  commission: CommissionKey
  /** The numbers behind bodies and motes; the sandbox can change them. */
  forge: Forge
  /** The composition this commission must reach. */
  target: Target
  /** The composition the amalgam started from. */
  start: Pool[]
  seed: number
  draw: Rune[]
  hand: Rune[]
  discard: Rune[]
  pools: Pool[]
  table: TableEntry[]
  term: number
  quintessence: number
  spent: number
  discardsLeft: number
  intent: Intent
  phase: 'compose' | 'won' | 'lost'
  /** Sigils cast so far this term. */
  casts: CastOutcome[]
  /** Ward gathered so far this term. */
  termWard: number
  history: TermOutcome[]
  nextTableId: number
}

function drawUp(state: GameState, rng: Rng): GameState {
  let { draw, hand, discard } = state
  draw = draw.slice()
  hand = hand.slice()
  while (hand.length < state.settings.handSize) {
    if (draw.length === 0) {
      if (discard.length === 0) break
      draw = rng.shuffle(discard)
      discard = []
    }
    hand.push(draw.shift()!)
  }
  return { ...state, draw, hand, discard }
}

/**
 * Every opening hand holds at least one water and one earth, so the first
 * term can always work the mud. After that the shuffle is left alone.
 */
export function fairOpening(deck: Rune[], handSize: number): Rune[] {
  const out = deck.slice()
  for (const need of ['water', 'earth'] as const) {
    if (out.slice(0, handSize).some((g) => g.affinity === need)) continue
    const from = out.findIndex((g, i) => i >= handSize && g.affinity === need)
    let to = -1
    for (let i = Math.min(handSize, out.length) - 1; i >= 0; i--) {
      if (out[i].affinity !== 'water' && out[i].affinity !== 'earth') {
        to = i
        break
      }
    }
    if (from >= 0 && to >= 0) [out[from], out[to]] = [out[to], out[from]]
  }
  return out
}

export interface Setup {
  forge: Forge
  deck: RuneSpec[]
  start: Pool[]
  target: Target
  /** Which commission: mud by default, or a boss. */
  commission?: CommissionKey
}

export const standardSetup = (): Setup => ({
  forge: cloneForge(DEFAULT_FORGE),
  deck: standardDeck(),
  start: MUD_START.map((p) => ({ ...p })),
  target: cloneTarget(CLAY_TARGET),
  commission: 'mud',
})

export function newGame(settings: Settings = DEFAULT_SETTINGS, seed = Date.now(), setup: Setup = standardSetup()): GameState {
  const rng = makeRng(seed)
  const pools = normalize(setup.start)
  const commission = setup.commission ?? 'mud'
  let state: GameState = {
    settings,
    commission,
    forge: setup.forge,
    target: setup.target,
    start: pools,
    seed,
    draw: fairOpening(rng.shuffle(buildDeck(setup.deck, setup.forge)), settings.handSize),
    hand: [],
    discard: [],
    pools,
    table: [],
    term: 1,
    quintessence: settings.stock,
    spent: 0,
    discardsLeft: settings.discards,
    intent: rollIntent(rng, 1, pools, [], settings, commission),
    phase: 'compose',
    casts: [],
    termWard: 0,
    history: [],
    nextTableId: 1,
  }
  state = drawUp(state, rng)
  return { ...state, seed: rng.state() }
}

/** How many more sigils can be cast this term: the setting, and a boss's bind. */
export function castsLeft(state: GameState): number {
  const limit = Math.min(state.settings.castsPerTerm > 0 ? state.settings.castsPerTerm : Infinity, state.intent.castLimit ?? Infinity)
  return Number.isFinite(limit) ? Math.max(0, limit - state.casts.length) : Infinity
}

/** The resistance multiplier this term: the material's, times any stiffening. */
export const resistanceMult = (state: Pick<GameState, 'commission' | 'intent' | 'settings'>): number =>
  materialResistance(state.commission, state.settings.boss) * (state.intent.resistanceMult ?? 1)

/** Why a sigil can't be cast as it stands, or null when it can. */
export function invalidReason(state: GameState, sigil: Sigil): string | null {
  if (state.phase !== 'compose') return 'The commission is over.'
  if (castsLeft(state) <= 0) return state.intent.castLimit ? 'Bound: only one sigil this term.' : 'No more sigils this term.'
  const runes = runesOf(sigil)
  const ids = new Set(runes.map((r) => r.id))
  if (ids.size !== runes.length) return 'A rune can only be placed once.'
  if (!runes.every((r) => state.hand.some((h) => h.id === r.id))) return 'Every rune must come from your hand.'
  if (sigil.joins.length > 0 && (sigil.anchor.links < 1 || openLinks(sigil) < 0)) return 'The sigil has more joins than links.'
  return null
}

export { canJoin }

/** The end of the term as things stand: the commission acts, and the term's Ward meets it. */
function endOf(state: Pick<GameState, 'intent' | 'pools' | 'table' | 'termWard' | 'settings' | 'target'>): EndOutcome {
  const acted = applyIntent(state.intent, state.pools, state.table)
  const flare = state.intent.flare
  const incoming = flare
  // The commission's own pure pools lend Ward alongside the term's sigils.
  const ward = state.termWard + (state.intent.ward ?? 0)
  const absorbed = Math.min(ward, incoming)
  const paid = Math.round((incoming - absorbed) * 10) / 10
  return {
    pools: acted.pools,
    table: acted.table,
    intentNote: acted.note,
    flare,
    ward,
    absorbed,
    paid,
    finished: inBand(acted.pools, state.target),
  }
}

export const previewEnd = (state: GameState): EndOutcome => endOf(state)

export interface CastPreview {
  cast: CastOutcome
  table: TableEntry[]
  /** What ending the term right after this cast would do; null when the cast finishes the commission. */
  end: EndOutcome | null
}

/** Exactly what casting this sigil would do, and what ending the term after it would cost. */
export function previewCast(state: GameState, sigil: Sigil, poolKey?: string): CastPreview {
  const mult = resistanceMult(state)
  const resolution = state.settings.equation
    ? resolveEquation(sigil, state.pools, poolKey, { ...state.settings.equation, base: state.settings.equation.base * mult })
    : resolve(sigil, state.pools, poolKey, { ...state.settings, resistanceMult: mult })
  const table = [...state.table, { id: state.nextTableId, term: state.term, sigil }]
  const finished = inBand(resolution.pools, state.target)
  const cast: CastOutcome = { term: state.term, sigil, resolution, pools: resolution.pools, finished }
  const end = finished
    ? null
    : endOf({ ...state, pools: resolution.pools, table, termWard: state.termWard + resolution.outputs.ward })
  return { cast, table, end }
}

export function cast(state: GameState, sigil: Sigil, poolKey?: string): GameState {
  const reason = invalidReason(state, sigil)
  if (reason) throw new Error(reason)
  const p = previewCast(state, sigil, poolKey)
  const used = new Set(runesOf(sigil).map((r) => r.id))
  const next: GameState = {
    ...state,
    hand: state.hand.filter((r) => !used.has(r.id)),
    discard: [...state.discard, ...runesOf(sigil)],
    pools: p.cast.pools,
    table: p.table,
    termWard: state.termWard + p.cast.resolution.outputs.ward,
    casts: [...state.casts, p.cast],
    nextTableId: state.nextTableId + 1,
  }
  return p.cast.finished ? { ...next, phase: 'won' } : next
}

/** End the term: the commission acts, unabsorbed instability costs quintessence, and the next term begins. */
export function endTerm(state: GameState): GameState {
  if (state.phase !== 'compose') return state
  const e = endOf(state)
  const rng = makeRng(state.seed)
  const quintessence = Math.max(0, Math.round((state.quintessence - e.paid) * 10) / 10)
  let next: GameState = {
    ...state,
    pools: e.pools,
    table: e.table,
    quintessence,
    spent: Math.round((state.spent + e.paid) * 10) / 10,
    history: [...state.history, { ...e, term: state.term, intent: state.intent, casts: state.casts }],
    casts: [],
    termWard: 0,
  }
  if (quintessence <= 0) return { ...next, phase: 'lost', seed: rng.state() }
  // A commission finishes the moment the amalgam is in range, even when its own move put it there.
  if (e.finished) return { ...next, phase: 'won', seed: rng.state() }
  if (state.intent.junk) {
    let id = Math.max(0, ...[...next.hand, ...next.draw, ...next.discard].map((r) => r.id))
    const draw = next.draw.slice()
    for (let i = 0; i < state.intent.junk; i++) draw.splice(rng.int(0, draw.length), 0, makeRune(++id, { body: 'circle', motes: [], junk: true }, state.forge))
    next = { ...next, draw }
  }
  const term = state.term + 1
  next = { ...next, term, intent: rollIntent(rng, term, next.pools, next.table, state.settings, state.commission) }
  next = drawUp(next, rng)
  return { ...next, seed: rng.state() }
}

export function discardRunes(state: GameState, ids: number[]): GameState {
  if (state.phase !== 'compose' || state.discardsLeft <= 0 || ids.length === 0) return state
  const drop = new Set(ids)
  const rng = makeRng(state.seed)
  let next: GameState = {
    ...state,
    hand: state.hand.filter((g) => !drop.has(g.id)),
    discard: [...state.discard, ...state.hand.filter((g) => drop.has(g.id))],
    discardsLeft: state.discardsLeft - 1,
  }
  next = drawUp(next, rng)
  return { ...next, seed: rng.state() }
}

/** Every sigil cast so far, this term included. */
export const sigilsPlayed = (state: GameState): Sigil[] => [
  ...state.history.flatMap((t) => t.casts.map((c) => c.sigil)),
  ...state.casts.map((c) => c.sigil),
]

/** Terms used, counting a term in progress that has casts. */
export const termsUsed = (state: GameState): number => state.history.length + (state.casts.length > 0 ? 1 : 0)

/** Payment for a finished commission: more product earns more. */
export const payment = (state: GameState) => (state.phase === 'won' ? Math.round(totalKg(state.pools) * 2) : 0)
