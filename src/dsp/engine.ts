// DSP: a material is a spectrum. Each element is a band of three spectral
// lines, harmonics of one root (earth the bass, water and air the mids, fire
// the treble); the commission hands you a raw spectrum and names the chord to
// transmute it into. It also feeds instability into a pool on the moon dial,
// and the pool flares against your quintessence; a flare discharges the pool.
//
// Two kinds of card, each played one of two ways:
// - Attenuate: on instability, take its elements out of the pool, and charge
//   rises by what it took; on the spectrum, lower the line in each of its
//   bands that stands furthest over the chord.
// - Amplify: on instability, add its elements to the pool, and charge rises
//   by the same (risky: it all flares); on the spectrum, raise the line in
//   each of its bands that stands furthest under the chord.
//
// Charge is the goal: you seal the transmutation once charge reaches the seal
// base plus the distance, every line's gap from the chord added up. So both
// ways of playing make progress: charging raises charge, tuning lowers what
// it must reach. See DSP.md.

import { makeRng } from '../sim/rng'
import type { Elemental } from '../sim/types'
import { DISCARD_PHASES, DRAW_PHASES, ELEMENTS, PHASE_NAMES, TICKS, emptyPool, phaseAt, poolTotal, type Phase, type Pool } from '../circuits/engine'

export { ELEMENTS, PHASE_NAMES, TICKS, emptyPool, phaseAt, poolTotal, type Phase, type Pool }

/** The elements low to high, as bands of sound: earth the bass, water and air the mids, fire the treble. */
export const BANDS: Elemental[] = ['earth', 'water', 'air', 'fire']

/** An eighth of the moon, the time every card takes. */
export const EIGHTH = 2
/** What a card moves of each of its elements, in either mode. */
export const POWER = 3
/** The charge a perfectly tuned spectrum needs to seal; every unit of distance adds one. */
export const SEAL_BASE = 10

// ---------------------------------------------------------------------------
// The spectrum: three lines per element

/** The root every line is a harmonic of: A1. */
export const ROOT_HZ = 55
/**
 * Each band's three lines, low to high, as harmonics of the root: earth 110,
 * 165 and 220 Hz; water 275, 330 and 440; air 550, 660 and 825; fire 1320,
 * 1650 and 1980. Together they spell one A major sonority.
 */
export const NOTE_HARMONICS: Record<Elemental, number[]> = { earth: [2, 3, 4], water: [5, 6, 8], air: [10, 12, 15], fire: [24, 30, 36] }
export const LINE_NAMES = ['low', 'middle', 'high']
/** A spectrum: each element's three line amplitudes, low to high. */
export type Spectrum = Record<Elemental, number[]>
export const emptySpectrum = (): Spectrum => ({ water: [0, 0, 0], earth: [0, 0, 0], air: [0, 0, 0], fire: [0, 0, 0] })
export const copySpectrum = (s: Spectrum): Spectrum => ({ water: s.water.slice(), earth: s.earth.slice(), air: s.air.slice(), fire: s.fire.slice() })
export const spectrumTotal = (s: Spectrum) => ELEMENTS.reduce((n, e) => n + s[e][0] + s[e][1] + s[e][2], 0)
/** How far a spectrum is from a chord: every line's gap, added up. */
export const distanceOf = (s: Spectrum, chord: Spectrum) => ELEMENTS.reduce((n, e) => n + [0, 1, 2].reduce((m, i) => m + Math.abs(s[e][i] - chord[e][i]), 0), 0)

// ---------------------------------------------------------------------------
// Cards

export type Kind = 'attenuate' | 'amplify'
export type Mode = 'instability' | 'spectrum'

export interface Card {
  id: number
  name: string
  kind: Kind
  /** Its elements: the pool's elements it works on, and the bands of the spectrum it works in. */
  elements: Elemental[]
  /** What it moves of each element. */
  power: number
  /** Time on the dial, in ticks. */
  time: number
}

type Pair = [Elemental, Elemental]
const PAIRS: Pair[] = [
  ['water', 'earth'],
  ['water', 'air'],
  ['water', 'fire'],
  ['earth', 'air'],
  ['earth', 'fire'],
  ['air', 'fire'],
]
const ATTENUATE_NAMES = ['Decant', 'Evaporate', 'Quench', 'Sift', 'Smother', 'Snuff']
const AMPLIFY_NAMES = ['Dissolve', 'Circulate', 'Digest', 'Sublime', 'Coagulate', 'Cupel']

/** The opening deck: an Attenuate and an Amplify for each pair of elements. */
export function startingDeck(): Card[] {
  const att = PAIRS.map((pair, i): Card => ({ id: i + 1, name: ATTENUATE_NAMES[i], kind: 'attenuate', elements: pair, power: POWER, time: EIGHTH }))
  const amp = PAIRS.map((pair, i): Card => ({ id: i + 7, name: AMPLIFY_NAMES[i], kind: 'amplify', elements: pair, power: POWER, time: EIGHTH }))
  return [...att, ...amp]
}

// ---------------------------------------------------------------------------
// Commissions

export interface Commission {
  key: string
  name: string
  blurb: string
  /** The raw material: the spectrum you start from. */
  start: Spectrum
  /** The material to make: the chord the spectrum must be tuned toward. */
  chord: Spectrum
  /** The charge a perfectly tuned spectrum needs to seal. */
  base: number
  /** Instability fed into the pool in one bulk at each feeding phase. */
  feed: Partial<Pool>
  feedAt: Phase[]
  /** Phases at which the pool flares: what is in it costs quintessence, and the pool empties. */
  attacks: Phase[]
}

export const MUD: Commission = {
  key: 'mud',
  name: 'Mud',
  blurb: 'Feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. Its raw spectrum is 20 from the chord of mud.',
  // Earth too bright, water too low in the middle, and a hiss of air and fire.
  start: { earth: [2, 3, 3], water: [5, 2, 2], air: [2, 2, 0], fire: [0, 1, 2] },
  // Earth leaning on its lowest line, water on its middle one.
  chord: { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 0, 0] },
  base: SEAL_BASE,
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
  /** Charge gathered toward the seal. */
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
/** The charge the seal needs now: the base, plus the distance. */
export const needOf = (f: Fight) => f.commission.base + distance(f)

export function newGame(seed = Date.now(), settings: Settings = DEFAULT_SETTINGS, commission: Commission = MUD, deck: Card[] = startingDeck()): Game {
  const rng = makeRng(seed)
  const fight: Fight = {
    commission,
    dial: 0,
    pool: emptyPool(),
    spectrum: copySpectrum(commission.start),
    charge: 0,
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
    // A flare discharges the pool: it costs what is in it, and empties it (experiments can keep it, or half).
    const rule = g.settings.flare ?? 'empties'
    if (rule === 'empties') f.pool = emptyPool()
    if (rule === 'halves') for (const e of ELEMENTS) f.pool[e] = Math.floor(f.pool[e] / 2)
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

/** Sealed: charge has reached what the seal needs. */
export const sealed = (f: Fight) => f.charge >= needOf(f)
const check = (g: Game): Game => (g.stage === 'fight' && sealed(g.fight) ? { ...g, stage: 'won' } : g)

/** With no cards in hand, the moon moves on by itself to the next draw. */
function settle(g: Game): Game {
  let next = g
  const stuck = (x: Game) => x.stage === 'fight' && !x.fight.hand.length
  if (!stuck(next)) return next
  next = { ...next, fight: { ...next.fight, log: ['Nothing to play: the moon moves on.', ...next.fight.log] } }
  for (let guard = 0; guard < TICKS * 2 && stuck(next); guard++) next = advance(next, 1)
  return next
}

/** A line a spectrum play moves: which, and by how much (down is negative). */
export interface LineMove {
  element: Elemental
  line: number
  from: number
  to: number
}

/** What a card would do, played one way, now. */
export interface Effect {
  /** Taken from the pool (Attenuate on instability) or added to it (Amplify on instability), by element. */
  took: Pool
  added: Pool
  /** Charge it raises. */
  charge: number
  /** The lines it moves (spectrum plays). */
  moves: LineMove[]
  /** The spectrum after. */
  spectrum: Spectrum
}

/**
 * What a card does played one way. On instability, Attenuate takes up to its
 * power of each of its elements from the pool and Amplify adds its power of
 * each; either way charge rises by the amount moved. On the spectrum, each of
 * its bands has its line furthest from the chord in the card's direction moved
 * toward the chord by up to its power, stopping at the chord.
 */
export function resolve(f: Fight, c: Card, mode: Mode): Effect {
  const took = emptyPool()
  const added = emptyPool()
  const spectrum = copySpectrum(f.spectrum)
  const moves: LineMove[] = []
  let charge = 0
  if (mode === 'instability') {
    for (const e of c.elements) {
      if (c.kind === 'attenuate') {
        took[e] = Math.min(f.pool[e], c.power)
        charge += took[e]
      } else {
        added[e] = c.power
        charge += c.power
      }
    }
  } else {
    const chord = f.commission.chord
    for (const e of c.elements) {
      const gap = (i: number) => (c.kind === 'attenuate' ? spectrum[e][i] - chord[e][i] : chord[e][i] - spectrum[e][i])
      const i = [0, 1, 2].reduce((a, b) => (gap(b) > gap(a) ? b : a))
      if (gap(i) <= 0) continue
      const by = Math.min(c.power, gap(i))
      const from = spectrum[e][i]
      spectrum[e][i] += c.kind === 'attenuate' ? -by : by
      moves.push({ element: e, line: i, from, to: spectrum[e][i] })
    }
  }
  return { took, added, charge, moves, spectrum }
}

/** Play a card one way: it acts at once, then the moon moves on by its time. */
export function playCard(g: Game, id: number, mode: Mode): Game {
  if (g.stage !== 'fight') return g
  const c = g.fight.hand.find((x) => x.id === id)
  if (!c) throw new Error('That card is not in hand.')
  const f0 = g.fight
  const r = resolve(f0, c, mode)
  const pool = { ...f0.pool }
  for (const e of ELEMENTS) pool[e] += r.added[e] - r.took[e]
  const need0 = needOf(f0)
  const fight0: Fight = { ...f0, pool, spectrum: r.spectrum, charge: f0.charge + r.charge }
  const need1 = needOf(fight0)
  const what =
    mode === 'instability'
      ? c.kind === 'attenuate'
        ? `takes ${pairWords(r.took)} from the pool, charge +${r.charge}`
        : `adds ${pairWords(r.added)} to the pool, charge +${r.charge}`
      : r.moves.length
        ? `${c.kind === 'attenuate' ? 'lowers' : 'raises'} ${r.moves.map((m) => `${m.element}'s ${LINE_NAMES[m.line]} line ${m.from} → ${m.to}`).join(' and ')}; the seal needs ${need1} instead of ${need0}`
        : 'finds nothing to tune'
  const fight: Fight = {
    ...fight0,
    hand: f0.hand.filter((x) => x.id !== id),
    discard: [...f0.discard, c],
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
