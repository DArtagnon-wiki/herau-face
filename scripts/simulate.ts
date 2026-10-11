// A simple, decent player run through many commissions, to check the numbers
// against the doc's difficulty targets. Not optimal; roughly a player who
// knows the rules and plays greedily within a term: it keeps casting the best
// sigil while that beats ending the term, then ends it.
//
//   npm run simulate                       default settings
//   npm run simulate -- --games 500 --hand 6 --casts 2 --flare 1.25 --no-strain --capped --naive
//   npm run simulate -- --power 8 --links 2 --hand 8   a stronger deck: every body's power and extra links

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
import { presetByKey } from '../src/sim/presets'
import { DEFAULT_EQUATION } from '../src/sim/equation'

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
/**
 * --equation resolves sigils by the alchemical equation (src/sim/equation.ts),
 * tuned with --base, --step, --ring, --inscribe and --neutral.
 */
if (args.includes('--equation')) {
  settings.equation = {
    base: Number(arg('--base') ?? DEFAULT_EQUATION.base),
    step: Number(arg('--step') ?? DEFAULT_EQUATION.step),
    ring: Number(arg('--ring') ?? DEFAULT_EQUATION.ring),
    inscribe: Number(arg('--inscribe') ?? DEFAULT_EQUATION.inscribe),
    neutral: Number(arg('--neutral') ?? DEFAULT_EQUATION.neutral),
    share: Number(arg('--share') ?? DEFAULT_EQUATION.share),
    gate: args.includes('--gate') ? true : args.includes('--no-gate') ? false : DEFAULT_EQUATION.gate,
  }
}
const KINDS: JoinKind[] = settings.equation ? ['circumscribe', 'side', 'entwine', 'inscribe', 'tangent'] : ['circumscribe', 'side', 'entwine', 'inscribe']
/** --planner: use the term-planning player even for small decks. */
const forcePlanner = args.includes('--planner')
/** --naive: a player who never wards on purpose. */
const naive = args.includes('--naive')
/** --no-organics: the old two-element mud and an earth-only target, for comparison. */
const noOrganics = args.includes('--no-organics')
/** --deck opening|mid|late starts from a deck along the run; its hand size applies unless --hand is given. */
const preset = arg('--deck') ? presetByKey(arg('--deck')!) : undefined
if (arg('--deck') && !preset) throw new Error(`No deck called ${arg('--deck')}: try opening, mid or late.`)
if (preset && !arg('--hand')) settings.handSize = preset.handSize
const setup = preset ? preset.setup() : standardSetup()
/** --power N sets every body's power; --links N adds N links to every body. */
const power = arg('--power')
const extraLinks = Number(arg('--links') ?? 0)
for (const b of Object.values(setup.forge.bodies)) {
  if (power) b.power = Number(power)
  b.links += extraLinks
}
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

/**
 * --farm M: a player who grows the amalgam to M kg before finishing. Clay
 * finishes the moment it is in band, so it grows mass off-spec, then lands.
 */
const farm = Number(arg('--farm') ?? 0)
const startKg = totalKg(setup.start)
const farmBonus = (pools: EndOutcome['pools']) => (farm ? 40 * Math.log2(Math.min(totalKg(pools), farm) / startKg) : 0)

/** --ignore-spec: with --farm, chase mass alone, to bound how fast a deck can grow it. */
const ignoreSpec = args.includes('--ignore-spec')

function evalEnd(state: GameState, end: EndOutcome): number {
  if (ignoreSpec) return farmBonus(end.pools) - end.paid * 3
  return farmBonus(end.pools) - miss(end.pools, state.target) * 30 - centering(state, end.pools) * 2 - end.paid * (naive ? 0 : 3) - imbalance(end.table) * 0.3
}

/** Every sigil the hand can make, within the link limits. */
function* sigils(hand: Rune[]): Generator<Sigil> {
  const kinds = KINDS
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

type Scored = { sigil: Sigil; poolKey?: string; score: number }

function score(state: GameState, s: Sigil): Scored {
  let best: Scored | null = null
  const keys = candidatePools(s, state.pools).map(poolKey)
  for (const key of keys.length > 1 ? keys : [undefined]) {
    const p = previewCast(state, s, key)
    const v = p.cast.finished
      ? totalKg(p.cast.pools) >= farm
        ? 10000 + totalKg(p.cast.pools)
        : -1e6
      : evalEnd(state, p.end!)
    if (!best || v > best.score) best = { sigil: s, poolKey: key, score: v }
  }
  return best!
}

const specKey = (r: Rune) => `${r.body}:${r.motes.map((m) => m.elemental ?? m.kind).join(',')}`
/** Sigils that differ only in which of two identical runes they use, or in the order of non-ring joins, are the same. */
function sigilKey(s: Sigil): string {
  const rings = s.joins.filter((j) => j.kind === 'circumscribe').map((j) => specKey(j.rune))
  const rest = s.joins.filter((j) => j.kind !== 'circumscribe').map((j) => `${j.kind}:${specKey(j.rune)}`).sort()
  return `${specKey(s.anchor)}|${rings.join('>')}|${rest.join(';')}`
}

/**
 * Big hands and high-link anchors make too many sigils to try them all, so
 * grow each anchor's sigil one join at a time, keeping the best few at every
 * size. Returns the best sigil overall and the best for each anchor and size.
 */
function beam(state: GameState, width: number): { best: Scored | null; bySize: Scored[] } {
  const kinds = KINDS
  let best: Scored | null = null
  const bySize: Scored[] = []
  const anchors = new Map<string, Rune>()
  for (const r of state.hand) if (!anchors.has(specKey(r))) anchors.set(specKey(r), r)
  for (const anchor of anchors.values()) {
    let frontier: Scored[] = [score(state, { anchor, joins: [] })]
    for (let depth = 0; ; depth++) {
      bySize.push(frontier[0])
      if (!best || frontier[0].score > best.score) best = frontier[0]
      if (depth >= anchor.links) break
      const next = new Map<string, Scored>()
      for (const { sigil } of frontier) {
        const used = new Set([sigil.anchor.id, ...sigil.joins.map((j) => j.rune.id)])
        for (const r of state.hand) {
          if (used.has(r.id)) continue
          for (const kind of kinds) {
            const s: Sigil = { anchor, joins: [...sigil.joins, { kind, rune: r }] }
            const k = sigilKey(s)
            if (!next.has(k)) next.set(k, score(state, s))
          }
        }
      }
      if (next.size === 0) break
      frontier = [...next.values()].sort((a, b) => b.score - a.score).slice(0, width)
    }
  }
  return { best, bySize }
}

/**
 * Ring chains route a change around the elemental square, and some loop back
 * to the anchor's element with a big yield (earth → air → fire → earth is
 * ×40). A chain only pays once it is complete, so a join-by-join search never
 * finds one. Try every chain of two or three rings the hand can make, each
 * padded with side links for Reach.
 */
function chainCandidates(state: GameState): Scored[] {
  const out: Scored[] = []
  const seen = new Set<string>()
  const elemental = state.hand.filter((r) => r.affinity !== 'none')
  for (const anchor of elemental) {
    const maxRings = Math.min(3, anchor.links)
    const grow = (rings: Rune[], last: string) => {
      if (rings.length >= 2) {
        const used = new Set([anchor.id, ...rings.map((r) => r.id)])
        const spare = state.hand
          .filter((r) => !used.has(r.id))
          .sort((x, y) => y.reachMult - x.reachMult || Number(x.affinity !== 'none') - Number(y.affinity !== 'none'))
        let bestHere: Scored | null = null
        for (let k = 0; k <= Math.min(spare.length, anchor.links - rings.length); k++) {
          const sigil: Sigil = {
            anchor,
            joins: [...rings.map((rune) => ({ kind: 'circumscribe' as const, rune })), ...spare.slice(0, k).map((rune) => ({ kind: 'side' as const, rune }))],
          }
          const key = sigilKey(sigil)
          if (seen.has(key)) continue
          seen.add(key)
          const x = score(state, sigil)
          if (!bestHere || x.score > bestHere.score) bestHere = x
          out.push(x)
        }
      }
      if (rings.length >= maxRings) return
      const tried = new Set<string>()
      for (const r of elemental) {
        if (r === anchor || rings.includes(r) || r.affinity === last || tried.has(r.affinity)) continue
        tried.add(r.affinity)
        grow([...rings, r], r.affinity)
      }
    }
    grow([], anchor.affinity)
  }
  return out
}

/** Cast this sigil, then keep casting the greedy best while it helps; the value the term ends on. */
function rollout(state: GameState, first: Scored): number {
  if (first.score >= 10000) return first.score
  let s = cast(state, first.sigil, first.poolKey)
  let value = first.score
  while (s.phase === 'compose' && s.hand.length) {
    const next = beam(s, 4).best
    if (!next || next.score <= value + 0.01) break
    value = next.score
    if (value >= 10000) break
    s = cast(s, next.sigil, next.poolKey)
  }
  return value
}

/**
 * A player who plans the term: it tries the best sigil of every anchor and
 * size, plays each term out greedily from there, and starts with the sigil
 * whose term ends best. This keeps it from spending runes on Ward that a
 * later sigil in the same term needs.
 */
function plannedCast(state: GameState): Scored | null {
  const { bySize } = beam(state, 4)
  const chains = chainCandidates(state).sort((x, y) => y.score - x.score).slice(0, 12)
  let best: Scored | null = null
  for (const c of [...bySize, ...chains]) {
    const r = previewCast(state, c.sigil, c.poolKey).cast.resolution
    if (r.mode === 'none' && r.outputs.ward === 0) continue
    const v = rollout(state, c)
    if (!best || v > best.score) best = { ...c, score: v }
  }
  return best
}

function bestCast(state: GameState): Scored | null {
  if (forcePlanner || state.hand.length > 7 || state.hand.some((r) => r.links > 2)) return plannedCast(state)
  let best: Scored | null = null
  for (const s of sigils(state.hand)) {
    const x = score(state, s)
    if (!best || x.score > best.score) best = x
  }
  return best
}

function play(seed: number) {
  let s = newGame(settings, seed, { ...setup, start: setup.start.map((p) => ({ ...p })) })
  let discardsUsed = 0
  let wardOnly = 0
  let casts = 0
  let peak = totalKg(s.pools)
  for (let guard = 0; guard < 200 && s.phase === 'compose'; guard++) {
    peak = Math.max(peak, totalKg(s.pools))
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
  return { state: s, discardsUsed, wardOnly, casts, peak: Math.max(peak, totalKg(s.pools)) }
}

/** --trace N prints the first N commissions cast by cast. */
const traceN = Number(arg('--trace') ?? 0)
const runeName = (r: Rune) => `${r.affinity === 'none' ? 'plain' : r.affinity} ${r.body}`
const sharesNote = (pools: EndOutcome['pools']) => {
  const sh = shares(pools)
  return `earth ${(100 * sh.earth).toFixed(1)}% water ${(100 * sh.water).toFixed(1)}% air ${(100 * sh.air).toFixed(1)}% fire ${(100 * sh.fire).toFixed(1)}% · ${totalKg(pools).toFixed(1)} kg`
}
function trace(state: GameState) {
  const terms = [...state.history.map((t) => ({ term: t.term, casts: t.casts, end: t as EndOutcome | null })), { term: state.term, casts: state.casts, end: null }]
  for (const t of terms) {
    if (!t.casts.length && !t.end) continue
    console.log(`  term ${t.term}`)
    for (const c of t.casts) {
      const r = c.resolution
      const joins = c.sigil.joins.map((j) => `${j.kind} ${runeName(j.rune)}`).join(', ')
      const what = r.mode === 'none' ? 'no change' : `${r.converted.toFixed(2)} kg ${r.source!.elemental} → ${r.produced.toFixed(2)} kg ${r.target!.elemental}`
      console.log(`    ${runeName(c.sigil.anchor)}${joins ? ' + ' + joins : ''}: ${what}, ward ${r.outputs.ward} → ${sharesNote(c.pools)}${c.finished ? ' · done' : ''}`)
    }
    if (t.end) console.log(`    end: paid ${t.end.paid} → ${sharesNote(t.end.pools)}`)
  }
}

const pct = (xs: number[], p: number) => {
  const sorted = xs.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const f1 = (n: number) => n.toFixed(1)

const eqNote = settings.equation ? ` · equation: base ${settings.equation.base}, step ×${settings.equation.step}, ring ×${settings.equation.ring}, neutral ${settings.equation.neutral} kg + ${settings.equation.share * 100}% of the pool${settings.equation.gate ? ', power gate' : ''}` : ''
const forgeNote = eqNote + (preset ? ` · ${preset.name.toLowerCase()}` : '') + (power || extraLinks ? ` · power ${power ?? 'default'} · +${extraLinks} links` : '') + (farm ? ` · farming to ${farm} kg` : '')
console.log(
  `${games} commissions${forgeNote} · hand ${settings.handSize} · ${settings.castsPerTerm || 'any number of'} sigil${settings.castsPerTerm === 1 ? '' : 's'} a term · flare ×${settings.flareScale} · stock ${settings.stock} · strain ${settings.strain ? 'on' : 'off'} · surplus Force ${settings.surplusForce ? 'multiplies' : 'capped'}${naive ? ' · naive player' : ''}${noOrganics ? ' · no organics' : ''}\n`,
)
const runs = Array.from({ length: games }, (_, i) => play(1000 + i))
runs.slice(0, traceN).forEach((r, i) => {
  console.log(`commission ${i + 1}: ${r.state.phase}, ${termsUsed(r.state)} terms`)
  trace(r.state)
})
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
if (farm) console.log(`peak mass median ${f1(pct(runs.map((r) => r.peak), 50))} kg, p90 ${f1(pct(runs.map((r) => r.peak), 90))} kg, best ${f1(Math.max(...runs.map((r) => r.peak)))} kg`)
console.log(`finished in 1 term ${Math.round((100 * won.filter((r) => termsUsed(r.state) <= 1).length) / games)}%, in 2 or fewer ${Math.round((100 * won.filter((r) => termsUsed(r.state) <= 2).length) / games)}%`)
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
