// DSP: a material is a spectrum. Each element is a band of three spectral
// lines, harmonics of one root (earth the bass, water and air the mids, fire
// the treble), twelve lines in all, low to high. The commission hands you a raw
// spectrum and names the chord to transmute it into; the work is done when the
// spectrum is within the commission's tolerance of the chord (Mud: 2). It also
// feeds instability into a pool on
// the moon dial, and the pool flares against your quintessence; a flare
// discharges the pool.
//
// Three kinds of card:
// - Drains take their elements out of the pool before it flares, and bank
//   what they take as charge of that element. Charge keeps through the fight.
// - Attacks are kernels: a short row of taps, each an operation on the line
//   beneath it (+3 adds 3, −1 takes 1 away, ×⅓ cuts to a third). You line a
//   kernel up on the spectrum, and every tap works on its own line. Amplitudes
//   stay whole (fractions drop) and never go below zero.
// - Powers stay in play once played, and draw on their element's charge; with
//   none left a power goes quiet until charge returns. Resonance makes every
//   attack one step stronger, for one charge of its element an attack.
// See DSP.md.

import { makeRng } from '../sim/rng'
import type { Elemental } from '../sim/types'
import { DISCARD_PHASES, DRAW_PHASES, ELEMENTS, PHASE_NAMES, TICKS, emptyPool, phaseAt, poolTotal, type Phase, type Pool } from '../circuits/engine'

export { ELEMENTS, PHASE_NAMES, TICKS, emptyPool, phaseAt, poolTotal, type Phase, type Pool }

/** The elements low to high, as bands of sound: earth the bass, water and air the mids, fire the treble. */
export const BANDS: Elemental[] = ['earth', 'water', 'air', 'fire']

/** An eighth of the moon, the time every card takes. */
export const EIGHTH = 2
/** What a drain takes of each of its elements. */
export const DRAIN = 3

// ---------------------------------------------------------------------------
// The spectrum: twelve lines, three per element

/** The root every line is a harmonic of: A1. */
export const ROOT_HZ = 55
/**
 * Each band's three lines, low to high, as harmonics of the root: earth 110,
 * 165 and 220 Hz; water 275, 330 and 440; air 550, 660 and 825; fire 1320,
 * 1650 and 1980. Together they spell one A major sonority.
 */
export const NOTE_HARMONICS: Record<Elemental, number[]> = { earth: [2, 3, 4], water: [5, 6, 8], air: [10, 12, 15], fire: [24, 30, 36] }
export const LINE_NAMES = ['low', 'middle', 'high']
export const LINES = 12
/** A spectrum: each element's three line amplitudes, low to high. */
export type Spectrum = Record<Elemental, number[]>
export const emptySpectrum = (): Spectrum => ({ water: [0, 0, 0], earth: [0, 0, 0], air: [0, 0, 0], fire: [0, 0, 0] })
export const copySpectrum = (s: Spectrum): Spectrum => ({ water: s.water.slice(), earth: s.earth.slice(), air: s.air.slice(), fire: s.fire.slice() })
export const spectrumTotal = (s: Spectrum) => ELEMENTS.reduce((n, e) => n + s[e][0] + s[e][1] + s[e][2], 0)
/** How far a spectrum is from a chord: every line's gap, added up. */
export const distanceOf = (s: Spectrum, chord: Spectrum) => ELEMENTS.reduce((n, e) => n + [0, 1, 2].reduce((m, i) => m + Math.abs(s[e][i] - chord[e][i]), 0), 0)
/** Line k of twelve, low to high: its element and which of the element's three lines. */
export const lineAt = (k: number): { element: Elemental; i: number } => ({ element: BANDS[Math.floor(k / 3)], i: k % 3 })
export const lineName = (k: number) => `${lineAt(k).element} ${LINE_NAMES[lineAt(k).i]}`

// ---------------------------------------------------------------------------
// Cards

/** One tap of a kernel: add (or take away) a number, or multiply. */
export type Tap = { op: 'add'; v: number } | { op: 'times'; v: number }

export interface DrainCard {
  id: number
  name: string
  kind: 'drain'
  elements: Elemental[]
  time: number
}
export interface AttackCard {
  id: number
  name: string
  kind: 'attack'
  kernel: Tap[]
  /** The tap you line up on the line you pick. */
  anchor: number
  time: number
}
export interface PowerCard {
  id: number
  name: string
  kind: 'power'
  /** The element whose charge it draws on. */
  element: Elemental
  /** What it does while it has charge: Resonance makes every attack one step stronger. */
  effect: 'resonance'
  time: number
}
export type Card = DrainCard | AttackCard | PowerCard

const add = (v: number): Tap => ({ op: 'add', v })
const times = (v: number): Tap => ({ op: 'times', v })

/** The opening deck: five drains, six attacks, and a power. */
export function startingDeck(): Card[] {
  const drain = (id: number, name: string, elements: Elemental[]): DrainCard => ({ id, name, kind: 'drain', elements, time: EIGHTH })
  const attack = (id: number, name: string, kernel: Tap[], anchor: number): AttackCard => ({ id, name, kind: 'attack', kernel, anchor, time: EIGHTH })
  return [
    drain(1, 'Decant', ['water', 'earth']),
    drain(2, 'Evaporate', ['water']),
    drain(3, 'Quench', ['water']),
    drain(4, 'Sift', ['earth']),
    drain(5, 'Smother', ['earth']),
    attack(6, 'Sharpen', [add(-1), add(3), add(-1)], 1),
    attack(7, 'Sharpen', [add(-1), add(3), add(-1)], 1),
    attack(8, 'Lift', [add(2), add(2)], 0),
    attack(9, 'Lift', [add(2), add(2)], 0),
    attack(10, 'Cut', [add(-2), add(-2)], 0),
    attack(11, 'Damp', [times(1 / 3), times(1 / 3), times(1 / 3)], 1),
    { id: 12, name: 'Resonance of water', kind: 'power', element: 'water', effect: 'resonance', time: EIGHTH },
  ]
}

/** A tap one step stronger: adds and takes away 1 more, a cut cuts deeper (×⅓ to ×¼). */
export const boostTap = (t: Tap): Tap => (t.op === 'add' ? add(t.v > 0 ? t.v + 1 : t.v - 1) : times(t.v < 1 ? t.v / (1 + t.v) : t.v + 1))
const third = (v: number) => (Math.abs(v - 1 / 3) < 1e-9 ? '⅓' : Math.abs(v - 1 / 4) < 1e-9 ? '¼' : Math.abs(v - 1 / 2) < 1e-9 ? '½' : String(Math.round(v * 100) / 100))
export const tapWords = (t: Tap) => (t.op === 'add' ? (t.v > 0 ? `+${t.v}` : `−${-t.v}`) : `×${third(t.v)}`)

// ---------------------------------------------------------------------------
// Commissions

export interface Commission {
  key: string
  name: string
  blurb: string
  /** The raw material: the spectrum you start from. */
  start: Spectrum
  /** The material to make: the chord the spectrum must match. */
  chord: Spectrum
  /** How close counts as a match: the distance at or under which the work is done (0 is exact). */
  tolerance: number
  /** Instability fed into the pool in one bulk at each feeding phase. */
  feed: Partial<Pool>
  feedAt: Phase[]
  /** Phases at which the pool flares: what is in it costs quintessence, and the pool empties. */
  attacks: Phase[]
}

export const MUD: Commission = {
  key: 'mud',
  name: 'Mud',
  blurb: 'Feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. Its raw spectrum is 20 from the chord of mud; bring it within 2.',
  // Earth too bright, water too low in the middle, and a hiss of air and fire.
  start: { earth: [2, 3, 3], water: [5, 2, 2], air: [2, 2, 0], fire: [0, 1, 2] },
  // Earth leaning on its lowest line, water on its middle one.
  chord: { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 0, 0] },
  tolerance: 2,
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
  /** How close counts as a match, for experiments; the commission's tolerance when not given. */
  tolerance?: number
  /** What a flare does to the pool: it empties (the rule), or, for experiments, stays or keeps half. */
  flare?: 'stays' | 'empties' | 'halves'
}
export const DEFAULT_SETTINGS: Settings = { stock: 40, hand: 4 }

export interface Fight {
  commission: Commission
  dial: number
  pool: Pool
  /** The material's spectrum as it stands. */
  spectrum: Spectrum
  /** Charge, by element: drains bank it, powers draw on it. */
  charge: Pool
  /** Powers in play. */
  powers: PowerCard[]
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

export interface Game {
  settings: Settings
  seed: number
  quintessence: number
  stage: 'fight' | 'won' | 'lost'
  fight: Fight
}

/** How far the spectrum is from the chord. */
export const distance = (f: Fight) => distanceOf(f.spectrum, f.commission.chord)

export function newGame(seed = Date.now(), settings: Settings = DEFAULT_SETTINGS, commission: Commission = MUD, deck: Card[] = startingDeck()): Game {
  const rng = makeRng(seed)
  const fight: Fight = {
    commission,
    dial: 0,
    pool: emptyPool(),
    spectrum: copySpectrum(commission.start),
    charge: emptyPool(),
    powers: [],
    hand: [],
    draw: rng.shuffle(deck),
    discard: [],
    log: [`${commission.name}: ${commission.blurb}`],
    paid: 0,
    flares: [],
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

const poolWords = (p: Partial<Pool>) => BANDS.filter((e) => p[e]).map((e) => `${p[e]} ${e}`).join(' and ') || 'nothing'

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
    f.paid += paid
    // A flare discharges the pool: it costs what is in it, and the pool empties (experiments can keep it, or half).
    const rule = g.settings.flare ?? 'empties'
    if (rule === 'empties') f.pool = emptyPool()
    if (rule === 'halves') for (const e of ELEMENTS) f.pool[e] = Math.floor(f.pool[e] / 2)
    notes.push(flare ? `${c.name} flares: pay ${flare}` : `${c.name} flares, but the pool is empty`)
  }
  if (opening || c.feedAt.includes(phase)) {
    const feed = feedOf(c)
    for (const e of ELEMENTS) f.pool[e] += feed[e]
    notes.push(`${c.name} feeds ${poolWords(feed)}`)
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

/** Matched: the spectrum is within the commission's tolerance of the chord (or an experiment's). */
export const matched = (f: Fight, tolerance = f.commission.tolerance) => distance(f) <= tolerance
const check = (g: Game): Game => (g.stage === 'fight' && matched(g.fight, g.settings.tolerance ?? g.fight.commission.tolerance) ? { ...g, stage: 'won' } : g)

/** With no cards in hand, the moon moves on by itself to the next draw. */
function settle(g: Game): Game {
  let next = g
  const stuck = (x: Game) => x.stage === 'fight' && !x.fight.hand.length
  if (!stuck(next)) return next
  next = { ...next, fight: { ...next.fight, log: ['Nothing to play: the moon moves on.', ...next.fight.log] } }
  for (let guard = 0; guard < TICKS * 2 && stuck(next); guard++) next = advance(next, 1)
  return next
}

/** A line an attack moves. */
export interface LineMove {
  line: number
  from: number
  to: number
}

/** What a card would do now (an attack, lined up on a line). */
export interface Effect {
  /** Taken from the pool by a drain, by element. */
  took: Pool
  /** Charge by element: banked by a drain (positive), spent by powers (negative). */
  charge: Pool
  /** The kernel as it lands, after any power has strengthened it. */
  kernel: Tap[]
  /** Powers that strengthened it. */
  boosted: PowerCard[]
  /** The lines it moves, and the spectrum after. */
  moves: LineMove[]
  spectrum: Spectrum
}

/** The lines a kernel covers when lined up on a line: the lines under each tap, off the ends included as null. */
export const footprint = (c: AttackCard, line: number): (number | null)[] => c.kernel.map((_, j) => {
  const k = line - c.anchor + j
  return k >= 0 && k < LINES ? k : null
})

/** Powers that would work now: in play, with charge of their element left. */
export const livePowers = (f: Fight) => f.powers.filter((p) => f.charge[p.element] > 0)

/**
 * What a card does now. A drain takes up to 3 of each of its elements from
 * the pool and banks it as that element's charge. An attack, lined up so its
 * anchor tap sits on the line given, works every tap on its own line; each
 * live Resonance makes every tap one step stronger, for one charge of its
 * element. A power does nothing at once: it goes into play.
 */
export function resolve(f: Fight, c: Card, line = 0): Effect {
  const took = emptyPool()
  const charge = emptyPool()
  const spectrum = copySpectrum(f.spectrum)
  const moves: LineMove[] = []
  let kernel: Tap[] = []
  let boosted: PowerCard[] = []
  if (c.kind === 'drain') {
    for (const e of c.elements) {
      took[e] = Math.min(f.pool[e], DRAIN)
      charge[e] += took[e]
    }
  } else if (c.kind === 'attack') {
    boosted = livePowers(f).filter((p) => p.effect === 'resonance')
    kernel = boosted.reduce((k) => k.map(boostTap), c.kernel)
    for (const p of boosted) charge[p.element] -= 1
    footprint(c, line).forEach((k, j) => {
      if (k === null) return
      const { element, i } = lineAt(k)
      const from = spectrum[element][i]
      const t = kernel[j]
      const to = Math.max(0, Math.floor((t.op === 'add' ? from + t.v : from * t.v) + 1e-9))
      spectrum[element][i] = to
      if (to !== from) moves.push({ line: k, from, to })
    })
  }
  return { took, charge, kernel, boosted, moves, spectrum }
}

/** Where an attack would close the spectrum on the chord most, and by how much (ties go to the lowest line). */
export function bestLine(f: Fight, c: AttackCard): { line: number; closed: number } {
  const d0 = distance(f)
  let best = { line: c.anchor, closed: -Infinity }
  for (let k = 0; k < LINES; k++) {
    const closed = d0 - distanceOf(resolve(f, c, k).spectrum, f.commission.chord)
    if (closed > best.closed) best = { line: k, closed }
  }
  return best
}

/** Play a card (an attack lined up on a line): it acts at once, then the moon moves on by its time. */
export function playCard(g: Game, id: number, line?: number): Game {
  if (g.stage !== 'fight') return g
  const c = g.fight.hand.find((x) => x.id === id)
  if (!c) throw new Error('That card is not in hand.')
  const f0 = g.fight
  const at = c.kind === 'attack' ? (line ?? bestLine(f0, c).line) : 0
  const r = resolve(f0, c, at)
  const pool = { ...f0.pool }
  const charge = { ...f0.charge }
  for (const e of ELEMENTS) {
    pool[e] -= r.took[e]
    charge[e] += r.charge[e]
  }
  const d0 = distance(f0)
  const next: Fight = { ...f0, pool, charge, spectrum: r.spectrum }
  const d1 = distance(next)
  const what =
    c.kind === 'drain'
      ? `takes ${poolWords(r.took)} from the pool, banked as charge`
      : c.kind === 'power'
        ? `${c.name} comes into play`
        : `${r.kernel.map(tapWords).join(' ')} on ${lineName(at)}${r.boosted.length ? ` (strengthened by ${r.boosted.map((p) => p.name).join(' and ')})` : ''}: ${r.moves.length ? `${d1 ? `${d1} from the chord, from ${d0}` : 'the spectrum matches the chord'}` : 'nothing moves'}`
  const fight: Fight = {
    ...next,
    hand: f0.hand.filter((x) => x.id !== id),
    discard: c.kind === 'power' ? f0.discard : [...f0.discard, c],
    powers: c.kind === 'power' ? [...f0.powers, c] : f0.powers,
    log: [`${c.name}: ${what}.`, ...f0.log],
  }
  const played = check({ ...g, fight })
  return played.stage === 'fight' ? settle(advance(played, c.time)) : played
}

/** Let an eighth of the moon pass without playing. */
export function wait(g: Game): Game {
  if (g.stage !== 'fight') return g
  return settle(advance({ ...g, fight: { ...g.fight, log: ['Waits an eighth.', ...g.fight.log] } }, EIGHTH))
}

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
