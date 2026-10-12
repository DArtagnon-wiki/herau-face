// A simple, decent player run through many commissions, to check the numbers
// against the doc's difficulty targets. Not optimal; roughly a player who
// knows the rules and plays greedily within a term: it keeps casting the best
// sigil while that beats ending the term, then ends it.
//
//   npm run simulate                       default settings
//   npm run simulate -- --games 500 --hand 6 --casts 2 --flare 1.25 --capped --naive
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
  termsUsed,
  type EndOutcome,
  type GameState,
  type Settings,
  standardSetup,
} from '../src/sim/game'
import { candidatePools, canJoin } from '../src/sim/sigil'
import type { Grade, JoinKind, Rune, Sigil } from '../src/sim/types'
import { ELEMENTALS, poolKey } from '../src/sim/alchemy'
import { presetByKey } from '../src/sim/presets'
import { ACT_CHANCE, COMMISSIONS, FINE_CLAY_PURITY, cloneTarget, expectedThreat, type BossTuning, type CommissionKey } from '../src/sim/commission'
import { mixedDeck } from '../src/sim/deck'
import { DEFAULT_EQUATION, sourcePools } from '../src/sim/equation'
import { refinedShare } from '../src/sim/catalysts'

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
  surplusForce: !args.includes('--capped'),
  /** --debuff-flare N: a small flare on seep, evaporate and scorch turns (element moves). */
  debuffFlare: Number(arg('--debuff-flare') ?? DEFAULT_SETTINGS.debuffFlare ?? 0),
  /** --flare-min, --flare-max, --flare-rise: mud's flare moves. */
  flareMin: Number(arg('--flare-min') ?? DEFAULT_SETTINGS.flareMin ?? 11),
  flareMax: Number(arg('--flare-max') ?? DEFAULT_SETTINGS.flareMax ?? 15),
  flareRise: Number(arg('--flare-rise') ?? DEFAULT_SETTINGS.flareRise ?? 1),
  /** --act 0.5,0.25,0.1,0.03: each elemental's chance to act by purity. */
  actChance: arg('--act') ? arg('--act')!.split(',').map(Number) : DEFAULT_SETTINGS.actChance,
  /** --combat moves|purity: element move pools, or purity effects (default). */
  combat: (arg('--combat') as Settings['combat']) ?? DEFAULT_SETTINGS.combat,
}
/**
 * --equation resolves sigils by the alchemical equation (src/sim/equation.ts),
 * tuned with --base, --step, --ring, --inscribe and --neutral.
 */
/** --purity-mass N, --purity-flare a,b,c,d, --purity-ward a,b,c,d, --purity-taint a,b,c,d: purity effects by grade, per N kg. */
{
  const list = (name: string) => arg(name)?.split(',').map(Number)
  const purity: NonNullable<Settings['purity']> = {}
  if (arg('--purity-mass')) purity.mass = Number(arg('--purity-mass'))
  if (list('--purity-flare')) purity.flare = list('--purity-flare')
  if (list('--purity-ward')) purity.ward = list('--purity-ward')
  if (list('--purity-taint')) purity.taint = list('--purity-taint')
  /** --purity-chance P or E,W,A,F: each element's chance to stir. */
  const ch = list('--purity-chance')
  if (ch) purity.chance = ch.length === 1 ? { earth: ch[0], water: ch[0], air: ch[0], fire: ch[0] } : { earth: ch[0], water: ch[1], air: ch[2], fire: ch[3] }
  if (Object.keys(purity).length) settings.purity = purity
}
if (args.includes('--equation')) {
  settings.equation = {
    base: Number(arg('--base') ?? DEFAULT_EQUATION.base),
    step: Number(arg('--step') ?? DEFAULT_EQUATION.step),
    ring: Number(arg('--ring') ?? DEFAULT_EQUATION.ring),
    inscribe: Number(arg('--inscribe') ?? DEFAULT_EQUATION.inscribe),
    neutral: Number(arg('--neutral') ?? DEFAULT_EQUATION.neutral),
    share: Number(arg('--share') ?? DEFAULT_EQUATION.share),
    gate: args.includes('--gate') ? true : args.includes('--no-gate') ? false : DEFAULT_EQUATION.gate,
    /** --free-purify: purifying steps cost no extra resistance. */
    purifyStep: !args.includes('--free-purify'),
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
if (arg('--deck') && !preset) throw new Error(`No deck called ${arg('--deck')}: try opening, mid, late, or an archetype (ward, combo, great, purity, mastery, thinning, each also -late).`)
if (preset && !arg('--hand')) settings.handSize = preset.handSize
const setup = preset ? preset.setup() : standardSetup()
/**
 * --commission mire plays the boss. --boss-resistance, --boss-flare-min,
 * --boss-flare-max, --boss-stiffen, --boss-junk, --boss-mass (a multiplier on
 * its weight) tune it.
 */
const commission = (arg('--commission') ?? 'mud') as CommissionKey
if (commission !== 'mud') {
  const c = COMMISSIONS[commission]
  const mass = Number(arg('--boss-mass') ?? 1)
  setup.commission = commission
  /** --boss-grades E,W,A,F: the purity of each elemental in the boss, 0 impure to 3 perfect. */
  const grades = arg('--boss-grades')?.split(',').map(Number)
  const order = ['earth', 'water', 'air', 'fire']
  setup.start = c.start.map((p) => ({ ...p, kg: p.kg * mass, ...(grades ? { grade: grades[order.indexOf(p.elemental)] as Grade } : {}) }))
  setup.target = cloneTarget(c.target)
  const num = (name: string) => (arg(name) !== undefined ? Number(arg(name)) : undefined)
  const boss: Partial<BossTuning> = {}
  const set = <K extends keyof BossTuning>(k: K, v: BossTuning[K] | undefined) => {
    if (v !== undefined) boss[k] = v
  }
  set('resistance', num('--boss-resistance'))
  set('flareMin', num('--boss-flare-min'))
  set('flareMax', num('--boss-flare-max'))
  set('stiffen', num('--boss-stiffen'))
  set('junk', num('--boss-junk'))
  /** --boss-purity-mass N: under purity effects, the boss's effects are quoted per N kg. --boss-signature P: chance a stirring element also makes its signature move. */
  if (arg('--boss-purity-mass')) boss.purity = { ...boss.purity, mass: Number(arg('--boss-purity-mass')) }
  if (arg('--boss-chance')) {
    const c = Number(arg('--boss-chance'))
    boss.purity = { ...boss.purity, chance: { earth: c, water: c, air: c, fire: c } }
  }
  if (arg('--boss-signature')) boss.signature = Number(arg('--boss-signature'))
  /** --boss-act 0.8,0.6,0.3,0.1: the boss's chance to act by purity. */
  if (arg('--boss-act')) boss.act = arg('--boss-act')!.split(',').map(Number)
  settings.boss = boss
}
/** --mix C:K[:T] starts from C circles and K crescents of each element, plus T plain triangles (default 2). */
const mix = arg('--mix')
if (mix) {
  const [c, k, t] = mix.split(':').map(Number)
  setup.deck = mixedDeck(c, k, Number.isFinite(t) ? t : 2)
}
/** --power N sets every body's power; --links N adds N links to every body. */
const power = arg('--power')
const extraLinks = Number(arg('--links') ?? 0)
for (const b of Object.values(setup.forge.bodies)) {
  if (power) b.power = Number(power)
  b.links += extraLinks
}
/** --fine: fine clay, a purity target: clay whose earth is at least half pure. */
if (args.includes('--fine')) setup.target = { ...setup.target, purity: { ...FINE_CLAY_PURITY } }
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

/**
 * --miss-weight W: how much the player values progress against quintessence.
 * 60 by default; at 30 the player wards forever in grinding fights instead of
 * making slow progress, which mattered against the boss.
 */
const missWeight = Number(arg('--miss-weight') ?? 60)
/** --ignore-spec: with --farm, chase mass alone, to bound how fast a deck can grow it. */
const ignoreSpec = args.includes('--ignore-spec')

/** --threat-weight N: how much the player weighs next term's expected instability, so purifying pays (0 ignores it). */
const threatWeight = Number(arg('--threat-weight') ?? 1.5)
const threat = (state: GameState, end: EndOutcome) => (naive || !threatWeight ? 0 : threatWeight * expectedThreat(end.pools, end.table, state.settings, state.commission, state.term + 1))

function evalEnd(state: GameState, end: EndOutcome): number {
  if (ignoreSpec) return farmBonus(end.pools) - end.paid * 3 - threat(state, end)
  return farmBonus(end.pools) - miss(end.pools, state.target) * missWeight - centering(state, end.pools) * 2 - end.paid * (naive ? 0 : 3) - threat(state, end)
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
  const keys = (state.settings.equation ? sourcePools : candidatePools)(s, state.pools).map(poolKey)
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

const specKey = (r: Rune) => `${r.body}:${r.motes.map((m) => m.elemental ?? m.kind).join(',')}${r.stacks ? `*${r.stacks}` : ''}`
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
  while (s.phase === 'compose' && s.hand.length && castsLeft(s) > 0) {
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
  let purified = 0
  let casts = 0
  let returns = 0
  let gathered = 0
  let moved = 0
  let movedByGreat = 0
  let peak = totalKg(s.pools)
  for (let guard = 0; guard < 200 && s.phase === 'compose'; guard++) {
    peak = Math.max(peak, totalKg(s.pools))
    const endNow = evalEnd(s, previewEnd(s))
    const best = castsLeft(s) > 0 && s.hand.length ? bestCast(s) : null
    if (best && best.score > endNow + 0.01) {
      if (!best.sigil.joins.some((j) => j.kind === 'circumscribe' || j.kind === 'inscribe')) wardOnly++
      casts++
      if (best.sigil.anchor.cohobation) returns++
      s = cast(s, best.sigil, best.poolKey)
      const last = s.casts.at(-1) ?? s.history.at(-1)?.casts.at(-1)
      if (last?.resolution.mode === 'purify') purified++
      gathered += (last?.resolution.gathered ?? []).reduce((g, x) => g + x.kg, 0)
      if (last && last.resolution.mode === 'transmute') {
        moved += last.resolution.converted
        if ([last.sigil.anchor, ...last.sigil.joins.map((j) => j.rune)].some((r) => r.multiplication)) movedByGreat += last.resolution.converted
      }
      continue
    }
    if (s.casts.length === 0 && s.discardsLeft > 0) {
      const sh = shares(s.pools)
      const t = s.target
      const needed = new Set<string>(['water', 'earth', 'none'])
      if (sh.air >= t.air.max) needed.add('air')
      if (sh.fire >= t.fire.max) needed.add('fire')
      const drop = s.hand.filter((r) => r.junk || !needed.has(r.affinity)).map((r) => r.id)
      if (drop.length) {
        s = discardRunes(s, drop)
        discardsUsed++
        continue
      }
    }
    s = endTerm(s)
  }
  const all = [...s.hand, ...s.draw, ...s.discard, ...s.burned]
  const maxStacks = Math.max(0, ...all.map((r) => r.stacks))
  const absorbed = s.history.reduce((a, t) => a + t.absorbed, 0)
  const flares = s.history.reduce((a, t) => a + t.flare, 0)
  return { state: s, discardsUsed, wardOnly, purified, casts, returns, gathered, maxStacks, moved, movedByGreat, absorbed, flares, burned: s.burned.length, refined: refinedShare(s.pools), peak: Math.max(peak, totalKg(s.pools)) }
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
 const mudNote = ` · flares ${settings.flareMin}–${settings.flareMax} +${settings.flareRise}/term · act ${(settings.actChance ?? ACT_CHANCE).join('/')} · combat ${settings.combat ?? 'purity'}${settings.purity ? ' ' + JSON.stringify(settings.purity) : ''} · debuff flare ${settings.debuffFlare}`
 const bossNote = commission !== 'mud' ? ` · ${COMMISSIONS[commission].source} ${JSON.stringify(settings.boss)}${arg('--boss-mass') ? ` ×${arg('--boss-mass')} mass` : ''}` : ''
const forgeNote = (setup.target.purity ? ' · fine clay (half the earth pure)' : '') + bossNote + eqNote + mudNote + (mix ? ` · deck ${mix} (circles:crescents:triangles)` : '') + (preset ? ` · ${preset.name.toLowerCase()}` : '') + (power || extraLinks ? ` · power ${power ?? 'default'} · +${extraLinks} links` : '') + (farm ? ` · farming to ${farm} kg` : '')
console.log(
  `${games} commissions${forgeNote} · hand ${settings.handSize} · ${settings.castsPerTerm || 'any number of'} sigil${settings.castsPerTerm === 1 ? '' : 's'} a term · flare ×${settings.flareScale} · stock ${settings.stock} · surplus Force ${settings.surplusForce ? 'multiplies' : 'capped'}${naive ? ' · naive player' : ''}${noOrganics ? ' · no organics' : ''}\n`,
)
const runs = Array.from({ length: games }, (_, i) => play(1000 + i))
/** --dump FILE writes the first commission's final state as JSON, for drawing its star. */
if (arg('--dump')) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(arg('--dump')!, JSON.stringify(runs.map((r) => r.state).slice(0, Number(arg('--dump-count') ?? 1))))
}
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
if (won.length && won.length < runs.length) console.log(`among wins: spent median ${pct(won.map((r) => r.state.spent), 50)}, p10 ${pct(won.map((r) => r.state.spent), 10)}, p90 ${pct(won.map((r) => r.state.spent), 90)} · terms median ${pct(won.map((r) => termsUsed(r.state)), 50)}`)
if (farm) console.log(`peak mass median ${f1(pct(runs.map((r) => r.peak), 50))} kg, p90 ${f1(pct(runs.map((r) => r.peak), 90))} kg, best ${f1(Math.max(...runs.map((r) => r.peak)))} kg`)
console.log(`finished in 1 term ${Math.round((100 * won.filter((r) => termsUsed(r.state) <= 1).length) / games)}%, in 2 or fewer ${Math.round((100 * won.filter((r) => termsUsed(r.state) <= 2).length) / games)}%`)
console.log(buckets.map(([label, f]) => `${label}: ${Math.round((100 * spent.filter(f).length) / games)}%`).join('  '))
console.log(
  `archetype signs: Ward absorbed ${Math.round((100 * runs.reduce((a, r) => a + r.absorbed, 0)) / Math.max(1, runs.reduce((a, r) => a + r.flares, 0)))}% of flares · returns ${f1(mean(runs.map((r) => r.returns)))} · biggest growth ${f1(mean(runs.map((r) => r.maxStacks)))} casts, moving ${Math.round((100 * runs.reduce((a, r) => a + r.movedByGreat, 0)) / Math.max(1, runs.reduce((a, r) => a + r.moved, 0)))}% of the kilos · burned ${f1(mean(runs.map((r) => r.burned)))} · gathered ${f1(mean(runs.map((r) => r.gathered)))} kg · medium or purer at the end ${Math.round(100 * mean(runs.map((r) => r.refined)))}%${setup.catalysts?.length ? ` · catalysts ${setup.catalysts.join(', ')}` : ''}`,
)
console.log(`sigils a term ${f1(mean(runs.map((r) => r.casts / Math.max(1, termsUsed(r.state)))))} · defence-only sigils ${f1(mean(runs.map((r) => r.wardOnly)))} · purifying ${f1(mean(runs.map((r) => r.purified)))} · discards used ${f1(mean(runs.map((r) => r.discardsUsed)))}`)

