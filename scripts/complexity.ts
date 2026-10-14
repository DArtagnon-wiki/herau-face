// How much deciding a hand takes: every legal sigil at each decision the
// simulated player faces, how many distinct results they give, and how many
// come close to the best. Run: npx tsx scripts/complexity.ts --deck opening|mid|late [--games N]

import { totalKg } from '../src/sim/alchemy'
import { miss } from '../src/sim/commission'
import { cast, castsLeft, endTerm, newGame, previewCast, previewEnd, DEFAULT_SETTINGS, type EndOutcome, type GameState } from '../src/sim/game'
import { canJoin } from '../src/sim/sigil'
import type { JoinKind, Rune, Sigil } from '../src/sim/types'
import { poolKey } from '../src/sim/alchemy'
import { presetByKey } from '../src/sim/presets'
import { expectedThreat } from '../src/sim/commission'
import { DEFAULT_EQUATION, sourcePools } from '../src/sim/equation'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const preset = presetByKey(arg('--deck') ?? 'opening')!
const games = Number(arg('--games') ?? 20)
const settings = { ...DEFAULT_SETTINGS, equation: DEFAULT_EQUATION, handSize: preset.handSize }
const KINDS: JoinKind[] = ['circumscribe', 'side', 'entwine', 'inscribe', 'tangent']
/** Sigils with more joins than this aren't enumerated (late hands have millions). */
const MAX_ENUM = Number(arg('--max') ?? 60000)

const evalEnd = (s: GameState, end: EndOutcome) => -miss(end.pools, s.target) * 60 - end.paid * 3 - 1.5 * expectedThreat(end.pools, end.table, s.settings, s.commission, s.term + 1)

/** Legal sigils (each set of joins once, order ignored): Σ over anchors Σ_k C(n,k)·5^k, k ≤ links. */
function rawCount(hand: Rune[]): number {
  const C = (n: number, k: number) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c }
  let total = 0
  for (const a of hand) for (let k = 0; k <= Math.min(a.links, hand.length - 1); k++) total += C(hand.length - 1, k) * 5 ** k
  return total
}

function* sigils(hand: Rune[]): Generator<Sigil> {
  for (const anchor of hand) {
    const rest = hand.filter((r) => r !== anchor)
    const grow = function* (i: number, s: Sigil): Generator<Sigil> {
      if (i === rest.length) return yield s
      yield* grow(i + 1, s)
      if (!canJoin(s, rest[i])) return
      for (const kind of KINDS) yield* grow(i + 1, { anchor, joins: [...s.joins, { kind, rune: rest[i] }] })
    }
    yield* grow(0, { anchor, joins: [] })
  }
}

const spec = (r: Rune) => `${r.body}:${r.rarity}:${r.motes.map((m) => m.elemental ?? m.kind).join(',')}`
const key = (s: Sigil) => `${spec(s.anchor)}|${s.joins.map((j) => `${j.kind}:${spec(j.rune)}`).sort().join(';')}`
const outcome = (pools: { elemental: string; grade: number; kg: number }[], ward: number) =>
  pools.filter((p) => p.kg > 0.05).map((p) => `${p.elemental}${p.grade}:${p.kg.toFixed(1)}`).sort().join(' ') + `|w${ward.toFixed(0)}`

const med = (xs: number[]) => { const a = xs.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN }
const mean = (xs: number[]) => { const a = xs.filter((x) => !Number.isNaN(x)); return a.reduce((p, q) => p + q, 0) / Math.max(1, a.length) }
type Row = { raw: number; distinct: number; outcomes: number; useful: number; near1: number; near5: number; nearSpread: number; joins: number; simpleLoss: number; taps: number }
const rows: Row[] = []
const lateRaw: number[] = []

for (let g = 0; g < games; g++) {
  let s = newGame(settings, 5000 + g, preset.setup())
  for (let guard = 0; guard < 60 && s.phase === 'compose'; guard++) {
    if (!s.hand.length || castsLeft(s) <= 0) { s = endTerm(s); continue }
    const raw = rawCount(s.hand)
    if (raw > MAX_ENUM) { lateRaw.push(raw); s = endTerm(s); continue }
    const endNow = evalEnd(s, previewEnd(s))
    const seen = new Map<string, { sigil: Sigil; pool?: string; v: number; out: string }>()
    for (const sg of sigils(s.hand)) {
      const k = key(sg)
      if (seen.has(k)) continue
      const keys = sourcePools(sg, s.pools).map(poolKey)
      let best: { sigil: Sigil; pool?: string; v: number; out: string } | null = null
      for (const pk of keys.length > 1 ? keys : [undefined]) {
        const p = previewCast(s, sg, pk)
        const v = p.cast.finished ? 10000 : evalEnd(s, p.end!)
        if (!best || v > best.v) best = { sigil: sg, pool: pk, v, out: outcome(p.cast.pools, p.cast.resolution.outputs.ward) }
      }
      seen.set(k, best!)
    }
    const all = [...seen.values()]
    const top = all.reduce((a, b) => (b.v > a.v ? b : a))
    if (castsLeft(s) <= 0 || top.v <= endNow + 0.01) { s = endTerm(s); continue }
    const byOut = new Map<string, number>()
    for (const x of all) byOut.set(x.out, Math.max(byOut.get(x.out) ?? -Infinity, x.v))
    const outs = [...byOut.values()]
    const simple = all.filter((x) => x.sigil.joins.length <= 1).reduce((a, b) => (b.v > a.v ? b : a))
    rows.push({
      raw, distinct: all.length, outcomes: outs.length,
      useful: outs.filter((v) => v > endNow + 0.01).length,
      near1: outs.filter((v) => v >= top.v - 3).length,
      near5: outs.filter((v) => v >= top.v - 15).length,
      // Unit-free: results within a tenth of the gap between the best and the median result (NaN when the best finishes).
      nearSpread: top.v >= 10000 ? NaN : outs.filter((v) => v >= top.v - 0.1 * (top.v - med(outs))).length,
      joins: top.sigil.joins.length,
      simpleLoss: top.v >= 10000 ? (simple.v >= 10000 ? 0 : NaN) : (top.v - simple.v) / 3,
      taps: 1 + 2 * top.sigil.joins.length + (sourcePools(top.sigil, s.pools).length > 1 ? 1 : 0),
    })
    s = cast(s, top.sigil, top.pool)
  }
}

console.log(`${preset.name} · hand ${preset.handSize} · ${rows.length} decisions in ${games} commissions`)
if (rows.length) {
  console.log(`legal sigils median ${med(rows.map((r) => r.raw))} · distinct by rune type ${med(rows.map((r) => r.distinct))} · distinct results ${med(rows.map((r) => r.outcomes))} · results that beat ending the term ${med(rows.map((r) => r.useful))}`)
  console.log(`results within 1 quintessence of the best ${med(rows.map((r) => r.near1))} (mean ${mean(rows.map((r) => r.near1)).toFixed(1)}) · within 5 ${med(rows.map((r) => r.near5))} · within a tenth of the best-to-median gap ${med(rows.map((r) => r.nearSpread))} (mean ${mean(rows.map((r) => r.nearSpread)).toFixed(1)})`)
  console.log(`best sigil's joins: mean ${mean(rows.map((r) => r.joins)).toFixed(1)} · share with 2+ joins ${(100 * rows.filter((r) => r.joins >= 2).length / rows.length).toFixed(0)}% · loss if you only ever use ≤1 join: median ${med(rows.map((r) => r.simpleLoss)).toFixed(1)}, mean ${mean(rows.map((r) => r.simpleLoss)).toFixed(1)} quintessence · taps for the best ${mean(rows.map((r) => r.taps)).toFixed(1)}`)
}
if (lateRaw.length) console.log(`hands too big to enumerate: ${lateRaw.length}, legal sigils median ${med(lateRaw)}`)
