import { totalKg } from './alchemy'
import { MUD_START, applyIntent, earthShare, inBand, rollIntent, substanceName, type Intent } from './commission'
import { startingDeck } from './deck'
import { makeRng, type Rng } from './rng'
import { resolve, type Resolution } from './rune'
import { glyphsOf, strain, type TableEntry } from './table'
import type { Glyph, Pool, Rune, ShapeClass } from './types'

export interface Settings {
  /** Whether a lopsided rune table adds instability each term. */
  strain: boolean
  /** Whether Force past the requirement multiplies Reach. */
  surplusForce: boolean
  flareScale: number
  stock: number
  handSize: number
  discards: number
}

export const DEFAULT_SETTINGS: Settings = { strain: true, surplusForce: true, flareScale: 1, stock: 100, handSize: 7, discards: 2 }

export interface TermOutcome {
  term: number
  rune: Rune
  resolution: Resolution
  pools: Pool[]
  table: TableEntry[]
  share: number
  substance: string
  finished: boolean
  intent: Intent
  intentNote: string
  removed?: TableEntry
  flare: number
  strain: number
  ward: number
  absorbed: number
  paid: number
}

export interface GameState {
  settings: Settings
  deckClass: ShapeClass
  seed: number
  draw: Glyph[]
  hand: Glyph[]
  discard: Glyph[]
  pools: Pool[]
  table: TableEntry[]
  term: number
  quintessence: number
  spent: number
  discardsLeft: number
  intent: Intent
  phase: 'compose' | 'won' | 'lost'
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

export function newGame(deckClass: ShapeClass, settings: Settings = DEFAULT_SETTINGS, seed = Date.now()): GameState {
  const rng = makeRng(seed)
  const pools = MUD_START
  let state: GameState = {
    settings,
    deckClass,
    seed,
    draw: rng.shuffle(startingDeck(deckClass)),
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
    history: [],
    nextTableId: 1,
  }
  state = drawUp(state, rng)
  return { ...state, seed: rng.state() }
}

/** Why a rune can't be cast as it stands, or null when it can. */
export function invalidReason(state: GameState, rune: Rune): string | null {
  const glyphs = glyphsOf(rune)
  const ids = new Set(glyphs.map((g) => g.id))
  if (ids.size !== glyphs.length) return 'An element can only be placed once.'
  if (!glyphs.every((g) => state.hand.some((h) => h.id === g.id))) return 'Every element must come from your hand.'
  if (rune.joins.length > rune.anchor.sides) return `This anchor holds ${rune.anchor.sides} joins.`
  return null
}

/** Exactly what this term would do, without changing anything. Drives the preview and the cast. */
export function previewTerm(state: GameState, rune: Rune, poolKey?: string): TermOutcome {
  const resolution = resolve(rune, state.pools, poolKey, state.settings)
  const placed: TableEntry = { id: state.nextTableId, term: state.term, rune }
  const tableAfterCast = [...state.table, placed]
  const ward = resolution.outputs.ward
  const finished = inBand(resolution.pools)
  const base = {
    term: state.term,
    rune,
    resolution,
    intent: state.intent,
    ward,
    finished,
  }
  if (finished) {
    return {
      ...base,
      pools: resolution.pools,
      table: tableAfterCast,
      share: earthShare(resolution.pools),
      substance: substanceName(resolution.pools),
      intentNote: 'The clay sets before the mud can act.',
      flare: 0,
      strain: 0,
      absorbed: 0,
      paid: 0,
    }
  }
  const acted = applyIntent(state.intent, resolution.pools, tableAfterCast)
  const flare = state.intent.flare
  const tableStrain = strain(acted.table, state.settings.strain)
  const incoming = flare + tableStrain
  const absorbed = Math.min(ward, incoming)
  const paid = Math.round((incoming - absorbed) * 10) / 10
  return {
    ...base,
    pools: acted.pools,
    table: acted.table,
    share: earthShare(acted.pools),
    substance: substanceName(acted.pools),
    intentNote: acted.note,
    removed: acted.removed,
    flare,
    strain: tableStrain,
    absorbed,
    paid,
  }
}

export function cast(state: GameState, rune: Rune, poolKey?: string): GameState {
  if (state.phase !== 'compose') return state
  const reason = invalidReason(state, rune)
  if (reason) throw new Error(reason)

  const outcome = previewTerm(state, rune, poolKey)
  const rng = makeRng(state.seed)
  const used = new Set(glyphsOf(rune).map((g) => g.id))
  const quintessence = Math.max(0, Math.round((state.quintessence - outcome.paid) * 10) / 10)

  let next: GameState = {
    ...state,
    hand: state.hand.filter((g) => !used.has(g.id)),
    discard: [...state.discard, ...glyphsOf(rune)],
    pools: outcome.pools,
    table: outcome.table,
    quintessence,
    spent: Math.round((state.spent + outcome.paid) * 10) / 10,
    history: [...state.history, outcome],
    nextTableId: state.nextTableId + 1,
  }
  if (outcome.finished) return { ...next, phase: 'won', seed: rng.state() }
  if (quintessence <= 0) return { ...next, phase: 'lost', seed: rng.state() }

  const term = state.term + 1
  next = { ...next, term, intent: rollIntent(rng, term, next.pools, next.table, state.settings) }
  next = drawUp(next, rng)
  return { ...next, seed: rng.state() }
}

export function discardGlyphs(state: GameState, ids: number[]): GameState {
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

/** Payment for a finished commission: more product earns more. */
export const payment = (state: GameState) => (state.phase === 'won' ? Math.round(totalKg(state.pools) * 2) : 0)
