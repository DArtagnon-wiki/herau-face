// The balance bench: rune builds scored against a basic Wash.
//
// A build goes into the deck (as a twelfth card beside the eleven opening
// cards, or as a change to one of them), and greedy plays the same fights with
// it: every enemy in the rogues gallery but the Mire, each on its own at full
// quintessence, with the same seeds for every build. (The opening deck alone
// loses the Mire nearly every time, so what a card saves there is mostly
// whether it turns a loss into a win.) What a fight costs is the quintessence
// it takes, less 3 for each metal smelted after it: flares, plus whatever the
// cards pay, less whatever they gain, less metal. A build's worth is what it
// saves against a blank twelfth card that does nothing, over what a second
// Wash saves: blank 0, Wash 1.
//
// So that no element is tied to a principle, the metal makers' principles turn
// over the seeds (each yields salt, sulfur and mercury equally often), and so
// does any principle output of the card being measured.
//
//   npx tsx scripts/circuits-balance.ts                  the opening cards and the Catalyst, as a twelfth card
//   npx tsx scripts/circuits-balance.ts --symmetry       the element-symmetric opening cards, enemy by enemy
//   npx tsx scripts/circuits-balance.ts --pairs          every input with every output at its plain amount
//   npx tsx scripts/circuits-balance.ts --calibrate [--target 2] [--slice 0/2] [--out pairs.json]
//                                                        for each input and output, the amount that makes the rune worth the target
//   npx tsx scripts/circuits-balance.ts --write a.json b.json [--target 2] [--tolerance 0.3]
//                                                        the pairs within reach of the target, into src/circuits/draft-pairs.ts
//   npx tsx scripts/circuits-balance.ts --sigils [--slice 0/2] [--out sigils.json]
//                                                        what adding each sigil to each opening card is worth
//   npx tsx scripts/circuits-balance.ts --curve Sieve [--steps 5]
//                                                        the same sigil added again and again, caps lifted: worth, plays, worth a play
//   (--seeds 300: fights per enemy for each build; --fights mud,peat,...: which enemies; --base 5000: the first seed)

import { writeFileSync, readFileSync } from 'node:fs'
import {
  DRAFT_INPUTS,
  DRAFT_OUTPUTS,
  GALLERY,
  METAL_GATE,
  UNIT_GATE,
  catalystCard,
  draftCard,
  fromPool,
  statusDef,
  STATUSES,
  type Card,
  type Channel,
  type Commission,
  type DraftOutput,
  type Output,
  type Principle,
  type Source,
} from '../src/circuits/engine'
import { ID, METAL_WORTH, blankCard, byName, changed, opening, scorer, sum, twelfth, withPrinciple, type DeckOf } from './circuits-bench'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const SEEDS = Number(arg('--seeds') ?? 300)
const TARGET = Number(arg('--target') ?? 2)
const TOLERANCE = Number(arg('--tolerance') ?? 0.3)
const FIGHTS: Commission[] = (arg('--fights')?.split(',') ?? GALLERY.filter((c) => c.key !== 'mire').map((c) => c.key)).map((k) => GALLERY.find((c) => c.key === k)!)
const S = scorer(FIGHTS, SEEDS, Number(arg('--base') ?? 5000))

// ---------------------------------------------------------------------------
// Draft pairs: an input and an output, with the knobs the calibration turns

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

const pairDeck = (src: Source, o: DraftOutput, amount: number, count: number): DeckOf => twelfth((p) => draftCard(ID, { element: src, capacity: amount }, withCount(o, count), p))

interface Tuned {
  input: Source
  output: string
  amount: number
  count: number
  worth: number
  /** What it saves against a blank card, enemy by enemy. */
  saves: number[]
}

function measurePair(src: Source, o: DraftOutput, amount: number, count: number, sc = S): Tuned {
  const m = sc.measure(pairDeck(src, o, amount, count))
  return { input: src, output: outKey(o), amount, count, worth: sc.worth(m), saves: sc.saves(m) }
}

/** The amount (or count) that brings a pair closest to the target, by bisection on a knob that only adds strength. */
function calibrate(src: Source, o: DraftOutput): Tuned {
  const knob = knobOf(src, o)
  if (knob === 'none') return measurePair(src, o, plainAmount(src), 1)
  const at = (k: number) => (knob === 'amount' ? measurePair(src, o, k, 1) : measurePair(src, o, plainAmount(src), k))
  const seen = new Map<number, Tuned>()
  const get = (k: number) => seen.get(k) ?? (seen.set(k, at(k)), seen.get(k)!)
  let lo = 1
  let hi = knob === 'amount' ? HI_AMOUNT : HI_COUNT
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
// Sigils added to a card

/** A sigil to add to a card: what it does to the card, and whether the card can take it under the caps. */
interface Sigil {
  name: string
  add: (c: Card, p: Principle) => Card
  fits: (c: Card) => boolean
}
const input = (ch: Channel): Sigil => ({
  name: `input ${fromPool(ch.element) ? `${ch.capacity} ${ch.element}` : `${ch.element} ${ch.capacity}`}`,
  add: (c) => ({ ...c, channels: [...c.channels, { ...ch }] }),
  fits: (c) => c.channels.length < 3,
})
const output = (name: string, o: (p: Principle) => Output): Sigil => ({
  name,
  add: (c, p) => ({ ...c, outputs: [...c.outputs, o(p)] }),
  fits: (c) => c.outputs.length < 3,
})
const SIGILS: Sigil[] = [
  ...DRAFT_INPUTS.map(input),
  { name: 'gain', add: (c) => ({ ...c, gain: c.gain + 1 }), fits: (c) => c.purifies && c.gain < 2 },
  { name: 'ground stage', add: (c) => ({ ...c, ground: c.ground + 1 }), fits: (c) => c.ground < 2 },
  output(`distil (from ${METAL_GATE})`, (p) => ({ kind: 'principle', principle: p, gate: METAL_GATE })),
  output('Ward', () => ({ kind: 'ward', gate: 1 })),
  output('quintessence', () => ({ kind: 'quintessence', gate: 1 })),
  output('catalyst ×2', () => ({ kind: 'catalyst', factor: 2, gate: 0 })),
  output(`draw 1 (from ${UNIT_GATE})`, () => ({ kind: 'draw', gate: UNIT_GATE })),
  output(`spare an eighth (from ${UNIT_GATE})`, () => ({ kind: 'regain', gate: UNIT_GATE })),
  ...STATUSES.map((st) => output(st.unit ? `${st.name} (from ${UNIT_GATE})` : st.name, () => ({ kind: 'status', status: st.key, gate: st.unit ? UNIT_GATE : 1 }))),
]

// ---------------------------------------------------------------------------
// Reports

const f2 = (x: number) => x.toFixed(2)
const f1 = (x: number) => x.toFixed(1)
const names = FIGHTS.map((c) => c.name)

function header(): void {
  console.log(`${SEEDS} fights per enemy for each build, ${FIGHTS.length} enemies; metal is worth ${METAL_WORTH}.`)
  console.log(`A blank twelfth card costs ${S.blank.costs.map(f1).join(', ')} (${names.join(', ')}).`)
  console.log(`A Wash saves ${S.saves(S.wash).map(f1).join(', ')}: ${f1(S.unit)} in all.`)
}

const SYMMETRIC = [
  ['Wash', 'Calcine', 'Fan', 'Kindle'],
  ['Dissolve', 'Circulate', 'Digest', 'Sublime', 'Coagulate', 'Cupel'],
]

if (args.includes('--write')) {
  const files = args.slice(args.indexOf('--write') + 1).filter((a) => a.endsWith('.json'))
  const all: Tuned[] = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))
  const outputOf = (t: Tuned) => withCount(DRAFT_OUTPUTS.find((x) => outKey(x) === t.output)!, t.count)
  // Check each candidate again on fresh seeds; keep it only if it holds there too, at the mean of the two.
  const fresh = scorer(FIGHTS, SEEDS, 9000)
  // A pair that only reached the target at the top of its knob's range (up to 20 of an element, six of a unit) is left out.
  const atCeiling = (t: Tuned) => {
    const k = knobOf(t.input, DRAFT_OUTPUTS.find((x) => outKey(x) === t.output)!)
    return (k === 'amount' && t.amount >= HI_AMOUNT) || (k === 'count' && t.count >= HI_COUNT)
  }
  const checked = all
    .filter((t) => Math.abs(t.worth - TARGET) <= TOLERANCE && !atCeiling(t))
    .map((t) => {
      const again = measurePair(t.input, DRAFT_OUTPUTS.find((x) => outKey(x) === t.output)!, t.amount, t.count, fresh).worth
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
  const again = (t: Tuned) => checked.find((c) => c.input === t.input && c.output === t.output)?.again
  for (const t of all.filter((t) => !keep.some((k) => k.input === t.input && k.output === t.output)))
    console.log(`  left out: ${t.input} → ${t.output} at ${t.amount}${t.count > 1 ? ` ×${t.count}` : ''}: ${f2(t.worth)}${again(t) !== undefined ? `, again ${f2(again(t)!)}` : ''}`)
} else if (args.includes('--calibrate')) {
  const [k, n] = (arg('--slice') ?? '0/1').split('/').map(Number)
  const pairs = DRAFT_INPUTS.flatMap((ch) => DRAFT_OUTPUTS.map((o) => ({ src: ch.element, o })))
  header()
  const done: Tuned[] = []
  for (const { src, o } of pairs.filter((_, i) => i % n === k)) {
    const t = calibrate(src, o)
    done.push(t)
    console.log(`${src} → ${t.output}: amount ${t.amount}${t.count > 1 ? `, ×${t.count}` : ''} → ${f2(t.worth)} Washes`)
    if (arg('--out')) writeFileSync(arg('--out')!, JSON.stringify(done, null, 1))
  }
} else if (args.includes('--symmetry')) {
  header()
  for (const group of SYMMETRIC) {
    const rows = group.map((name) => {
      const m = S.measure(twelfth((p) => withPrinciple(byName(name), p)))
      return { name, worth: S.worth(m), error: S.error(m), saves: S.saves(m) }
    })
    const ws = rows.map((r) => r.worth)
    console.log(`\n${group.join(', ')}: ${rows.map((r) => `${f2(r.worth)} ± ${f2(r.error)}`).join(', ')} (spread ${f2(Math.max(...ws) - Math.min(...ws))}, mean ${f2(sum(ws) / ws.length)})`)
    console.log(`Card | Washes | ${names.join(' | ')}`)
    console.log(`--- | --- | ${names.map(() => '---').join(' | ')}`)
    for (const r of rows) console.log(`${r.name} | ${f2(r.worth)} | ${r.saves.map(f1).join(' | ')}`)
  }
} else if (args.includes('--pairs')) {
  header()
  const rows = DRAFT_INPUTS.flatMap((ch) => DRAFT_OUTPUTS.map((o) => ({ name: `${ch.element} ${ch.capacity} → ${outKey(o)}`, t: measurePair(ch.element, o, ch.capacity, 1) })))
  rows.sort((a, b) => b.t.worth - a.t.worth)
  for (const r of rows) console.log(`${r.name} | ${f2(r.t.worth)}`)
} else if (args.includes('--sigils')) {
  // Each sigil on each opening card that can take it: its worth in Washes, and how often the card is drawn and played.
  const [k, n] = (arg('--slice') ?? '0/1').split('/').map(Number)
  header()
  const base = opening.map((c) => ({ c, m: S.measure(changed(c.id, (x) => x), c.id) }))
  const jobs = opening.flatMap((c) => SIGILS.filter((s) => s.fits(c)).map((s) => ({ c, s })))
  const done: { card: string; sigil: string; worth: number; plays: number; draws: number; basePlays: number; baseDraws: number }[] = []
  for (const { c, s } of jobs.filter((_, i) => i % n === k)) {
    const m = S.measure(changed(c.id, s.add), c.id)
    const b = base.find((x) => x.c.id === c.id)!.m
    const row = { card: c.name, sigil: s.name, worth: S.worth(m) - S.worth(b), plays: m.plays, draws: m.draws, basePlays: b.plays, baseDraws: b.draws }
    done.push(row)
    console.log(`${row.card} + ${row.sigil}: ${f2(row.worth)} Washes; played ${f2(row.basePlays)} → ${f2(row.plays)} a fight (drawn ${f2(row.baseDraws)})`)
    if (arg('--out')) writeFileSync(arg('--out')!, JSON.stringify(done, null, 1))
  }
} else if (args.includes('--curve')) {
  // The same sigil added again and again to one card, caps lifted. At each step: the card's worth V (its deck
  // against the same deck with the card blanked), how often it is played a fight P, and its worth a play u = V/P.
  // Each step's gain splits as dV = P̄·du (each play better) + ū·dP (played more often).
  const name = arg('--curve')!
  const card = byName(name)
  const steps = Number(arg('--steps') ?? 5)
  header()
  const without = S.worth(S.measure(changed(card.id, () => ({ ...blankCard, id: card.id })), card.id))
  const at = (change: (c: Card, p: Principle) => Card) => {
    const m = S.measure(changed(card.id, change), card.id)
    return { V: S.worth(m) - without, P: m.plays, D: m.draws }
  }
  const zero = at((c) => c)
  console.log(`\n${name} as it opens: worth ${f2(zero.V)} Washes, played ${f2(zero.P)} a fight (drawn ${f2(zero.D)}), ${f2(zero.V / zero.P)} a play.`)
  const menu: Sigil[] = [
    input({ element: 'any', capacity: 3 }),
    input({ element: 'water', capacity: 5 }),
    input({ element: 'earth', capacity: 5 }),
    input({ element: 'air', capacity: 4 }),
    input({ element: 'fire', capacity: 4 }),
    { name: 'gain', add: (c) => ({ ...c, gain: c.gain + 1 }), fits: (c) => c.purifies },
    { name: 'ground stage', add: (c) => ({ ...c, ground: c.ground + 1 }), fits: () => true },
    output('Ward', () => ({ kind: 'ward', gate: 1 })),
  ]
  const out: { sigil: string; k: number; V: number; P: number; D: number }[] = [{ sigil: 'none', k: 0, V: zero.V, P: zero.P, D: zero.D }]
  for (const s of menu.filter((s) => s.fits(card))) {
    const row = [zero]
    for (let k = 1; k <= steps; k++) row.push(at((c, p) => Array.from({ length: k }).reduce<Card>((x) => s.add(x, p), c)))
    row.forEach((r, k) => k && out.push({ sigil: s.name, k, V: r.V, P: r.P, D: r.D }))
    console.log(`\n${s.name}: k | worth V | plays P | played when drawn | a play u | dV | from better plays | from more plays`)
    row.forEach((r, k) => {
      const when = `${Math.round((100 * r.P) / r.D)}%`
      if (!k) return console.log(`  0 | ${f2(r.V)} | ${f2(r.P)} | ${when} | ${f2(r.V / r.P)} | | |`)
      const q = row[k - 1]
      const dV = r.V - q.V
      const better = ((r.P + q.P) / 2) * (r.V / r.P - q.V / q.P)
      console.log(`  ${k} | ${f2(r.V)} | ${f2(r.P)} | ${when} | ${f2(r.V / r.P)} | ${f2(dV)} | ${f2(better)} | ${f2(dV - better)}`)
    })
  }
  if (arg('--out')) writeFileSync(arg('--out')!, JSON.stringify(out, null, 1))
} else {
  header()
  const rows: { name: string; w: number; saves: number[] }[] = []
  for (const c of opening) {
    if (rows.some((r) => r.name === c.name)) continue
    const m = S.measure(twelfth((p) => withPrinciple(c, p)))
    rows.push({ name: c.name, w: S.worth(m), saves: S.saves(m) })
  }
  const cat = S.measure(twelfth(() => catalystCard(ID)))
  rows.push({ name: 'Catalyst', w: S.worth(cat), saves: S.saves(cat) })
  rows.sort((a, b) => b.w - a.w)
  console.log(`\nCard | Washes | ${names.join(' | ')}`)
  console.log(`--- | --- | ${names.map(() => '---').join(' | ')}`)
  for (const r of rows) console.log(`${r.name} | ${f2(r.w)} | ${r.saves.map(f1).join(' | ')}`)
}
