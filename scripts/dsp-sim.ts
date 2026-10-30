// Plays DSP's Mud with simple strategies, to see whether the numbers make a
// fight worth playing, and whether a complete match is in reach with kernels.
//
// - Greedy: the power first; then the attack, at its best line, that closes
//   the spectrum on the chord most; with nothing that closes it, the drain
//   that takes most.
// - Guarded: as greedy, but drains first whenever a drain would take 3 or more.
// - Lookahead: tries the power, each drain, and each attack at its three best
//   lines; plays each out several times with a greedy player that now and then
//   plays at random, and takes the one that does best (won with the most
//   quintessence left). Its playouts run on the real draw pile, so it knows the
//   order of the cards to come, which a player doesn't: take it as a ceiling.
//
//   npx tsx scripts/dsp-sim.ts [--games 600] [--rollouts 10] [--stock 40] [--hand 4] [--tolerance 2]
//   (--tolerance 0 asks for a complete match; Mud's own is 2)

import { makeRng, type Rng } from '../src/sim/rng'
import { DEFAULT_SETTINGS, LINES, MUD, TICKS, bestLine, distance, distanceOf, newGame, playCard, poolTotal, resolve, type Game, type Settings } from '../src/dsp/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const GAMES = Number(arg('--games') ?? 600)
const ROLLOUTS = Number(arg('--rollouts') ?? 10)
const settings: Settings = {
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
  hand: Number(arg('--hand') ?? DEFAULT_SETTINGS.hand),
  tolerance: arg('--tolerance') !== undefined ? Number(arg('--tolerance')) : undefined,
}

type Move = { id: number; line?: number }
const apply = (g: Game, m: Move) => playCard(g, m.id, m.line)
type Policy = (g: Game, rng: Rng) => Move

/** The attack in hand that closes the spectrum most, at its best line. */
function bestAttack(g: Game): { move: Move; closed: number } | null {
  let best: { move: Move; closed: number } | null = null
  for (const c of g.fight.hand) {
    if (c.kind !== 'attack') continue
    const b = bestLine(g.fight, c)
    if (!best || b.closed > best.closed) best = { move: { id: c.id, line: b.line }, closed: b.closed }
  }
  return best
}
function bestDrain(g: Game): { move: Move; took: number } | null {
  let best: { move: Move; took: number } | null = null
  for (const c of g.fight.hand) {
    if (c.kind !== 'drain') continue
    const took = poolTotal(resolve(g.fight, c).took)
    if (!best || took > best.took) best = { move: { id: c.id }, took }
  }
  return best
}

const greedy: Policy = (g) => {
  const power = g.fight.hand.find((c) => c.kind === 'power')
  if (power) return { id: power.id }
  const a = bestAttack(g)
  if (a && a.closed > 0) return a.move
  const d = bestDrain(g)
  if (d) return d.move
  return a ? a.move : { id: g.fight.hand[0].id }
}
const guarded: Policy = (g, rng) => {
  const d = bestDrain(g)
  if (d && d.took >= 3) return d.move
  return greedy(g, rng)
}

/** Greedy, but a fifth of the time any card at any line. */
const loose: Policy = (g, rng) => {
  if (rng.float() < 0.2) {
    const c = g.fight.hand[rng.int(0, g.fight.hand.length - 1)]
    return { id: c.id, line: c.kind === 'attack' ? rng.int(0, LINES - 1) : undefined }
  }
  return greedy(g, rng)
}
function playOut(g: Game, rng: Rng): Game {
  let x = g
  for (let guard = 0; guard < 200 && x.stage === 'fight' && x.fight.hand.length; guard++) x = apply(x, loose(x, rng))
  return x
}
const score = (g: Game) => (g.stage === 'won' ? 100 + g.quintessence : g.stage === 'lost' ? 0 : g.quintessence / 2 - distance(g.fight))

function candidates(g: Game): Move[] {
  const out: Move[] = []
  for (const c of g.fight.hand) {
    if (c.kind !== 'attack') {
      out.push({ id: c.id })
      continue
    }
    const d0 = distance(g.fight)
    const lines = Array.from({ length: LINES }, (_, k) => ({ k, closed: d0 - distanceOf(resolve(g.fight, c, k).spectrum, g.fight.commission.chord) }))
    lines.sort((a, b) => b.closed - a.closed)
    for (const l of lines.slice(0, 3)) out.push({ id: c.id, line: l.k })
  }
  return out
}
const lookahead: Policy = (g, rng) => {
  let best = candidates(g)[0]
  let bestScore = -Infinity
  for (const m of candidates(g)) {
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
  dist: number
  charge: number
  kinds: Record<string, number>
}

function game(i: number, policy: Policy): Stat {
  const rng = makeRng(424242 + i)
  let g = newGame(1000 + i, settings, MUD)
  let plays = 0
  const kinds: Record<string, number> = { drain: 0, attack: 0, strong: 0, power: 0, idle: 0 }
  for (let guard = 0; guard < 300 && g.stage === 'fight'; guard++) {
    const m = policy(g, rng)
    const c = g.fight.hand.find((x) => x.id === m.id)!
    const r = resolve(g.fight, c, m.line)
    const k = c.kind === 'power' ? 'power' : c.kind === 'drain' ? (poolTotal(r.took) ? 'drain' : 'idle') : r.moves.length ? (r.boosted.length ? 'strong' : 'attack') : 'idle'
    kinds[k]++
    plays++
    g = apply(g, m)
  }
  const charge = g.fight.charge.water + g.fight.charge.earth + g.fight.charge.air + g.fight.charge.fire
  return { won: g.stage === 'won', left: g.quintessence, flares: g.fight.flares, plays, moons: g.fight.dial / TICKS, dist: distance(g.fight), charge, kinds }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`

const tol = settings.tolerance ?? MUD.tolerance
console.log(`Mud, ${GAMES} games each · ${settings.stock} quintessence · draw ${settings.hand} at new and full moons, discard at the quarters · win at ${tol ? `within ${tol}` : 'a complete match'} (20 off at the start)`)
console.log('')
console.log('Strategy | Won | Flares, 1st to 4th | Quintessence left (won) | Cards played | Moons | Off by, when lost | Charge left (won) | Plays: drain, attack, strengthened attack, power, wasted')
console.log('--- | --- | --- | --- | --- | --- | --- | --- | ---')
for (const [name, policy, n] of [
  ['Greedy', greedy, GAMES],
  ['Guarded', guarded, GAMES],
  ['Lookahead', lookahead, Math.min(GAMES, 300)],
] as [string, Policy, number][]) {
  const s = Array.from({ length: n }, (_, i) => game(i, policy))
  const w = s.filter((x) => x.won)
  const l = s.filter((x) => !x.won)
  const each = [0, 1, 2, 3].map((k) => {
    const xs = s.filter((x) => x.flares.length > k).map((x) => x.flares[k])
    return xs.length >= n / 10 ? mean(xs).toFixed(1) : '–'
  })
  const total = mean(s.map((x) => x.plays))
  const kinds = ['drain', 'attack', 'strong', 'power', 'idle'].map((k) => pct(mean(s.map((x) => x.kinds[k])), total))
  console.log(
    `${name} | ${pct(w.length, n)} | ${each.join(', ')} | ${mean(w.map((x) => x.left)).toFixed(1)} | ${mean(s.map((x) => x.plays)).toFixed(1)} | ${mean(s.map((x) => x.moons)).toFixed(2)} | ${l.length ? mean(l.map((x) => x.dist)).toFixed(1) : '–'} | ${mean(w.map((x) => x.charge)).toFixed(1)} | ${kinds.join(', ')}`,
  )
}
