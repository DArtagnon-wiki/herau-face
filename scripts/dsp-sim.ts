// Plays DSP's Mud with simple strategies, to see whether the first numbers
// make a fight worth playing.
//
// - Random: any card in hand, smooths only when that finishes.
// - Offense: sculptors first, then drainers; smooths only when that finishes.
// - Defense: drainers first, then sculptors; the same smoothing.
// - Lookahead: tries each move, plays each out several times at random, and
//   takes the one that does best (won with the most quintessence left). Its
//   playouts run on the real draw pile, so it knows the order of the cards to
//   come, which a player doesn't: take it as a ceiling.
//
//   npx tsx scripts/dsp-sim.ts [--games 1000] [--rollouts 12] [--stock 40] [--hand 4]
//     [--flare empties|stays|halves] [--feed water:5,earth:2]   (flares empty the pool unless told otherwise)

import { makeRng, type Rng } from '../src/sim/rng'
import { DEFAULT_SETTINGS, MUD, TICKS, type Commission, isDrainer, isSculptor, matchOf, newGame, playCard, poolTotal, smoothingFinishes, tune, type Game, type Settings } from '../src/dsp/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const GAMES = Number(arg('--games') ?? 1000)
const ROLLOUTS = Number(arg('--rollouts') ?? 12)
const settings: Settings = {
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
  hand: Number(arg('--hand') ?? DEFAULT_SETTINGS.hand),
  flare: (arg('--flare') ?? 'empties') as Settings['flare'],
}
/** Mud, or Mud with another feed: --feed water:3,earth:1. */
const mud: Commission = arg('--feed') ? { ...MUD, feed: Object.fromEntries(arg('--feed')!.split(',').map((x) => [x.split(':')[0], Number(x.split(':')[1])])) } : MUD

type Move = { kind: 'card'; id: number } | { kind: 'tune' }
const apply = (g: Game, m: Move) => (m.kind === 'tune' ? tune(g) : playCard(g, m.id))
type Policy = (g: Game, rng: Rng) => Move

const finishMove = (g: Game): Move | null => (smoothingFinishes(g) ? { kind: 'tune' } : null)
const random: Policy = (g, rng) => finishMove(g) ?? { kind: 'card', id: g.fight.hand[rng.int(0, g.fight.hand.length - 1)].id }
const ordered =
  (first: (c: Game['fight']['hand'][number]) => boolean): Policy =>
  (g) => {
    const f = finishMove(g)
    if (f) return f
    const c = g.fight.hand.find(first) ?? g.fight.hand[0]
    return { kind: 'card', id: c.id }
  }
const offense = ordered(isSculptor)
const defense = ordered(isDrainer)

function playOut(g: Game, policy: Policy, rng: Rng): Game {
  let x = g
  for (let guard = 0; guard < 200 && x.stage === 'fight'; guard++) {
    if (!x.fight.hand.length) break
    x = apply(x, policy(x, rng))
  }
  return x
}
const score = (g: Game) => (g.stage === 'won' ? 100 + g.quintessence : g.stage === 'lost' ? 0 : g.quintessence / 2)

const lookahead: Policy = (g, rng) => {
  const f = finishMove(g)
  if (f) return f
  const moves: Move[] = g.fight.hand.map((c) => ({ kind: 'card', id: c.id }))
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    const after = apply(g, m)
    let total = 0
    for (let k = 0; k < ROLLOUTS; k++) total += score(playOut(after, random, rng))
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
  flares: number
  plays: number
  moons: number
  smoothed: number
  size: number
  rawMatch: number
  /** Each flare in turn. */
  each: number[]
}

function game(i: number, policy: Policy): Stat {
  const rng = makeRng(424242 + i)
  let g = newGame(1000 + i, settings, mud)
  let plays = 0
  let raw = 0
  for (let guard = 0; guard < 300 && g.stage === 'fight'; guard++) {
    const m = policy(g, rng)
    if (m.kind === 'card') plays++
    if (m.kind === 'tune') raw = matchOf(g.fight.attack, g.fight.commission.target)
    g = apply(g, m)
  }
  return {
    won: g.stage === 'won',
    left: g.quintessence,
    flares: g.fight.flares.length,
    plays,
    moons: g.fight.dial / TICKS,
    smoothed: g.fight.smoothed,
    size: poolTotal(g.fight.attack),
    rawMatch: raw || matchOf(g.fight.attack, g.fight.commission.target),
    each: g.fight.flares,
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`

console.log(`Mud (feeds ${JSON.stringify(mud.feed)}), ${GAMES} games each · ${settings.stock} quintessence · draw ${settings.hand} at new and full moons, discard at the quarters · flares: pool ${settings.flare}`)
console.log('')
console.log('Strategy | Won | Flares 1st to 4th (mean, where at least a tenth of games reach it) | Quintessence left (won) | Flares | Cards played | Moons | Charge spent smoothing | Match before the last smoothing')
console.log('--- | --- | --- | --- | --- | --- | --- | --- | ---')
for (const [name, policy, n] of [
  ['Random', random, GAMES],
  ['Offense first', offense, GAMES],
  ['Defense first', defense, GAMES],
  ['Lookahead', lookahead, Math.min(GAMES, 400)],
] as [string, Policy, number][]) {
  const s = Array.from({ length: n }, (_, i) => game(i, policy))
  const w = s.filter((x) => x.won)
  console.log(
    `${name} | ${pct(w.length, n)} | ${[0, 1, 2, 3].map((k) => { const xs = s.filter((x) => x.each.length > k).map((x) => x.each[k]); return xs.length >= n / 10 ? mean(xs).toFixed(1) : '–' }).join(', ')} | ${mean(w.map((x) => x.left)).toFixed(1)} | ${mean(s.map((x) => x.flares)).toFixed(1)} | ${mean(s.map((x) => x.plays)).toFixed(1)} | ${mean(s.map((x) => x.moons)).toFixed(2)} | ${mean(w.map((x) => x.smoothed)).toFixed(1)} | ${Math.round(100 * mean(w.map((x) => x.rawMatch)))}%`,
  )
}
