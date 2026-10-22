// Does note-level shape earn its place as a mechanic? Mud is played with three
// chords of the same material (12 water to 8 earth, voiced dark, even or
// bright within each band) under three rules:
//
// - Elements: the match counts elements only, as the game does now.
// - Notes, spread: the match counts notes, and every sculptor spreads its
//   elements evenly over a band's notes, so only smoothing shapes within a band.
// - Notes, timbres: the match counts notes, and each sculptor has a timbre:
//   Circulate and Coagulate dark, Digest and Sublime bright, Dissolve and Cupel
//   even.
//
// The lookahead player plays each (as in dsp-sim.ts). At every decision it
// also asks what it would play if the chord were one of the others, with the
// same random playouts, and, for a baseline of noise, what it would play on the
// same chord with other playouts. Playouts diverge once anything differs, so
// the clean measure is the second: whenever two or more sculptors are in hand,
// which one fits best, judged without playouts as the charge it would leave
// still needed to reach the match. If that depends on the chord, shape is a
// real mechanic.
//
//   npx tsx scripts/dsp-timbre.ts [--games 200] [--rollouts 12] [--mode elements|spread|timbres] [--bar 0.8] [--fit-only]
//   (--fit-only skips the lookahead comparisons, which are mostly noise, for speed)

import { makeRng, type Rng } from '../src/sim/rng'
import { DEFAULT_SETTINGS, MATCH_TO_FINISH, MUD, isSculptor, matchOf, newGame, noteMatch, playCard, poolTotal, smooth, smoothNotes, smoothingFinishes, startingDeck, sumsOf, tune, voicing, type Card, type Commission, type Game, type Settings, type Timbre, type Voice } from '../src/dsp/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const GAMES = Number(arg('--games') ?? 200)
const BAR = Number(arg('--bar') ?? MATCH_TO_FINISH)
const FIT_ONLY = args.includes('--fit-only')
const ROLLOUTS = Number(arg('--rollouts') ?? 12)

const chord = (earth: number[], water: number[]): Voice => ({ earth, water, air: [0, 0, 0], fire: [0, 0, 0] })
const MATERIALS: Commission[] = [
  { ...MUD, key: 'dark', name: 'Mud, dark', chord: chord([5, 2, 1], [6, 4, 2]) },
  { ...MUD, key: 'even', name: 'Mud, even', chord: chord([3, 3, 2], [4, 4, 4]) },
  { ...MUD, key: 'bright', name: 'Mud, bright', chord: chord([1, 2, 5], [2, 4, 6]) },
]
const TIMBRE_OF: Record<string, Timbre> = { Dissolve: 'even', Circulate: 'dark', Digest: 'bright', Sublime: 'bright', Coagulate: 'dark', Cupel: 'even' }

type Mode = 'elements' | 'spread' | 'timbres'
const MODES: Mode[] = arg('--mode') ? [arg('--mode') as Mode] : ['elements', 'spread', 'timbres']
const settingsOf = (m: Mode): Settings => ({ ...DEFAULT_SETTINGS, match: m === 'elements' ? 'elements' : 'notes', bar: BAR })
const deckOf = (m: Mode): Card[] => startingDeck().map((c) => (m === 'timbres' && isSculptor(c) ? { ...c, timbre: TIMBRE_OF[c.name] } : c))

type Move = { kind: 'card'; id: number } | { kind: 'tune' }
const apply = (g: Game, m: Move) => (m.kind === 'tune' ? tune(g) : playCard(g, m.id))
const same = (a: Move, b: Move) => a.kind === b.kind && (a.kind === 'tune' || a.id === (b as { id: number }).id)

function randomMove(g: Game, rng: Rng): Move {
  return smoothingFinishes(g) ? { kind: 'tune' } : { kind: 'card', id: g.fight.hand[rng.int(0, g.fight.hand.length - 1)].id }
}
function playOut(g: Game, rng: Rng): Game {
  let x = g
  for (let guard = 0; guard < 200 && x.stage === 'fight' && x.fight.hand.length; guard++) x = apply(x, randomMove(x, rng))
  return x
}
const score = (g: Game) => (g.stage === 'won' ? 100 + g.quintessence : g.stage === 'lost' ? 0 : g.quintessence / 2)

/** The lookahead's move, with its playouts driven by this seed. */
function lookahead(g: Game, seed: number): Move {
  if (smoothingFinishes(g)) return { kind: 'tune' }
  const rng = makeRng(seed)
  let best: Move = { kind: 'card', id: g.fight.hand[0].id }
  let bestScore = -Infinity
  for (const c of g.fight.hand) {
    const m: Move = { kind: 'card', id: c.id }
    const after = apply(g, m)
    let total = 0
    for (let k = 0; k < ROLLOUTS; k++) total += score(playOut(after, rng))
    if (total > bestScore) {
      bestScore = total
      best = m
    }
  }
  return best
}

/**
 * How much charge the attack would still need after playing this sculptor:
 * smoothing moves until the match reaches the bar (40 if it never would).
 */
function chargeNeeded(g: Game, c: Card, chordOf: Commission): number {
  const f = g.fight
  const notes = g.settings.match === 'notes'
  let voice = { water: f.voice.water.slice(), earth: f.voice.earth.slice(), air: f.voice.air.slice(), fire: f.voice.fire.slice() }
  for (const e of ['water', 'earth', 'air', 'fire'] as const) if (c.gives[e]) voicing(c.gives[e]!, c.timbre).forEach((x, i) => (voice[e][i] += x))
  let attack = sumsOf(voice)
  const m = () => (notes ? noteMatch(voice, chordOf.chord) : matchOf(attack, chordOf.target))
  for (let k = 0; k <= 40; k++) {
    if (m() >= BAR - 1e-9) return k
    if (notes) {
      const s = smoothNotes(voice, chordOf.chord, 1)
      if (!s.spent) return 40
      voice = s.voice
      attack = sumsOf(voice)
    } else {
      const s = smooth(attack, chordOf.target, 1)
      if (!s.spent) return 40
      attack = s.attack
    }
  }
  return 40
}

/** The sculptor in hand that would leave the least charge still needed, on this chord. */
function bestFit(g: Game, chordOf: Commission): Card | null {
  const sculptors = g.fight.hand.filter(isSculptor)
  if (sculptors.length < 2) return null
  let best = sculptors[0]
  let need = Infinity
  for (const c of sculptors) {
    const n = chargeNeeded(g, c, chordOf)
    if (n < need) {
      need = n
      best = c
    }
  }
  return best
}

interface Row {
  won: number
  left: number[]
  charge: number[]
  flares: number[]
  decisions: number
  /** Decisions with a real choice (two or more cards) where another chord would change the move. */
  split: number
  /** The same, on the same chord with other playouts: the noise. */
  noise: number
  choices: number
  /** Hands with two or more sculptors, and those where the best fit depends on the chord. */
  fits: number
  fitSplit: number
  /** In those hands: the extra charge needed for playing another chord's best fit instead. */
  stake: number[]
  picks: Record<string, number>
}

function run(mode: Mode, material: Commission): Row {
  const row: Row = { won: 0, left: [], charge: [], flares: [], decisions: 0, split: 0, noise: 0, choices: 0, fits: 0, fitSplit: 0, stake: [], picks: {} }
  const others = MATERIALS.filter((m) => m.key !== material.key)
  for (let i = 0; i < GAMES; i++) {
    let g = newGame(1000 + i, settingsOf(mode), material, deckOf(mode))
    for (let k = 0; k < 300 && g.stage === 'fight'; k++) {
      const seed = (i * 7919 + k * 104729) >>> 0
      const m = lookahead(g, seed)
      row.decisions++
      if (g.fight.hand.length > 1 && !FIT_ONLY) {
        row.choices++
        const alt = others.map((o) => lookahead({ ...g, fight: { ...g.fight, commission: o } }, seed))
        if (alt.some((a) => !same(a, m))) row.split++
        const reseeded = [1, 2].map((d) => lookahead(g, (seed + d * 15485863) >>> 0))
        if (reseeded.some((a) => !same(a, m))) row.noise++
      }
      const fit = bestFit(g, material)
      if (fit) {
        row.fits++
        const wrong = others.map((o) => bestFit(g, o)!).filter((c) => c.id !== fit.id)
        if (wrong.length) {
          row.fitSplit++
          const need = chargeNeeded(g, fit, material)
          row.stake.push(Math.max(...wrong.map((c) => chargeNeeded(g, c, material))) - need)
        }
      }
      if (m.kind === 'card') {
        const c = g.fight.hand.find((x) => x.id === m.id)!
        if (isSculptor(c)) row.picks[c.name] = (row.picks[c.name] ?? 0) + 1
      }
      g = apply(g, m)
    }
    if (g.stage === 'won') {
      row.won++
      row.left.push(g.quintessence)
      row.charge.push(g.fight.smoothed)
    }
    row.flares.push(g.fight.flares.length)
  }
  return row
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`
const NAMES: Record<Mode, string> = { elements: 'Elements (now)', spread: 'Notes, spread', timbres: 'Notes, timbres' }

console.log(`Mud's three chords, ${GAMES} games each with the lookahead (${ROLLOUTS} playouts a move); flares empty the pool; the match to finish is ${Math.round(BAR * 100)}%.`)
console.log('')
console.log('Rule | Chord | Won | Quintessence left (won) | Charge spent (won) | Flares | Another chord changes the lookahead\'s move | Other playouts change it (noise) | Another chord changes the best-fitting sculptor | Extra charge the wrong fit costs')
console.log('--- | --- | --- | --- | --- | --- | --- | --- | --- | ---')
const picks: string[] = []
for (const mode of MODES) {
  for (const mat of MATERIALS) {
    const r = run(mode, mat)
    console.log(`${NAMES[mode]} | ${mat.key} | ${pct(r.won, GAMES)} | ${mean(r.left).toFixed(1)} | ${mean(r.charge).toFixed(1)} | ${mean(r.flares).toFixed(1)} | ${pct(r.split, r.choices)} | ${pct(r.noise, r.choices)} | ${pct(r.fitSplit, r.fits)} of ${r.fits} | ${mean(r.stake).toFixed(1)}`)
    const total = Object.values(r.picks).reduce((a, b) => a + b, 0)
    picks.push(`${NAMES[mode]} | ${mat.key} | ${['Dissolve', 'Circulate', 'Digest', 'Sublime', 'Coagulate', 'Cupel'].map((n) => pct(r.picks[n] ?? 0, total)).join(' | ')}`)
  }
}
console.log('')
console.log('Sculptors played, as a share of all sculptor plays (timbres: Dissolve even, Circulate dark, Digest bright, Sublime bright, Coagulate dark, Cupel even)')
console.log('')
console.log('Rule | Chord | Dissolve | Circulate | Digest | Sublime | Coagulate | Cupel')
console.log('--- | --- | --- | --- | --- | --- | --- | ---')
for (const p of picks) console.log(p)
void poolTotal
