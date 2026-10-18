// Circuits: a card is a small circuit. The commission feeds instability into a
// pool, element by element, on a moon dial; cards drain it through their input
// channels and turn what they take into purification (one number) and the
// three principles (salt, sulfur, mercury). When the commission attacks, what
// is in the pool flares and costs quintessence, and the pool stays. No turns:
// every card costs time on the dial, and the dial's phases carry the events.
// See CIRCUITS.md.

import { makeRng } from '../sim/rng'
import { DRAFT_PAIRS } from './draft-pairs'
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

/**
 * What an input takes from. An element or "any" takes from the pool, up to
 * its capacity: it drains the commission and powers the card at once. The
 * others feed the collector from elsewhere for a fixed cost, collecting their
 * capacity: quintessence pays 3 of yours (never your last), discard throws
 * away a card from your hand, moon makes the card take an eighth more.
 */
export type Source = Elemental | 'any' | 'quintessence' | 'discard' | 'moon'
export const fromPool = (s: Source): s is Elemental | 'any' => s === 'any' || ELEMENTS.includes(s as Elemental)

export interface Channel {
  element: Source
  capacity: number
}

/** What a moon input adds to a card's time, and what a regain output spares: an eighth. */
export const EIGHTH = 2
/** What a unit output (draw, regain, and the statuses that don't scale) needs its stage to collect. */
export const UNIT_GATE = 3

export type StatusKey = 'settle' | 'starve' | 'expose' | 'thorns' | 'stall' | 'volatile' | 'condense' | 'mend' | 'retain' | 'foresight'
export interface StatusDef {
  key: StatusKey
  name: string
  /** On the commission, or on you. */
  on: 'commission' | 'you'
  /** A unit status adds 1 when it fires; the others add what the card collected (N). */
  unit: boolean
  /** Most it stacks to. */
  cap?: number
  text: string
}
export const STATUSES: StatusDef[] = [
  { key: 'settle', name: 'Settle', on: 'commission', unit: false, text: 'at every phase N of the most plentiful instability settles and is purified, then N falls by 1' },
  { key: 'starve', name: 'Starve', on: 'commission', unit: false, text: 'its next bulk feed is N smaller' },
  { key: 'expose', name: 'Expose', on: 'commission', unit: false, text: 'your cards purify ×1.5 for the next N phases' },
  { key: 'thorns', name: 'Thorns', on: 'commission', unit: false, text: 'when it next flares, N of the pool is purified first' },
  { key: 'stall', name: 'Stall', on: 'commission', unit: true, text: 'its next flare comes an eighth later' },
  { key: 'volatile', name: 'Volatile', on: 'commission', unit: true, cap: 1, text: 'until its next flare your cards purify ×2, but that flare is doubled' },
  { key: 'condense', name: 'Condense', on: 'you', unit: false, text: 'your next card also takes N of whatever is most plentiful' },
  { key: 'mend', name: 'Mend', on: 'you', unit: false, text: 'at every phase you gain N quintessence, then N falls by 1' },
  { key: 'retain', name: 'Retain', on: 'you', unit: true, cap: 1, text: 'at the next quarter moon you keep your hand' },
  { key: 'foresight', name: 'Foresight', on: 'you', unit: true, text: 'at the next quarter moon you draw 2' },
]
export const statusDef = (k: StatusKey) => STATUSES.find((s) => s.key === k)!
export const noStatus = (): Record<StatusKey, number> => Object.fromEntries(STATUSES.map((s) => [s.key, 0])) as Record<StatusKey, number>
export const FORESIGHT_DRAW = 2

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
  /** Gain stages: each multiplies purification by one more (×2, ×3, …), at no cost in time. */
  gain: number
  /** Time it takes on the dial, in ticks: an eighth of the moon (2). */
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
  /** Draw n cards (1 if not given). */
  | { kind: 'draw'; gate: number; n?: number }
  /** Spare n eighths of the moon: the next cards spend them before the dial moves. */
  | { kind: 'regain'; gate: number; n?: number }
  /** Gain 1 quintessence for each collected. */
  | { kind: 'quintessence'; gate: number }
  /** Put a status on the commission or on you: N (what was collected), or n (1 if not given) for a unit status. */
  | { kind: 'status'; status: StatusKey; gate: number; n?: number }

export const GROUND_DRAIN = 3
/** What a quintessence input pays, whatever it collects. */
export const QUINT_INPUT_COST = 3
/** What a principle output needs its stage to collect. */
export const METAL_GATE = 4
export const BASE_COST = 2
/** Most of each part a card can hold. */
export const CAPS = { channels: 3, gain: 2, outputs: 3, ground: 2 }
/** Time a card takes on the dial, in ticks: its own, and an eighth more for each moon input. */
export const costOf = (c: Card) => c.time + EIGHTH * c.channels.filter((ch) => ch.element === 'moon').length

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
  /** What a Condense waiting on it took besides, from whatever was most plentiful. */
  condensed: number
  /** Quintessence its inputs pay, and cards they discard. */
  paid: number
  discards: number
  /** Cards it draws, ticks of the moon it spares, quintessence it gains. */
  draw: number
  regain: number
  gain: number
  /** Statuses it puts on, by how much. */
  statuses: Partial<Record<StatusKey, number>>
}

/** What else a card's inputs and multipliers depend on, beyond the pool. */
export interface Context {
  /** Your quintessence, for quintessence inputs. */
  quintessence?: number
  /** Other cards in hand, for discard inputs. */
  others?: number
  /** A Condense waiting for the next card. */
  condense?: number
  /** Statuses multiplying what cards purify (Expose, Volatile). */
  mult?: number
}

/** Take up to n from the most plentiful elements of a pool (changed in place), one most plentiful at a time. */
function takeMost(left: Pool, n: number, into?: Pool): number {
  let need = n
  while (need > 0 && poolTotal(left) > 0) {
    const e = ELEMENTS.reduce((a, b) => (left[b] > left[a] ? b : a))
    const k = Math.min(left[e], need)
    left[e] -= k
    if (into) into[e] += k
    need -= k
  }
  return n - need
}

/**
 * What playing a card does. Everything its inputs collect goes into its
 * collecting stage: channels for one element take first, up to their
 * capacity; any-element channels then take from whatever is most plentiful;
 * the inputs that don't take from the pool each collect their capacity
 * (quintessence paying it, discard throwing away a card, moon taking an
 * eighth more); a Condense waiting takes its N besides. Ground stages take
 * last. Purification is what was collected, times (1 + gain), times a
 * catalyst's boost and any multiplying statuses; a card whose main output is
 * a ground purifies nothing. Each side output whose gate the collection
 * reached fires: a principle output yields 1 of its principle; Ward,
 * quintessence and the scaling statuses give 1 for each collected; draw,
 * regain and the unit statuses fire once.
 */
export function resolveCard(card: Card, pool: Pool, boost = 1, ctx: Context = {}): CardResult {
  const left = { ...pool }
  const drained = emptyPool()
  const principles: Record<Principle, number> = { salt: 0, sulfur: 0, mercury: 0 }
  let processed = 0
  let paid = 0
  let discards = 0
  const took_: number[] = card.channels.map(() => 0)
  const order = (s: Source) => (s === 'any' ? 1 : fromPool(s) ? 0 : 2)
  const ordered = card.channels.map((ch, i) => ({ ch, i })).sort((a, b) => order(a.ch.element) - order(b.ch.element))
  for (const { ch, i } of ordered) {
    let took = 0
    const src = ch.element
    if (src === 'any') took = takeMost(left, ch.capacity, drained)
    else if (src === 'quintessence') {
      // It pays its fixed cost only if that leaves you some quintessence.
      if ((ctx.quintessence ?? 0) - paid > QUINT_INPUT_COST) {
        took = ch.capacity
        paid += QUINT_INPUT_COST
      }
    } else if (src === 'discard') {
      if ((ctx.others ?? 0) > discards) {
        took = ch.capacity
        discards++
      }
    } else if (src === 'moon') took = ch.capacity
    else {
      took = Math.min(left[src], ch.capacity)
      left[src] -= took
      drained[src] += took
    }
    processed += took
    took_[i] = took
  }
  const condensed = ctx.condense ? takeMost(left, ctx.condense, drained) : 0
  processed += condensed
  let ward = 0
  let catalyst = 1
  let draw = 0
  let regain = 0
  let gain = 0
  const statuses: Partial<Record<StatusKey, number>> = {}
  for (const o of card.outputs) {
    if (o.gate > 0 && (processed <= 0 || processed < o.gate)) continue
    switch (o.kind) {
      case 'catalyst':
        catalyst *= o.factor
        break
      case 'principle':
        principles[o.principle] += 1
        break
      case 'ward':
        ward += processed
        break
      case 'draw':
        draw += o.n ?? 1
        break
      case 'regain':
        regain += EIGHTH * (o.n ?? 1)
        break
      case 'quintessence':
        gain += processed
        break
      case 'status':
        statuses[o.status] = (statuses[o.status] ?? 0) + (statusDef(o.status).unit ? (o.n ?? 1) : processed)
        break
    }
  }
  const grounded: number[] = []
  for (let g = 0; g < card.ground; g++) grounded.push(takeMost(left, GROUND_DRAIN, drained))
  const purification = card.purifies ? Math.ceil(processed * (1 + card.gain) * boost * (ctx.mult ?? 1)) : 0
  return { drained, processed, purification, principles, ward, catalyst, took: took_, grounded, condensed, paid, discards, draw, regain, gain, statuses }
}

/** What playing this card from hand would do in this run as it stands. */
export function resolveIn(run: Run, card: Card): CardResult {
  const f = run.fight
  const inHand = f.hand.some((x) => x.id === card.id)
  return resolveCard(card, f.pool, f.catalyst, {
    quintessence: run.quintessence,
    others: f.hand.length - (inHand ? 1 : 0),
    condense: f.status.condense,
    mult: multOf(f),
  })
}

/** What cards purify times over from statuses: Expose ×1.5, Volatile ×2. */
export const multOf = (f: Fight) => (f.status.expose > 0 ? 1.5 : 1) * (f.status.volatile > 0 ? 2 : 1)

/** What would flare now: the pool, less what Thorns purifies first, doubled if Volatile, less Ward. */
export function threatOf(f: Fight): number {
  const flare = Math.max(0, poolTotal(f.pool) - f.status.thorns) * (f.status.volatile > 0 ? 2 : 1)
  return Math.max(0, flare - f.ward)
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
      return { ...c, gain: c.gain + 1 }
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
  /** Statuses on the commission and on you. */
  status: Record<StatusKey, number>
  /** Spare time, in ticks: the next cards spend it before the dial moves. */
  spare: number
  /** Flares a Stall has held back, waiting for the next phase. */
  pending: number
}

export interface Run {
  settings: Settings
  seed: number
  quintessence: number
  metals: number
  deck: Card[]
  stage: 'draft' | 'fight' | 'reward' | 'won' | 'lost'
  fightIndex: number
  fight: Fight
  /** Between fights: the runes on offer, and whether the free one is taken. */
  offer: RewardRune[]
  tookFree: boolean
  /** What the last fight smelted. */
  smelted: { silver: number; lead: number; value: number } | null
  nextId: number
  /** Before the first fight: the twelfth rune being drafted. */
  draft: Draft | null
}

/**
 * The opening draft of a twelfth rune: pick one of three runes, each an input
 * and an output tuned by the balance simulator to be worth about two Washes;
 * the rune also yields a principle once it collects 1.
 */
export interface Draft {
  offers: DraftPair[]
  principle: Principle
}
export interface DraftPair {
  input: Channel
  output: DraftOutput
  /** What the balance simulator found it worth, in Washes. */
  worth: number
}
/** An output on offer in the draft: purification or a ground stage, or a side output. */
export type DraftOutput = { kind: 'purify' } | { kind: 'ground' } | Output

const channel = (element: Source, capacity: number): Channel => ({ element, capacity })
const yields = (principle: Principle): Output => ({ kind: 'principle', principle, gate: METAL_GATE })
const card = (id: number, name: string, channels: Channel[], outputs: Output[], purifies = true): Card => ({ id, name, channels, outputs, purifies, gain: 0, time: BASE_COST, ground: 0 })

/** A card the shop can offer: takes a little of anything, purifies it, and the next card played purifies ×2. */
export function catalystCard(id: number): Card {
  return card(id, 'Catalyst', [channel('any', 2)], [{ kind: 'catalyst', factor: 2, gate: 0 }])
}

/**
 * The opening deck: six purifiers, one for each pair of elements, that take up
 * to 3 of each and purify 1 for each, yielding nothing (slow to drain, but
 * they cover two elements and hit hard); four metal makers, one for each
 * element, that take up to 5 of it and ground it, purifying nothing, and yield
 * their principle once they take 4 or more; and the Sieve, which takes 3 of
 * anything, purifies it and raises Ward.
 */
export function startingDeck(): Card[] {
  let id = 1
  const metal = (name: string, e: Elemental, p: Principle) => card(id++, name, [channel(e, 5)], [yields(p)], false)
  const purifier = (name: string, a: Elemental, b: Elemental) => card(id++, name, [channel(a, 3), channel(b, 3)], [])
  return [
    purifier('Dissolve', 'water', 'earth'),
    purifier('Circulate', 'water', 'air'),
    purifier('Digest', 'water', 'fire'),
    purifier('Sublime', 'earth', 'air'),
    purifier('Coagulate', 'earth', 'fire'),
    purifier('Cupel', 'air', 'fire'),
    metal('Wash', 'water', 'mercury'),
    metal('Calcine', 'earth', 'salt'),
    metal('Fan', 'air', 'mercury'),
    metal('Kindle', 'fire', 'sulfur'),
    card(id++, 'Sieve', [channel('any', 3)], [{ kind: 'ward', gate: 1 }]),
  ]
}

/** Inputs the draft offers: the elements as the shop sells them, any, and the three that don't take from the pool. */
export const DRAFT_INPUTS: Channel[] = [
  channel('water', 5),
  channel('earth', 5),
  channel('air', 4),
  channel('fire', 4),
  channel('any', 3),
  channel('quintessence', 3),
  channel('discard', 3),
  channel('moon', 3),
]

/** Every output a drafted rune can have; the balance simulator pairs each with each input. */
export const DRAFT_OUTPUTS: DraftOutput[] = [
  { kind: 'purify' },
  { kind: 'ground' },
  { kind: 'ward', gate: 1 },
  { kind: 'catalyst', factor: 2, gate: 0 },
  { kind: 'draw', gate: UNIT_GATE },
  { kind: 'regain', gate: UNIT_GATE },
  { kind: 'quintessence', gate: 1 },
  ...STATUSES.map((st): DraftOutput => ({ kind: 'status', status: st.key, gate: st.unit ? UNIT_GATE : 1 })),
]

/** The drafted rune: its input, its output, and a principle once it collects 1. */
export function draftCard(id: number, input: Channel, output: DraftOutput, principle: Principle): Card {
  const metal: Output = { kind: 'principle', principle, gate: 1 }
  const c = card(id, 'Opus', [{ ...input }], [metal], output.kind === 'purify')
  if (output.kind === 'ground') return { ...c, ground: 1 }
  if (output.kind === 'purify') return c
  return { ...c, outputs: [{ ...output }, metal] }
}

/** Three runes from the tuned pairs, no two with the same output, and the principle they would yield. */
function rollDraft(rng: ReturnType<typeof makeRng>): Draft {
  const offers: DraftPair[] = []
  for (const p of rng.shuffle(DRAFT_PAIRS)) {
    if (offers.length < 3 && !offers.some((o) => JSON.stringify(o.output) === JSON.stringify(p.output))) offers.push(p)
  }
  return { offers, principle: PRINCIPLES[rng.int(0, PRINCIPLES.length - 1)] }
}

/** Take a rune on offer in the draft: it joins the deck and the first fight opens. */
export function draftPick(run: Run, i: number): Run {
  const d = run.draft
  if (run.stage !== 'draft' || !d) return run
  const pick = d.offers[i]
  if (!pick) throw new Error('No such rune on offer.')
  const opus = draftCard(run.nextId, pick.input, pick.output, d.principle)
  return startFight({ ...run, deck: [...run.deck, opus], nextId: run.nextId + 1, draft: null }, 0)
}

/** A new run: the draft of a twelfth rune first, unless asked to go straight to the first fight with the eleven. */
export function newRun(seed = Date.now(), settings: Settings = DEFAULT_SETTINGS, opts: { draft?: boolean } = {}): Run {
  const deck = startingDeck()
  const rng = makeRng(seed)
  const draft = opts.draft === false ? null : rollDraft(rng)
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
    draft,
  }
  return draft ? { ...run, stage: 'draft', seed: rng.state() } : startFight(run, 0)
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
    status: noStatus(),
    spare: 0,
    pending: 0,
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
 * What happens at a phase: helpers and statuses work; the commission attacks,
 * grows and feeds the pool in bulk, each at its own phases; at the first and
 * last quarters you discard your hand; at the new and full moons you draw.
 */
function phaseEvents(run: Run, pos: number, opening = false): Run {
  const phase = phaseAt(pos)!
  let f: Fight = { ...run.fight, pool: { ...run.fight.pool }, status: { ...run.fight.status }, log: run.fight.log.slice() }
  const st = f.status
  const c = f.commission
  const notes: string[] = []
  let quint = run.quintessence
  if (!opening && f.homunculi > 0) {
    const drained = takeMost(f.pool, HOMUNCULUS_DRAIN * f.homunculi)
    if (drained) {
      f.purified += drained
      notes.push(`the homunculus purifies ${drained}`)
    }
  }
  if (!opening && st.settle > 0) {
    const settled = takeMost(f.pool, st.settle)
    f.purified += settled
    st.settle -= 1
    if (settled) notes.push(`${settled} settles and is purified`)
  }
  if (!opening && st.mend > 0) {
    quint += st.mend
    notes.push(`you mend ${st.mend}`)
    st.mend -= 1
  }
  if (!opening && st.expose > 0) st.expose -= 1
  // Flares due now: the rhythm's, and any a Stall held back; a Stall holds each back an eighth more.
  let paid = 0
  const due = opening ? 0 : f.pending + (c.attacks.includes(phase) ? 1 : 0)
  const held = Math.min(st.stall, due)
  st.stall -= held
  f.pending = held
  if (held) notes.push(`${c.name} is stalled`)
  for (let k = 0; k < due - held; k++) {
    if (st.thorns > 0) {
      const pricked = takeMost(f.pool, st.thorns)
      f.purified += pricked
      st.thorns = 0
      if (pricked) notes.push(`thorns purify ${pricked}`)
    }
    const flare = poolTotal(f.pool) * (st.volatile > 0 ? 2 : 1)
    const doubled = st.volatile > 0
    st.volatile = 0
    const absorbed = Math.min(f.ward, flare)
    const cost = flare - absorbed
    paid += cost
    f.flares = [...f.flares, flare]
    f.ward -= absorbed
    f.paid += cost
    // The pool stays: a flare costs what is in it, but does not empty it.
    notes.push(flare ? `${c.name} flares ${flare}${doubled ? ' (doubled)' : ''}${absorbed ? `, Ward takes ${absorbed}` : ''}${cost ? `: pay ${cost}` : ''}` : `${c.name} flares, but the pool is empty`)
  }
  if (!opening && c.buffs?.includes(phase)) {
    f.buffs += 1
    notes.push(`${c.name} grows`)
  }
  if (opening || c.feedAt.includes(phase)) {
    const feed = feedOf(c, f.buffs)
    let starved = 0
    while (st.starve > starved && poolTotal(feed) > 0) {
      feed[ELEMENTS.reduce((a, b) => (feed[b] > feed[a] ? b : a))] -= 1
      starved++
    }
    st.starve = 0
    for (const e of ELEMENTS) f.pool[e] += feed[e]
    notes.push(`${c.name} feeds ${ELEMENTS.filter((e) => feed[e]).map((e) => `${feed[e]} ${e}`).join(', ') || 'nothing'}${starved ? ` (${starved} starved)` : ''}`)
  }
  let extra = 0
  if (!opening && DISCARD_PHASES.includes(phase)) {
    if (st.retain > 0) {
      st.retain = 0
      if (f.hand.length) notes.push(`you keep your hand`)
    } else if (f.hand.length) {
      notes.push(`you discard ${f.hand.length}`)
      f.discard = [...f.discard, ...f.hand]
      f.hand = []
    }
    if (st.foresight > 0) {
      extra = FORESIGHT_DRAW * st.foresight
      st.foresight = 0
      notes.push(`foresight draws ${extra}`)
    }
  }
  const draws = (opening || DRAW_PHASES.includes(phase) ? run.settings.hand : 0) + extra
  if (notes.length) f.log.unshift(`${PHASE_NAMES[phase]}: ${notes.join('; ')}.`)
  let next: Run = { ...run, quintessence: Math.max(0, quint - paid), fight: f }
  if (draws) next = drawCards(next, draws)
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

/**
 * Play a card from hand: it resolves at once, then the dial moves on by its
 * cost, less any spare time, which it spends first. A card with a discard
 * input throws away another card from hand: the one named, else the first.
 */
export function playCard(run: Run, id: number, discardId?: number): Run {
  if (run.stage !== 'fight') return run
  const c = run.fight.hand.find((x) => x.id === id)
  if (!c) throw new Error('That card is not in hand.')
  const f0 = run.fight
  const r = resolveIn(run, c)
  const pool = { ...f0.pool }
  for (const e of ELEMENTS) pool[e] -= r.drained[e]
  const principles = { ...f0.principles }
  for (const p of PRINCIPLES) principles[p] += r.principles[p]
  let hand = f0.hand.filter((x) => x.id !== id)
  const thrown: Card[] = []
  for (let k = 0; k < r.discards; k++) {
    const t = hand.find((x) => x.id === discardId) ?? hand[0]
    if (!t) break
    thrown.push(t)
    hand = hand.filter((x) => x !== t)
    discardId = undefined
  }
  const status = { ...f0.status, condense: 0 }
  const put: string[] = []
  for (const [k, n] of Object.entries(r.statuses) as [StatusKey, number][]) {
    const def = statusDef(k)
    status[k] = Math.min(def.cap ?? Infinity, status[k] + n)
    put.push(def.unit ? def.name : `${def.name} ${n}`)
  }
  const cost = costOf(c)
  const spent = Math.min(f0.spare, cost)
  const got = PRINCIPLES.filter((p) => r.principles[p]).map((p) => `${r.principles[p]} ${p}`)
  const what = [
    c.purifies ? `purifies ${r.purification}${f0.catalyst > 1 ? ` (×${f0.catalyst} from a catalyst)` : ''}` : poolTotal(r.drained) ? 'grounds it' : '',
    got.length ? `leaves ${got.join(' and ')}` : '',
    r.ward ? `raises Ward ${r.ward}` : '',
    r.gain ? `gains ${r.gain} quintessence` : '',
    r.draw ? `draws ${r.draw}` : '',
    r.regain ? `spares ${r.regain === EIGHTH ? 'an eighth' : `${r.regain / EIGHTH} eighths`}` : '',
    put.length ? `puts on ${put.join(', ')}` : '',
    r.catalyst > 1 ? `the next card purifies ×${r.catalyst}` : '',
  ].filter(Boolean)
  const paidWords = [r.paid ? `pays ${r.paid} quintessence` : '', thrown.length ? `discards ${thrown.map((t) => t.name).join(', ')}` : ''].filter(Boolean)
  const fight: Fight = {
    ...f0,
    pool,
    principles,
    status,
    ward: f0.ward + r.ward,
    catalyst: r.catalyst,
    purified: f0.purified + r.purification,
    hand,
    discard: [...f0.discard, ...thrown, c],
    spare: f0.spare - spent + r.regain,
    log: [`${c.name}: ${[...paidWords, `takes ${poolTotal(r.drained)}`, ...what].join(', ')}.`, ...f0.log],
  }
  let played: Run = { ...run, quintessence: run.quintessence - r.paid + r.gain, fight }
  if (r.draw) played = drawCards(played, r.draw)
  played = after(played)
  return played.stage === 'fight' ? settle(advance(played, cost - spent)) : played
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

/**
 * The next phases and what they bring, for the dial: attack is whether a flare
 * comes there (after any Stall), rhythm whether the commission's rhythm puts
 * one there, held whether a Stall holds one back there.
 */
export function upcoming(f: Fight, count = 4): { pos: number; phase: Phase; attack: boolean; rhythm: boolean; held: boolean; buff: boolean; feed: boolean; draw: boolean; discard: boolean }[] {
  const out = []
  let pos = f.dial + 1
  let carry = f.pending
  let stall = f.status.stall
  while (out.length < count) {
    const phase = phaseAt(pos)
    if (phase) {
      const rhythm = f.commission.attacks.includes(phase)
      const due = carry + (rhythm ? 1 : 0)
      const held = Math.min(stall, due)
      stall -= held
      carry = held
      out.push({
        pos,
        phase,
        attack: due - held > 0,
        rhythm,
        held: held > 0,
        buff: !!f.commission.buffs?.includes(phase),
        feed: f.commission.feedAt.includes(phase),
        draw: DRAW_PHASES.includes(phase),
        discard: DISCARD_PHASES.includes(phase),
      })
    }
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

/**
 * A single fight against one commission with this deck, at full
 * quintessence: what the balance simulator plays.
 */
export function fightWith(seed: number, deck: Card[], index: number, settings: Settings = DEFAULT_SETTINGS): Run {
  const run: Run = {
    settings,
    seed,
    quintessence: settings.stock,
    metals: 0,
    deck,
    stage: 'fight',
    fightIndex: index,
    fight: null as unknown as Fight,
    offer: [],
    tookFree: false,
    smelted: null,
    nextId: 1 + Math.max(0, ...deck.map((c) => c.id)),
    draft: null,
  }
  return startFight(run, index)
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
      return 'Gain: purification ×1 more'
    case 'card':
      return 'Catalyst: a new card; the next card played after it purifies ×2'
    case 'distill':
      return `Distil ${r.principle}: 1 ${r.principle} whenever the card takes ${METAL_GATE} or more`
    case 'ground':
      return `Ground: a new stage that takes up to ${GROUND_DRAIN} of anything and grounds it, purifying nothing`
  }
}

/** An output in a few words. */
export function outputWords(o: Output): string {
  switch (o.kind) {
    case 'ward':
      return 'Ward 1 for each'
    case 'catalyst':
      return `the next card ×${o.factor}`
    case 'principle':
      return `${o.principle} from ${o.gate}`
    case 'draw':
      return `draw ${o.n ?? 1} from ${o.gate}`
    case 'regain':
      return `spare ${(o.n ?? 1) === 1 ? 'an eighth' : `${o.n} eighths`} from ${o.gate}`
    case 'quintessence':
      return 'quintessence 1 for each'
    case 'status': {
      const d = statusDef(o.status)
      return d.unit ? `${d.name}${(o.n ?? 1) > 1 ? ` ${o.n}` : ''} from ${o.gate}` : `${d.name} 1 for each`
    }
  }
}

/** An input in a few words. */
export function inputWords(ch: Channel): string {
  switch (ch.element) {
    case 'any':
      return `${ch.capacity} any`
    case 'quintessence':
      return `${ch.capacity} for ${QUINT_INPUT_COST} quintessence`
    case 'discard':
      return `${ch.capacity} for a discard`
    case 'moon':
      return `${ch.capacity} for an eighth`
    default:
      return `${ch.capacity} ${ch.element}`
  }
}

/** A card's equation in words. */
export function cardWords(c: Card): string {
  const ins = c.channels.map(inputWords).join(' + ')
  const g = c.gain ? ` ×${1 + c.gain}` : ''
  const d = c.outputs.map((o) => `, ${outputWords(o)}`).join('')
  const gr = c.ground ? `, ground ${c.ground * GROUND_DRAIN}` : ''
  return `Takes up to ${ins}${g}${d}${gr}`
}
