// A simple, decent player run through many mud-to-clay commissions, to check
// the numbers against the doc's difficulty targets. Not optimal; roughly a
// player who knows the rules and plays one term ahead.
//
//   npm run simulate                       default settings
//   npm run simulate -- --games 500 --flare 1.25 --no-strain --capped

import { totalKg } from '../src/sim/alchemy'
import { CLAY_BAND, earthShare } from '../src/sim/commission'
import { DEFAULT_SETTINGS, cast, discardRunes, newGame, previewTerm, type GameState, type Settings } from '../src/sim/game'
import { canJoin } from '../src/sim/sigil'
import { imbalance } from '../src/sim/table'
import { balance, metricsOf } from '../src/sim/metrics'
import type { JoinKind, Rune, Sigil } from '../src/sim/types'

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const games = Number(arg('--games') ?? 300)
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  flareScale: Number(arg('--flare') ?? DEFAULT_SETTINGS.flareScale),
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
  handSize: Number(arg('--hand') ?? DEFAULT_SETTINGS.handSize),
  strain: !args.includes('--no-strain'),
  surplusForce: !args.includes('--capped'),
}
/** --naive: a player who never wards on purpose. */
const naive = args.includes('--naive')

const mid = (CLAY_BAND[0] + CLAY_BAND[1]) / 2

function score(state: GameState, sigil: Sigil, poolKey?: string): number {
  const t = previewTerm(state, sigil, poolKey)
  if (t.finished) return 10000 - t.paid * 10 + totalKg(t.pools)
  const over = Math.max(0, t.share - CLAY_BAND[1])
  const paidWeight = naive ? 0 : 3
  return -Math.abs(t.share - mid) * 300 - over * 2000 - t.paid * paidWeight - imbalance(t.table) * 0.3
}

/** Every sigil the hand can make, within the link limits. */
function* sigils(hand: Rune[], from: string, to: string): Generator<Sigil> {
  const kinds: JoinKind[] = ['circumscribe', 'side', 'entwine']
  for (const anchor of hand) {
    const rest = hand.filter((r) => r !== anchor)
    const grow = function* (i: number, s: Sigil): Generator<Sigil> {
      if (i === rest.length) {
        yield s
        return
      }
      yield* grow(i + 1, s)
      const r = rest[i]
      if (!canJoin(s, r)) return
      for (const kind of kinds) {
        if (kind === 'circumscribe' && !(anchor.affinity === from && (r.affinity === to || r.affinity === 'none'))) continue
        yield* grow(i + 1, { anchor, joins: [...s.joins, { kind, rune: r }] })
      }
    }
    yield* grow(0, { anchor, joins: [] })
  }
}

function bestSigil(state: GameState): { sigil: Sigil; poolKey?: string; score: number; transmutes: boolean } {
  const over = earthShare(state.pools) > CLAY_BAND[1]
  const from = over ? 'earth' : 'water'
  const to = over ? 'water' : 'earth'
  const poolKey = over ? 'earth:0' : undefined
  let best: { sigil: Sigil; poolKey?: string; score: number; transmutes: boolean } | null = null
  for (const s of sigils(state.hand, from, to)) {
    const v = score(state, s, poolKey)
    if (!best || v > best.score) best = { sigil: s, poolKey, score: v, transmutes: s.joins.some((j) => j.kind === 'circumscribe') }
  }
  return best!
}

function play(seed: number) {
  let s = newGame(settings, seed)
  let discardsUsed = 0
  let wardOnlyTerms = 0
  for (let guard = 0; guard < 60 && s.phase === 'compose'; guard++) {
    const hasWater = s.hand.some((r) => r.affinity === 'water')
    const hasEarth = s.hand.some((r) => r.affinity === 'earth')
    if ((!hasWater || !hasEarth) && s.discardsLeft > 0) {
      const drop = s.hand.filter((r) => r.affinity === 'air' || r.affinity === 'fire').map((r) => r.id)
      if (drop.length) {
        s = discardRunes(s, drop)
        discardsUsed++
        continue
      }
    }
    const best = bestSigil(s)
    if (!best.transmutes) wardOnlyTerms++
    s = cast(s, best.sigil, best.poolKey)
  }
  return { state: s, discardsUsed, wardOnlyTerms }
}

const pct = (xs: number[], p: number) => {
  const sorted = xs.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1)

console.log(
  `${games} commissions · flare ×${settings.flareScale} · stock ${settings.stock} · hand ${settings.handSize} · strain ${settings.strain ? 'on' : 'off'} · surplus Force ${settings.surplusForce ? 'multiplies' : 'capped'}${naive ? ' · naive player' : ''}\n`,
)
const runs = Array.from({ length: games }, (_, i) => play(1000 + i))
const spent = runs.map((r) => r.state.spent)
const terms = runs.map((r) => r.state.history.length)
const won = runs.filter((r) => r.state.phase === 'won')
const buckets = [
  ['0', (x: number) => x === 0],
  ['1–5', (x: number) => x > 0 && x <= 5],
  ['6–15', (x: number) => x > 5 && x <= 15],
  ['16–30', (x: number) => x > 15 && x <= 30],
  ['31–50', (x: number) => x > 30 && x <= 50],
  ['>50', (x: number) => x > 50],
] as const
console.log(`won ${Math.round((100 * won.length) / games)}%  spent median ${pct(spent, 50)}, p90 ${pct(spent, 90)}  terms median ${pct(terms, 50)}, p90 ${pct(terms, 90)}  clay ${avg(won.map((r) => totalKg(r.state.pools)))} kg`)
console.log(buckets.map(([label, f]) => `${label}: ${Math.round((100 * spent.filter(f).length) / games)}%`).join('  '))
console.log(`discards used ${avg(runs.map((r) => r.discardsUsed))} · ward-only terms ${avg(runs.map((r) => r.wardOnlyTerms))}`)

// Table metrics at the end of each commission, averaged.
const played = runs.map((r) => metricsOf(r.state.history.map((t) => t.sigil)))
const onTable = runs.map((r) => metricsOf(r.state.table.map((e) => e.sigil)))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const f1 = (n: number) => n.toFixed(1)
console.log('\nPer commission, played:')
console.log(`  bodies   circles ${f1(mean(played.map((m) => m.bodies.circle)))} · crescents ${f1(mean(played.map((m) => m.bodies.crescent)))} · triangles ${f1(mean(played.map((m) => m.bodies.triangle)))} · sides ${f1(mean(played.map((m) => m.sides)))}`)
console.log(`  gems     water ${f1(mean(played.map((m) => m.motes.water)))} · earth ${f1(mean(played.map((m) => m.motes.earth)))} · air ${f1(mean(played.map((m) => m.motes.air)))} · fire ${f1(mean(played.map((m) => m.motes.fire)))}`)
console.log('Imbalance on the table at the end (Earth − Air, Water − Fire, total):')
for (const measure of ['runes', 'motes', 'sides'] as const) {
  const b = onTable.map((m) => balance(m, measure))
  console.log(`  ${(measure === 'motes' ? 'gems' : measure).padEnd(6)} ${f1(mean(b.map((x) => x.earthAir)))}, ${f1(mean(b.map((x) => x.waterFire)))}, ${f1(mean(b.map((x) => x.total)))}`)
}
