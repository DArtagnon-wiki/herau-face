// How much deciding a hand takes: every legal sigil at each decision the
// simulated player faces, how many distinct results they give, and how many
// come close to the best. Run: npx tsx scripts/complexity.ts --deck opening|mid|late [--games N]

import { miss } from '../src/sim/commission'
import { cast, castsLeft, dismantleMachine, endTerm, extendMachine, fireMachine, machineOpen, newGame, previewCast, previewEnd, tableRoom, DEFAULT_SETTINGS, type EndOutcome, type GameState } from '../src/sim/game'
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
/** --machines N: table machines with N slots; --no-rebuild: never take one apart to recompose. */
const machines = Number(arg('--machines') ?? 0)
const rebuild = machines > 0 && !args.includes('--no-rebuild')
const settings = { ...DEFAULT_SETTINGS, equation: DEFAULT_EQUATION, handSize: preset.handSize, machines, machineGrowth: Number(arg('--growth') ?? 1), machineApart: (arg('--apart') ?? 'discard') as 'hand' | 'discard' }
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
type Row = { raw: number; distinct: number; outcomes: number; useful: number; near1: number; near5: number; nearSpread: number; joins: number; simpleLoss: number; fireLoss: number; taps: number }
const rows: Row[] = []
/** Per commission: how often a cast repeats an earlier one exactly, or repeats its route (anchor element → output, and whether it purifies). */
const repeats = { casts: 0, exact: 0, route: 0 }
const routeTotals = new Map<string, number>()
const lateRaw: number[] = []

type Join = { kind: JoinKind; rune: Rune }
type Option = { label: 'cast' | 'fire' | 'add' | 'rebuild'; sigil: Sigil; pool?: string; v: number; out: string; taps: number; tableId?: number; adds?: Join[]; apart?: number }
const C = (n: number, k: number) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c }
const labels = { cast: 0, fire: 0, add: 0, rebuild: 0 }

/** Score a sigil (cast from hand, or a machine firing) at its best pool. */
function scored(st: GameState, sg: Sigil, label: Option['label'], extra: Partial<Option>, taps: number): Option {
  const keys = sourcePools(sg, st.pools).map(poolKey)
  let best: Option | null = null
  for (const pk of keys.length > 1 ? keys : [undefined]) {
    const p = previewCast(st, sg, pk, extra.tableId)
    const v = p.cast.finished ? 10000 : evalEnd(st, p.end!)
    if (!best || v > best.v) best = { label, sigil: sg, pool: pk, v, out: outcome(p.cast.pools, p.cast.resolution.outputs.ward), taps: taps + (keys.length > 1 ? 1 : 0), ...extra }
  }
  return best!
}

/** Every distinct sigil the hand can cast, scored. */
function castOptions(st: GameState, label: Option['label'], extra: Partial<Option> = {}, tapsBefore = 0): Option[] {
  const seen = new Map<string, Option>()
  for (const sg of sigils(st.hand)) {
    const k = key(sg)
    if (!seen.has(k)) seen.set(k, scored(st, sg, label, extra, tapsBefore + 1 + 2 * sg.joins.length))
  }
  return [...seen.values()]
}

for (let g = 0; g < games; g++) {
  let s = newGame(settings, 5000 + g, preset.setup())
  const exactSeen = new Set<string>()
  const routes = new Map<string, number>()
  for (let guard = 0; guard < 80 && s.phase === 'compose'; guard++) {
    const unfired = s.table.filter((e) => machines && e.fired !== s.term)
    if (castsLeft(s) <= 0 || (!s.hand.length && !unfired.length)) { s = endTerm(s); continue }
    const room = tableRoom(s) > 0
    // Legal moves, counted: new sigils, every way to fire each machine (with any runes added), and every rebuild.
    let raw = room ? rawCount(s.hand) : 0
    for (const e of unfired) {
      for (let k = 0; k <= Math.min(machineOpen(s, e), s.hand.length); k++) raw += C(s.hand.length, k) * 5 ** k
      if (rebuild) raw += rawCount(settings.machineApart === 'hand' ? [...s.hand, e.sigil.anchor, ...e.sigil.joins.map((j) => j.rune)] : s.hand)
    }
    if (raw > MAX_ENUM) { lateRaw.push(raw); s = endTerm(s); continue }
    const endNow = evalEnd(s, previewEnd(s))
    const all: Option[] = room && s.hand.length ? castOptions(s, 'cast') : []
    for (const e of unfired) {
      const open = Math.min(machineOpen(s, e), 2)
      const fire = (adds: Join[]) => all.push(scored(s, { anchor: e.sigil.anchor, joins: [...e.sigil.joins, ...adds] }, adds.length ? 'add' : 'fire', { tableId: e.id, adds }, 1 + 2 * adds.length))
      fire([])
      for (let i = 0; i < s.hand.length && open >= 1; i++)
        for (const k of KINDS) {
          fire([{ kind: k, rune: s.hand[i] }])
          for (let j = i + 1; j < s.hand.length && open >= 2; j++) for (const k2 of KINDS) fire([{ kind: k, rune: s.hand[i] }, { kind: k2, rune: s.hand[j] }])
        }
      if (rebuild) for (const o of castOptions(dismantleMachine(s, e.id), 'rebuild', { apart: e.id }, 1)) all.push(o)
    }
    if (!all.length) { s = endTerm(s); continue }
    const top = all.reduce((a, b) => (b.v > a.v ? b : a))
    if (top.v <= endNow + 0.01) { s = endTerm(s); continue }
    const byOut = new Map<string, number>()
    for (const x of all) byOut.set(x.out, Math.max(byOut.get(x.out) ?? -Infinity, x.v))
    const outs = [...byOut.values()]
    const bestOf = (f: (x: Option) => boolean) => all.filter(f).reduce((a, b) => (b.v > a.v ? b : a), { v: -Infinity } as Option)
    const loss = (b: Option) => (top.v >= 10000 ? (b.v >= 10000 ? 0 : NaN) : (top.v - b.v) / 3)
    rows.push({
      raw, distinct: all.length, outcomes: outs.length,
      useful: outs.filter((v) => v > endNow + 0.01).length,
      near1: outs.filter((v) => v >= top.v - 3).length,
      near5: outs.filter((v) => v >= top.v - 15).length,
      // Unit-free: results within a tenth of the gap between the best and the median result (NaN when the best finishes).
      nearSpread: top.v >= 10000 ? NaN : outs.filter((v) => v >= top.v - 0.1 * (top.v - med(outs))).length,
      joins: top.sigil.joins.length,
      simpleLoss: loss(bestOf((x) => x.sigil.joins.length <= 1 || x.label === 'fire')),
      fireLoss: loss(bestOf((x) => x.label === 'fire' || x.label === 'cast')),
      taps: top.taps,
    })
    labels[top.label]++
    const res = previewCast(s, top.sigil, top.pool, top.tableId).cast.resolution
    const route = `${top.sigil.anchor.affinity}>${res.target?.elemental ?? '-'}${res.mode === 'purify' ? '+' : ''}`
    repeats.casts++
    if (exactSeen.has(key(top.sigil))) repeats.exact++
    if (routes.has(route)) repeats.route++
    exactSeen.add(key(top.sigil))
    routes.set(route, (routes.get(route) ?? 0) + 1)
    routeTotals.set(route, (routeTotals.get(route) ?? 0) + 1)
    if (top.label === 'cast') s = cast(s, top.sigil, top.pool)
    else if (top.label === 'rebuild') s = cast(dismantleMachine(s, top.apart!), top.sigil, top.pool)
    else {
      if (top.adds?.length) s = extendMachine(s, top.tableId!, top.adds.map((j) => ({ kind: j.kind, runeId: j.rune.id })))
      s = fireMachine(s, top.tableId!, top.pool)
    }
  }
}

console.log(`${preset.name} · hand ${preset.handSize}${machines ? ` · machines, ${machines} slots${rebuild ? '' : ', never rebuilt'}` : ''} · ${rows.length} decisions in ${games} commissions`)
if (rows.length) {
  console.log(`legal sigils median ${med(rows.map((r) => r.raw))} · distinct by rune type ${med(rows.map((r) => r.distinct))} · distinct results ${med(rows.map((r) => r.outcomes))} · results that beat ending the term ${med(rows.map((r) => r.useful))}`)
  console.log(`results within 1 quintessence of the best ${med(rows.map((r) => r.near1))} (mean ${mean(rows.map((r) => r.near1)).toFixed(1)}) · within 5 ${med(rows.map((r) => r.near5))} · within a tenth of the best-to-median gap ${med(rows.map((r) => r.nearSpread))} (mean ${mean(rows.map((r) => r.nearSpread)).toFixed(1)})`)
  console.log(`best sigil's joins: mean ${mean(rows.map((r) => r.joins)).toFixed(1)} · share with 2+ joins ${(100 * rows.filter((r) => r.joins >= 2).length / rows.length).toFixed(0)}% · loss if you only ever use ≤1 join: median ${med(rows.map((r) => r.simpleLoss)).toFixed(1)}, mean ${mean(rows.map((r) => r.simpleLoss)).toFixed(1)} quintessence · taps for the best ${mean(rows.map((r) => r.taps)).toFixed(1)}`)
  if (machines) {
    const n = rows.length
    console.log(`best move: new sigil ${Math.round(100 * labels.cast / n)}% · fire as it stands ${Math.round(100 * labels.fire / n)}% · add runes, then fire ${Math.round(100 * labels.add / n)}% · take apart and recompose ${Math.round(100 * labels.rebuild / n)}% · loss if you only fire machines as they stand or cast new sigils: median ${med(rows.map((r) => r.fireLoss)).toFixed(1)}, mean ${mean(rows.map((r) => r.fireLoss)).toFixed(1)} quintessence`)
  }
}
if (repeats.casts) console.log(`repeats: ${(100 * repeats.exact / repeats.casts).toFixed(0)}% of casts repeat an earlier composition exactly, ${(100 * repeats.route / repeats.casts).toFixed(0)}% repeat an earlier route (same anchor element, output and purifying)`)
if (routeTotals.size) console.log(`routes: ${[...routeTotals].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `${r.replace('>-', ' (Ward only)').replace('>', '→').replace('+', ' purify')} ${(100 * n / repeats.casts).toFixed(0)}%`).join(' · ')}`)
if (lateRaw.length) console.log(`hands too big to enumerate: ${lateRaw.length}, legal sigils median ${med(lateRaw)}`)
