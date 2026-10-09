import { totalKg } from './alchemy'
import { MUD_START, applyIntent, earthShare, inBand, rollIntent, substanceName, type Intent } from './commission'
import { DEFAULT_FORGE, buildDeck, cloneForge, standardDeck, type Forge, type RuneSpec } from './deck'
import { makeRng, type Rng } from './rng'
import { canJoin, openLinks, resolve, runesOf, type Resolution } from './sigil'
import { strain, type TableEntry } from './table'
import type { Pool, Rune, Sigil } from './types'

export interface Settings {
  /** Whether a lopsided table adds instability each term. */
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
  sigil: Sigil
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
  /** The numbers behind bodies and motes; the sandbox can change them. */
  forge: Forge
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
}

export const standardSetup = (): Setup => ({ forge: cloneForge(DEFAULT_FORGE), deck: standardDeck() })

export function newGame(settings: Settings = DEFAULT_SETTINGS, seed = Date.now(), setup: Setup = standardSetup()): GameState {
  const rng = makeRng(seed)
  const pools = MUD_START
  let state: GameState = {
    settings,
    forge: setup.forge,
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
    history: [],
    nextTableId: 1,
  }
  state = drawUp(state, rng)
  return { ...state, seed: rng.state() }
}

/** Why a sigil can't be cast as it stands, or null when it can. */
export function invalidReason(state: GameState, sigil: Sigil): string | null {
  const runes = runesOf(sigil)
  const ids = new Set(runes.map((r) => r.id))
  if (ids.size !== runes.length) return 'A rune can only be placed once.'
  if (!runes.every((r) => state.hand.some((h) => h.id === r.id))) return 'Every rune must come from your hand.'
  if (sigil.joins.length > 0 && (sigil.anchor.links < 1 || openLinks(sigil) < 0)) return 'The sigil has more joins than links.'
  return null
}

export { canJoin }

/** Exactly what this term would do, without changing anything. Drives the preview and the cast. */
export function previewTerm(state: GameState, sigil: Sigil, poolKey?: string): TermOutcome {
  const resolution = resolve(sigil, state.pools, poolKey, state.settings)
  const placed: TableEntry = { id: state.nextTableId, term: state.term, sigil }
  const tableAfterCast = [...state.table, placed]
  const ward = resolution.outputs.ward
  const finished = inBand(resolution.pools)
  const base = {
    term: state.term,
    sigil,
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

export function cast(state: GameState, sigil: Sigil, poolKey?: string): GameState {
  if (state.phase !== 'compose') return state
  const reason = invalidReason(state, sigil)
  if (reason) throw new Error(reason)

  const outcome = previewTerm(state, sigil, poolKey)
  const rng = makeRng(state.seed)
  const used = new Set(runesOf(sigil).map((r) => r.id))
  const quintessence = Math.max(0, Math.round((state.quintessence - outcome.paid) * 10) / 10)

  let next: GameState = {
    ...state,
    hand: state.hand.filter((g) => !used.has(g.id)),
    discard: [...state.discard, ...runesOf(sigil)],
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

/** Payment for a finished commission: more product earns more. */
export const payment = (state: GameState) => (state.phase === 'won' ? Math.round(totalKg(state.pools) * 2) : 0)
