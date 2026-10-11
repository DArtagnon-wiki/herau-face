// How much mass a deck can move in one term, the game's equivalent of damage
// per turn. For each deck along the run, deal many hands and find the most
// kilos the best sigil, and the best set of sigils for the whole hand, can
// take from an unlimited weak pool and turn into another element. Defence and
// aim are ignored: this is raw throughput against the neutral 1 kg take.
//
//   npx tsx scripts/power.ts [--hands 300] [--grade 0]

import { buildDeck } from '../src/sim/deck'
import { DEFAULT_EQUATION, resolveEquation } from '../src/sim/equation'
import { PRESETS } from '../src/sim/presets'
import { makeRng } from '../src/sim/rng'
import type { Grade, Pool, Rune, Sigil } from '../src/sim/types'

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const hands = Number(arg('--hands') ?? 300)
const grade = Number(arg('--grade') ?? 0) as Grade
const pools: Pool[] = (['earth', 'water', 'air', 'fire'] as const).map((elemental) => ({ elemental, grade, kg: 1e12 }))

/** The most kilos one sigil anchored on this rune can take, and the runes it uses. */
function bestFrom(anchor: Rune, rest: Rune[]): { kg: number; used: Rune[] } {
  let best = { kg: 0, used: [] as Rune[] }
  if (anchor.affinity === 'none') return best
  const roles = new Array<number>(rest.length).fill(0) // 0 out, 1 on the path, 2 side link
  const visit = (i: number, joined: number) => {
    if (i === rest.length) {
      const path = rest.filter((_, k) => roles[k] === 1)
      const sides = rest.filter((_, k) => roles[k] === 2)
      for (const seal of path) {
        if (seal.affinity === 'none' || seal.affinity === anchor.affinity) continue
        const sigil: Sigil = {
          anchor,
          joins: [
            ...sides.map((rune) => ({ kind: 'side' as const, rune })),
            ...path.filter((r) => r !== seal).map((rune) => ({ kind: 'circumscribe' as const, rune })),
            { kind: 'circumscribe' as const, rune: seal },
          ],
        }
        const kg = resolveEquation(sigil, pools, undefined, DEFAULT_EQUATION).converted
        if (kg > best.kg) best = { kg, used: [anchor, ...path, ...sides] }
      }
      return
    }
    for (const role of [0, 1, 2]) {
      if (role && joined >= anchor.links) continue
      roles[i] = role
      visit(i + 1, joined + (role ? 1 : 0))
    }
    roles[i] = 0
  }
  visit(0, 0)
  return best
}

function bestSigil(hand: Rune[]): { kg: number; used: Rune[] } {
  let best = { kg: 0, used: [] as Rune[] }
  for (const anchor of hand) {
    const b = bestFrom(anchor, hand.filter((r) => r !== anchor))
    if (b.kg > best.kg) best = b
  }
  return best
}

/** Greedy: cast the best sigil, then the best from what is left, until nothing moves mass. */
function bestTerm(hand: Rune[]): number {
  let left = hand
  let total = 0
  for (;;) {
    const b = bestSigil(left)
    if (b.kg <= 0) return total
    total += b.kg
    left = left.filter((r) => !b.used.includes(r))
  }
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]
const decks = [
  ...PRESETS.map((p) => ({ name: p.key, setup: p.setup(), hand: p.handSize })),
  (() => {
    const late = PRESETS.find((p) => p.key === 'late')!.setup()
    for (const b of Object.values(late.forge.bodies)) b.links += 1
    return { name: 'late+', setup: late, hand: 10 }
  })(),
]
console.log(`Kilos moved from an unlimited ${['weak', 'medium', 'heavy', 'inert'][grade]} pool, ${hands} hands per deck (neutral take ${DEFAULT_EQUATION.neutral} kg)`)
console.log('deck      hand   best sigil p10/p50/p90      whole term p10/p50/p90')
for (const d of decks) {
  const rng = makeRng(7)
  const sig: number[] = []
  const term: number[] = []
  for (let h = 0; h < hands; h++) {
    const hand = rng.shuffle(buildDeck(d.setup.deck, d.setup.forge)).slice(0, d.hand)
    sig.push(bestSigil(hand).kg)
    term.push(bestTerm(hand))
  }
  const f = (xs: number[]) => [0.1, 0.5, 0.9].map((p) => pct(xs, p).toFixed(1).padStart(6)).join(' ')
  console.log(`${d.name.padEnd(9)} ${String(d.hand).padStart(4)}   ${f(sig)}      ${f(term)}`)
}
