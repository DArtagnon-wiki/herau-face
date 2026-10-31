// Plays DSP's commissions with simple strategies, to see whether the numbers
// make each fight worth playing, and how hard each one is.
//
// - Greedy: the power first; then the attack, at its best line, that closes
//   the spectrum on the chord most; with nothing that closes it, the drain
//   that takes most.
// - Planner: plans the rest of the hand before the next discard (two cards
//   from the new or full moon), trying every card at every line that moves
//   something, and plays the first card of the best plan: closest to the chord,
//   counting quintessence and what is left in the pool to flare at half the
//   weight of distance. It sees only its hand: the nearest stand-in for a
//   careful player.
// - Lookahead: tries the power, each drain, and each attack at its three best
//   lines; plays each out several times with a greedy player that now and then
//   plays at random, and takes the one that does best (won with the most
//   quintessence left). Its playouts run on the real draw pile, so it knows the
//   order of the cards to come, which a player doesn't: take it as a ceiling.
//
//   npx tsx scripts/dsp-sim.ts [--fight mud|all] [--games 600] [--ahead 300] [--rollouts 10] [--stock 40] [--hand 4] [--tolerance 2]
//   (--tolerance 0 asks for a complete match; every commission's own is 2. --ahead is how many games the lookahead plays.)

import { makeRng, type Rng } from '../src/sim/rng'
import { COMMISSIONS, DEFAULT_SETTINGS, startingDeck, type Card, type Tap, TICKS, linesOf, type Commission, bestLine, distance, distanceOf, newGame, playCard, poolTotal, resolve, type Game, type Settings } from '../src/dsp/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const GAMES = Number(arg('--games') ?? 600)
const ROLLOUTS = Number(arg('--rollouts') ?? 10)
const AHEAD = Number(arg('--ahead') ?? 300)
const PLAN = Number(arg('--plan') ?? 300)
const FIGHT = arg('--fight') ?? 'all'
// Deck experiments: swap attacks in the opening deck by name.
const T = (...v: number[]): Tap[] => v.map((x) => ({ op: 'add', v: x }))
const FINE: Record<string, { name: string; kernel: Tap[]; anchor: number }> = {
  Nudge: { name: 'Nudge', kernel: T(1), anchor: 0 },
  Trim: { name: 'Trim', kernel: T(-1), anchor: 0 },
  Shift: { name: 'Shift', kernel: T(-1, 1), anchor: 0 },
  Ease: { name: 'Ease', kernel: T(1, 1), anchor: 0 },
  Pare: { name: 'Pare', kernel: T(-1, -1), anchor: 0 },
}
/** --deck "Lift>Nudge,Sharpen>Trim" swaps the first card of each name; "+Nudge" adds one. */
function deckOf(spec?: string): Card[] {
  const deck = startingDeck()
  if (!spec) return deck
  let id = 100
  for (const part of spec.split(',')) {
    if (part.startsWith('+')) {
      const f = FINE[part.slice(1)]
      deck.push({ id: id++, kind: 'attack', time: 2, ...f })
      continue
    }
    const [from, to] = part.split('>')
    const i = deck.findIndex((c) => c.name === from)
    const f = FINE[to]
    deck[i] = { id: deck[i].id, kind: 'attack', time: 2, ...f }
  }
  return deck
}
const DECK = deckOf(arg('--deck'))
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

/** Every distinct play in hand: drains and powers once, attacks at every line that moves something (lines with the same result once). */
function plays(g: Game): Move[] {
  const out: Move[] = []
  for (const c of g.fight.hand) {
    if (c.kind !== 'attack') {
      out.push({ id: c.id })
      continue
    }
    const seen = new Set<string>()
    for (let k = 0; k < linesOf(g.fight.spectrum); k++) {
      const r = resolve(g.fight, c, k)
      if (!r.moves.length) continue
      const key = JSON.stringify(r.spectrum)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: c.id, line: k })
    }
  }
  return out
}
const planScore = (g: Game) => (g.stage === 'won' ? 1000 + g.quintessence : g.stage === 'lost' ? -1000 : g.quintessence / 2 - distance(g.fight) - poolTotal(g.fight.pool) / 2)
/** Plays left before the hand is discarded at the next quarter. */
const playsLeft = (g: Game) => Math.max(1, Math.min(g.fight.hand.length, Math.ceil((8 - ((g.fight.dial + 4) % 8)) / 2)))
function bestPlan(g: Game, depth: number): { move: Move | null; score: number } {
  if (depth === 0 || g.stage !== 'fight' || !g.fight.hand.length) return { move: null, score: planScore(g) }
  let best: { move: Move | null; score: number } = { move: null, score: -Infinity }
  const dial = g.fight.dial
  for (const m of plays(g)) {
    const after = apply(g, m)
    // Plan only within this hand: once the moon has passed the quarter, stop.
    const sameHand = after.stage === 'fight' && after.fight.dial - dial < 8 - ((dial + 4) % 8) && after.fight.hand.length
    const score = sameHand ? bestPlan(after, depth - 1).score : planScore(after)
    if (score > best.score) best = { move: m, score }
  }
  return best
}
const planner: Policy = (g, rng) => bestPlan(g, playsLeft(g)).move ?? greedy(g, rng)

/** Greedy, but a fifth of the time any card at any line. */
const loose: Policy = (g, rng) => {
  if (rng.float() < 0.2) {
    const c = g.fight.hand[rng.int(0, g.fight.hand.length - 1)]
    return { id: c.id, line: c.kind === 'attack' ? rng.int(0, linesOf(g.fight.spectrum) - 1) : undefined }
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
    const lines = Array.from({ length: linesOf(g.fight.spectrum) }, (_, k) => ({ k, closed: d0 - distanceOf(resolve(g.fight, c, k).spectrum, g.fight.commission.chord) }))
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

function game(i: number, policy: Policy, commission: Commission): Stat {
  const rng = makeRng(424242 + i)
  let g = newGame(1000 + i, settings, commission, DECK)
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

// --set '{"feed":{"fire":4},"attacks":["waxing-gibbous"]}' changes the fight's terms, for tuning.
const fights = (FIGHT === 'all' ? COMMISSIONS : COMMISSIONS.filter((c) => c.key === FIGHT)).map((c) => (arg('--set') ? { ...c, ...JSON.parse(arg('--set')!) } : c))
console.log(`${GAMES} games each (the lookahead ${Math.min(GAMES, AHEAD)}) · ${settings.stock} quintessence · draw ${settings.hand} at new and full moons, discard at the quarters${settings.tolerance !== undefined ? ` · win at ${settings.tolerance ? `within ${settings.tolerance}` : 'a complete match'}` : ''}`)
for (const commission of fights) {
  console.log('')
  console.log(`**${commission.name}** (${commission.rank}): ${distanceOf(commission.start, commission.chord)} off at the start`)
  console.log('')
  console.log('Strategy | Won | Flares, 1st to 4th | Quintessence left (won) | Cards played | Moons | Off by, when lost | Charge left (won) | Plays: drain, attack, strengthened attack, power, wasted')
  console.log('--- | --- | --- | --- | --- | --- | --- | --- | ---')
  for (const [name, policy, n] of [
    ['Greedy', greedy, GAMES],
    ['Planner', planner, Math.min(GAMES, PLAN)],
    ['Lookahead', lookahead, Math.min(GAMES, AHEAD)],
  ] as [string, Policy, number][]) {
    if (!n) continue
    const s = Array.from({ length: n }, (_, i) => game(i, policy, commission))
    const w = s.filter((x) => x.won)
    const l = s.filter((x) => !x.won)
    const each = [0, 1, 2, 3].map((k) => {
      const xs = s.filter((x) => x.flares.length > k).map((x) => x.flares[k])
      return xs.length >= n / 10 ? mean(xs).toFixed(1) : '–'
    })
    const total = mean(s.map((x) => x.plays))
    const kinds = ['drain', 'attack', 'strong', 'power', 'idle'].map((k) => pct(mean(s.map((x) => x.kinds[k])), total))
    console.log(
      `${name} | ${pct(w.length, n)} | ${each.join(', ')} | ${w.length ? mean(w.map((x) => x.left)).toFixed(1) : '–'} | ${mean(s.map((x) => x.plays)).toFixed(1)} | ${mean(s.map((x) => x.moons)).toFixed(2)} | ${l.length ? mean(l.map((x) => x.dist)).toFixed(1) : '–'} | ${w.length ? mean(w.map((x) => x.charge)).toFixed(1) : '–'} | ${kinds.join(', ')}`,
    )
  }
}
