// DSP: offense and defense pulled apart. The commission still feeds
// instability into a pool on the moon dial, and the pool still flares against
// your quintessence. Drainers (their sigils inside the circuit) take
// instability out of the pool, and what they take charges one battery.
// Sculptors (their sigils outside) play elements into an attack, which must
// grow into the commission's material: at least its size, and close enough to
// its shape. At any time you can spend charge to smooth the attack toward the
// target's shape, a unit of the wrong element moved into a missing one for
// each charge. Each element is a band of sound: earth the bass, water and air
// the mids, fire the treble, so the attack is a spectrum, and smoothing it is a
// filter that turns a rough noise into the material's pure tone. See DSP.md.

import { makeRng } from '../sim/rng'
import type { Elemental } from '../sim/types'
import { DISCARD_PHASES, DRAW_PHASES, ELEMENTS, PHASE_NAMES, TICKS, emptyPool, phaseAt, poolTotal, type Phase, type Pool } from '../circuits/engine'

export { ELEMENTS, PHASE_NAMES, TICKS, emptyPool, phaseAt, poolTotal, type Phase, type Pool }

/** The elements low to high, as bands of sound: earth the bass, water and air the mids, fire the treble. */
export const BANDS: Elemental[] = ['earth', 'water', 'air', 'fire']

/** An eighth of the moon, the time every card takes. */
export const EIGHTH = 2
/** What a drainer takes of each of its elements, and what a sculptor plays of each of its. */
export const DRAIN = 3
export const SCULPT = 3
/** Charge for each unit of instability drained. */
export const CHARGE_PER_UNIT = 1
/** How close the attack's shape must be to the material's to finish it. */
export const MATCH_TO_FINISH = 0.8

// ---------------------------------------------------------------------------
// Cards

export interface Card {
  id: number
  name: string
  /** Inner sigils, defense: what it takes from the pool, by element; each unit taken charges the battery. */
  takes: Partial<Pool>
  /** Outer sigils, offense: what it plays into the attack, by element. */
  gives: Partial<Pool>
  /** Time on the dial, in ticks. */
  time: number
}

export const isDrainer = (c: Card) => poolTotal({ ...emptyPool(), ...c.takes }) > 0
export const isSculptor = (c: Card) => poolTotal({ ...emptyPool(), ...c.gives }) > 0

type Pair = [Elemental, Elemental]
const PAIRS: Pair[] = [
  ['water', 'earth'],
  ['water', 'air'],
  ['water', 'fire'],
  ['earth', 'air'],
  ['earth', 'fire'],
  ['air', 'fire'],
]
const DRAINER_NAMES = ['Decant', 'Evaporate', 'Quench', 'Sift', 'Smother', 'Snuff']
const SCULPTOR_NAMES = ['Dissolve', 'Circulate', 'Digest', 'Sublime', 'Coagulate', 'Cupel']

/** The opening deck: a drainer and a sculptor for each pair of elements. */
export function startingDeck(): Card[] {
  const drainers = PAIRS.map(([a, b], i): Card => ({ id: i + 1, name: DRAINER_NAMES[i], takes: { [a]: DRAIN, [b]: DRAIN }, gives: {}, time: EIGHTH }))
  const sculptors = PAIRS.map(([a, b], i): Card => ({ id: i + 7, name: SCULPTOR_NAMES[i], takes: {}, gives: { [a]: SCULPT, [b]: SCULPT }, time: EIGHTH }))
  return [...drainers, ...sculptors]
}

// ---------------------------------------------------------------------------
// Matching the material

/**
 * How close an attack's shape is to the material's: the share of the attack
 * that overlaps the material's proportions (1 is a perfect match). Shape only,
 * so its size doesn't count here.
 */
export function matchOf(attack: Pool, target: Pool): number {
  const a = poolTotal(attack)
  const t = poolTotal(target)
  if (!a || !t) return 0
  return ELEMENTS.reduce((n, e) => n + Math.min(attack[e] / a, target[e] / t), 0)
}

/** The material's shape at the attack's size: what each band would hold if the attack matched exactly. */
export function scaledTarget(attack: Pool, target: Pool): Pool {
  const a = poolTotal(attack)
  const t = poolTotal(target)
  const out = emptyPool()
  if (!t) return out
  for (const e of ELEMENTS) out[e] = (target[e] * a) / t
  return out
}

/** Whether an attack makes the material: at least its size, and its shape close enough. */
export const finishes = (attack: Pool, target: Pool) => poolTotal(attack) >= poolTotal(target) && matchOf(attack, target) >= MATCH_TO_FINISH - 1e-9

/**
 * Smoothing: each charge moves one unit from the band furthest over the
 * material's shape (off-target noise first, since it is all excess) into the
 * band furthest under it, as long as the move improves the match. Stops when
 * the charge runs out or nothing more helps.
 */
export function smooth(attack: Pool, target: Pool, charge: number): { attack: Pool; spent: number; moved: { from: Elemental; to: Elemental }[] } {
  const out = { ...attack }
  const moved: { from: Elemental; to: Elemental }[] = []
  for (let k = 0; k < charge; k++) {
    const s = scaledTarget(out, target)
    const noise = (e: Elemental) => (target[e] === 0 ? 1 : 0)
    const over = BANDS.filter((e) => out[e] > s[e] + 1e-9 && out[e] >= 1).sort((x, y) => noise(y) - noise(x) || out[y] - s[y] - (out[x] - s[x]))
    const under = BANDS.filter((e) => out[e] < s[e] - 1e-9).sort((x, y) => s[y] - out[y] - (s[x] - out[x]))
    if (!over.length || !under.length) break
    const from = over[0]
    const to = under[0]
    const next = { ...out, [from]: out[from] - 1, [to]: out[to] + 1 }
    if (matchOf(next, target) <= matchOf(out, target) + 1e-9) break
    Object.assign(out, next)
    moved.push({ from, to })
  }
  return { attack: out, spent: moved.length, moved }
}

// ---------------------------------------------------------------------------
// Commissions

export interface Commission {
  key: string
  name: string
  blurb: string
  /** The material to make: its shape, and its size (the total), which the attack must reach. */
  target: Pool
  /** Instability fed into the pool in one bulk at each feeding phase. */
  feed: Partial<Pool>
  feedAt: Phase[]
  /** Phases at which the pool flares: what is in it costs quintessence, and stays. */
  attacks: Phase[]
}

export const MUD: Commission = {
  key: 'mud',
  name: 'Mud',
  blurb: 'Feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. Its material is 12 water to 8 earth.',
  target: { water: 12, earth: 8, air: 0, fire: 0 },
  feed: { water: 5, earth: 2 },
  feedAt: ['new', 'full'],
  attacks: ['waxing-gibbous', 'waning-crescent'],
}

export const feedOf = (c: Commission): Pool => ({ ...emptyPool(), ...c.feed })

// ---------------------------------------------------------------------------
// The fight

export interface Settings {
  stock: number
  /** How many you draw at each new and full moon. */
  hand: number
  /** What a flare does to the pool, for experiments: it stays (the rule), empties, or keeps half. */
  flare?: 'stays' | 'empties' | 'halves'
}
export const DEFAULT_SETTINGS: Settings = { stock: 40, hand: 4 }

export interface Fight {
  commission: Commission
  dial: number
  pool: Pool
  /** The attack sculpted so far, by element. */
  attack: Pool
  /** The battery. */
  charge: number
  hand: Card[]
  draw: Card[]
  discard: Card[]
  /** Newest first. */
  log: string[]
  /** Quintessence paid in this fight. */
  paid: number
  /** Flare at each attack, oldest first. */
  flares: number[]
  /** Charge spent smoothing, over the fight. */
  smoothed: number
}

export interface Game {
  settings: Settings
  seed: number
  quintessence: number
  stage: 'fight' | 'won' | 'lost'
  fight: Fight
}

export function newGame(seed = Date.now(), settings: Settings = DEFAULT_SETTINGS, commission: Commission = MUD, deck: Card[] = startingDeck()): Game {
  const rng = makeRng(seed)
  const fight: Fight = {
    commission,
    dial: 0,
    pool: emptyPool(),
    attack: emptyPool(),
    charge: 0,
    hand: [],
    draw: rng.shuffle(deck),
    discard: [],
    log: [`${commission.name}: ${commission.blurb}`],
    paid: 0,
    flares: [],
    smoothed: 0,
  }
  // The new moon that opens the fight: the first feed and the first hand.
  return phaseEvents({ settings, seed: rng.state(), quintessence: settings.stock, stage: 'fight', fight }, 0, true)
}

function drawCards(g: Game, n: number): Game {
  const rng = makeRng(g.seed)
  let { hand, draw, discard } = g.fight
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
  return { ...g, seed: rng.state(), fight: { ...g.fight, hand, draw, discard } }
}

const pairWords = (p: Partial<Pool>) => BANDS.filter((e) => p[e]).map((e) => `${p[e]} ${e}`).join(' and ') || 'nothing'

/** What happens at a phase: the pool flares, the commission feeds, you discard at the quarters and draw at the new and full moons. */
function phaseEvents(g: Game, pos: number, opening = false): Game {
  const phase = phaseAt(pos)!
  const c = g.fight.commission
  const f: Fight = { ...g.fight, pool: { ...g.fight.pool } }
  const notes: string[] = []
  let paid = 0
  if (!opening && c.attacks.includes(phase)) {
    const flare = poolTotal(f.pool)
    paid = flare
    f.flares = [...f.flares, flare]
    f.paid += flare
    // The pool stays: a flare costs what is in it, but doesn't empty it (unless an experiment says otherwise).
    if (g.settings.flare === 'empties') f.pool = emptyPool()
    if (g.settings.flare === 'halves') for (const e of ELEMENTS) f.pool[e] = Math.floor(f.pool[e] / 2)
    notes.push(flare ? `${c.name} flares: pay ${flare}` : `${c.name} flares, but the pool is empty`)
  }
  if (opening || c.feedAt.includes(phase)) {
    const feed = feedOf(c)
    for (const e of ELEMENTS) f.pool[e] += feed[e]
    notes.push(`${c.name} feeds ${pairWords(feed)}`)
  }
  if (!opening && DISCARD_PHASES.includes(phase) && f.hand.length) {
    notes.push(`you discard ${f.hand.length}`)
    f.discard = [...f.discard, ...f.hand]
    f.hand = []
  }
  let next: Game = { ...g, quintessence: Math.max(0, g.quintessence - paid), fight: f }
  if (opening || DRAW_PHASES.includes(phase)) next = drawCards(next, g.settings.hand)
  if (notes.length) next = { ...next, fight: { ...next.fight, log: [`${PHASE_NAMES[phase]}: ${notes.join('; ')}.`, ...next.fight.log] } }
  return next
}

/** Move the dial on, running every phase it reaches; the fight is lost when quintessence runs out. */
function advance(g: Game, ticks: number): Game {
  let next = g
  const from = g.fight.dial
  for (let pos = from + 1; pos <= from + ticks; pos++) {
    next = { ...next, fight: { ...next.fight, dial: pos } }
    if (phaseAt(pos)) next = phaseEvents(next, pos)
    if (next.quintessence <= 0) return { ...next, stage: 'lost' }
  }
  return next
}

/** The material is made: the fight is won. */
const check = (g: Game): Game => (g.stage === 'fight' && finishes(g.fight.attack, g.fight.commission.target) ? { ...g, stage: 'won' } : g)

/** Whether smoothing now would finish the material. */
export function smoothingFinishes(g: Game): boolean {
  const f = g.fight
  return f.charge > 0 && finishes(smooth(f.attack, f.commission.target, f.charge).attack, f.commission.target)
}

/** With no cards in hand, the moon moves on by itself to the next draw, unless smoothing now would finish. */
function settle(g: Game): Game {
  let next = g
  const stuck = (x: Game) => x.stage === 'fight' && !x.fight.hand.length && !smoothingFinishes(x)
  if (!stuck(next)) return next
  next = { ...next, fight: { ...next.fight, log: ['Nothing to play: the moon moves on.', ...next.fight.log] } }
  for (let guard = 0; guard < TICKS * 2 && stuck(next); guard++) next = advance(next, 1)
  return next
}

/** What a card would do now: what it takes from the pool (and so charges), and what it plays into the attack. */
export function resolve(f: Fight, c: Card): { took: Pool; charge: number; gives: Pool } {
  const took = emptyPool()
  for (const e of ELEMENTS) took[e] = Math.min(f.pool[e], c.takes[e] ?? 0)
  const gives = { ...emptyPool(), ...c.gives }
  return { took, charge: poolTotal(took) * CHARGE_PER_UNIT, gives }
}

/** Play a card from hand: it drains and sculpts at once, then the moon moves on by its time. */
export function playCard(g: Game, id: number): Game {
  if (g.stage !== 'fight') return g
  const c = g.fight.hand.find((x) => x.id === id)
  if (!c) throw new Error('That card is not in hand.')
  const f0 = g.fight
  const r = resolve(f0, c)
  const pool = { ...f0.pool }
  const attack = { ...f0.attack }
  for (const e of ELEMENTS) {
    pool[e] -= r.took[e]
    attack[e] += r.gives[e]
  }
  const what = [isDrainer(c) ? `takes ${pairWords(r.took)}, charge +${r.charge}` : '', isSculptor(c) ? `plays ${pairWords(r.gives)} into the attack` : ''].filter(Boolean)
  const fight: Fight = {
    ...f0,
    pool,
    attack,
    charge: f0.charge + r.charge,
    hand: f0.hand.filter((x) => x.id !== id),
    discard: [...f0.discard, c],
    log: [`${c.name}: ${what.join('; ')}.`, ...f0.log],
  }
  const played = check({ ...g, fight })
  return played.stage === 'fight' ? settle(advance(played, c.time)) : played
}

/** Spend charge to smooth the attack toward the material's shape. Takes no time. */
export function tune(g: Game): Game {
  if (g.stage !== 'fight') return g
  const f = g.fight
  const s = smooth(f.attack, f.commission.target, f.charge)
  if (!s.spent) throw new Error(f.charge ? 'Nothing to smooth: charge would not bring the attack closer.' : 'No charge to spend.')
  const before = matchOf(f.attack, f.commission.target)
  const after = matchOf(s.attack, f.commission.target)
  const fight: Fight = {
    ...f,
    attack: s.attack,
    charge: f.charge - s.spent,
    smoothed: f.smoothed + s.spent,
    log: [`Smooths with ${s.spent} charge: match ${pct(before)} → ${pct(after)}.`, ...f.log],
  }
  return settle(check({ ...g, fight }))
}

/** Let an eighth of the moon pass without playing. */
export function wait(g: Game): Game {
  if (g.stage !== 'fight') return g
  return settle(advance({ ...g, fight: { ...g.fight, log: ['Waits an eighth.', ...g.fight.log] } }, EIGHTH))
}

export const pct = (m: number) => `${Math.floor(m * 100 + 1e-9)}%`

/** What would flare now: the whole pool. */
export const threatOf = (f: Fight) => poolTotal(f.pool)

/** The next phases and what they bring, for the dial and the notes. */
export function upcoming(f: Fight, count = 4): { pos: number; phase: Phase; attack: boolean; feed: boolean; draw: boolean; discard: boolean }[] {
  const out = []
  for (let pos = f.dial + 1; out.length < count; pos++) {
    const phase = phaseAt(pos)
    if (!phase) continue
    out.push({ pos, phase, attack: f.commission.attacks.includes(phase), feed: f.commission.feedAt.includes(phase), draw: DRAW_PHASES.includes(phase), discard: DISCARD_PHASES.includes(phase) })
  }
  return out
}
