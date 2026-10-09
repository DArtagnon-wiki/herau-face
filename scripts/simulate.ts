// A simple, decent player run through many mud-to-clay commissions, to check
// the numbers against the doc's difficulty targets. Not optimal; roughly a
// player who knows the rules and plays one term ahead.
//
//   npm run simulate                 all three starting decks, default settings
//   npm run simulate -- --games 500 --flare 1.25 --no-strain

import { totalKg } from '../src/sim/alchemy'
import { CLAY_BAND, earthShare } from '../src/sim/commission'
import { DEFAULT_SETTINGS, cast, discardGlyphs, newGame, previewTerm, type GameState, type Settings } from '../src/sim/game'
import { imbalance } from '../src/sim/table'
import type { Glyph, JoinKind, Rune, ShapeClass } from '../src/sim/types'

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

const mid = (CLAY_BAND[0] + CLAY_BAND[1]) / 2

function score(state: GameState, rune: Rune, poolKey?: string): number {
  const t = previewTerm(state, rune, poolKey)
  if (t.finished) return 10000 - t.paid * 10 + totalKg(t.pools)
  const over = Math.max(0, t.share - CLAY_BAND[1])
  return -Math.abs(t.share - mid) * 300 - over * 2000 - t.paid * 3 - imbalance(t.table) * 0.3
}

/** Every way to spend the leftover cards on links, entwines, one fine inscribe, or nothing. */
function* extras(cards: Glyph[], room: number): Generator<[JoinKind, Glyph][]> {
  const options: (JoinKind | null)[] = [null, 'link', 'entwine', 'inscribe']
  const n = cards.length
  const total = options.length ** n
  for (let code = 0; code < total; code++) {
    const joins: [JoinKind, Glyph][] = []
    let c = code
    let inscribes = 0
    for (let i = 0; i < n; i++) {
      const kind = options[c % options.length]
      c = Math.floor(c / options.length)
      if (kind) joins.push([kind, cards[i]])
      if (kind === 'inscribe') inscribes++
    }
    if (joins.length <= room && inscribes <= 1) yield joins
  }
}

function bestRune(state: GameState): { rune: Rune; poolKey?: string; score: number } | null {
  const over = earthShare(state.pools) > CLAY_BAND[1]
  const from = over ? 'earth' : 'water'
  const to = over ? 'water' : 'earth'
  const poolKey = over ? 'earth:0' : undefined

  let best: { rune: Rune; poolKey?: string; score: number } | null = null
  const anchors = state.hand.filter((g) => g.affinity === from)
  for (const anchor of anchors) {
    const rest = state.hand.filter((g) => g !== anchor)
    const targets = rest.filter((g) => g.affinity === to).sort((a, b) => b.value - a.value)
    if (targets.length === 0) continue
    // Try one or two circumscribes of the target affinity.
    for (let k = 1; k <= Math.min(3, targets.length); k++) {
      const circ = targets.slice(0, k)
      const others = rest.filter((g) => !circ.includes(g))
      for (const joins of extras(others, anchor.sides - k)) {
        const rune: Rune = { anchor, joins: [...circ.map((glyph) => ({ kind: 'circumscribe' as JoinKind, glyph })), ...joins.map(([kind, glyph]) => ({ kind, glyph }))] }
        const s = score(state, rune, poolKey)
        if (!best || s > best.score) best = { rune, poolKey, score: s }
      }
    }
  }
  return best
}

function stabilizeRune(state: GameState): Rune {
  // Neutral-ish play: the widest anchor, everything else entwined.
  const anchor = state.hand.slice().sort((a, b) => b.sides - a.sides)[0]
  const rest = state.hand.filter((g) => g !== anchor).slice(0, anchor.sides)
  return { anchor, joins: rest.map((glyph) => ({ kind: 'entwine', glyph })) }
}

function play(shape: ShapeClass, seed: number) {
  let s = newGame(shape, settings, seed)
  let discardsUsed = 0
  let stabilizeTerms = 0
  for (let guard = 0; guard < 60 && s.phase === 'compose'; guard++) {
    const best = bestRune(s)
    if (best) {
      s = cast(s, best.rune, best.poolKey)
      continue
    }
    if (s.discardsLeft > 0) {
      const keep = new Set(['water', 'earth'])
      const drop = s.hand.filter((g) => !keep.has(g.affinity)).map((g) => g.id)
      s = discardGlyphs(s, drop.length ? drop : [s.hand[0].id])
      discardsUsed++
      continue
    }
    s = cast(s, stabilizeRune(s))
    stabilizeTerms++
  }
  return { state: s, discardsUsed, stabilizeTerms }
}

const pct = (xs: number[], p: number) => {
  const sorted = xs.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

console.log(`${games} commissions per deck · flare ×${settings.flareScale} · stock ${settings.stock} · hand ${settings.handSize} · strain ${settings.strain ? 'on' : 'off'} · surplus Force ${settings.surplusForce ? 'multiplies' : 'capped'}\n`)
for (const shape of ['regular', 'isosceles', 'scalene'] as ShapeClass[]) {
  const runs = Array.from({ length: games }, (_, i) => play(shape, 1000 + i))
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
  const dist = buckets.map(([label, f]) => `${label}: ${Math.round((100 * spent.filter(f).length) / games)}%`).join('  ')
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1)
  console.log(`${shape.padEnd(9)} won ${Math.round((100 * won.length) / games)}%  spent median ${pct(spent, 50)}, p90 ${pct(spent, 90)}  terms median ${pct(terms, 50)}, p90 ${pct(terms, 90)}  clay ${avg(won.map((r) => totalKg(r.state.pools)))} kg`)
  console.log(`          ${dist}`)
  console.log(`          discards used ${avg(runs.map((r) => r.discardsUsed))}, stabilize-only terms ${avg(runs.map((r) => r.stabilizeTerms))}\n`)
}
