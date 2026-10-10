import { normalize, totalKg } from './alchemy'
import { CLAY_TARGET, MUD_START, applyIntent, cloneTarget, inBand, rollIntent, type Intent, type Target } from './commission'
import { DEFAULT_FORGE, buildDeck, cloneForge, standardDeck, type Forge, type RuneSpec } from './deck'
import { makeRng, type Rng } from './rng'
import { canJoin, openLinks, resolve, runesOf, type Resolution } from './sigil'
import { strain, type TableEntry } from './table'
import type { Pool, Rune, Sigil } from './types'
import { resolveEquation, type Equation } from './equation'

export interface Settings {
  /** Whether a lopsided table adds instability each term. */
  strain: boolean
  /** Whether Force past the requirement multiplies Reach. */
  surplusForce: boolean
  flareScale: number
  stock: number
  handSize: number
  discards: number
  /** Most sigils a term; 0 means as many as the hand allows. */
  castsPerTerm: number
  /** When set, sigils resolve by the alchemical equation instead of Reach × Force. */
  equation?: Equation | null
}

export const DEFAULT_SETTINGS: Settings = {
  strain: true,
  surplusForce: true,
  flareScale: 1,
  stock: 100,
  handSize: 6,
  discards: 2,
  castsPerTerm: 0,
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
  removed?: TableEntry
  flare: number
  strain: number
  /** Ward gathered over the term's casts. */
  ward: number
  absorbed: number
  paid: number
}

export interface TermOutcome extends EndOutcome {
  term: number
  intent: Intent
  casts: CastOutcome[]
}

export interface GameState {
  settings: Settings
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
}

export const standardSetup = (): Setup => ({
  forge: cloneForge(DEFAULT_FORGE),
  deck: standardDeck(),
  start: MUD_START.map((p) => ({ ...p })),
  target: cloneTarget(CLAY_TARGET),
})

export function newGame(settings: Settings = DEFAULT_SETTINGS, seed = Date.now(), setup: Setup = standardSetup()): GameState {
  const rng = makeRng(seed)
  const pools = normalize(setup.start)
  let state: GameState = {
    settings,
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
    intent: rollIntent(rng, 1, pools, [], settings),
    phase: 'compose',
    casts: [],
    termWard: 0,
    history: [],
    nextTableId: 1,
  }
  state = drawUp(state, rng)
  return { ...state, seed: rng.state() }
}

/** How many more sigils can be cast this term. */
export const castsLeft = (state: GameState): number =>
  state.settings.castsPerTerm > 0 ? Math.max(0, state.settings.castsPerTerm - state.casts.length) : Infinity

/** Why a sigil can't be cast as it stands, or null when it can. */
export function invalidReason(state: GameState, sigil: Sigil): string | null {
  if (state.phase !== 'compose') return 'The commission is over.'
  if (castsLeft(state) <= 0) return 'No more sigils this term.'
  const runes = runesOf(sigil)
  const ids = new Set(runes.map((r) => r.id))
  if (ids.size !== runes.length) return 'A rune can only be placed once.'
  if (!runes.every((r) => state.hand.some((h) => h.id === r.id))) return 'Every rune must come from your hand.'
  if (sigil.joins.length > 0 && (sigil.anchor.links < 1 || openLinks(sigil) < 0)) return 'The sigil has more joins than links.'
  return null
}

export { canJoin }

/** The end of the term as things stand: the commission acts, and the term's Ward meets it. */
function endOf(state: Pick<GameState, 'intent' | 'pools' | 'table' | 'termWard' | 'settings'>): EndOutcome {
  const acted = applyIntent(state.intent, state.pools, state.table)
  const flare = state.intent.flare
  const tableStrain = strain(acted.table, state.settings.strain)
  const incoming = flare + tableStrain
  const absorbed = Math.min(state.termWard, incoming)
  const paid = Math.round((incoming - absorbed) * 10) / 10
  return {
    pools: acted.pools,
    table: acted.table,
    intentNote: acted.note,
    removed: acted.removed,
    flare,
    strain: tableStrain,
    ward: state.termWard,
    absorbed,
    paid,
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
  const resolution = state.settings.equation
    ? resolveEquation(sigil, state.pools, poolKey, state.settings.equation)
    : resolve(sigil, state.pools, poolKey, state.settings)
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
  const term = state.term + 1
  next = { ...next, term, intent: rollIntent(rng, term, next.pools, next.table, state.settings) }
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
