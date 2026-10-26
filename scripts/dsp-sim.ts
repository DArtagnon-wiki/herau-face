// Plays DSP's Mud with simple strategies, to see whether the numbers make a
// fight worth playing.
//
// - Random: any card, either of its ways.
// - Tuner: every card on the spectrum when it would move anything, else its other way.
// - Defender: every card its defensive way (drain, Ward) when that does anything, else on the spectrum.
// - Greedy: the play worth most now: distance closed, instability drained,
//   and Ward raised (as far as the coming flare needs it).
// - Lookahead: tries each play, plays each out several times at random, and
//   takes the one that does best (won with the most quintessence left). Its
//   playouts run on the real draw pile, so it knows the order of the cards to
//   come, which a player doesn't: take it as a ceiling.
//
//   npx tsx scripts/dsp-sim.ts [--games 1000] [--rollouts 12] [--stock 40] [--hand 4]
//     [--flare empties|stays|halves]

import { makeRng, type Rng } from '../src/sim/rng'
import { DEFAULT_SETTINGS, MUD, TICKS, distance, distanceOf, modesOf, newGame, playCard, poolTotal, resolve, type Commission, type Game, type Mode, type Settings } from '../src/dsp/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const GAMES = Number(arg('--games') ?? 1000)
const ROLLOUTS = Number(arg('--rollouts') ?? 12)
const settings: Settings = {
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
  hand: Number(arg('--hand') ?? DEFAULT_SETTINGS.hand),
  flare: (arg('--flare') ?? 'empties') as Settings['flare'],
}
const mud: Commission = MUD

type Move = { id: number; mode: Mode }
const apply = (g: Game, m: Move) => playCard(g, m.id, m.mode)
const movesOf = (g: Game): Move[] => g.fight.hand.flatMap((c) => modesOf(c).map((mode) => ({ id: c.id, mode })))
type Policy = (g: Game, rng: Rng) => Move

const random: Policy = (g, rng) => {
  const ms = movesOf(g)
  return ms[rng.int(0, ms.length - 1)]
}
const tuner: Policy = (g) => {
  const c = g.fight.hand.find((x) => resolve(g.fight, x, 'spectrum').moves.length) ?? g.fight.hand[0]
  return { id: c.id, mode: resolve(g.fight, c, 'spectrum').moves.length ? 'spectrum' : modesOf(c)[0] }
}
const does = (g: Game, m: Move) => {
  const c = g.fight.hand.find((x) => x.id === m.id)!
  const r = resolve(g.fight, c, m.mode)
  return m.mode === 'spectrum' ? r.moves.length > 0 : m.mode === 'drain' ? r.charge > 0 : r.ward > 0
}
const defender: Policy = (g) => {
  const guard = g.fight.hand.map((c) => ({ id: c.id, mode: modesOf(c)[0] })).find((m) => does(g, m))
  return guard ?? { id: g.fight.hand[0].id, mode: 'spectrum' }
}
/** What a play is worth now: distance closed, instability drained, and Ward raised as far as the coming flare needs it. */
function worth(g: Game, m: Move): number {
  const f = g.fight
  const c = f.hand.find((x) => x.id === m.id)!
  const r = resolve(f, c, m.mode)
  const closed = distance(f) - distanceOf(r.spectrum, f.commission.chord)
  const open = Math.max(0, poolTotal(f.pool) - f.ward)
  return closed + poolTotal(r.took) + Math.min(r.ward, open) * 0.9
}
const greedy: Policy = (g) => movesOf(g).reduce((a, b) => (worth(g, b) > worth(g, a) ? b : a))

function playOut(g: Game, rng: Rng): Game {
  let x = g
  for (let guard = 0; guard < 200 && x.stage === 'fight' && x.fight.hand.length; guard++) x = apply(x, random(x, rng))
  return x
}
const score = (g: Game) => (g.stage === 'won' ? 100 + g.quintessence : g.stage === 'lost' ? 0 : g.quintessence / 2)
const lookahead: Policy = (g, rng) => {
  let best = movesOf(g)[0]
  let bestScore = -Infinity
  for (const m of movesOf(g)) {
    const after = apply(g, m)
    let total = 0
    for (let k = 0; k < ROLLOUTS; k++) total += score(after.stage === 'fight' ? playOut(after, rng) : after)
    if (total > bestScore) {
      bestScore = total
      best = m
    }
  }
  return best
}

interface Stat {
  won: boolean
  left: number
  flares: number[]
  plays: number
  moons: number
  charge: number
  ward: number
  dist: number
  /** Plays by way: drained, Ward raised, lowered, raised, wasted. */
  kinds: Record<string, number>
}

function game(i: number, policy: Policy): Stat {
  const rng = makeRng(424242 + i)
  let g = newGame(1000 + i, settings, mud)
  let plays = 0
  const kinds: Record<string, number> = { drain: 0, ward: 0, lower: 0, raise: 0, idle: 0 }
  for (let guard = 0; guard < 300 && g.stage === 'fight'; guard++) {
    const m = policy(g, rng)
    const c = g.fight.hand.find((x) => x.id === m.id)!
    const r = resolve(g.fight, c, m.mode)
    const k = m.mode === 'drain' ? (r.charge ? 'drain' : 'idle') : m.mode === 'ward' ? (r.ward ? 'ward' : 'idle') : r.moves.length ? (c.kind === 'attenuate' ? 'lower' : 'raise') : 'idle'
    kinds[k]++
    plays++
    g = apply(g, m)
  }
  return { won: g.stage === 'won', left: g.quintessence, flares: g.fight.flares, plays, moons: g.fight.dial / TICKS, charge: g.fight.charge, ward: g.fight.ward, dist: distance(g.fight), kinds }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`

console.log(`Mud, ${GAMES} games each · ${settings.stock} quintessence · draw ${settings.hand} at new and full moons, discard at the quarters · flares: pool ${settings.flare} · win on a complete match (20 off at the start)`)
console.log('')
console.log('Strategy | Won | Flares, 1st to 4th | Quintessence left (won) | Cards played | Moons | Left over at the win: charge, Ward | Plays: drain, Ward, lower, raise, wasted')
console.log('--- | --- | --- | --- | --- | --- | --- | ---')
for (const [name, policy, n] of [
  ['Random', random, GAMES],
  ['Tuner', tuner, GAMES],
  ['Defender', defender, GAMES],
  ['Greedy', greedy, GAMES],
  ['Lookahead', lookahead, Math.min(GAMES, 400)],
] as [string, Policy, number][]) {
  const s = Array.from({ length: n }, (_, i) => game(i, policy))
  const w = s.filter((x) => x.won)
  const each = [0, 1, 2, 3].map((k) => {
    const xs = s.filter((x) => x.flares.length > k).map((x) => x.flares[k])
    return xs.length >= n / 10 ? mean(xs).toFixed(1) : '–'
  })
  const total = mean(s.map((x) => x.plays))
  const kinds = ['drain', 'ward', 'lower', 'raise', 'idle'].map((k) => pct(mean(s.map((x) => x.kinds[k])), total))
  console.log(
    `${name} | ${pct(w.length, n)} | ${each.join(', ')} | ${mean(w.map((x) => x.left)).toFixed(1)} | ${mean(s.map((x) => x.plays)).toFixed(1)} | ${mean(s.map((x) => x.moons)).toFixed(2)} | ${mean(w.map((x) => x.charge)).toFixed(1)}, ${mean(w.map((x) => x.ward)).toFixed(1)} | ${kinds.join(', ')}`,
  )
}
