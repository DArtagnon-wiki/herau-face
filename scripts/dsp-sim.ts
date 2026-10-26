// Plays DSP's Mud with simple strategies, to see whether the numbers make a
// fight worth playing and whether charging and tuning both win.
//
// - Random: any card, either way.
// - Charger: every card on instability (Attenuate drains, Amplify adds).
// - Tuner: every card on the spectrum when it would tune anything, else on instability.
// - Greedy: the play with the most progress now (charge raised plus need
//   lowered), counting instability added as a cost and instability taken as a
//   gain, since it flares.
// - Lookahead: tries each play, plays each out several times at random, and
//   takes the one that does best (won with the most quintessence left). Its
//   playouts run on the real draw pile, so it knows the order of the cards to
//   come, which a player doesn't: take it as a ceiling.
//
//   npx tsx scripts/dsp-sim.ts [--games 1000] [--rollouts 12] [--stock 40] [--hand 4]
//     [--flare empties|stays|halves] [--base 10]

import { makeRng, type Rng } from '../src/sim/rng'
import { DEFAULT_SETTINGS, MUD, TICKS, distance, needOf, newGame, playCard, poolTotal, resolve, type Commission, type Game, type Mode, type Settings } from '../src/dsp/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const GAMES = Number(arg('--games') ?? 1000)
const ROLLOUTS = Number(arg('--rollouts') ?? 12)
const settings: Settings = {
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
  hand: Number(arg('--hand') ?? DEFAULT_SETTINGS.hand),
  flare: (arg('--flare') ?? 'empties') as Settings['flare'],
}
const mud: Commission = { ...MUD, base: Number(arg('--base') ?? MUD.base) }

type Move = { id: number; mode: Mode }
const apply = (g: Game, m: Move) => playCard(g, m.id, m.mode)
const movesOf = (g: Game): Move[] => g.fight.hand.flatMap((c) => (['instability', 'spectrum'] as Mode[]).map((mode) => ({ id: c.id, mode })))
type Policy = (g: Game, rng: Rng) => Move

const random: Policy = (g, rng) => {
  const ms = movesOf(g)
  return ms[rng.int(0, ms.length - 1)]
}
const charger: Policy = (g) => {
  // Drain first, where there is something to drain; else whatever comes first.
  const att = g.fight.hand.find((c) => c.kind === 'attenuate' && resolve(g.fight, c, 'instability').charge > 0)
  return { id: (att ?? g.fight.hand[0]).id, mode: 'instability' }
}
const tuner: Policy = (g) => {
  const c = g.fight.hand.find((x) => resolve(g.fight, x, 'spectrum').moves.length) ?? g.fight.hand[0]
  return { id: c.id, mode: resolve(g.fight, c, 'spectrum').moves.length ? 'spectrum' : 'instability' }
}
/** Progress now, with what it does to the pool counted as well. */
function worth(g: Game, m: Move): number {
  const c = g.fight.hand.find((x) => x.id === m.id)!
  const r = resolve(g.fight, c, m.mode)
  const tuned = needOf(g.fight) - (g.fight.commission.base + distanceAfter(g, r.spectrum))
  return r.charge + tuned + poolTotal(r.took) - poolTotal(r.added)
}
const distanceAfter = (g: Game, s: Game['fight']['spectrum']) => distance({ ...g.fight, spectrum: s })
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
  dist: number
  /** Plays by way: drained, amplified into the pool, tuned down, tuned up, wasted. */
  kinds: Record<string, number>
}

function game(i: number, policy: Policy): Stat {
  const rng = makeRng(424242 + i)
  let g = newGame(1000 + i, settings, mud)
  let plays = 0
  const kinds: Record<string, number> = { drain: 0, feed: 0, lower: 0, raise: 0, idle: 0 }
  for (let guard = 0; guard < 300 && g.stage === 'fight'; guard++) {
    const m = policy(g, rng)
    const c = g.fight.hand.find((x) => x.id === m.id)!
    const r = resolve(g.fight, c, m.mode)
    const k = m.mode === 'instability' ? (c.kind === 'attenuate' ? (r.charge ? 'drain' : 'idle') : 'feed') : r.moves.length ? (c.kind === 'attenuate' ? 'lower' : 'raise') : 'idle'
    kinds[k]++
    plays++
    g = apply(g, m)
  }
  return { won: g.stage === 'won', left: g.quintessence, flares: g.fight.flares, plays, moons: g.fight.dial / TICKS, charge: g.fight.charge, dist: distance(g.fight), kinds }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`

console.log(`Mud, ${GAMES} games each · ${settings.stock} quintessence · draw ${settings.hand} at new and full moons, discard at the quarters · flares: pool ${settings.flare} · seal: charge ${mud.base} + distance (20 at the start)`)
console.log('')
console.log('Strategy | Won | Flares, 1st to 4th | Quintessence left (won) | Cards played | Moons | At the seal: charge, distance | Plays: drain, amplify into the pool, lower, raise, wasted')
console.log('--- | --- | --- | --- | --- | --- | --- | ---')
for (const [name, policy, n] of [
  ['Random', random, GAMES],
  ['Charger', charger, GAMES],
  ['Tuner', tuner, GAMES],
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
  const kinds = ['drain', 'feed', 'lower', 'raise', 'idle'].map((k) => pct(mean(s.map((x) => x.kinds[k])), total))
  console.log(
    `${name} | ${pct(w.length, n)} | ${each.join(', ')} | ${mean(w.map((x) => x.left)).toFixed(1)} | ${mean(s.map((x) => x.plays)).toFixed(1)} | ${mean(s.map((x) => x.moons)).toFixed(2)} | ${mean(w.map((x) => x.charge)).toFixed(1)}, ${mean(w.map((x) => x.dist)).toFixed(1)} | ${kinds.join(', ')}`,
  )
}
