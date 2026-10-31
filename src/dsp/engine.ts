// DSP: a material is a spectrum. Each element is a band of spectral lines
// (three for most commissions, up to five for the hardest), notes in A major
// (earth the bass, water and air the mids, fire the treble), low to high. The
// commission hands you a raw spectrum and names the chord to transmute it into;
// the work is done when the spectrum is within the commission's tolerance of the
// chord (2). It also feeds instability into a pool on the moon dial, and the
// pool flares against your quintessence; a flare discharges the pool.
//
// Three kinds of card:
// - Drains take their elements out of the pool before it flares, and bank
//   what they take as charge of that element. Charge keeps through the fight.
// - Attacks are kernels: a short row of taps, each an operation on the line
//   beneath it (+3 adds 3, −1 takes 1 away, ×⅓ cuts to a third). You line a
//   kernel up on the spectrum, and every tap works on its own line. Amplitudes
//   stay whole (fractions drop) and never go below zero. A line that matches
//   the chord is locked: no tap moves it again, so progress is never lost.
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
// The spectrum: a band of lines per element, the same number in every band

/** The root every line is a harmonic of: A1. */
export const ROOT_HZ = 55
/**
 * With three lines a band, each line is a harmonic of the root: earth 110, 165
 * and 220 Hz; water 275, 330 and 440; air 550, 660 and 825; fire 1320, 1650
 * and 1980. Together they spell one A major sonority.
 */
export const NOTE_HARMONICS: Record<Elemental, number[]> = { earth: [2, 3, 4], water: [5, 6, 8], air: [10, 12, 15], fire: [24, 30, 36] }
/** Each band's reach, lowest note to highest. */
const BAND_RANGE: Record<Elemental, [number, number]> = { earth: [110, 220], water: [275, 440], air: [550, 825], fire: [1320, 1980] }
/** The A major scale in just intonation. */
const SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8]
/** The most lines a band can hold: air and fire reach only five notes of the scale. */
export const MOST_PER_BAND = 5
/**
 * The notes of a band of `per` lines, in Hz, low to high. Three lines are the
 * harmonics above; four and five are spread evenly over the band's notes of
 * the A major scale, keeping its lowest and highest.
 */
export function bandNotes(e: Elemental, per: number): number[] {
  if (per === 3) return NOTE_HARMONICS[e].map((h) => h * ROOT_HZ)
  const [lo, hi] = BAND_RANGE[e]
  const notes: number[] = []
  for (let a = ROOT_HZ; a <= hi; a *= 2) for (const r of SCALE) if (a * r >= lo - 0.5 && a * r <= hi + 0.5) notes.push(a * r)
  notes.sort((x, y) => x - y)
  if (per <= 1) return [notes[0]]
  return Array.from({ length: per }, (_, i) => notes[Math.round((i * (notes.length - 1)) / (per - 1))])
}
const LINE_NAMES: Record<number, string[]> = {
  3: ['low', 'middle', 'high'],
  4: ['low', 'low middle', 'high middle', 'high'],
  5: ['lowest', 'low', 'middle', 'high', 'highest'],
}
/** A spectrum: each element's line amplitudes, low to high. */
export type Spectrum = Record<Elemental, number[]>
export const emptySpectrum = (per = 3): Spectrum => ({ water: Array(per).fill(0), earth: Array(per).fill(0), air: Array(per).fill(0), fire: Array(per).fill(0) })
export const copySpectrum = (s: Spectrum): Spectrum => ({ water: s.water.slice(), earth: s.earth.slice(), air: s.air.slice(), fire: s.fire.slice() })
/** Lines in each band, and in the whole spectrum. */
export const perBand = (s: Spectrum) => s.earth.length
export const linesOf = (s: Spectrum) => BANDS.length * perBand(s)
export const spectrumTotal = (s: Spectrum) => ELEMENTS.reduce((n, e) => n + s[e].reduce((a, b) => a + b, 0), 0)
/** How far a spectrum is from a chord: every line's gap, added up. */
export const distanceOf = (s: Spectrum, chord: Spectrum) => ELEMENTS.reduce((n, e) => n + chord[e].reduce((m, t, i) => m + Math.abs((s[e][i] ?? 0) - t), 0), 0)
/** A line that matches the chord is locked: no tap moves it. */
export const isLocked = (s: Spectrum, chord: Spectrum, e: Elemental, i: number) => s[e][i] === chord[e][i]
/** Line k, low to high, in a spectrum of `per` lines a band: its element and which of the element's lines. */
export const lineAt = (k: number, per = 3): { element: Elemental; i: number } => ({ element: BANDS[Math.floor(k / per)], i: k % per })
export const lineName = (k: number, per = 3) => {
  const { element, i } = lineAt(k, per)
  return `${element} ${LINE_NAMES[per]?.[i] ?? i + 1}`
}

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

/** The opening deck: a drain for each pair of elements, six attacks, and a power. */
export function startingDeck(): Card[] {
  const drain = (id: number, name: string, elements: Elemental[]): DrainCard => ({ id, name, kind: 'drain', elements, time: EIGHTH })
  const attack = (id: number, name: string, kernel: Tap[], anchor: number): AttackCard => ({ id, name, kind: 'attack', kernel, anchor, time: EIGHTH })
  return [
    drain(1, 'Decant', ['water', 'earth']),
    drain(2, 'Evaporate', ['water', 'air']),
    drain(3, 'Quench', ['water', 'fire']),
    drain(4, 'Sift', ['earth', 'air']),
    drain(5, 'Smother', ['earth', 'fire']),
    drain(6, 'Snuff', ['air', 'fire']),
    attack(7, 'Sharpen', [add(-1), add(3), add(-1)], 1),
    attack(8, 'Sharpen', [add(-1), add(3), add(-1)], 1),
    attack(9, 'Lift', [add(2), add(2)], 0),
    attack(10, 'Lift', [add(2), add(2)], 0),
    attack(11, 'Cut', [add(-2), add(-2)], 0),
    attack(12, 'Damp', [times(1 / 3), times(1 / 3), times(1 / 3)], 1),
    { id: 13, name: 'Resonance of water', kind: 'power', element: 'water', effect: 'resonance', time: EIGHTH },
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
  /** How hard it is, in a word. */
  rank: string
  /** What the material is like, in a line. */
  blurb: string
  /** The raw material: the spectrum you start from. Every band holds as many lines as the chord's. */
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

const S = (earth: number[], water: number[], air: number[], fire: number[]): Spectrum => ({ earth, water, air, fire })
const HALVES: Phase[] = ['new', 'full']

export const BRINE: Commission = {
  key: 'brine',
  name: 'Brine',
  rank: 'Easy',
  blurb: 'Sea water and a little salt: a broad, low water and a grain of earth.',
  start: S([3, 3, 0], [3, 3, 2], [2, 2, 1], [0, 0, 0]),
  chord: S([1, 1, 0], [5, 5, 2], [0, 0, 0], [0, 0, 0]),
  tolerance: 2,
  feed: { water: 4 },
  feedAt: HALVES,
  attacks: ['waxing-gibbous', 'waning-crescent'],
}

export const MUD: Commission = {
  key: 'mud',
  name: 'Mud',
  rank: 'Fair',
  blurb: 'Earth leaning on its lowest line, water on its middle one. The raw stuff is too bright, and hisses.',
  start: S([2, 3, 3], [5, 2, 2], [2, 2, 0], [0, 1, 2]),
  chord: S([5, 2, 1], [3, 6, 3], [0, 0, 0], [0, 0, 0]),
  tolerance: 2,
  feed: { water: 5, earth: 2 },
  feedAt: HALVES,
  attacks: ['waxing-gibbous', 'waning-crescent'],
}

export const FOG: Commission = {
  key: 'fog',
  name: 'Fog',
  rank: 'Testing',
  blurb: 'Water hung in air, four lines to an element: air must swell where earth and fire fall silent.',
  start: S([3, 1, 1, 0], [5, 2, 1, 0], [1, 1, 2, 0], [1, 0, 2, 1]),
  chord: S([0, 0, 0, 0], [2, 4, 3, 1], [3, 5, 4, 2], [0, 0, 0, 0]),
  tolerance: 2,
  feed: { water: 4, air: 3 },
  feedAt: HALVES,
  attacks: ['waxing-gibbous', 'waning-crescent'],
}

export const GLASS: Commission = {
  key: 'glass',
  name: 'Glass',
  rank: 'Hard',
  blurb: 'Sand through fire, four lines to an element: earth peaks low, fire peaks high, and the water must go.',
  start: S([5, 3, 3, 4], [2, 3, 1, 0], [2, 1, 3, 1], [0, 1, 1, 0]),
  chord: S([3, 6, 4, 1], [0, 0, 0, 0], [0, 0, 1, 0], [2, 4, 6, 3]),
  tolerance: 2,
  feed: { fire: 5, earth: 3 },
  feedAt: HALVES,
  attacks: ['waxing-gibbous', 'waning-crescent'],
}

export const QUICKSILVER: Commission = {
  key: 'quicksilver',
  name: 'Quicksilver',
  rank: 'Brutal',
  blurb: 'Cold water with a fire in it, five lines to an element: water peaks in the middle, fire high, and earth must go.',
  start: S([2, 3, 1, 2, 1], [4, 1, 2, 1, 3], [3, 0, 1, 4, 1], [3, 2, 0, 1, 0]),
  chord: S([0, 0, 0, 0, 0], [1, 3, 6, 3, 1], [0, 2, 3, 2, 0], [0, 1, 2, 4, 2]),
  tolerance: 2,
  feed: { water: 4, fire: 3, air: 1 },
  feedAt: HALVES,
  attacks: ['waxing-gibbous', 'waning-crescent'],
}

export const STONE: Commission = {
  key: 'stone',
  name: 'The Stone',
  rank: 'Virtually impossible',
  blurb: 'Every element in perfect balance, five lines each, from a spectrum that is nothing like it. It flares an eighth after every feed, before you can drain much.',
  start: S([5, 1, 2, 6, 0], [0, 6, 1, 0, 4], [4, 0, 7, 1, 3], [2, 5, 0, 4, 6]),
  chord: S([1, 3, 5, 3, 1], [1, 3, 5, 3, 1], [1, 3, 5, 3, 1], [1, 3, 5, 3, 1]),
  tolerance: 2,
  feed: { earth: 1, water: 1, air: 1, fire: 1 },
  feedAt: HALVES,
  attacks: ['waxing-crescent', 'waning-gibbous'],
}

/** The commissions, easiest first. */
export const COMMISSIONS: Commission[] = [BRINE, MUD, FOG, GLASS, QUICKSILVER, STONE]

const PHASE_AT: Record<Phase, string> = {
  new: 'the new moon',
  'waxing-crescent': '1/8',
  first: 'the first quarter',
  'waxing-gibbous': '3/8',
  full: 'the full moon',
  'waning-gibbous': '5/8',
  last: 'the last quarter',
  'waning-crescent': '7/8',
}
const listed = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five']

/** A commission's terms in words: feed, flares, lines and distance. */
export function termsOf(c: Commission): string {
  const feed = BANDS.filter((e) => c.feed[e])
    .sort((x, y) => (c.feed[y] ?? 0) - (c.feed[x] ?? 0))
    .map((e) => `${c.feed[e]} ${e}`)
  const when = c.feedAt.length === 4 ? 'every quarter of the moon' : c.feedAt.length === 2 && c.feedAt.includes('new') && c.feedAt.includes('full') ? 'every new and full moon' : listed(c.feedAt.map((p) => PHASE_AT[p]))
  return `Feeds ${listed(feed)} at ${when}, and flares at ${listed(c.attacks.map((p) => PHASE_AT[p]))} of the moon. ${NUMBER_WORDS[perBand(c.chord)] ?? perBand(c.chord)} lines to an element; the raw spectrum is ${distanceOf(c.start, c.chord)} from the chord: bring it within ${c.tolerance}.`.replace(/^(.)/, (m) => m.toUpperCase()).replace(/\. (.)/g, (_m, x) => `. ${x.toUpperCase()}`)
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
    log: [`${commission.name}: ${termsOf(commission)}`],
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
export const footprint = (c: AttackCard, line: number, lines = 12): (number | null)[] =>
  c.kernel.map((_, j) => {
    const k = line - c.anchor + j
    return k >= 0 && k < lines ? k : null
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
    const per = perBand(f.spectrum)
    footprint(c, line, linesOf(f.spectrum)).forEach((k, j) => {
      if (k === null) return
      const { element, i } = lineAt(k, per)
      const from = spectrum[element][i]
      // A line that matches the chord is locked: nothing moves it again.
      if (from === f.commission.chord[element][i]) return
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
  for (let k = 0; k < linesOf(f.spectrum); k++) {
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
        : `${r.kernel.map(tapWords).join(' ')} on ${lineName(at, perBand(f0.spectrum))}${r.boosted.length ? ` (strengthened by ${r.boosted.map((p) => p.name).join(' and ')})` : ''}: ${r.moves.length ? `${d1 ? `${d1} from the chord, from ${d0}` : 'the spectrum matches the chord'}` : 'nothing moves'}`
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
