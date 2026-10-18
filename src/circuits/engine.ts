// Circuits: a card is a small circuit. The commission feeds instability into a
// pool, element by element, on a moon dial; cards drain it through their input
// channels and turn what they take into purification (one number) and the
// three principles (salt, sulfur, mercury). Whatever is left in the pool when
// the commission attacks flares and costs quintessence. There are no turns:
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
 * tick: the eight phases of the moon. A fight opens at the first quarter, so
 * position 0 is the first quarter and the full moon falls 4 ticks later.
 */
export const TICKS = 16
export type Phase = 'first' | 'waxing-gibbous' | 'full' | 'waning-gibbous' | 'last' | 'waning-crescent' | 'new' | 'waxing-crescent'
/** In the order the dial meets them from the opening. */
export const PHASES: Phase[] = ['first', 'waxing-gibbous', 'full', 'waning-gibbous', 'last', 'waning-crescent', 'new', 'waxing-crescent']
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
/** The quarter phases, when you draw. */
export const DRAW_PHASES: Phase[] = ['new', 'first', 'full', 'last']
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
  /** Gain stages: each multiplies purification by one more (×2, ×3, …) and costs a tick (a sixteenth of the moon) more. */
  gain: number
  /** The most it purifies in one play, when rails are on; rail runes raise it. */
  rail: number
  /** Grounds: each drains up to GROUND_DRAIN more of any instability, purifying nothing. */
  ground: number
}

export type Output = { kind: 'principle'; principle: Principle; gate: number } | { kind: 'ward'; gate: number }

export const GROUND_DRAIN = 3
/** What a principle output needs its stage to collect. */
export const METAL_GATE = 4
export const BASE_COST = 2
/** Most of each part a card can hold. */
export const CAPS = { channels: 3, gain: 2, outputs: 3, ground: 2, rail: 2 }
/** A card's rail to start, and what each rail rune adds. */
export const RAIL_BASE = 10
export const RAIL_STEP = 5
/** Time a card takes on the dial, in ticks: an eighth of the moon (2 ticks), and a tick more for each gain stage. */
export const costOf = (c: Card) => BASE_COST + c.gain

export interface CardResult {
  /** What the card drains from the pool, by element (channels and grounds). */
  drained: Pool
  /** What its channels took: the part that purifies. */
  processed: number
  purification: number
  principles: Record<Principle, number>
  /** Ward it raises against the next flare. */
  ward: number
  /** What each channel took, in the card's order. */
  took: number[]
}

/**
 * What playing a card does to this pool. Channels for one element take first,
 * up to their capacity; any-element channels then take from whatever is most
 * plentiful; grounds last. Purification is what the channels took, times
 * (1 + gain). Each side output whose gate the channels reached fires: a
 * principle output yields 1 of its principle, a Ward output Ward 1 for each
 * taken.
 */
export function resolveCard(card: Card, pool: Pool, rails = false): CardResult {
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
  for (const o of card.outputs) {
    if (processed <= 0 || processed < o.gate) continue
    if (o.kind === 'principle') principles[o.principle] += 1
    else ward += processed
  }
  for (let g = 0; g < card.ground; g++) {
    let need = GROUND_DRAIN
    while (need > 0 && poolTotal(left) > 0) need -= takeFrom(most(), need)
  }
  const raw = processed * (1 + card.gain)
  return { drained, processed, purification: rails ? Math.min(raw, card.rail) : raw, principles, ward, took: took_ }
}

// ---------------------------------------------------------------------------
// Commissions

export interface Commission {
  key: string
  name: string
  blurb: string
  /** Purification that finishes it. */
  require: number
  /** Instability fed into the pool at every phase, by element. */
  feed: Partial<Pool>
  /** Phases at which whatever is left in the pool flares. */
  attacks: Phase[]
  /** Phases at which it grows stronger, adding buffFeed to its feed. */
  buffs?: Phase[]
  buffFeed?: Partial<Pool>
  /** Under the overflow rule: how much of each element the vessel holds safely; only what is above it flares. */
  vessel?: number
}

/** The vessel a commission holds its pool in, under the overflow rule. */
export const DEFAULT_VESSEL = 6

export const COMMISSIONS: Commission[] = [
  { key: 'mud', name: 'Mud', blurb: 'Feeds mostly water and some earth. Its vessel holds 4 of each; what is above flares at every full and new moon.', require: 30, feed: { water: 4, earth: 2 }, attacks: ['full', 'new'], vessel: 4 },
  { key: 'peat', name: 'Peat bog', blurb: 'Water, earth and a smoulder of fire. Its vessel holds 4 of each; what is above flares at every full and new moon.', require: 45, feed: { water: 3, earth: 3, fire: 1 }, attacks: ['full', 'new'], vessel: 4 },
  {
    key: 'fumarole',
    name: 'Fumarole',
    blurb: 'A vent of hot breath: air and fire, a little water. Its vessel holds 4 of each; what is above flares at every full and new moon.',
    require: 40,
    feed: { air: 3, fire: 3, water: 1 },
    attacks: ['full', 'new'],
    vessel: 4,
  },
  {
    key: 'mire',
    name: 'The Mire',
    blurb: 'A boss. Its vessel holds only 3 of each; what is above flares at every quarter. Grows at every crescent and gibbous moon, adding earth to its feed.',
    require: 50,
    feed: { water: 4, earth: 3, fire: 1 },
    attacks: ['first', 'full', 'last', 'new'],
    buffs: ['waxing-gibbous', 'waning-gibbous', 'waning-crescent', 'waxing-crescent'],
    buffFeed: { earth: 1 },
    vessel: 3,
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
  /** Time on the dial, in ticks. */
  time: number
  effect: string
}

export const RECIPES: Recipe[] = [
  { key: 'tincture', name: 'Tincture of salt', cost: { salt: 2 }, time: 1, effect: 'Ward 6 against the next flare' },
  { key: 'spirit', name: 'Spirit of mercury', cost: { mercury: 3 }, time: 1, effect: 'Draw 2' },
  { key: 'homunculus', name: 'Homunculus', cost: { mercury: 3, salt: 2, sulfur: 1 }, time: 2, effect: 'A helper: at every phase it drains 2 of the most plentiful instability and purifies 2' },
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
  | { kind: 'rail' }

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
  { kind: 'rail' },
]

export const EXTRA_RUNE_PRICE = 3

/** Whether this rune fits on this card: each kind of part has a cap. */
export const fits = (r: RewardRune, c: Card) =>
  r.kind === 'channel'
    ? c.channels.length < CAPS.channels
    : r.kind === 'gain'
      ? c.gain < CAPS.gain
      : r.kind === 'distill'
        ? c.outputs.length < CAPS.outputs
        : r.kind === 'rail'
          ? c.rail < RAIL_BASE + CAPS.rail * RAIL_STEP
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
    case 'rail':
      return { ...c, rail: c.rail + RAIL_STEP }
  }
}

// ---------------------------------------------------------------------------
// The run

export interface Settings {
  stock: number
  hand: number
  /**
   * When and how you draw. refill: at every quarter, refill the hand to
   * `hand`; draw: at every quarter, draw `hand` more; cycle: each half moon is
   * a turn, so at every full and new moon, discard what is left and draw `hand`.
   */
  draw: 'refill' | 'draw' | 'cycle'
  /**
   * What a flare does to the pool. clear: all of it flares and the pool is
   * emptied; keep: all of it flares but it stays; overflow: only what is above
   * the commission's vessel flares, and only that is lost.
   */
  flare: 'clear' | 'keep' | 'overflow'
  /** Whether cards purify at most their rail per play. */
  rails: boolean
}

/** The phases at which you draw under these settings (the opening always draws). */
export const drawPhases = (s: Settings): Phase[] => (s.draw === 'cycle' ? ['full', 'new'] : DRAW_PHASES)
export const DEFAULT_SETTINGS: Settings = { stock: 60, hand: 4, draw: 'refill', flare: 'overflow', rails: true }

export interface Fight {
  commission: Commission
  dial: number
  buffs: number
  pool: Pool
  purified: number
  ward: number
  principles: Record<Principle, number>
  homunculi: number
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
const card = (id: number, name: string, ch: Channel, out: Output): Card => ({ id, name, channels: [ch], outputs: [out], gain: 0, ground: 0, rail: RAIL_BASE })

/** The opening deck: one-input circuits, mostly water and earth. The metal creators yield their principle only from 4 or more; the Sieve raises Ward instead. */
export function startingDeck(): Card[] {
  let id = 1
  return [
    ...Array.from({ length: 4 }, () => card(id++, 'Wash', channel('water', 5), yields('mercury'))),
    ...Array.from({ length: 3 }, () => card(id++, 'Calcine', channel('earth', 5), yields('salt'))),
    card(id++, 'Fan', channel('air', 5), yields('mercury')),
    card(id++, 'Kindle', channel('fire', 5), yields('sulfur')),
    card(id++, 'Sieve', channel('any', 3), { kind: 'ward', gate: 1 }),
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
    hand: [],
    draw: rng.shuffle(run.deck),
    discard: [],
    log: [`${commission.name}: ${commission.blurb}`],
    paid: 0,
    flares: [],
  }
  // The first quarter that opens the fight: the first feed and the first hand.
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

/** What would flare from this pool under a flare rule, by element: all of it, or what is above the vessel. */
export function flareOf(pool: Pool, c: Commission, rule: Settings['flare']): Pool {
  const out = emptyPool()
  const cap = rule === 'overflow' ? (c.vessel ?? DEFAULT_VESSEL) : 0
  for (const e of ELEMENTS) out[e] = Math.max(0, pool[e] - cap)
  return out
}

/** What happens at a phase: helpers work, the commission attacks and grows, it feeds the pool, and at the quarters you draw. */
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
    const rule = run.settings.flare
    const flaring = flareOf(f.pool, c, rule)
    const flare = poolTotal(flaring)
    const absorbed = Math.min(f.ward, flare)
    paid = flare - absorbed
    f.flares = [...f.flares, flare]
    f.ward -= absorbed
    f.paid += paid
    if (rule !== 'keep') for (const e of ELEMENTS) f.pool[e] -= flaring[e]
    notes.push(flare ? `${c.name} flares ${flare}${absorbed ? `, Ward takes ${absorbed}` : ''}${paid ? `: pay ${paid}` : ''}` : `${c.name} flares, but nothing ${rule === 'overflow' ? 'is over the vessel' : 'is in the pool'}`)
  }
  if (!opening && c.buffs?.includes(phase)) {
    f.buffs += 1
    notes.push(`${c.name} grows`)
  }
  const feed = feedOf(c, f.buffs)
  for (const e of ELEMENTS) f.pool[e] += feed[e]
  const draws = opening || drawPhases(run.settings).includes(phase)
  if (draws && run.settings.draw === 'cycle' && f.hand.length) {
    notes.push(`discards ${f.hand.length}`)
    f.discard = [...f.discard, ...f.hand]
    f.hand = []
  }
  f.log.unshift(`${PHASE_NAMES[phase]}: ${[...notes, `feeds ${ELEMENTS.filter((e) => feed[e]).map((e) => `${feed[e]} ${e}`).join(', ')}`].join('; ')}.`)
  let next: Run = { ...run, quintessence: Math.max(0, run.quintessence - paid), fight: f }
  if (draws) {
    const n = run.settings.draw === 'refill' ? Math.max(0, run.settings.hand - f.hand.length) : run.settings.hand
    next = drawCards(next, n)
  }
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
  const offer = rng.shuffle(REWARD_POOL.filter((r) => r.kind !== 'rail' || run.settings.rails)).slice(0, 3)
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
  const r = resolveCard(c, run.fight.pool, run.settings.rails)
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
    purified: run.fight.purified + r.purification,
    hand: run.fight.hand.filter((x) => x.id !== id),
    discard: [...run.fight.discard, c],
    log: [`${c.name}: takes ${poolTotal(r.drained)}, purifies ${r.purification}${got.length ? `, leaves ${got.join(' and ')}` : ''}${r.ward ? `, raises Ward ${r.ward}` : ''}.`, ...run.fight.log],
  }
  const played = after({ ...run, fight })
  return played.stage === 'fight' ? settle(advance(played, costOf(c))) : played
}

export const canAfford = (f: Fight, r: Recipe) => PRINCIPLES.every((p) => f.principles[p] >= (r.cost[p] ?? 0))

/** Brew a recipe: pay its principles, take its time, apply it. */
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
export function upcoming(f: Fight, count = 4, drawAt: Phase[] = DRAW_PHASES): { pos: number; phase: Phase; attack: boolean; buff: boolean; draw: boolean }[] {
  const out = []
  let pos = f.dial + 1
  while (out.length < count) {
    const phase = phaseAt(pos)
    if (phase) out.push({ pos, phase, attack: f.commission.attacks.includes(phase), buff: !!f.commission.buffs?.includes(phase), draw: drawAt.includes(phase) })
    pos++
  }
  return out
}

// ---------------------------------------------------------------------------
// Between fights

/** Take a rune on offer and add it to a card in the deck: the first is free, more cost metal. */
export function takeRune(run: Run, offerIndex: number, cardId: number): Run {
  if (run.stage !== 'reward') return run
  const r = run.offer[offerIndex]
  const c = run.deck.find((x) => x.id === cardId)
  if (!r || !c || !fits(r, c)) throw new Error('That rune does not fit there.')
  const price = run.tookFree ? EXTRA_RUNE_PRICE : 0
  if (price > run.metals) throw new Error('Not enough metal.')
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
    case 'distill':
      return `Distil ${r.principle}: 1 ${r.principle} whenever the card takes ${METAL_GATE} or more`
    case 'ground':
      return `Ground: drains ${GROUND_DRAIN} more of anything, purifying nothing`
    case 'rail':
      return `Rail: purifies up to ${RAIL_STEP} more in one play`
  }
}

/** A card's equation in words. */
export function cardWords(c: Card): string {
  const ins = c.channels.map((ch) => `${ch.capacity} ${ch.element === 'any' ? 'any' : ch.element}`).join(' + ')
  const g = c.gain ? ` ×${1 + c.gain}` : ''
  const d = c.outputs.map((o) => (o.kind === 'ward' ? ', Ward 1 for each' : `, ${o.principle} from ${o.gate}`)).join('')
  const gr = c.ground ? `, ground ${c.ground * GROUND_DRAIN}` : ''
  return `Takes up to ${ins}${g}${d}${gr}`
}
