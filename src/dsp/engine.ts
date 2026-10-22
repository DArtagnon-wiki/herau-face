// DSP: offense and defense pulled apart. The commission still feeds
// instability into a pool on the moon dial, and the pool flares against your
// quintessence; a flare discharges the pool, so each one costs only what came
// in since the last. Drainers (their sigils inside the circuit) take
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
  /** How a sculptor voices its elements among each band's notes; even when not given. */
  timbre?: Timbre
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
// Notes: each element's band holds three notes, harmonics of one root

/** The root every note is a harmonic of: A1. */
export const ROOT_HZ = 55
/**
 * Each band's three notes, low to high, as harmonics of the root: earth 110,
 * 165 and 220 Hz; water 275, 330 and 440; air 550, 660 and 825; fire 1320,
 * 1650 and 1980. Together they spell one A major sonority.
 */
export const NOTE_HARMONICS: Record<Elemental, number[]> = { earth: [2, 3, 4], water: [5, 6, 8], air: [10, 12, 15], fire: [24, 30, 36] }
/** Something heard note by note: three amounts per element, low to high. */
export type Voice = Record<Elemental, number[]>
export const emptyVoice = (): Voice => ({ water: [0, 0, 0], earth: [0, 0, 0], air: [0, 0, 0], fire: [0, 0, 0] })
export const sumsOf = (v: Voice): Pool => ({ water: sum3(v.water), earth: sum3(v.earth), air: sum3(v.air), fire: sum3(v.fire) })
const sum3 = (xs: number[]) => xs[0] + xs[1] + xs[2]
export const voiceTotal = (v: Voice) => poolTotal(sumsOf(v))
const copyVoice = (v: Voice): Voice => ({ water: v.water.slice(), earth: v.earth.slice(), air: v.air.slice(), fire: v.fire.slice() })

/** Where a sculptor puts each 3 units of an element among the band's three notes. */
export type Timbre = 'dark' | 'even' | 'bright'
export const TIMBRES: Record<Timbre, number[]> = { dark: [2, 1, 0], even: [1, 1, 1], bright: [0, 1, 2] }
/** How n units of an element land among its notes, for a timbre. */
export const voicing = (n: number, timbre: Timbre = 'even') => TIMBRES[timbre].map((x) => (x * n) / 3)

/** How close a voice is to a chord, note by note: the share of it that overlaps the chord's proportions. */
export function noteMatch(voice: Voice, chord: Voice): number {
  const a = voiceTotal(voice)
  const t = voiceTotal(chord)
  if (!a || !t) return 0
  return ELEMENTS.reduce((n, e) => n + [0, 1, 2].reduce((m, i) => m + Math.min(voice[e][i] / a, chord[e][i] / t), 0), 0)
}

/**
 * Smoothing note by note: each charge moves one unit from the note furthest
 * over the chord's shape (notes the chord doesn't have first) into the note
 * furthest under it, as long as that improves the match.
 */
export function smoothNotes(voice: Voice, chord: Voice, charge: number): { voice: Voice; spent: number } {
  const out = copyVoice(voice)
  const t = voiceTotal(chord)
  let spent = 0
  const notes = BANDS.flatMap((e) => [0, 1, 2].map((i) => [e, i] as const))
  for (let k = 0; k < charge && t; k++) {
    const a = voiceTotal(out)
    const want = (e: Elemental, i: number) => (chord[e][i] * a) / t
    const over = notes.filter(([e, i]) => out[e][i] > want(e, i) + 1e-9 && out[e][i] > 1e-9).sort(([e1, i1], [e2, i2]) => (chord[e2][i2] === 0 ? 1 : 0) - (chord[e1][i1] === 0 ? 1 : 0) || out[e2][i2] - want(e2, i2) - (out[e1][i1] - want(e1, i1)))
    const under = notes.filter(([e, i]) => out[e][i] < want(e, i) - 1e-9).sort(([e1, i1], [e2, i2]) => want(e2, i2) - out[e2][i2] - (want(e1, i1) - out[e1][i1]))
    if (!over.length || !under.length) break
    const [fe, fi] = over[0]
    const [te, ti] = under[0]
    const amount = Math.min(1, out[fe][fi])
    const next = copyVoice(out)
    next[fe][fi] -= amount
    next[te][ti] += amount
    if (noteMatch(next, chord) <= noteMatch(out, chord) + 1e-9) break
    Object.assign(out, next)
    spent++
  }
  return { voice: out, spent }
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
  /**
   * The material as a chord: how each element's share sits among its band's
   * three notes, low to high. Each element's notes sum to its target. It is the
   * material's voice; play matches on elements unless the notes setting asks.
   */
  chord: Voice
  /** Instability fed into the pool in one bulk at each feeding phase. */
  feed: Partial<Pool>
  feedAt: Phase[]
  /** Phases at which the pool flares: what is in it costs quintessence, and the pool empties. */
  attacks: Phase[]
}

export const MUD: Commission = {
  key: 'mud',
  name: 'Mud',
  blurb: 'Feeds 5 water and 2 earth at every new and full moon, and flares at 3/8 and 7/8 of the moon. Its material is 12 water to 8 earth.',
  target: { water: 12, earth: 8, air: 0, fire: 0 },
  chord: { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 0, 0] },
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
  /** What the match compares: elements (the rule), or, for experiments, notes against the material's chord. */
  match?: 'elements' | 'notes'
  /** The match that finishes a material, for experiments; MATCH_TO_FINISH when not given. */
  bar?: number
}
export const DEFAULT_SETTINGS: Settings = { stock: 40, hand: 4 }

export interface Fight {
  commission: Commission
  dial: number
  pool: Pool
  /** The attack sculpted so far, by element. */
  attack: Pool
  /** The same attack note by note, as the sculptors' timbres voiced it. */
  voice: Voice
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
    voice: emptyVoice(),
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

/** The match as this game counts it: by element (the rule), or note by note. */
export function matchNow(g: Game, f: Fight = g.fight): number {
  return g.settings.match === 'notes' ? noteMatch(f.voice, f.commission.chord) : matchOf(f.attack, f.commission.target)
}
const done = (g: Game, f: Fight = g.fight) => poolTotal(f.attack) >= poolTotal(f.commission.target) && matchNow(g, f) >= (g.settings.bar ?? MATCH_TO_FINISH) - 1e-9

/** The material is made: the fight is won. */
const check = (g: Game): Game => (g.stage === 'fight' && done(g) ? { ...g, stage: 'won' } : g)

/**
 * Smoothing in this game's terms: what the attack becomes, note by note and
 * by element, and the charge spent. Smoothing by element moves a unit out of
 * the band's loudest note and into the note the material's chord most wants.
 */
export function smoothed(g: Game): { attack: Pool; voice: Voice; spent: number } {
  const f = g.fight
  const chord = f.commission.chord
  if (g.settings.match === 'notes') {
    const s = smoothNotes(f.voice, chord, f.charge)
    return { attack: sumsOf(s.voice), voice: s.voice, spent: s.spent }
  }
  const s = smooth(f.attack, f.commission.target, f.charge)
  const voice = copyVoice(f.voice)
  for (const { from, to } of s.moved) {
    const loud = [0, 1, 2].reduce((a, b) => (voice[from][b] > voice[from][a] ? b : a))
    const take = Math.min(1, voice[from][loud])
    voice[from][loud] -= take
    const pattern = sum3(chord[to]) ? chord[to] : [1, 1, 1]
    const after = sum3(voice[to]) + take
    const gap = (i: number) => (pattern[i] * after) / sum3(pattern) - voice[to][i]
    const put = [0, 1, 2].reduce((a, b) => (gap(b) > gap(a) ? b : a))
    voice[to][put] += take
  }
  return { attack: s.attack, voice, spent: s.spent }
}

/** Whether smoothing now would finish the material. */
export function smoothingFinishes(g: Game): boolean {
  const f = g.fight
  if (!f.charge) return false
  const s = smoothed(g)
  return s.spent > 0 && done(g, { ...f, attack: s.attack, voice: s.voice })
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
  const voice = copyVoice(f0.voice)
  for (const e of ELEMENTS) {
    pool[e] -= r.took[e]
    attack[e] += r.gives[e]
    if (r.gives[e]) voicing(r.gives[e], c.timbre).forEach((x, i) => (voice[e][i] += x))
  }
  const what = [isDrainer(c) ? `takes ${pairWords(r.took)}, charge +${r.charge}` : '', isSculptor(c) ? `plays ${pairWords(r.gives)} into the attack` : ''].filter(Boolean)
  const fight: Fight = {
    ...f0,
    pool,
    attack,
    voice,
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
  const s = smoothed(g)
  if (!s.spent) throw new Error(f.charge ? 'Nothing to smooth: charge would not bring the attack closer.' : 'No charge to spend.')
  const before = matchNow(g)
  const after = matchNow(g, { ...f, attack: s.attack, voice: s.voice })
  const fight: Fight = {
    ...f,
    attack: s.attack,
    voice: s.voice,
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
