// Circuits: a card is a small circuit. The commission feeds instability into a
// pool, element by element, on a moon dial; cards drain it through their input
// channels and turn what they take into purification (one number) and the
// three principles (salt, sulfur, mercury). When the commission attacks, what
// is in the pool flares and costs quintessence, and the pool stays. No turns:
// every card costs time on the dial, and the dial's phases carry the events.
// See CIRCUITS.md.

import { makeRng } from '../sim/rng'
import type { Elemental } from '../sim/types'

export const ELEMENTS: Elemental[] = ['water', 'earth', 'air', 'fire']
export type Principle = 'salt' | 'sulfur' | 'mercury'
export const PRINCIPLES: Principle[] = ['salt', 'sulfur', 'mercury']

export type Pool = Record<Elemental, number>
export const emptyPool = (): Pool => ({ water: 0, earth: 0, air: 0, fire: 0 })
export const poolTotal = (p: Pool) => ELEMENTS.reduce((n, e) => n + p[e], 0)

// ---------------------------------------------------------------------------
// The dial

/**
 * The dial counts sixteenths of a moon (ticks). A phase falls on every second
 * tick: the eight phases of the moon. A fight opens at the new moon, position 0.
 */
export const TICKS = 16
export type Phase = 'new' | 'waxing-crescent' | 'first' | 'waxing-gibbous' | 'full' | 'waning-gibbous' | 'last' | 'waning-crescent'
/** In the order the dial meets them from the opening. */
export const PHASES: Phase[] = ['new', 'waxing-crescent', 'first', 'waxing-gibbous', 'full', 'waning-gibbous', 'last', 'waning-crescent']
export const PHASE_NAMES: Record<Phase, string> = {
  new: 'New moon',
  'waxing-crescent': 'Waxing crescent',
  first: 'First quarter',
  'waxing-gibbous': 'Waxing gibbous',
  full: 'Full moon',
  'waning-gibbous': 'Waning gibbous',
  last: 'Last quarter',
  'waning-crescent': 'Waning crescent',
}
/** How lit each phase is, as a fraction of the cycle from the new moon (0) through full (0.5). */
export const PHASE_CYCLE: Record<Phase, number> = { new: 0, 'waxing-crescent': 0.125, first: 0.25, 'waxing-gibbous': 0.375, full: 0.5, 'waning-gibbous': 0.625, last: 0.75, 'waning-crescent': 0.875 }
/** You draw at the new and full moons, and discard what is left at the quarters between. */
export const DRAW_PHASES: Phase[] = ['new', 'full']
export const DISCARD_PHASES: Phase[] = ['first', 'last']
/** The common rhythm: a commission feeds in bulk at the new and full moons and attacks at 3/8 and 7/8 of the moon. */
export const FEED_PHASES: Phase[] = ['new', 'full']
export const ATTACK_PHASES: Phase[] = ['waxing-gibbous', 'waning-crescent']
/** The phase at a dial position that falls on one, else null. */
export const phaseAt = (pos: number): Phase | null => (pos % 2 === 0 ? PHASES[(pos / 2) % PHASES.length] : null)

// ---------------------------------------------------------------------------
// Cards

export interface Channel {
  element: Elemental | 'any'
  capacity: number
}

export interface Card {
  id: number
  name: string
  channels: Channel[]
  /**
   * The collecting stage's side outputs, beside purification. Each fires when
   * the stage took at least its gate (drawn as that many arcs on the output):
   * a principle output yields 1 of its principle, a Ward output Ward 1 for
   * each taken. Which principle a card yields is its own design, not its
   * element's; distilling runes add more outputs to any card.
   */
  outputs: Output[]
  /**
   * The collecting stage's main output, below it: purification (a square), or
   * a ground (what it takes is grounded, purifying nothing).
   */
  purifies: boolean
  /** Gain stages: each multiplies purification by one more (×2, ×3, …); a gain rune also makes the card a tick slower. */
  gain: number
  /** Time it takes on the dial, in ticks: an eighth of the moon (2) to start, a tick more for each gain rune added. */
  time: number
  /**
   * Ground stages, each a stage of its own beside the collector: it takes up
   * to GROUND_DRAIN of whatever is most plentiful (a wild input) and grounds it
   * (its output), purifying nothing.
   */
  ground: number
}

export type Output =
  | { kind: 'principle'; principle: Principle; gate: number }
  | { kind: 'ward'; gate: number }
  /** The next card played purifies this many times over. */
  | { kind: 'catalyst'; factor: number; gate: number }

export const GROUND_DRAIN = 3
/** What a principle output needs its stage to collect. */
export const METAL_GATE = 4
export const BASE_COST = 2
/** Most of each part a card can hold. */
export const CAPS = { channels: 3, gain: 2, outputs: 3, ground: 2 }
/** Time a card takes on the dial, in ticks. */
export const costOf = (c: Card) => c.time

export interface CardResult {
  /** What the card drains from the pool, by element (channels and grounds). */
  drained: Pool
  /** What its channels took: the part that purifies. */
  processed: number
  purification: number
  principles: Record<Principle, number>
  /** Ward it raises against the next flare. */
  ward: number
  /** What the next card played will purify times over, if it catalyses; else 1. */
  catalyst: number
  /** What each channel took, in the card's order. */
  took: number[]
  /** What each ground stage took. */
  grounded: number[]
}

/**
 * What playing a card does to this pool. Channels for one element take first,
 * up to their capacity; any-element channels then take from whatever is most
 * plentiful; ground stages last. Purification is what the channels took, times
 * (1 + gain), times any boost a catalyst left; a card whose main output is a
 * ground purifies nothing. Each side output whose gate the channels reached fires: a
 * principle output yields 1 of its principle, a Ward output Ward 1 for each
 * taken.
 */
export function resolveCard(card: Card, pool: Pool, boost = 1): CardResult {
  const left = { ...pool }
  const drained = emptyPool()
  const principles: Record<Principle, number> = { salt: 0, sulfur: 0, mercury: 0 }
  let processed = 0
  const takeFrom = (e: Elemental, n: number) => {
    const k = Math.min(left[e], n)
    left[e] -= k
    drained[e] += k
    return k
  }
  const most = () => ELEMENTS.reduce((a, b) => (left[b] > left[a] ? b : a))
  const took_: number[] = card.channels.map(() => 0)
  const ordered = card.channels.map((ch, i) => ({ ch, i })).sort((a, b) => Number(a.ch.element === 'any') - Number(b.ch.element === 'any'))
  for (const { ch, i } of ordered) {
    let took = 0
    if (ch.element !== 'any') took = takeFrom(ch.element, ch.capacity)
    else {
      let need = ch.capacity
      while (need > 0 && poolTotal(left) > 0) {
        const k = takeFrom(most(), need)
        took += k
        need -= k
      }
    }
    processed += took
    took_[i] = took
  }
  let ward = 0
  let catalyst = 1
  for (const o of card.outputs) {
    if (o.kind === 'catalyst') {
      if (processed >= o.gate) catalyst *= o.factor
      continue
    }
    if (processed <= 0 || processed < o.gate) continue
    if (o.kind === 'principle') principles[o.principle] += 1
    else ward += processed
  }
  const grounded: number[] = []
  for (let g = 0; g < card.ground; g++) {
    let need = GROUND_DRAIN
    while (need > 0 && poolTotal(left) > 0) need -= takeFrom(most(), need)
    grounded.push(GROUND_DRAIN - need)
  }
  const purification = card.purifies ? processed * (1 + card.gain) * boost : 0
  return { drained, processed, purification, principles, ward, catalyst, took: took_, grounded }
}

// ---------------------------------------------------------------------------
// Commissions

export interface Commission {
  key: string
  name: string
  blurb: string
  /** Purification that finishes it. */
  require: number
  /** Instability it feeds into the pool in one bulk, by element, at each of its feeding phases. */
  feed: Partial<Pool>
  /** When it feeds; the common rhythm is the new and full moons. */
  feedAt: Phase[]
  /** Phases at which the pool flares: what is in it costs quintessence, less Ward, and stays. */
  attacks: Phase[]
  /** Phases at which it grows stronger, adding buffFeed to its feed. */
  buffs?: Phase[]
  buffFeed?: Partial<Pool>
}

export const COMMISSIONS: Commission[] = [
  {
    key: 'mud',
    name: 'Mud',
    blurb: 'Feeds mostly water and some earth at every new and full moon, and flares at 3/8 and 7/8 of the moon.',
    require: 20,
    feed: { water: 5, earth: 2 },
    feedAt: FEED_PHASES,
    attacks: ATTACK_PHASES,
  },
  {
    key: 'peat',
    name: 'Peat bog',
    blurb: 'Water, earth and a smoulder of fire at every new and full moon; flares at 3/8 and 7/8 of the moon.',
    require: 30,
    feed: { water: 4, earth: 4, fire: 1 },
    feedAt: FEED_PHASES,
    attacks: ATTACK_PHASES,
  },
  {
    key: 'fumarole',
    name: 'Fumarole',
    blurb: 'A vent of hot breath: air and fire, a little water, at every new and full moon; flares at 3/8 and 7/8 of the moon.',
    require: 30,
    feed: { air: 4, fire: 4, water: 1 },
    feedAt: FEED_PHASES,
    attacks: ATTACK_PHASES,
  },
  {
    key: 'mire',
    name: 'The Mire',
    blurb: 'A boss. Feeds at every new and full moon, a little more earth each time, and flares at 3/8 and 7/8 of the moon.',
    require: 40,
    feed: { water: 5, earth: 3, fire: 1 },
    feedAt: FEED_PHASES,
    attacks: ATTACK_PHASES,
    buffs: ['new', 'full'],
    buffFeed: { earth: 1 },
  },
]


/** Its feed after this many buffs. */
export function feedOf(c: Commission, buffs: number): Pool {
  const out = emptyPool()
  for (const e of ELEMENTS) out[e] = (c.feed[e] ?? 0) + buffs * (c.buffFeed?.[e] ?? 0)
  return out
}

// ---------------------------------------------------------------------------
// Recipes

export interface Recipe {
  key: 'tincture' | 'spirit' | 'homunculus'
  name: string
  cost: Partial<Record<Principle, number>>
  /** Time on the dial, in ticks: none, so brewing never costs a play. */
  time: number
  effect: string
}

export const RECIPES: Recipe[] = [
  { key: 'tincture', name: 'Tincture of salt', cost: { salt: 2 }, time: 0, effect: 'Ward 6 against the next flare' },
  { key: 'spirit', name: 'Spirit of mercury', cost: { mercury: 3 }, time: 0, effect: 'Draw 2' },
  { key: 'homunculus', name: 'Homunculus', cost: { mercury: 3, salt: 2, sulfur: 1 }, time: 0, effect: 'A helper: at every phase it drains 2 of the most plentiful instability and purifies 2' },
]
export const TINCTURE_WARD = 6
export const HOMUNCULUS_DRAIN = 2

/** Metals smelted from what is left after a fight: silver from mercury and salt, lead from any two principles. */
export const METALS = { silver: { value: 3 }, lead: { value: 1 } }

export function smelt(p: Record<Principle, number>): { silver: number; lead: number; value: number } {
  const left = { ...p }
  const silver = Math.min(Math.floor(left.mercury / 2), left.salt)
  left.mercury -= silver * 2
  left.salt -= silver
  const lead = Math.floor((left.mercury + left.salt + left.sulfur) / 2)
  return { silver, lead, value: silver * METALS.silver.value + lead * METALS.lead.value }
}

// ---------------------------------------------------------------------------
// Runes added between fights

export type RewardRune =
  | { kind: 'channel'; element: Elemental | 'any'; capacity: number }
  | { kind: 'gain' }
  | { kind: 'distill'; principle: Principle }
  | { kind: 'ground' }
  /** A whole new card for the deck. */
  | { kind: 'card'; card: 'catalyst' }

export const REWARD_POOL: RewardRune[] = [
  { kind: 'channel', element: 'water', capacity: 5 },
  { kind: 'channel', element: 'earth', capacity: 5 },
  { kind: 'channel', element: 'air', capacity: 4 },
  { kind: 'channel', element: 'fire', capacity: 4 },
  { kind: 'channel', element: 'any', capacity: 3 },
  { kind: 'gain' },
  { kind: 'gain' },
  { kind: 'distill', principle: 'salt' },
  { kind: 'distill', principle: 'sulfur' },
  { kind: 'distill', principle: 'mercury' },
  { kind: 'ground' },
  { kind: 'card', card: 'catalyst' },
  { kind: 'card', card: 'catalyst' },
]

export const EXTRA_RUNE_PRICE = 3

/** Whether this rune fits on this card: each kind of part has a cap. */
export const fits = (r: RewardRune, c: Card) =>
  r.kind === 'card'
    ? false
    : r.kind === 'channel'
      ? c.channels.length < CAPS.channels
      : r.kind === 'gain'
        ? c.purifies && c.gain < CAPS.gain
        : r.kind === 'distill'
          ? c.outputs.length < CAPS.outputs
          : c.ground < CAPS.ground

export function addRune(c: Card, r: RewardRune): Card {
  if (!fits(r, c)) return c
  switch (r.kind) {
    case 'channel':
      return { ...c, channels: [...c.channels, { element: r.element, capacity: r.capacity }] }
    case 'gain':
      return { ...c, gain: c.gain + 1, time: c.time + 1 }
    case 'distill':
      return { ...c, outputs: [...c.outputs, { kind: 'principle', principle: r.principle, gate: METAL_GATE }] }
    case 'ground':
      return { ...c, ground: c.ground + 1 }
    case 'card':
      return c
  }
}

// ---------------------------------------------------------------------------
// The run

export interface Settings {
  stock: number
  /** How many you draw at each new and full moon. */
  hand: number
}

export const DEFAULT_SETTINGS: Settings = { stock: 40, hand: 4 }

export interface Fight {
  commission: Commission
  dial: number
  buffs: number
  pool: Pool
  purified: number
  ward: number
  principles: Record<Principle, number>
  homunculi: number
  /** What the next card played purifies times over, from a catalyst; 1 when none waits. */
  catalyst: number
  hand: Card[]
  draw: Card[]
  discard: Card[]
  /** Newest first. */
  log: string[]
  /** Quintessence paid in this fight. */
  paid: number
  /** Flare at each attack, oldest first. */
  flares: number[]
}

export interface Run {
  settings: Settings
  seed: number
  quintessence: number
  metals: number
  deck: Card[]
  stage: 'fight' | 'reward' | 'won' | 'lost'
  fightIndex: number
  fight: Fight
  /** Between fights: the runes on offer, and whether the free one is taken. */
  offer: RewardRune[]
  tookFree: boolean
  /** What the last fight smelted. */
  smelted: { silver: number; lead: number; value: number } | null
  nextId: number
}

const channel = (element: Elemental | 'any', capacity: number): Channel => ({ element, capacity })
const yields = (principle: Principle): Output => ({ kind: 'principle', principle, gate: METAL_GATE })
const card = (id: number, name: string, channels: Channel[], outputs: Output[], purifies = true): Card => ({ id, name, channels, outputs, purifies, gain: 0, time: BASE_COST, ground: 0 })

/** A card the shop can offer: takes a little of anything, purifies it, and the next card played purifies ×2. */
export function catalystCard(id: number): Card {
  return card(id, 'Catalyst', [channel('any', 2)], [{ kind: 'catalyst', factor: 2, gate: 0 }])
}

/**
 * The opening deck, two kinds of card and a Sieve. The metal makers take up to
 * 5 of their element and ground it, purifying nothing, and yield their
 * principle once they take 4 or more. The purifiers take up to 3 each of two
 * elements and purify 1 for each, yielding nothing: slow to drain, but they
 * cover two elements and hit hard. Every element has both kinds. The Sieve
 * takes 3 of anything, purifies it and raises Ward.
 */
export function startingDeck(): Card[] {
  let id = 1
  const metal = (name: string, e: Elemental, p: Principle) => card(id++, name, [channel(e, 5)], [yields(p)], false)
  const purifier = (name: string, a: Elemental, b: Elemental) => card(id++, name, [channel(a, 3), channel(b, 3)], [])
  return [
    metal('Wash', 'water', 'mercury'),
    metal('Wash', 'water', 'mercury'),
    metal('Calcine', 'earth', 'salt'),
    metal('Fan', 'air', 'mercury'),
    metal('Kindle', 'fire', 'sulfur'),
    purifier('Dissolve', 'water', 'earth'),
    purifier('Coagulate', 'earth', 'water'),
    purifier('Sublime', 'earth', 'air'),
    purifier('Cupel', 'air', 'fire'),
    purifier('Digest', 'fire', 'water'),
    card(id++, 'Sieve', [channel('any', 3)], [{ kind: 'ward', gate: 1 }]),
  ]
}

export function newRun(seed = Date.now(), settings: Settings = DEFAULT_SETTINGS): Run {
  const deck = startingDeck()
  const run: Run = {
    settings,
    seed,
    quintessence: settings.stock,
    metals: 0,
    deck,
    stage: 'fight',
    fightIndex: 0,
    fight: null as unknown as Fight,
    offer: [],
    tookFree: false,
    smelted: null,
    nextId: deck.length + 1,
  }
  return startFight(run, 0)
}

function startFight(run: Run, index: number): Run {
  const rng = makeRng(run.seed)
  const commission = COMMISSIONS[index]
  const fight: Fight = {
    commission,
    dial: 0,
    buffs: 0,
    pool: emptyPool(),
    purified: 0,
    ward: 0,
    principles: { salt: 0, sulfur: 0, mercury: 0 },
    homunculi: 0,
    catalyst: 1,
    hand: [],
    draw: rng.shuffle(run.deck),
    discard: [],
    log: [`${commission.name}: ${commission.blurb}`],
    paid: 0,
    flares: [],
  }
  // The new moon that opens the fight: the first feed and the first hand.
  return phaseEvents({ ...run, stage: 'fight', fightIndex: index, seed: rng.state(), fight }, 0, true)
}

function drawCards(run: Run, n: number): Run {
  const rng = makeRng(run.seed)
  let { hand, draw, discard } = run.fight
  hand = hand.slice()
  draw = draw.slice()
  for (let i = 0; i < n; i++) {
    if (!draw.length) {
      if (!discard.length) break
      draw = rng.shuffle(discard)
      discard = []
    }
    hand.push(draw.shift()!)
  }
  return { ...run, seed: rng.state(), fight: { ...run.fight, hand, draw, discard } }
}

/**
 * What happens at a phase: helpers work; the commission attacks, grows and
 * feeds the pool in bulk, each at its own phases; at the first and last
 * quarters you discard your hand; at the new and full moons you draw.
 */
function phaseEvents(run: Run, pos: number, opening = false): Run {
  const phase = phaseAt(pos)!
  let f = { ...run.fight, pool: { ...run.fight.pool }, log: run.fight.log.slice() }
  const c = f.commission
  const notes: string[] = []
  if (!opening && f.homunculi > 0) {
    let drained = 0
    for (let h = 0; h < f.homunculi; h++) {
      let need = HOMUNCULUS_DRAIN
      while (need > 0 && poolTotal(f.pool) > 0) {
        const e = ELEMENTS.reduce((a, b) => (f.pool[b] > f.pool[a] ? b : a))
        const k = Math.min(f.pool[e], need)
        f.pool[e] -= k
        need -= k
        drained += k
      }
    }
    if (drained) {
      f.purified += drained
      notes.push(`the homunculus purifies ${drained}`)
    }
  }
  let paid = 0
  if (!opening && c.attacks.includes(phase)) {
    const flare = poolTotal(f.pool)
    const absorbed = Math.min(f.ward, flare)
    paid = flare - absorbed
    f.flares = [...f.flares, flare]
    f.ward -= absorbed
    f.paid += paid
    // The pool stays: a flare costs what is in it, but does not empty it.
    notes.push(flare ? `${c.name} flares ${flare}${absorbed ? `, Ward takes ${absorbed}` : ''}${paid ? `: pay ${paid}` : ''}` : `${c.name} flares, but the pool is empty`)
  }
  if (!opening && c.buffs?.includes(phase)) {
    f.buffs += 1
    notes.push(`${c.name} grows`)
  }
  if (opening || c.feedAt.includes(phase)) {
    const feed = feedOf(c, f.buffs)
    for (const e of ELEMENTS) f.pool[e] += feed[e]
    notes.push(`${c.name} feeds ${ELEMENTS.filter((e) => feed[e]).map((e) => `${feed[e]} ${e}`).join(', ')}`)
  }
  if (!opening && DISCARD_PHASES.includes(phase) && f.hand.length) {
    notes.push(`you discard ${f.hand.length}`)
    f.discard = [...f.discard, ...f.hand]
    f.hand = []
  }
  const draws = opening || DRAW_PHASES.includes(phase)
  if (notes.length) f.log.unshift(`${PHASE_NAMES[phase]}: ${notes.join('; ')}.`)
  let next: Run = { ...run, quintessence: Math.max(0, run.quintessence - paid), fight: f }
  if (draws) next = drawCards(next, run.settings.hand)
  return next
}

/** Move the dial on, running every phase it reaches. */
function advance(run: Run, ticks: number): Run {
  let next = run
  const from = run.fight.dial
  for (let pos = from + 1; pos <= from + ticks; pos++) {
    next = { ...next, fight: { ...next.fight, dial: pos } }
    if (phaseAt(pos)) next = phaseEvents(next, pos)
    if (next.quintessence <= 0) return { ...next, stage: 'lost' }
    if (next.fight.purified >= next.fight.commission.require) return finish(next)
  }
  return next
}

/** The fight is won: smelt what is left, then offer runes, or end the run after the last. */
function finish(run: Run): Run {
  const smelted = smelt(run.fight.principles)
  const metals = run.metals + smelted.value
  if (run.fightIndex >= COMMISSIONS.length - 1) return { ...run, metals, smelted, stage: 'won' }
  const rng = makeRng(run.seed)
  const offer = rng.shuffle(REWARD_POOL).slice(0, 3)
  return { ...run, metals, smelted, stage: 'reward', offer, tookFree: false, seed: rng.state() }
}

const after = (run: Run): Run => (run.fight.purified >= run.fight.commission.require ? finish(run) : run)

/** With nothing to play (no cards, no recipe to brew), the moon moves on by itself to the next draw. */
function settle(run: Run): Run {
  let next = run
  const stuck = (r: Run) => r.stage === 'fight' && !r.fight.hand.length && !RECIPES.some((x) => canAfford(r.fight, x))
  if (!stuck(next)) return next
  next = { ...next, fight: { ...next.fight, log: ['Nothing to play: the moon moves on.', ...next.fight.log] } }
  for (let guard = 0; guard < TICKS * 2 && stuck(next); guard++) next = advance(next, 1)
  return next
}

/** Play a card from hand: it resolves at once, then the dial moves on by its cost. */
export function playCard(run: Run, id: number): Run {
  if (run.stage !== 'fight') return run
  const c = run.fight.hand.find((x) => x.id === id)
  if (!c) throw new Error('That card is not in hand.')
  const r = resolveCard(c, run.fight.pool, run.fight.catalyst)
  const pool = { ...run.fight.pool }
  for (const e of ELEMENTS) pool[e] -= r.drained[e]
  const principles = { ...run.fight.principles }
  for (const p of PRINCIPLES) principles[p] += r.principles[p]
  const got = PRINCIPLES.filter((p) => r.principles[p]).map((p) => `${r.principles[p]} ${p}`)
  const fight: Fight = {
    ...run.fight,
    pool,
    principles,
    ward: run.fight.ward + r.ward,
    catalyst: r.catalyst,
    purified: run.fight.purified + r.purification,
    hand: run.fight.hand.filter((x) => x.id !== id),
    discard: [...run.fight.discard, c],
    log: [`${c.name}: takes ${poolTotal(r.drained)}, ${c.purifies ? `purifies ${r.purification}${run.fight.catalyst > 1 ? ` (×${run.fight.catalyst} from a catalyst)` : ''}` : 'grounds it'}${got.length ? `, leaves ${got.join(' and ')}` : ''}${r.ward ? `, raises Ward ${r.ward}` : ''}${r.catalyst > 1 ? `; the next card purifies ×${r.catalyst}` : ''}.`, ...run.fight.log],
  }
  const played = after({ ...run, fight })
  return played.stage === 'fight' ? settle(advance(played, costOf(c))) : played
}

export const canAfford = (f: Fight, r: Recipe) => PRINCIPLES.every((p) => f.principles[p] >= (r.cost[p] ?? 0))

/** Brew a recipe: pay its principles and apply it; brewing takes no time on the dial. */
export function craft(run: Run, key: Recipe['key']): Run {
  if (run.stage !== 'fight') return run
  const r = RECIPES.find((x) => x.key === key)!
  if (!canAfford(run.fight, r)) throw new Error('Not enough principles.')
  const principles = { ...run.fight.principles }
  for (const p of PRINCIPLES) principles[p] -= r.cost[p] ?? 0
  let next: Run = { ...run, fight: { ...run.fight, principles, log: [`Brews ${r.name.toLowerCase()}.`, ...run.fight.log] } }
  if (key === 'tincture') next = { ...next, fight: { ...next.fight, ward: next.fight.ward + TINCTURE_WARD } }
  if (key === 'spirit') next = drawCards(next, 2)
  if (key === 'homunculus') next = { ...next, fight: { ...next.fight, homunculi: next.fight.homunculi + 1 } }
  return settle(advance(next, r.time))
}

/** Let an eighth of the moon pass without playing. */
export function wait(run: Run): Run {
  if (run.stage !== 'fight') return run
  return settle(advance({ ...run, fight: { ...run.fight, log: ['Waits an eighth.', ...run.fight.log] } }, 2))
}

/** The next phases and what they bring, for the dial. */
export function upcoming(f: Fight, count = 4): { pos: number; phase: Phase; attack: boolean; buff: boolean; feed: boolean; draw: boolean; discard: boolean }[] {
  const out = []
  let pos = f.dial + 1
  while (out.length < count) {
    const phase = phaseAt(pos)
    if (phase)
      out.push({
        pos,
        phase,
        attack: f.commission.attacks.includes(phase),
        buff: !!f.commission.buffs?.includes(phase),
        feed: f.commission.feedAt.includes(phase),
        draw: DRAW_PHASES.includes(phase),
        discard: DISCARD_PHASES.includes(phase),
      })
    pos++
  }
  return out
}

// ---------------------------------------------------------------------------
// Between fights

/** Take a rune on offer and add it to a card in the deck: the first is free, more cost metal. */
export function takeRune(run: Run, offerIndex: number, cardId?: number): Run {
  if (run.stage !== 'reward') return run
  const r = run.offer[offerIndex]
  const price = run.tookFree ? EXTRA_RUNE_PRICE : 0
  if (price > run.metals) throw new Error('Not enough metal.')
  if (r?.kind === 'card') {
    return {
      ...run,
      metals: run.metals - price,
      deck: [...run.deck, catalystCard(run.nextId)],
      nextId: run.nextId + 1,
      offer: run.offer.filter((_, i) => i !== offerIndex),
      tookFree: true,
    }
  }
  const c = run.deck.find((x) => x.id === cardId)
  if (!r || !c || !fits(r, c)) throw new Error('That rune does not fit there.')
  return {
    ...run,
    metals: run.metals - price,
    deck: run.deck.map((x) => (x.id === cardId ? addRune(x, r) : x)),
    offer: run.offer.filter((_, i) => i !== offerIndex),
    tookFree: true,
  }
}

/** Go on to the next fight. */
export function nextFight(run: Run): Run {
  if (run.stage !== 'reward') return run
  return startFight({ ...run, offer: [], smelted: null }, run.fightIndex + 1)
}

/** Words for a rune on offer. */
export function runeWords(r: RewardRune): string {
  switch (r.kind) {
    case 'channel':
      return r.element === 'any' ? `Input: up to ${r.capacity} of any element` : `Input: up to ${r.capacity} ${r.element}`
    case 'gain':
      return 'Gain: purification ×1 more, a tick slower'
    case 'card':
      return 'Catalyst: a new card; the next card played after it purifies ×2'
    case 'distill':
      return `Distil ${r.principle}: 1 ${r.principle} whenever the card takes ${METAL_GATE} or more`
    case 'ground':
      return `Ground: a new stage that takes up to ${GROUND_DRAIN} of anything and grounds it, purifying nothing`
  }
}

/** A card's equation in words. */
export function cardWords(c: Card): string {
  const ins = c.channels.map((ch) => `${ch.capacity} ${ch.element === 'any' ? 'any' : ch.element}`).join(' + ')
  const g = c.gain ? ` ×${1 + c.gain}` : ''
  const d = c.outputs.map((o) => (o.kind === 'ward' ? ', Ward 1 for each' : o.kind === 'catalyst' ? `, the next card ×${o.factor}` : `, ${o.principle} from ${o.gate}`)).join('')
  const gr = c.ground ? `, ground ${c.ground * GROUND_DRAIN}` : ''
  return `Takes up to ${ins}${g}${d}${gr}`
}
