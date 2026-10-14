import { normalize, totalKg } from './alchemy'
import { CLAY_TARGET, MUD_START, applyIntent, cloneTarget, inBand, materialResistance, rollIntent, type BossTuning, type CombatMode, type CommissionKey, type Intent, type PurityEffects, type Target } from './commission'
import { DEFAULT_FORGE, buildDeck, cloneForge, grow, makeRune, standardDeck, type Forge, type RuneSpec } from './deck'
import { PELICAN_WARD, catalystPower, effectiveSigil } from './catalysts'
import { makeRng, type Rng } from './rng'
import { canJoin, openLinks, resolve, runesOf, type Resolution } from './sigil'
import type { TableEntry } from './table'
import type { Catalyst, JoinKind, Pool, Rune, Sigil } from './types'
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
  /**
   * Table machines: cast sigils stay on the table, up to this many, keep their
   * runes, and fire again once a term. 0 or unset: the table is for show and
   * cast runes go to the discard pile.
   */
  machines?: number
  /** Links a machine gains for every term it has stood on the table (1 unless set). */
  machineGrowth?: number
  /** Where a machine's runes go when it is taken apart: the discard pile (default) or straight back to hand. */
  machineApart?: 'discard' | 'hand'
}

export const DEFAULT_SETTINGS: Settings = {
  surplusForce: true,
  flareScale: 1,
  stock: 100,
  handSize: 6,
  // Discarding is a sandbox tool; in a run, drawing and discarding come from motes and runes.
  discards: 0,
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
  /** Ward gathered over the term's casts, plus any the commission's pure pools lend, plus lasting Ward. */
  ward: number
  /** Lasting Ward (lute) the flares didn't spend, carried into the next term. */
  kept: number
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
  /** Lasting Ward from lute motes: kept from term to term until a flare spends it. */
  keptWard: number
  /** Catalysts held for the run. */
  catalysts: Catalyst[]
  /** Runes burned this commission (calcination): out of the deck until it ends. */
  burned: Rune[]
  history: TermOutcome[]
  nextTableId: number
}

/** Draw runes into the hand, reshuffling the discard pile when the draw pile runs out. Crucible motes lend Ward as they are drawn. */
function drawRunes(state: GameState, rng: Rng, count: number): GameState {
  let { draw, hand, discard } = state
  draw = draw.slice()
  hand = hand.slice()
  let ward = 0
  for (let i = 0; i < count; i++) {
    if (draw.length === 0) {
      if (discard.length === 0) break
      draw = rng.shuffle(discard)
      discard = []
    }
    const r = draw.shift()!
    ward += r.crucible
    hand.push(r)
  }
  return { ...state, draw, hand, discard, termWard: state.termWard + ward }
}

const drawUp = (state: GameState, rng: Rng): GameState => drawRunes(state, rng, Math.max(0, state.settings.handSize - state.hand.length))

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
  /** Catalysts held for the run. */
  catalysts?: Catalyst[]
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
    keptWard: 0,
    catalysts: setup.catalysts ?? [],
    burned: [],
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

/** Every rune the commission holds: hand, piles, burned, and those standing in table machines. */
export const allRunes = (state: Pick<GameState, 'hand' | 'draw' | 'discard' | 'burned' | 'table' | 'settings'>): Rune[] => [
  ...state.hand,
  ...state.draw,
  ...state.discard,
  ...state.burned,
  ...(machinesOn(state) ? state.table.flatMap((t) => runesOf(t.sigil)) : []),
]

/** Whether cast sigils become table machines. */
export const machinesOn = (state: Pick<GameState, 'settings'>): boolean => (state.settings.machines ?? 0) > 0

/** Open links on a machine: its anchor's, plus what it has gained standing on the table, less what it holds. */
export const machineOpen = (state: Pick<GameState, 'settings' | 'term'>, entry: TableEntry): number =>
  openLinks(entry.sigil) + (state.settings.machineGrowth ?? 1) * Math.max(0, state.term - entry.term)

/** Room on the table for another machine (always, when machines are off). */
export const tableRoom = (state: Pick<GameState, 'settings' | 'table'>): number => (machinesOn(state) ? state.settings.machines! - state.table.length : Infinity)

/** Why a sigil can't be cast as it stands, or null when it can. */
export function invalidReason(state: GameState, sigil: Sigil): string | null {
  if (state.phase !== 'compose') return 'The commission is over.'
  if (castsLeft(state) <= 0) return state.intent.castLimit ? 'Bound: only one sigil this term.' : 'No more sigils this term.'
  if (tableRoom(state) <= 0) return 'The table is full: take a machine apart first.'
  const runes = runesOf(sigil)
  const ids = new Set(runes.map((r) => r.id))
  if (ids.size !== runes.length) return 'A rune can only be placed once.'
  if (!runes.every((r) => state.hand.some((h) => h.id === r.id))) return 'Every rune must come from your hand.'
  if (sigil.joins.length > 0 && (sigil.anchor.links < 1 || openLinks(sigil) < 0)) return 'The sigil has more joins than links.'
  return null
}

export { canJoin }

/** The end of the term as things stand: the commission acts, and the term's Ward meets it. */
function endOf(state: Pick<GameState, 'intent' | 'pools' | 'table' | 'termWard' | 'keptWard' | 'settings' | 'target'>): EndOutcome {
  const acted = applyIntent(state.intent, state.pools, state.table)
  const flare = state.intent.flare
  const incoming = flare
  // The commission's own pure pools lend Ward alongside the term's sigils;
  // flares spend this term's Ward first, then lasting Ward.
  const termSide = state.termWard + (state.intent.ward ?? 0)
  const ward = termSide + state.keptWard
  const absorbed = Math.min(ward, incoming)
  const paid = Math.round((incoming - absorbed) * 10) / 10
  const kept = Math.round(Math.max(0, state.keptWard - Math.max(0, incoming - termSide)) * 10) / 10
  return {
    pools: acted.pools,
    table: acted.table,
    intentNote: acted.note,
    flare,
    ward,
    kept,
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
  /** This term's Ward and the lasting Ward right after the cast. */
  termWard: number
  keptWard: number
}

/** Power every rune gains from the catalysts right now. */
export const powerBonus = (state: Pick<GameState, 'catalysts' | 'pools' | 'burned'>): number => catalystPower(state.catalysts, state.pools, state.burned.length)

/**
 * Exactly what casting this sigil would do, and what ending the term after it
 * would cost. With a table id, the sigil is that machine firing (perhaps with
 * runes just added), so the table gains nothing new.
 */
export function previewCast(state: GameState, sigil: Sigil, poolKey?: string, tableId?: number): CastPreview {
  const mult = resistanceMult(state)
  const eff = effectiveSigil(sigil, powerBonus(state), state.termWard + state.keptWard)
  const resolution = state.settings.equation
    ? resolveEquation(eff, state.pools, poolKey, { ...state.settings.equation, base: state.settings.equation.base * mult }, state.target)
    : resolve(eff, state.pools, poolKey, { ...state.settings, resistanceMult: mult })
  const machines = machinesOn(state)
  const table =
    tableId !== undefined
      ? state.table.map((e) => (e.id === tableId ? { ...e, sigil, fired: state.term } : e))
      : [...state.table, { id: state.nextTableId, term: state.term, sigil, ...(machines ? { fired: state.term } : {}) }]
  const finished = inBand(resolution.pools, state.target)
  const cast: CastOutcome = { term: state.term, sigil, resolution, pools: resolution.pools, finished }
  // Lute: the sigil's Ward lasts. Pelican: Ward when the anchor returns to hand.
  const ward = resolution.outputs.ward
  const lasting = runesOf(sigil).some((r) => r.lute)
  // A machine keeps its anchor, so cohobation (and the pelican's Ward for it) does nothing on the table.
  const pelican = !machines && sigil.anchor.cohobation && state.catalysts.includes('pelican') ? PELICAN_WARD : 0
  const termWard = state.termWard + (lasting ? 0 : ward) + pelican
  const keptWard = state.keptWard + (lasting ? ward : 0)
  const end = finished ? null : endOf({ ...state, pools: resolution.pools, table, termWard, keptWard })
  return { cast, table, end, termWard, keptWard }
}

/** The runes calcination would burn from this hand, when the player doesn't choose: slag first, then plain circles. */
export function autoBurn(hand: Rune[], count: number): number[] {
  if (count <= 0) return []
  const weak = (r: Rune) => r.junk || (r.links <= 1 && r.motes.every((m) => m.kind === 'element'))
  return hand
    .filter(weak)
    .sort((a, b) => Number(!!b.junk) - Number(!!a.junk) || a.power - b.power)
    .slice(0, count)
    .map((r) => r.id)
}

/** How many runes a sigil burns from hand when it resolves. */
export const burnsOf = (sigil: Sigil): number => runesOf(sigil).reduce((n, r) => n + r.calcination, 0)

export interface CastOptions {
  /** Which runes calcination burns from hand; chosen automatically (slag, then plain circles) when left out. */
  burn?: number[]
}

export function cast(state: GameState, sigil: Sigil, poolKey?: string, opts: CastOptions = {}): GameState {
  const reason = invalidReason(state, sigil)
  if (reason) throw new Error(reason)
  return resolveCast(state, sigil, poolKey, opts, null)
}

/** Why this machine can't fire now, or null when it can. */
export function fireReason(state: GameState, id: number): string | null {
  if (state.phase !== 'compose') return 'The commission is over.'
  const entry = state.table.find((e) => e.id === id)
  if (!machinesOn(state) || !entry) return 'No such machine.'
  if (entry.fired === state.term) return 'This machine has already fired this term.'
  if (castsLeft(state) <= 0) return state.intent.castLimit ? 'Bound: only one sigil this term.' : 'No more sigils this term.'
  return null
}

/** A table machine fires: its sigil resolves again, with no runes from hand. */
export function fireMachine(state: GameState, id: number, poolKey?: string, opts: CastOptions = {}): GameState {
  const reason = fireReason(state, id)
  if (reason) throw new Error(reason)
  return resolveCast(state, state.table.find((e) => e.id === id)!.sigil, poolKey, opts, id)
}

/** Join runes from hand to a table machine, while it has open links. It fires with them from its next firing. */
export function extendMachine(state: GameState, id: number, joins: { kind: JoinKind; runeId: number }[]): GameState {
  const entry = state.table.find((e) => e.id === id)
  if (state.phase !== 'compose' || !machinesOn(state) || !entry) throw new Error('No such machine.')
  if (joins.length > machineOpen(state, entry)) throw new Error('The machine has no open link for that.')
  const added = joins.map((j) => {
    const rune = state.hand.find((r) => r.id === j.runeId)
    if (!rune) throw new Error('Every rune must come from your hand.')
    return { kind: j.kind, rune }
  })
  const ids = new Set(added.map((j) => j.rune.id))
  const sigil = { anchor: entry.sigil.anchor, joins: [...entry.sigil.joins, ...added] }
  return { ...state, hand: state.hand.filter((r) => !ids.has(r.id)), table: state.table.map((e) => (e.id === id ? { ...e, sigil } : e)) }
}

/** Why this machine can't be taken apart now, or null when it can. */
export function dismantleReason(state: GameState, id: number): string | null {
  const entry = state.table.find((e) => e.id === id)
  if (state.phase !== 'compose' || !entry) return 'No such machine.'
  if (entry.fired === state.term) return 'It fired this term: take it apart next term.'
  return null
}

/**
 * Take a table machine apart, freeing its place. Its runes go to the discard
 * pile, or back to hand when Settings.machineApart says so. Not in a term it
 * fired, so no rune works twice in a term.
 */
export function dismantleMachine(state: GameState, id: number): GameState {
  const reason = dismantleReason(state, id)
  if (reason) throw new Error(reason)
  const entry = state.table.find((e) => e.id === id)!
  const runes = runesOf(entry.sigil)
  const table = state.table.filter((e) => e.id !== id)
  return state.settings.machineApart === 'hand' ? { ...state, hand: [...state.hand, ...runes], table } : { ...state, discard: [...state.discard, ...runes], table }
}

/** Resolve a sigil cast from hand (tableId null) or a machine firing, and apply everything that follows. */
function resolveCast(state: GameState, sigil: Sigil, poolKey: string | undefined, opts: CastOptions, tableId: number | null): GameState {
  const machines = machinesOn(state)
  const p = previewCast(state, sigil, poolKey, tableId ?? undefined)
  const runes = runesOf(sigil)
  const used = new Set(runes.map((r) => r.id))
  // Multiplication: each cast rune holding one grows. Cohobation: the anchor comes back to hand.
  const grown = runes.map((r) => grow(r, state.forge))
  const back = !machines && sigil.anchor.cohobation ? grown[0] : null
  // On the table, a machine keeps its runes, grown; otherwise they go to the discard pile.
  const grownSigil: Sigil = { anchor: grown[0], joins: sigil.joins.map((j, i) => ({ ...j, rune: grown[i + 1] })) }
  const entryId = tableId ?? state.nextTableId
  let next: GameState = {
    ...state,
    hand: tableId !== null ? state.hand : [...state.hand.filter((r) => !used.has(r.id)), ...(back ? [back] : [])],
    discard: machines ? state.discard : [...state.discard, ...grown.filter((r) => r !== back)],
    pools: p.cast.pools,
    table: machines ? p.table.map((e) => (e.id === entryId ? { ...e, sigil: grownSigil } : e)) : p.table,
    termWard: p.termWard,
    keptWard: p.keptWard,
    casts: [...state.casts, p.cast],
    nextTableId: tableId !== null ? state.nextTableId : state.nextTableId + 1,
  }
  if (p.cast.finished) return { ...next, phase: 'won' }
  // Distillation draws; calcination then burns from the hand, slag first.
  const draws = runes.reduce((n, r) => n + r.distill, 0)
  const burns = burnsOf(sigil)
  if (draws > 0) {
    const rng = makeRng(state.seed)
    next = { ...drawRunes(next, rng, draws), seed: rng.state() }
  }
  if (burns > 0) {
    const ids = new Set((opts.burn ?? autoBurn(next.hand, burns)).slice(0, burns))
    next = { ...next, hand: next.hand.filter((r) => !ids.has(r.id)), burned: [...next.burned, ...next.hand.filter((r) => ids.has(r.id))] }
  }
  return next
}

/** End the term: the commission acts, unabsorbed instability costs quintessence, and the next term begins. */
export function endTerm(state: GameState): GameState {
  if (state.phase !== 'compose') return state
  const e = endOf(state)
  const rng = makeRng(state.seed)
  const quintessence = Math.max(0, Math.round((state.quintessence - e.paid) * 10) / 10)
  // A machine the commission knocks off the table drops its runes into the discard pile.
  const kept = new Set(e.table.map((t) => t.id))
  const knocked = machinesOn(state) ? state.table.filter((t) => !kept.has(t.id)).flatMap((t) => runesOf(t.sigil)) : []
  let next: GameState = {
    ...state,
    pools: e.pools,
    table: e.table,
    discard: [...state.discard, ...knocked],
    quintessence,
    spent: Math.round((state.spent + e.paid) * 10) / 10,
    history: [...state.history, { ...e, term: state.term, intent: state.intent, casts: state.casts }],
    casts: [],
    termWard: 0,
    keptWard: e.kept,
  }
  if (quintessence <= 0) return { ...next, phase: 'lost', seed: rng.state() }
  // A commission finishes the moment the amalgam is in range, even when its own move put it there.
  if (e.finished) return { ...next, phase: 'won', seed: rng.state() }
  if (state.intent.junk) {
    let id = Math.max(0, ...allRunes(next).map((r) => r.id))
    const draw = next.draw.slice()
    for (let i = 0; i < state.intent.junk; i++) draw.splice(rng.int(0, draw.length), 0, makeRune(++id, { body: 'circle', motes: [], junk: true }, state.forge))
    next = { ...next, draw }
  }
  const term = state.term + 1
  next = { ...next, term, intent: rollIntent(rng, term, next.pools, next.table, state.settings, state.commission) }
  next = drawUp(next, rng)
  return { ...next, seed: rng.state() }
}

/** Discard runes from hand and draw back up. Spends a discard, unless free (the sandbox's tool). */
export function discardRunes(state: GameState, ids: number[], opts: { free?: boolean } = {}): GameState {
  if (state.phase !== 'compose' || (!opts.free && state.discardsLeft <= 0) || ids.length === 0) return state
  const drop = new Set(ids)
  const rng = makeRng(state.seed)
  let next: GameState = {
    ...state,
    hand: state.hand.filter((g) => !drop.has(g.id)),
    discard: [...state.discard, ...state.hand.filter((g) => drop.has(g.id))],
    discardsLeft: opts.free ? state.discardsLeft : state.discardsLeft - 1,
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
