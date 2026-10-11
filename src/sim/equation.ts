import { GRADE_MULT, MAX_PLAYER_GRADE, poolKey, stepsBetween, transfer } from './alchemy'
import { outputs, type Resolution } from './sigil'
import type { Elemental, Grade, Pool, Rune, Sigil } from './types'

// The alchemical equation: a second model for what a sigil does, next to the
// Reach × Force model in sigil.ts.
//
//   resistance = the pool's base × step for every quality flipped, and every purifying step, along the runepath
//   input kg   = (neutral + share × pool) × min(1, power ÷ resistance) × (reach up ÷ reach down) ^ ln(1 + power ÷ resistance)
//   output kg  = input × each circumscribe's multiplier ÷ each inscribe's divider
//
// The runepath starts at the anchor and walks the elemental square through the
// circumscribed and inscribed runes, easiest step first, and ends at the seal:
// the last of those runes placed with an element. The output is the seal's
// element. Ties on the square go earth, fire, air, water.
//
// Purity: a step that changes element leaves the output impure. A step that
// stays on the same element changes purity instead: inscribed, it purifies
// (one grade up, at one extra step of resistance); circumscribed, it
// adulterates (one grade down). So air → water → water, the second water
// inscribed, makes medium water.

export interface Equation {
  /** The material's base resistance. A pool's is this × its grade multiplier; the commission can raise it. */
  base: number
  /** Each quality flipped along the runepath multiplies resistance by this; a diagonal flips two. */
  step: number
  /** A circumscribe multiplies output by this, plus its rune's boost motes. */
  ring: number
  /** An inscribe divides output by this, plus its rune's boost motes. */
  inscribe: number
  /** Flat kilos in the neutral take: what a sigil takes when reach up equals reach down. */
  neutral: number
  /** The share of the source pool added to the neutral take, so small pools give small takes. */
  share: number
  /** When true, power short of resistance scales the take down: min(1, power ÷ resistance). */
  gate: boolean
  /** Whether each purifying step costs one more step of resistance (true unless set false). */
  purifyStep?: boolean
}

/**
 * Fitted against mud with the standard deck of 4 circles and 8 crescents: a
 * flat 1 kg neutral take, gated by power. The opening deck takes a median 6
 * terms and 4 quintessence.
 */
export const DEFAULT_EQUATION: Equation = { base: 3.5, step: 2, ring: 1.1, inscribe: 1.1, neutral: 1, share: 0, gate: true }

/** How ties on the square break: earth, fire, air (wind), water. */
export const PREFERENCE: Elemental[] = ['earth', 'fire', 'air', 'water']

export interface PathStep {
  rune: Rune
  kind: 'circumscribe' | 'inscribe'
  from: Elemental
  to: Elemental
  /** Qualities flipped on this step: 0 same element, 1 an edge of the square, 2 a diagonal. */
  flips: number
  /** On a same-element step: +1 when inscribed (purify), −1 when circumscribed (adulterate). 0 otherwise. */
  purity: -1 | 0 | 1
}

export interface Runepath {
  /** Every step in order; the last is the seal. */
  steps: PathStep[]
  flips: number
}

const onPath = (kind: string): kind is 'circumscribe' | 'inscribe' => kind === 'circumscribe' || kind === 'inscribe'

/**
 * Order the sigil's circumscribed and inscribed runes into a path from the
 * anchor to the seal. Null when there is no anchor element or no seal.
 * Runes without an element sit where the path is and flip nothing.
 */
export function runepath(sigil: Sigil): Runepath | null {
  const from = sigil.anchor.affinity
  if (from === 'none') return null
  const joins = sigil.joins.filter((j) => onPath(j.kind))
  let sealAt = -1
  joins.forEach((j, i) => {
    if (j.rune.affinity !== 'none') sealAt = i
  })
  if (sealAt < 0) return null
  const seal = joins[sealAt]
  const rest = joins.filter((_, i) => i !== sealAt)
  const steps: PathStep[] = []
  let at: Elemental = from
  const rank = (r: Rune) => (r.affinity === 'none' ? -1 : PREFERENCE.indexOf(r.affinity))
  const cost = (r: Rune) => (r.affinity === 'none' ? 0 : stepsBetween(at, r.affinity))
  while (rest.length) {
    let best = 0
    for (let i = 1; i < rest.length; i++) {
      const [a, b] = [rest[i].rune, rest[best].rune]
      if (cost(a) < cost(b) || (cost(a) === cost(b) && rank(a) < rank(b))) best = i
    }
    const [j] = rest.splice(best, 1)
    const to = j.rune.affinity === 'none' ? at : j.rune.affinity
    steps.push(step(j.rune, j.kind as PathStep['kind'], at, to))
    at = to
  }
  steps.push(step(seal.rune, seal.kind as PathStep['kind'], at, seal.rune.affinity as Elemental))
  return { steps, flips: steps.reduce((n, s) => n + s.flips, 0) }
}

function step(rune: Rune, kind: PathStep['kind'], from: Elemental, to: Elemental): PathStep {
  const flips = stepsBetween(from, to)
  const purity = flips === 0 && rune.affinity !== 'none' ? (kind === 'inscribe' ? 1 : -1) : 0
  return { rune, kind, from, to, flips, purity }
}

/** Purifying steps on the path: each costs one more step of resistance. */
export const purifies = (path: Runepath) => path.steps.filter((s) => s.purity > 0).length

/** Whether any step changes element. */
export const transmutes = (path: Runepath) => path.flips > 0

/**
 * The purity of what the sigil makes from a pool of this grade: changing
 * element resets it to impure, and same-element steps after that purify or
 * adulterate, up to pure.
 */
export function outputGrade(path: Runepath, from: Grade): Grade {
  let g: number = from
  for (const s of path.steps) {
    if (s.flips > 0) g = 0
    else if (s.purity > 0) g = g >= MAX_PLAYER_GRADE ? g : g + 1
    else if (s.purity < 0) g = Math.max(0, g - 1)
  }
  return g as Grade
}

/** Which way a sigil that never changes element moves purity: +1, −1 or 0 (net, ignoring the bounds). */
const netPurity = (path: Runepath) => path.steps.reduce((n, s) => n + s.purity, 0)

/**
 * The anchor's pools this sigil can work, in the order to offer them. A
 * transmuting sigil prefers the least pure (it resists least); one that only
 * purifies skips pools already pure, and one that only adulterates skips
 * impure pools and prefers the purest.
 */
export function sourcePools(sigil: Sigil, pools: Pool[]): Pool[] {
  const aff = sigil.anchor.affinity
  if (aff === 'none') return []
  const mine = pools.filter((p) => p.elemental === aff)
  const path = runepath(sigil)
  if (!path || transmutes(path)) return mine.sort((a, b) => a.grade - b.grade)
  const net = netPurity(path)
  if (net > 0) return mine.filter((p) => p.grade < MAX_PLAYER_GRADE).sort((a, b) => a.grade - b.grade)
  if (net < 0) return mine.filter((p) => p.grade > 0).sort((a, b) => b.grade - a.grade)
  return mine.sort((a, b) => a.grade - b.grade)
}

export interface EquationTerms {
  path: Runepath
  /** Purifying steps, each one more step of resistance. */
  purifies: number
  power: number
  resistance: number
  reachUp: number
  reachDown: number
  /** ln(1 + power ÷ resistance): how far the sigil can push its reach ratio. */
  authority: number
  multiplier: number
}

/** The equation's terms for a sigil against one pool. */
export function terms(sigil: Sigil, source: Pool, eq: Equation, path: Runepath): EquationTerms {
  const { anchor, joins } = sigil
  const pure = purifies(path)
  const power = anchor.power + path.steps.reduce((p, s) => p + s.rune.power, 0)
  const resistance = eq.base * GRADE_MULT[source.grade] * eq.step ** (path.flips + (eq.purifyStep === false ? 0 : pure))
  const out = outputs(sigil)
  const reachUp = (anchor.power + joins.filter((j) => j.kind === 'side').reduce((p, j) => p + j.rune.power, 0)) * out.reachMult
  const reachDown = anchor.power + joins.filter((j) => j.kind === 'tangent').reduce((p, j) => p + j.rune.power, 0)
  const multiplier = path.steps.reduce((m, s) => (s.kind === 'circumscribe' ? m * (eq.ring + s.rune.boost) : m / (eq.inscribe + s.rune.boost)), 1)
  return { path, purifies: pure, power, resistance, reachUp, reachDown, authority: Math.log(1 + power / resistance), multiplier }
}

/** The neutral take for this pool, the power gate, and what the sigil wants after aiming. */
export function take(eq: Equation, t: EquationTerms, poolKg: number): { neutral: number; gate: number; wanted: number } {
  const neutral = eq.neutral + (eq.share ?? 0) * poolKg
  const gate = eq.gate ? Math.min(1, t.power / t.resistance) : 1
  return { neutral, gate, wanted: neutral * gate * (t.reachUp / t.reachDown) ** t.authority }
}

/** Work out exactly what casting this sigil does under the equation. */
export function resolveEquation(sigil: Sigil, pools: Pool[], selectedKey: string | undefined, eq: Equation): Resolution {
  const out = outputs(sigil)
  const none = (note: string, source?: Pool): Resolution => ({
    outputs: out,
    mode: 'none',
    note,
    source,
    required: 0,
    efficiency: 0,
    converted: 0,
    produced: 0,
    yieldFactor: 0,
    pools,
  })
  const aff = sigil.anchor.affinity
  if (aff === 'none') return none('An elementless anchor changes nothing. Its Ward still counts.')
  const path = runepath(sigil)
  if (!path) return none('Circumscribe or inscribe a rune with an element to seal the equation.')
  const seal = path.steps[path.steps.length - 1]
  const candidates = sourcePools(sigil, pools)
  const source = candidates.find((p) => poolKey(p) === selectedKey) ?? candidates[0]
  if (!source) {
    const net = netPurity(path)
    if (pools.some((p) => p.elemental === aff) && !transmutes(path))
      return none(net > 0 ? `The ${aff} is already pure.` : `The ${aff} is already impure.`)
    return none(`There is no ${aff} in the amalgam.`)
  }
  const t = terms(sigil, source, eq, path)
  const { wanted } = take(eq, t, source.kg)
  const converted = Math.min(source.kg, wanted)
  const produced = converted * t.multiplier
  const target = { elemental: seal.to, grade: outputGrade(path, source.grade) }
  const mode = transmutes(path) ? 'transmute' : target.grade > source.grade ? 'purify' : target.grade < source.grade ? 'adulterate' : 'transmute'
  return {
    outputs: out,
    mode,
    note: '',
    source,
    target,
    required: t.resistance,
    efficiency: t.authority,
    converted,
    produced,
    yieldFactor: t.multiplier,
    pools: transfer(pools, source, converted, target, produced),
  }
}
