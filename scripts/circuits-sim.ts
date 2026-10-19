// Simulated players for the circuits prototype, to compare ways of playing a
// run. Each strategy decides what to do in a fight and what to take between
// fights:
//
// - greedy: plays, brews or waits for whatever looks best right now (purified
//   so far, quintessence kept, the pool it would face, helpers, Ward, cards in
//   hand); brews whenever that looks good, buys every rune its metal allows.
// - random: any legal move at random; random runes on random cards.
// - delay: in the fights before the boss, keeps the fight going to gather
//   principles (metal later) as long as doing so doesn't lose: a move is
//   allowed only if, after it, playing greedy would still finish the fight
//   with at least `reserve` quintessence left. Among allowed moves that don't
//   finish the fight it takes the most principles, else the move that purifies
//   least (cycling a card that takes nothing before waiting). When no move is
//   allowed it plays greedy. Between fights it buys runes like greedy.
//
// The engine is deterministic given the run (the seed travels in it), so the
// greedy look-ahead is exact.
//
//   npx tsx scripts/circuits-sim.ts [--strategy greedy|random|delay] [--reserve 1] [--delay-in 0,1,2] [--runs 300]
//   npx tsx scripts/circuits-sim.ts --compare [--runs 300]   every strategy side by side
//
// Every run opens with the draft of a twelfth rune: greedy and delay take the
// one the balance simulator (scripts/circuits-balance.ts) found worth most,
// random takes any.
//   (also --no-draft: the eleven opening cards, no twelfth rune; --picks need|wet: inputs for what the coming commissions feed, or only water and earth;
//    --hand 4, --stock 80)

import { makeRng, type Rng } from '../src/sim/rng'
import { apply, greedyMove, moves, rollout, type Move } from './circuits-players'
import type { Elemental } from '../src/sim/types'
import {
  COMMISSIONS,
  DEFAULT_SETTINGS,
  EXTRA_RUNE_PRICE,
  PRINCIPLES,
  TICKS,
  draftPick,
  fits,
  newRun,
  nextFight,
  takeRune,
  type Run,
  type Settings,
} from '../src/circuits/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const runs = Number(arg('--runs') ?? 300)
/** Which inputs the rune picks favour: what the coming commissions feed, or only water and earth. */
const picks = (arg('--picks') ?? 'need') as 'need' | 'wet'
/** Skip the opening draft: the eleven opening cards only. */
const noDraft = args.includes('--no-draft')
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  hand: Number(arg('--hand') ?? DEFAULT_SETTINGS.hand),
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
}

const principleCount = (r: Run) => PRINCIPLES.reduce((n, p) => n + r.fight.principles[p], 0)
/** The fight that `before` was in has ended in `after`. */
const ended = (before: Run, after: Run) => after.stage !== 'fight' || after.fightIndex !== before.fightIndex
const won = (r: Run) => r.stage === 'reward' || r.stage === 'won'
/** Runes added so far: one for each part beyond a card's first two, one for each card. */
const parts = (r: Run) => r.deck.reduce((n, c) => n + c.channels.length + c.gain + c.outputs.length + c.ground - 1, 0)

// ---------------------------------------------------------------------------
// Strategies

interface Strategy {
  name: string
  move(r: Run, rng: Rng): Move
  reward(r: Run, rng: Rng): Run
  draft(r: Run, rng: Rng): Run
}

/** Greedy drafts the rune the balance simulator found worth most. */
function greedyDraft(r: Run): Run {
  const offers = r.draft!.offers
  return draftPick(r, offers.reduce((best, o, i) => (o.worth > offers[best].worth ? i : best), 0))
}

const randomDraft = (r: Run, rng: Rng) => draftPick(r, rng.int(0, r.draft!.offers.length - 1))

/**
 * Between fights: the free rune and as many more as metal buys. Gains first;
 * then inputs, the element the coming commissions feed most for what the deck
 * can already take first; then distilling, then grounds.
 */
function greedyReward(r: Run): Run {
  let run = r
  const ahead = COMMISSIONS.slice(r.fightIndex + 1)
  const need = (e: Elemental | 'any') => {
    if (picks === 'wet') return e === 'water' || e === 'earth' ? 4 : 0
    if (e === 'any') return 0.5
    const fed = ahead.reduce((n, c) => n + (c.feed[e] ?? 0) + (c.buffFeed?.[e] ?? 0), 0)
    const cap = run.deck.reduce((n, c) => n + c.channels.filter((ch) => ch.element === e).reduce((k, ch) => k + ch.capacity, 0), 0)
    return fed / (1 + cap / 5)
  }
  const rank = (o: Run['offer'][number]) => (o.kind === 'gain' ? 0 : o.kind === 'card' ? 1 : o.kind === 'channel' ? 2 - Math.min(1, need(o.element) / 4) : o.kind === 'distill' ? 2 : 3)
  for (let guard = 0; guard < 5 && run.offer.length; guard++) {
    if (run.tookFree && run.metals < EXTRA_RUNE_PRICE) break
    const order = run.offer.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o))
    let done = false
    for (const { o, i } of order) {
      if (o.kind === 'card') {
        run = takeRune(run, i)
        done = true
        break
      }
      const cards = run.deck.filter((c) => fits(o, c))
      if (!cards.length) continue
      // Gains and distillers go on the water cards (the first commissions feed water most), channels on a card of another element.
      const pick =
        o.kind === 'channel'
          ? (cards.find((c) => !c.channels.some((ch) => ch.element === o.element)) ?? cards[0])
          : (cards.find((c) => c.channels[0].element === 'water') ?? cards[0])
      run = takeRune(run, i, pick.id)
      done = true
      break
    }
    if (!done) break
  }
  return nextFight(run)
}

const greedy: Strategy = { name: 'greedy', move: greedyMove, reward: greedyReward, draft: greedyDraft }

const random: Strategy = {
  name: 'random',
  draft: randomDraft,
  move: (r, rng) => {
    const ms = moves(r)
    return ms[rng.int(0, ms.length - 1)]
  },
  reward: (r, rng) => {
    let run = r
    for (let guard = 0; guard < 5 && run.offer.length; guard++) {
      if (run.tookFree && (run.metals < EXTRA_RUNE_PRICE || rng.float() < 0.5)) break
      const pairs = run.offer.flatMap((o, i) => (o.kind === 'card' ? [{ i, id: undefined as number | undefined }] : run.deck.filter((c) => fits(o, c)).map((c) => ({ i, id: c.id as number | undefined }))))
      if (!pairs.length) break
      const p = pairs[rng.int(0, pairs.length - 1)]
      run = takeRune(run, p.i, p.id)
    }
    return nextFight(run)
  },
}

function delay(reserve: number, delayIn: number[]): Strategy {
  return {
    name: `delay, keep ${reserve}`,
    reward: greedyReward,
    draft: greedyDraft,
    move: (r) => {
      if (!delayIn.includes(r.fightIndex)) return greedyMove(r)
      const have = principleCount(r)
      let best: Move | null = null
      let bestScore = -Infinity
      for (const m of moves(r)) {
        if (m.kind === 'brew') continue // brewing spends the principles it is gathering
        const after = apply(r, m)
        if (ended(r, after)) continue // finishing is not delaying
        const end = rollout(after)
        if (!won(end) || end.quintessence < reserve) continue
        const gained = principleCount(after) - have
        const purified = after.fight.purified - r.fight.purified
        const score = 100 * gained - purified + (m.kind === 'card' ? 0.5 : 0)
        if (score > bestScore) {
          best = m
          bestScore = score
        }
      }
      return best ?? greedyMove(r)
    },
  }
}

// ---------------------------------------------------------------------------
// Playing runs

type FightStat = {
  reached: boolean
  won: boolean
  paid: number
  metal: number
  runes: number
  quintIn: number
  moons: number
  plays: number
  waits: number
  brews: number
  /** Flares, and how many cost nothing. */
  flares: number
  blocked: number
  /** The most one card purified. */
  best: number
}
const freshStat = (q: number): FightStat => ({ reached: true, won: false, paid: 0, metal: 0, runes: 0, quintIn: q, moons: 0, plays: 0, waits: 0, brews: 0, flares: 0, blocked: 0, best: 0 })

interface Result {
  name: string
  runsWon: number
  quintLeft: number[]
  fights: FightStat[][]
}

function play(strategy: Strategy, n = runs): Result {
  const fights: FightStat[][] = COMMISSIONS.map(() => [])
  const quintLeft: number[] = []
  const byDraft = new Map<string, { n: number; won: number }>()
  let runsWon = 0
  for (let i = 0; i < n; i++) {
    const rng = makeRng(90000 + i)
    let r = newRun(7000 + i, settings, { draft: !noDraft })
    let stat = freshStat(r.quintessence)
    let drafted = 'none'
    for (let guard = 0; guard < 3000; guard++) {
      if (r.stage === 'draft') {
        r = strategy.draft(r, rng)
        const o = r.deck[r.deck.length - 1]
        const out = o.outputs.find((x) => x.kind !== 'principle')
        drafted = `${o.channels[0].element} ${o.channels[0].capacity} → ${o.purifies ? 'purify' : o.ground ? 'ground' : out?.kind === 'status' ? out.status : out?.kind}`
      }
      else if (r.stage === 'fight') {
        const m = strategy.move(r, rng)
        const next = apply(r, m)
        if (m.kind === 'card') stat.plays++
        if (m.kind === 'wait') stat.waits++
        if (m.kind === 'brew') stat.brews++
        if (m.kind === 'card') stat.best = Math.max(stat.best, (won(next) ? next.fight.commission.require : next.fight.purified) - r.fight.purified)
        if (next.fightIndex === r.fightIndex) {
          const newFlares = next.fight.flares.slice(r.fight.flares.length)
          if (newFlares.length) {
            stat.flares += newFlares.length
            if (r.quintessence === next.quintessence) stat.blocked += newFlares.length
          }
        }
        if (ended(r, next)) {
          stat.won = won(next)
          stat.paid = next.fight.paid
          stat.moons = next.fight.dial / TICKS
          stat.metal = next.smelted?.value ?? 0
          fights[r.fightIndex].push(stat)
        }
        r = next
      } else if (r.stage === 'reward') {
        const before = r
        r = strategy.reward(r, rng)
        fights[before.fightIndex][fights[before.fightIndex].length - 1].runes = parts(r) - parts(before)
        stat = freshStat(r.quintessence)
      } else break
    }
    if (r.stage === 'won') {
      runsWon++
      quintLeft.push(r.quintessence)
    }
    const d = byDraft.get(drafted) ?? { n: 0, won: 0 }
    byDraft.set(drafted, { n: d.n + 1, won: d.won + (r.stage === 'won' ? 1 : 0) })
  }
  if (args.includes('--by-draft')) {
    const by = [...byDraft.entries()].sort((a, b) => b[1].n - a[1].n)
    console.log(by.map(([k, e]) => `  ${k}: ${e.n} runs, won ${Math.round((100 * e.won) / e.n)}%`).join('\n'))
  }
  return { name: strategy.name, runsWon, quintLeft, fights }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN)
const pct = (n: number, d: number) => `${d ? Math.round((100 * n) / d) : 0}%`

function report(res: Result) {
  console.log(`\n${res.name}: runs won ${pct(res.runsWon, runs)} · quintessence left median ${med(res.quintLeft)}`)
  COMMISSIONS.forEach((c, i) => {
    const s = res.fights[i]
    if (!s.length) return console.log(`  ${c.name}: never reached`)
    console.log(
      `  ${c.name}: reached ${pct(s.length, runs)}, won ${pct(s.filter((x) => x.won).length, s.length)} · came in with ${mean(s.map((x) => x.quintIn)).toFixed(0)} · paid ${mean(s.map((x) => x.paid)).toFixed(1)} · metal ${mean(s.map((x) => x.metal)).toFixed(1)} · runes after ${mean(s.map((x) => x.runes)).toFixed(1)} · moons ${mean(s.map((x) => x.moons)).toFixed(1)} · cards ${mean(s.map((x) => x.plays)).toFixed(1)} · waits ${mean(s.map((x) => x.waits)).toFixed(1)} · brews ${mean(s.map((x) => x.brews)).toFixed(1)} · flares ${mean(s.map((x) => x.flares)).toFixed(1)}, fully blocked ${pct(s.reduce((n, x) => n + x.blocked, 0), s.reduce((n, x) => n + x.flares, 0))} · best play ${mean(s.map((x) => x.best)).toFixed(1)}`,
    )
  })
}

function row(res: Result): string {
  const f = res.fights
  const last = COMMISSIONS.length - 1
  const cell = (i: number, fn: (s: FightStat[]) => string) => (f[i].length ? fn(f[i]) : '–')
  return [
    res.name,
    pct(res.runsWon, runs),
    ...COMMISSIONS.slice(0, last).flatMap((_, i) => [cell(i, (s) => mean(s.map((x) => x.paid)).toFixed(1)), cell(i, (s) => mean(s.map((x) => x.metal)).toFixed(1))]),
    cell(last, (s) => `${pct(s.length, runs)} with ${mean(s.map((x) => x.quintIn)).toFixed(0)}`),
    cell(last, (s) => pct(s.filter((x) => x.won).length, s.length)),
    String(med(res.quintLeft)),
  ].join(' | ')
}

function header(): string {
  const last = COMMISSIONS.length - 1
  const cols = ['Strategy', 'Runs won', ...COMMISSIONS.slice(0, last).flatMap((c) => [`${c.name}: paid`, 'metal']), `Reached ${COMMISSIONS[last].name}, with`, 'won', 'Left (median)']
  return `${cols.join(' | ')}\n${cols.map(() => '---').join(' | ')}`
}

const delayIn = (arg('--delay-in') ?? COMMISSIONS.slice(0, -1).map((_, i) => i).join(',')).split(',').map(Number)
const reserve = Number(arg('--reserve') ?? 1)

console.log(`${runs} runs · draw ${settings.hand} at new and full moons, discard at the quarters · stock ${settings.stock}`)
if (args.includes('--compare')) {
  const early = COMMISSIONS.slice(0, -1).map((_, i) => i)
  const list: Strategy[] = [
    random,
    greedy,
    ...[1, 15, 25, 30, 35].map((k) => ({ ...delay(k, early), name: `delay before the boss, keep ${k}` })),
    ...[30, 35].map((k) => ({ ...delay(k, [0]), name: `delay in ${COMMISSIONS[0].name} only, keep ${k}` })),
  ]
  console.log(`\n${header()}`)
  for (const s of list) console.log(row(play(s)))
} else {
  const name = arg('--strategy') ?? 'greedy'
  const s = name === 'random' ? random : name === 'delay' ? delay(reserve, delayIn) : greedy
  report(play(s))
}
