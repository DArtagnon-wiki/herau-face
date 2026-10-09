// A simple, decent player run through many commissions, to check the numbers
// against the doc's difficulty targets. Not optimal; roughly a player who
// knows the rules and plays greedily within a term: it keeps casting the best
// sigil while that beats ending the term, then ends it.
//
//   npm run simulate                       default settings
//   npm run simulate -- --games 500 --hand 6 --casts 2 --flare 1.25 --no-strain --capped --naive

import { totalKg } from '../src/sim/alchemy'
import { constrained, miss, shares } from '../src/sim/commission'
import {
  DEFAULT_SETTINGS,
  cast,
  castsLeft,
  discardRunes,
  endTerm,
  newGame,
  previewCast,
  previewEnd,
  sigilsPlayed,
  termsUsed,
  type EndOutcome,
  type GameState,
  type Settings,
  standardSetup,
} from '../src/sim/game'
import { balance, metricsOf } from '../src/sim/metrics'
import { candidatePools, canJoin } from '../src/sim/sigil'
import { imbalance } from '../src/sim/table'
import type { JoinKind, Rune, Sigil } from '../src/sim/types'
import { ELEMENTALS, poolKey } from '../src/sim/alchemy'

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
  castsPerTerm: Number(arg('--casts') ?? DEFAULT_SETTINGS.castsPerTerm),
  strain: !args.includes('--no-strain'),
  surplusForce: !args.includes('--capped'),
}
/** --naive: a player who never wards on purpose. */
const naive = args.includes('--naive')
/** --no-organics: the old two-element mud and an earth-only target, for comparison. */
const noOrganics = args.includes('--no-organics')
const setup = standardSetup()
if (noOrganics) {
  setup.start = setup.start.filter((p) => p.elemental === 'earth' || p.elemental === 'water')
  setup.target.air = { min: 0, max: 1 }
  setup.target.fire = { min: 0, max: 1 }
}

/** Small pull toward the middle of each band, so the player keeps a margin. */
function centering(state: GameState, pools: EndOutcome['pools']): number {
  const s = shares(pools)
  let total = 0
  for (const e of ELEMENTALS) {
    const r = state.target[e]
    if (!constrained(r) || r.min <= 0 || r.max >= 1) continue
    total += Math.abs(s[e] - (r.min + r.max) / 2) / (r.max - r.min)
  }
  return total
}

function evalEnd(state: GameState, end: EndOutcome): number {
  return -miss(end.pools, state.target) * 30 - centering(state, end.pools) * 2 - end.paid * (naive ? 0 : 3) - imbalance(end.table) * 0.3
}

/** Every sigil the hand can make, within the link limits. */
function* sigils(hand: Rune[]): Generator<Sigil> {
  const kinds: JoinKind[] = ['circumscribe', 'side', 'entwine', 'inscribe']
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
      for (const kind of kinds) yield* grow(i + 1, { anchor, joins: [...s.joins, { kind, rune: r }] })
    }
    yield* grow(0, { anchor, joins: [] })
  }
}

function bestCast(state: GameState): { sigil: Sigil; poolKey?: string; score: number } | null {
  let best: { sigil: Sigil; poolKey?: string; score: number } | null = null
  for (const s of sigils(state.hand)) {
    const keys = candidatePools(s, state.pools).map(poolKey)
    for (const key of keys.length > 1 ? keys : [undefined]) {
      const p = previewCast(state, s, key)
      const v = p.cast.finished ? 10000 + totalKg(p.cast.pools) : evalEnd(state, p.end!)
      if (!best || v > best.score) best = { sigil: s, poolKey: key, score: v }
    }
  }
  return best
}

function play(seed: number) {
  let s = newGame(settings, seed, { ...setup, start: setup.start.map((p) => ({ ...p })) })
  let discardsUsed = 0
  let wardOnly = 0
  let casts = 0
  for (let guard = 0; guard < 200 && s.phase === 'compose'; guard++) {
    const endNow = evalEnd(s, previewEnd(s))
    const best = castsLeft(s) > 0 && s.hand.length ? bestCast(s) : null
    if (best && best.score > endNow + 0.01) {
      if (!best.sigil.joins.some((j) => j.kind === 'circumscribe' || j.kind === 'inscribe')) wardOnly++
      casts++
      s = cast(s, best.sigil, best.poolKey)
      continue
    }
    if (s.casts.length === 0 && s.discardsLeft > 0) {
      const sh = shares(s.pools)
      const t = s.target
      const needed = new Set<string>(['water', 'earth', 'none'])
      if (sh.air >= t.air.max) needed.add('air')
      if (sh.fire >= t.fire.max) needed.add('fire')
      const drop = s.hand.filter((r) => !needed.has(r.affinity)).map((r) => r.id)
      if (drop.length) {
        s = discardRunes(s, drop)
        discardsUsed++
        continue
      }
    }
    s = endTerm(s)
  }
  return { state: s, discardsUsed, wardOnly, casts }
}

const pct = (xs: number[], p: number) => {
  const sorted = xs.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const f1 = (n: number) => n.toFixed(1)

console.log(
  `${games} commissions · hand ${settings.handSize} · ${settings.castsPerTerm || 'any number of'} sigil${settings.castsPerTerm === 1 ? '' : 's'} a term · flare ×${settings.flareScale} · stock ${settings.stock} · strain ${settings.strain ? 'on' : 'off'} · surplus Force ${settings.surplusForce ? 'multiplies' : 'capped'}${naive ? ' · naive player' : ''}${noOrganics ? ' · no organics' : ''}\n`,
)
const runs = Array.from({ length: games }, (_, i) => play(1000 + i))
const spent = runs.map((r) => r.state.spent)
const terms = runs.map((r) => termsUsed(r.state))
const won = runs.filter((r) => r.state.phase === 'won')
const buckets = [
  ['0', (x: number) => x === 0],
  ['1–5', (x: number) => x > 0 && x <= 5],
  ['6–15', (x: number) => x > 5 && x <= 15],
  ['16–30', (x: number) => x > 15 && x <= 30],
  ['31–50', (x: number) => x > 30 && x <= 50],
  ['>50', (x: number) => x > 50],
] as const
console.log(`won ${Math.round((100 * won.length) / games)}%  spent median ${pct(spent, 50)}, p90 ${pct(spent, 90)}  terms median ${pct(terms, 50)}, p90 ${pct(terms, 90)}  clay ${f1(mean(won.map((r) => totalKg(r.state.pools))))} kg`)
console.log(buckets.map(([label, f]) => `${label}: ${Math.round((100 * spent.filter(f).length) / games)}%`).join('  '))
console.log(`sigils a term ${f1(mean(runs.map((r) => r.casts / Math.max(1, termsUsed(r.state)))))} · defence-only sigils ${f1(mean(runs.map((r) => r.wardOnly)))} · discards used ${f1(mean(runs.map((r) => r.discardsUsed)))}`)

// Table metrics at the end of each commission, averaged.
const played = runs.map((r) => metricsOf(sigilsPlayed(r.state)))
const onTable = runs.map((r) => metricsOf(r.state.table.map((e) => e.sigil)))
console.log('\nPer commission, played:')
console.log(`  bodies   circles ${f1(mean(played.map((m) => m.bodies.circle)))} · crescents ${f1(mean(played.map((m) => m.bodies.crescent)))} · triangles ${f1(mean(played.map((m) => m.bodies.triangle)))} · sides ${f1(mean(played.map((m) => m.sides)))}`)
console.log(`  gems     water ${f1(mean(played.map((m) => m.motes.water)))} · earth ${f1(mean(played.map((m) => m.motes.earth)))} · air ${f1(mean(played.map((m) => m.motes.air)))} · fire ${f1(mean(played.map((m) => m.motes.fire)))}`)
console.log('Imbalance on the table at the end (Earth − Air, Water − Fire, total):')
for (const measure of ['runes', 'motes', 'sides'] as const) {
  const b = onTable.map((m) => balance(m, measure))
  console.log(`  ${(measure === 'motes' ? 'gems' : measure).padEnd(6)} ${f1(mean(b.map((x) => x.earthAir)))}, ${f1(mean(b.map((x) => x.waterFire)))}, ${f1(mean(b.map((x) => x.total)))}`)
}
