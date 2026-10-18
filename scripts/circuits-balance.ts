// Rune builds scored against a basic Wash. A build goes into the deck as a
// twelfth card beside the eleven opening cards, and greedy plays the same
// fights with it: each commission on its own, at full quintessence, with the
// same seeds for every build. By default the first three commissions: the
// opening deck alone loses the Mire nearly every time, so what a card saves
// there is mostly whether it turns a loss into a win, which swamps the rest. What a fight costs is the quintessence it takes:
// flares, plus whatever the cards pay, less whatever they gain. A build's worth
// is what it saves against a blank twelfth card (one that does nothing), over
// what a second Wash saves: blank 0, Wash 1. The drafted rune's principle
// output (one arc) takes turns over the seeds: salt, sulfur, mercury.
//
//   npx tsx scripts/circuits-balance.ts                  the opening cards, the Catalyst, every input with every output at its plain amount
//   npx tsx scripts/circuits-balance.ts --calibrate [--target 2] [--slice 0/2] [--out pairs.json]
//                                                        find, for each input and output, the amount that makes the rune worth the target
//   npx tsx scripts/circuits-balance.ts --write a.json b.json [--target 2] [--tolerance 0.3]
//                                                        the pairs within reach of the target, into src/circuits/draft-pairs.ts
//   (--seeds 400: fights per commission for each build; --fights 0,1,2: which commissions, 3 for the Mire)

import { writeFileSync, readFileSync } from 'node:fs'
import {
  COMMISSIONS,
  DEFAULT_SETTINGS,
  DRAFT_INPUTS,
  DRAFT_OUTPUTS,
  PRINCIPLES,
  UNIT_GATE,
  catalystCard,
  draftCard,
  fightWith,
  fromPool,
  startingDeck,
  statusDef,
  type Card,
  type DraftOutput,
  type Source,
} from '../src/circuits/engine'
import { apply, greedyMove } from './circuits-players'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const SEEDS = Number(arg('--seeds') ?? 400)
const FIGHTS = (arg('--fights') ?? '0,1,2').split(',').map(Number)
const TARGET = Number(arg('--target') ?? 2)
const TOLERANCE = Number(arg('--tolerance') ?? 0.3)

// ---------------------------------------------------------------------------
// Scoring

const opening = startingDeck()
const ID = 100
const blank: Card = { id: ID, name: 'Blank', channels: [], outputs: [], purifies: false, gain: 0, time: 2, ground: 0 }
const wash: Card = { ...opening.find((c) => c.name === 'Wash')!, id: ID }

/** What one fight costs with this twelfth card: quintessence in, less quintessence out. */
function fightCost(card: Card, index: number, seed: number): number {
  let r = fightWith(seed, [...opening, { ...card, id: ID }], index, DEFAULT_SETTINGS)
  const start = r.quintessence
  for (let g = 0; g < 400 && r.stage === 'fight'; g++) r = apply(r, greedyMove(r))
  return start - r.quintessence
}

type Make = (p: (typeof PRINCIPLES)[number]) => Card

/** Mean cost of each commission with this card over a run of seeds; a drafted rune's principle takes turns by seed. */
function costsAt(make: Make, base: number): number[] {
  return FIGHTS.map((index) => {
    let total = 0
    for (let i = 0; i < SEEDS; i++) total += fightCost(make(PRINCIPLES[i % 3]), index, base + i)
    return total / SEEDS
  })
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Scoring over one run of seeds: blank and Wash measured on the same seeds as the builds. */
function scorer(base: number) {
  const blankCosts = costsAt(() => blank, base)
  const washCosts = costsAt(() => wash, base)
  const washSaves = sum(blankCosts) - sum(washCosts)
  return {
    blankCosts,
    washCosts,
    costs: (make: Make) => costsAt(make, base),
    /** A build's worth in Washes: what it saves over a blank card, against what a Wash saves. */
    worth: (c: number[]) => (sum(blankCosts) - sum(c)) / washSaves,
  }
}
const S = scorer(5000)
const { blankCosts, washCosts } = S
const costs = S.costs
const worth = S.worth

// ---------------------------------------------------------------------------
// Builds: an input and an output, with the knobs the calibration turns

const POOL_AMOUNT: Record<string, number> = Object.fromEntries(DRAFT_INPUTS.filter((ch) => fromPool(ch.element)).map((ch) => [ch.element, ch.capacity]))
const outKey = (o: DraftOutput) => (o.kind === 'status' ? o.status : o.kind)

/**
 * How a pair is tuned. Outputs that read what the card collects are tuned by
 * the input's amount; unit outputs (draw, spare, Stall, Foresight, catalyst)
 * by how many they give, with the input at its plain amount; Retain and
 * Volatile, which don't stack, by the input's amount alone.
 */
type Knob = 'amount' | 'count' | 'none'
function knobOf(src: Source, o: DraftOutput): Knob {
  const pool = fromPool(src)
  if (o.kind === 'draw' || o.kind === 'regain' || o.kind === 'catalyst') return 'count'
  if (o.kind === 'status' && statusDef(o.status).unit) return statusDef(o.status).cap === 1 ? (pool ? 'amount' : 'none') : 'count'
  if (o.kind === 'ground' && !pool) return 'none'
  return 'amount'
}

/** The top of each knob's range in the calibration. */
const HI_AMOUNT = 20
const HI_COUNT = 6

/** The plain amount of an input: the shop's for an element, enough for a unit gate otherwise. */
const plainAmount = (src: Source) => POOL_AMOUNT[src] ?? UNIT_GATE

function withCount(o: DraftOutput, n: number): DraftOutput {
  if (o.kind === 'draw' || o.kind === 'regain') return { ...o, n }
  if (o.kind === 'status' && statusDef(o.status).unit && !statusDef(o.status).cap) return { ...o, n }
  if (o.kind === 'catalyst') return { ...o, factor: 1 + n }
  return o
}

const buildOf = (src: Source, o: DraftOutput, amount: number, count: number): Make => (p) => draftCard(ID, { element: src, capacity: amount }, withCount(o, count), p)

interface Tuned {
  input: Source
  output: string
  amount: number
  count: number
  worth: number
  /** What it saves in each commission, against a blank card. */
  saves: number[]
}

function measure(src: Source, o: DraftOutput, amount: number, count: number): Tuned {
  const c = costs(buildOf(src, o, amount, count))
  return { input: src, output: outKey(o), amount, count, worth: worth(c), saves: c.map((x, i) => blankCosts[i] - x) }
}

/** The amount (or count) that brings a pair closest to the target, by bisection on a knob that only adds strength. */
function calibrate(src: Source, o: DraftOutput): Tuned {
  const knob = knobOf(src, o)
  if (knob === 'none') return measure(src, o, plainAmount(src), 1)
  const lo0 = 1
  const hi0 = knob === 'amount' ? HI_AMOUNT : HI_COUNT
  const at = (k: number) => (knob === 'amount' ? measure(src, o, k, 1) : measure(src, o, plainAmount(src), k))
  const seen = new Map<number, Tuned>()
  const get = (k: number) => seen.get(k) ?? (seen.set(k, at(k)), seen.get(k)!)
  let lo = lo0
  let hi = hi0
  if (get(hi).worth <= TARGET) return get(hi)
  if (get(lo).worth >= TARGET) return get(lo)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (get(mid).worth < TARGET) lo = mid
    else hi = mid
  }
  return Math.abs(get(lo).worth - TARGET) <= Math.abs(get(hi).worth - TARGET) ? get(lo) : get(hi)
}

// ---------------------------------------------------------------------------
// Reports

const f2 = (x: number) => x.toFixed(2)
const f1 = (x: number) => x.toFixed(1)
const names = FIGHTS.map((i) => COMMISSIONS[i].name)

function header(): void {
  console.log(`${SEEDS} fights per commission for each build. Blank twelfth card costs ${blankCosts.map(f1).join(', ')} (${names.join(', ')}); a Wash saves ${washCosts.map((c, i) => f1(blankCosts[i] - c)).join(', ')}.`)
}

if (args.includes('--write')) {
  const files = args.slice(args.indexOf('--write') + 1).filter((a) => a.endsWith('.json'))
  const all: Tuned[] = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))
  const outputOf = (t: Tuned) => withCount(DRAFT_OUTPUTS.find((x) => outKey(x) === t.output)!, t.count)
  // Check each candidate again on fresh seeds; keep it only if it holds there too, at the mean of the two.
  const fresh = scorer(9000)
  // A pair that only reached the target at the top of its knob's range (up to 20 of an element, six of a unit) is left out.
  const atCeiling = (t: Tuned) => {
    const k = knobOf(t.input, DRAFT_OUTPUTS.find((x) => outKey(x) === t.output)!)
    return (k === 'amount' && t.amount >= HI_AMOUNT) || (k === 'count' && t.count >= HI_COUNT)
  }
  const checked = all
    .filter((t) => Math.abs(t.worth - TARGET) <= TOLERANCE && !atCeiling(t))
    .map((t) => {
      const again = fresh.worth(fresh.costs(buildOf(t.input, DRAFT_OUTPUTS.find((x) => outKey(x) === t.output)!, t.amount, t.count)))
      console.log(`  ${t.input} → ${t.output} at ${t.amount}${t.count > 1 ? ` ×${t.count}` : ''}: ${f2(t.worth)}, again ${f2(again)}`)
      return { ...t, again }
    })
  const keep = checked.filter((t) => Math.abs(t.again - TARGET) <= TOLERANCE).map((t) => ({ ...t, worth: (t.worth + t.again) / 2 }))
  const lines = keep.map((t) => `  { input: ${JSON.stringify({ element: t.input, capacity: t.amount })}, output: ${JSON.stringify(outputOf(t))}, worth: ${f2(t.worth)} },`)
  writeFileSync(
    'src/circuits/draft-pairs.ts',
    `// Generated by scripts/circuits-balance.ts --write: the input and output pairs\n// the opening draft offers, each tuned to be worth about ${TARGET} Washes (within ${TOLERANCE}).\n\nimport type { Channel, DraftOutput } from './engine'\n\nexport const DRAFT_PAIRS: { input: Channel; output: DraftOutput; worth: number }[] = [\n${lines.join('\n')}\n]\n`,
  )
  console.log(`Kept ${keep.length} of ${all.length} pairs within ${TOLERANCE} of ${TARGET} on both runs of seeds.`)
  const out = all.filter((t) => !keep.some((k) => k.input === t.input && k.output === t.output))
  for (const t of out) console.log(`  left out: ${t.input} → ${t.output} at ${t.amount}${t.count > 1 ? ` ×${t.count}` : ''}: ${f2(t.worth)}${checked.find((c) => c.input === t.input && c.output === t.output) ? `, again ${f2(checked.find((c) => c.input === t.input && c.output === t.output)!.again)}` : ''}`)
} else if (args.includes('--calibrate')) {
  const [k, n] = (arg('--slice') ?? '0/1').split('/').map(Number)
  const pairs = DRAFT_INPUTS.flatMap((ch) => DRAFT_OUTPUTS.map((o) => ({ src: ch.element, o })))
  const mine = pairs.filter((_, i) => i % n === k)
  header()
  const done: Tuned[] = []
  for (const { src, o } of mine) {
    const t = calibrate(src, o)
    done.push(t)
    console.log(`${src} → ${t.output}: amount ${t.amount}${t.count > 1 ? `, ×${t.count}` : ''} → ${f2(t.worth)} Washes (saves ${t.saves.map(f1).join(', ')})`)
    if (arg('--out')) writeFileSync(arg('--out')!, JSON.stringify(done, null, 1))
  }
} else {
  header()
  const rows: { name: string; w: number; saves: number[] }[] = []
  const add = (name: string, make: (p: (typeof PRINCIPLES)[number]) => Card) => {
    const c = costs(make)
    rows.push({ name, w: worth(c), saves: c.map((x, i) => blankCosts[i] - x) })
  }
  for (const c of opening) if (!rows.some((r) => r.name === c.name)) add(c.name, () => c)
  add('Catalyst', () => catalystCard(ID))
  for (const ch of DRAFT_INPUTS) for (const output of DRAFT_OUTPUTS) add(`${ch.element} ${ch.capacity} → ${outKey(output)}`, buildOf(ch.element, output, ch.capacity, 1))
  rows.sort((a, b) => b.w - a.w)
  console.log(`\nBuild | Washes | ${names.map((n) => `saves in ${n}`).join(' | ')}`)
  console.log(`--- | --- | ${names.map(() => '---').join(' | ')}`)
  for (const r of rows) console.log(`${r.name} | ${f2(r.w)} | ${r.saves.map(f1).join(' | ')}`)
}
