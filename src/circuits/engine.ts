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
/** What processing each element leaves behind: earth salt, fire sulfur, the volatile water and air mercury. */
export const PRINCIPLE_OF: Record<Elemental, Principle> = { earth: 'salt', fire: 'sulfur', water: 'mercury', air: 'mercury' }

export type Pool = Record<Elemental, number>
export const emptyPool = (): Pool => ({ water: 0, earth: 0, air: 0, fire: 0 })
export const poolTotal = (p: Pool) => ELEMENTS.reduce((n, e) => n + p[e], 0)

// ---------------------------------------------------------------------------
// The dial

/** The dial counts eighths of a moon. Phases fall on every second eighth. */
export const EIGHTHS = 8
export type Phase = 'new' | 'first' | 'full' | 'last'
export const PHASES: Phase[] = ['new', 'first', 'full', 'last']
export const PHASE_NAMES: Record<Phase, string> = { new: 'New moon', first: 'First quarter', full: 'Full moon', last: 'Last quarter' }
/** The phase at a dial position that falls on one, else null. */
export const phaseAt = (pos: number): Phase | null => (pos % 2 === 0 ? PHASES[(pos / 2) % 4] : null)

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
   * The collecting stage's side output, beside purification: the principles of
   * what it took (the metal creators), or Ward, 1 for each it took (Sieve).
   */
  output: 'principle' | 'ward'
  /**
   * What the collecting stage must take before it gives its side output: the
   * metal creators need 4, Sieve 1. Drawn as that many arcs on the output.
   */
  threshold: number
  /** Gain stages: each multiplies purification by one more (×2, ×3, …) and costs an eighth more. */
  gain: number
  /** Distilling stages: each yields the card's principles once more. Only on cards that yield principles. */
  distill: number
  /** Grounds: each drains up to GROUND_DRAIN more of any instability, purifying nothing. */
  ground: number
}

export const GROUND_DRAIN = 3
export const BASE_COST = 2
/** Most of each part a card can hold. */
export const CAPS = { channels: 3, gain: 2, distill: 2, ground: 2 }
/** Time a card takes on the dial, in eighths: a quarter, and an eighth more for each gain stage. */
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
 * (1 + gain). When the channels took at least the card's threshold, the side
 * output fires: for a principle card, each channel that took something yields
 * its element's principle, times (1 + distill); for a Ward card, Ward 1 for
 * each it took.
 */
export function resolveCard(card: Card, pool: Pool): CardResult {
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
  const mains: (Elemental | null)[] = card.channels.map(() => null)
  const ordered = card.channels.map((ch, i) => ({ ch, i })).sort((a, b) => Number(a.ch.element === 'any') - Number(b.ch.element === 'any'))
  for (const { ch, i } of ordered) {
    let took = 0
    let main: Elemental | null = null
    if (ch.element !== 'any') {
      took = takeFrom(ch.element, ch.capacity)
      main = ch.element
    } else {
      let need = ch.capacity
      while (need > 0 && poolTotal(left) > 0) {
        const e = most()
        const k = takeFrom(e, need)
        if (k > 0 && !main) main = e
        took += k
        need -= k
      }
    }
    processed += took
    took_[i] = took
    mains[i] = main
  }
  const fires = processed > 0 && processed >= card.threshold
  if (fires && card.output === 'principle') card.channels.forEach((_, i) => {
    if (took_[i] > 0 && mains[i]) principles[PRINCIPLE_OF[mains[i]!]] += 1 + card.distill
  })
  const ward = fires && card.output === 'ward' ? processed : 0
  for (let g = 0; g < card.ground; g++) {
    let need = GROUND_DRAIN
    while (need > 0 && poolTotal(left) > 0) need -= takeFrom(most(), need)
  }
  return { drained, processed, purification: processed * (1 + card.gain), principles, ward, took: took_ }
}

// ---------------------------------------------------------------------------
// Commissions

export interface Commission {
  key: string
  name: string
  blurb: string
  /** Purification that finishes it. */
  require: number
  /** Instability fed into the pool at every quarter, by element. */
  feed: Partial<Pool>
  /** Phases at which whatever is left in the pool flares. */
  attacks: Phase[]
  /** Phases at which it grows stronger, adding buffFeed to its feed. */
  buffs?: Phase[]
  buffFeed?: Partial<Pool>
}

export const COMMISSIONS: Commission[] = [
  { key: 'mud', name: 'Mud', blurb: 'Feeds mostly water and a little earth. Flares at every full moon.', require: 30, feed: { water: 3, earth: 1 }, attacks: ['full'] },
  { key: 'peat', name: 'Peat bog', blurb: 'Water, earth and a smoulder of fire. Flares at every full moon.', require: 45, feed: { water: 2, earth: 2, fire: 1 }, attacks: ['full'] },
  {
    key: 'mire',
    name: 'The Mire',
    blurb: 'A boss. Grows at every quarter moon, adding earth to its feed, and flares at every new and full moon.',
    require: 50,
    feed: { water: 3, earth: 2, fire: 1 },
    attacks: ['new', 'full'],
    buffs: ['first', 'last'],
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
  /** Time on the dial, in eighths. */
  time: number
  effect: string
}

export const RECIPES: Recipe[] = [
  { key: 'tincture', name: 'Tincture of salt', cost: { salt: 2 }, time: 1, effect: 'Ward 6 against the next flare' },
  { key: 'spirit', name: 'Spirit of mercury', cost: { mercury: 3 }, time: 1, effect: 'Draw 2' },
  { key: 'homunculus', name: 'Homunculus', cost: { mercury: 3, salt: 2, sulfur: 1 }, time: 2, effect: 'A helper: every quarter it drains 2 of the most plentiful instability and purifies 2' },
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
  | { kind: 'distill' }
  | { kind: 'ground' }

export const REWARD_POOL: RewardRune[] = [
  { kind: 'channel', element: 'water', capacity: 5 },
  { kind: 'channel', element: 'earth', capacity: 5 },
  { kind: 'channel', element: 'air', capacity: 4 },
  { kind: 'channel', element: 'fire', capacity: 4 },
  { kind: 'channel', element: 'any', capacity: 3 },
  { kind: 'gain' },
  { kind: 'gain' },
  { kind: 'distill' },
  { kind: 'ground' },
]

export const EXTRA_RUNE_PRICE = 3

/** Whether this rune fits on this card: each kind of part has a cap, and distilling needs principles to distil. */
export const fits = (r: RewardRune, c: Card) =>
  r.kind === 'channel'
    ? c.channels.length < CAPS.channels
    : r.kind === 'gain'
      ? c.gain < CAPS.gain
      : r.kind === 'distill'
        ? c.output === 'principle' && c.distill < CAPS.distill
        : c.ground < CAPS.ground

export function addRune(c: Card, r: RewardRune): Card {
  if (!fits(r, c)) return c
  switch (r.kind) {
    case 'channel':
      return { ...c, channels: [...c.channels, { element: r.element, capacity: r.capacity }] }
    case 'gain':
      return { ...c, gain: c.gain + 1 }
    case 'distill':
      return { ...c, distill: c.distill + 1 }
    case 'ground':
      return { ...c, ground: c.ground + 1 }
  }
}

// ---------------------------------------------------------------------------
// The run

export interface Settings {
  stock: number
  hand: number
  /** At each new and full moon: refill the hand to `hand`, or draw that many. */
  draw: 'refill' | 'draw'
}
export const DEFAULT_SETTINGS: Settings = { stock: 60, hand: 4, draw: 'refill' }

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
/** What a metal creator must collect before it yields its principle. */
export const METAL_GATE = 4
const card = (id: number, name: string, ch: Channel, output: Card['output'] = 'principle', threshold = output === 'principle' ? METAL_GATE : 1): Card => ({
  id,
  name,
  channels: [ch],
  output,
  threshold,
  gain: 0,
  distill: 0,
  ground: 0,
})

/** The opening deck: one-input circuits, mostly water and earth. The metal creators yield their principle only from 4 or more; Sieve raises Ward instead. */
export function startingDeck(): Card[] {
  let id = 1
  return [
    ...Array.from({ length: 4 }, () => card(id++, 'Wash', channel('water', 5))),
    ...Array.from({ length: 3 }, () => card(id++, 'Calcine', channel('earth', 5))),
    card(id++, 'Fan', channel('air', 5)),
    card(id++, 'Kindle', channel('fire', 5)),
    card(id++, 'Sieve', channel('any', 3), 'ward'),
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

/** What happens at a phase: helpers work, the commission attacks and grows, it feeds the pool, and at new and full moons you draw. */
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
    f.pool = emptyPool()
    notes.push(flare ? `${c.name} flares ${flare}${absorbed ? `, Ward takes ${absorbed}` : ''}${paid ? `: pay ${paid}` : ''}` : `${c.name} flares, but the pool is empty`)
  }
  if (!opening && c.buffs?.includes(phase)) {
    f.buffs += 1
    notes.push(`${c.name} grows`)
  }
  const feed = feedOf(c, f.buffs)
  for (const e of ELEMENTS) f.pool[e] += feed[e]
  f.log.unshift(`${PHASE_NAMES[phase]}: ${[...notes, `feeds ${ELEMENTS.filter((e) => feed[e]).map((e) => `${feed[e]} ${e}`).join(', ')}`].join('; ')}.`)
  let next: Run = { ...run, quintessence: Math.max(0, run.quintessence - paid), fight: f }
  if (phase === 'new' || phase === 'full') {
    const n = run.settings.draw === 'refill' ? Math.max(0, run.settings.hand - f.hand.length) : run.settings.hand
    next = drawCards(next, n)
  }
  return next
}

/** Move the dial on, running every phase it reaches. */
function advance(run: Run, eighths: number): Run {
  let next = run
  const from = run.fight.dial
  for (let pos = from + 1; pos <= from + eighths; pos++) {
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

/** Play a card from hand: it resolves at once, then the dial moves on by its cost. */
export function playCard(run: Run, id: number): Run {
  if (run.stage !== 'fight') return run
  const c = run.fight.hand.find((x) => x.id === id)
  if (!c) throw new Error('That card is not in hand.')
  const r = resolveCard(c, run.fight.pool)
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
  return played.stage === 'fight' ? advance(played, costOf(c)) : played
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
  return advance(next, r.time)
}

/** Let a quarter pass without playing. */
export function wait(run: Run): Run {
  if (run.stage !== 'fight') return run
  return advance({ ...run, fight: { ...run.fight, log: ['Waits a quarter.', ...run.fight.log] } }, 2)
}

/** The next phases and what they bring, for the dial. */
export function upcoming(f: Fight, count = 4): { pos: number; phase: Phase; attack: boolean; buff: boolean; draw: boolean }[] {
  const out = []
  let pos = f.dial + 1
  while (out.length < count) {
    const phase = phaseAt(pos)
    if (phase) out.push({ pos, phase, attack: f.commission.attacks.includes(phase), buff: !!f.commission.buffs?.includes(phase), draw: phase === 'new' || phase === 'full' })
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
      return 'Gain stage: purification ×1 more, an eighth slower'
    case 'distill':
      return 'Distilling stage: principles once more'
    case 'ground':
      return `Ground: drains ${GROUND_DRAIN} more of anything, purifying nothing`
  }
}

/** A card's equation in words. */
export function cardWords(c: Card): string {
  const ins = c.channels.map((ch) => `${ch.capacity} ${ch.element === 'any' ? 'any' : ch.element}`).join(' + ')
  const g = c.gain ? ` ×${1 + c.gain}` : ''
  const d = c.output === 'ward' ? ', Ward 1 for each' : c.distill ? `, principles ×${1 + c.distill}` : ''
  const gr = c.ground ? `, ground ${c.ground * GROUND_DRAIN}` : ''
  return `Takes up to ${ins}${g}${d}${gr}`
}
