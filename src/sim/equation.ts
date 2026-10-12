import { GRADE_MULT, MAX_PLAYER_GRADE, elementalKg, poolKey, stepsBetween, totalKg, transfer } from './alchemy'
import type { Target } from './commission'
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
// circumscribed and inscribed runes with an element, easiest step first, and
// ends at the seal: the last of those runes placed. The output is the seal's
// element. Ties on the square go earth, fire, air, water. Neutral runes (no
// element) join the path after the seal, at the element it reached; with no
// elemental rune on the path, the last neutral one seals it at the anchor's.
//
// Purity: a step that changes element leaves the output impure. Every step
// that doesn't change element purifies, inscribed or circumscribed: a repeated
// element or a neutral rune, one grade up at one more step of resistance.
// Water → earth → earth makes medium earth; earth inside a neutral ring makes
// medium earth. Purifying that a later change of element would wipe out does
// nothing and costs nothing. Slag sits on the path and does nothing. Sigils
// never adulterate.

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
  /**
   * Grades this step purifies: +1 on any step that keeps the element (+2 with
   * rectification); 0 when it changes element, for slag, and for purifying a
   * later change would wipe out.
   */
  purity: number
}

export interface Runepath {
  /** Every step in order: the elemental runes up to the seal, then the neutral ones. */
  steps: PathStep[]
  /** The step whose element is the output: the last elemental rune placed, or with none, the last neutral one. */
  seal: PathStep
  flips: number
}

const onPath = (kind: string): kind is 'circumscribe' | 'inscribe' => kind === 'circumscribe' || kind === 'inscribe'

/**
 * Order the sigil's circumscribed and inscribed runes into a path from the
 * anchor to the seal. Null when there is no anchor element, or nothing on the
 * path but slag.
 */
export function runepath(sigil: Sigil): Runepath | null {
  const from = sigil.anchor.affinity
  if (from === 'none') return null
  const joins = sigil.joins.filter((j) => onPath(j.kind))
  const elemental = joins.filter((j) => j.rune.affinity !== 'none')
  const neutral = joins.filter((j) => j.rune.affinity === 'none')
  if (!elemental.length && !neutral.some((j) => !j.rune.junk)) return null
  const steps: PathStep[] = []
  let at: Elemental = from
  const rank = (r: Rune) => PREFERENCE.indexOf(r.affinity as Elemental)
  const cost = (r: Rune) => stepsBetween(at, r.affinity as Elemental)
  if (elemental.length) {
    const rest = elemental.slice(0, -1)
    const seal = elemental[elemental.length - 1]
    while (rest.length) {
      let best = 0
      for (let i = 1; i < rest.length; i++) {
        const [a, b] = [rest[i].rune, rest[best].rune]
        if (cost(a) < cost(b) || (cost(a) === cost(b) && rank(a) < rank(b))) best = i
      }
      const [j] = rest.splice(best, 1)
      steps.push(step(j.rune, j.kind as PathStep['kind'], at, j.rune.affinity as Elemental))
      at = j.rune.affinity as Elemental
    }
    steps.push(step(seal.rune, seal.kind as PathStep['kind'], at, seal.rune.affinity as Elemental))
    at = seal.rune.affinity as Elemental
  }
  const sealAt = elemental.length ? steps.length - 1 : steps.length + neutral.map((j) => !j.rune.junk).lastIndexOf(true)
  // Neutral runes purify whatever the path has reached.
  for (const j of neutral) steps.push(step(j.rune, j.kind as PathStep['kind'], at, at))
  // A change of element leaves the output impure, so purifying before the last change does nothing and costs nothing.
  let lastFlip = -1
  steps.forEach((s, i) => {
    if (s.flips > 0) lastFlip = i
  })
  const path = steps.map((s, i) => (i < lastFlip && s.purity ? { ...s, purity: 0 } : s))
  return { steps: path, seal: path[sealAt], flips: path.reduce((n, s) => n + s.flips, 0) }
}

function step(rune: Rune, kind: PathStep['kind'], from: Elemental, to: Elemental): PathStep {
  const flips = stepsBetween(from, to)
  const purity = flips === 0 && !rune.junk ? (rune.rectify ? 2 : 1) : 0
  return { rune, kind, from, to, flips, purity }
}

/** Purifying steps on the path: each costs one more step of resistance. */
export const purifies = (path: Runepath) => path.steps.filter((s) => s.purity > 0).length

/** Whether any step changes element. */
export const transmutes = (path: Runepath) => path.flips > 0

/**
 * The purity of what the sigil makes from a pool of this grade: changing
 * element resets it to impure, and the steps after that purify, up to pure.
 */
export function outputGrade(path: Runepath, from: Grade): Grade {
  let g: number = from
  for (const s of path.steps) {
    if (s.flips > 0) g = 0
    else if (s.purity > 0) g = g >= MAX_PLAYER_GRADE ? g : Math.min(MAX_PLAYER_GRADE, g + s.purity)
  }
  return g as Grade
}

/**
 * The anchor's pools this sigil can work, in the order to offer them, least
 * pure first (it resists least). A sigil that only purifies skips pools
 * already pure.
 */
export function sourcePools(sigil: Sigil, pools: Pool[]): Pool[] {
  const aff = sigil.anchor.affinity
  if (aff === 'none') return []
  const mine = pools.filter((p) => p.elemental === aff).sort((a, b) => a.grade - b.grade)
  const path = runepath(sigil)
  return !path || transmutes(path) ? mine : mine.filter((p) => p.grade < MAX_PLAYER_GRADE)
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
  /** Share of the pool a sigil that only purifies also takes (digestion motes); 0 otherwise. */
  digest: number
}

/** The equation's terms for a sigil against one pool. */
export function terms(sigil: Sigil, source: Pool, eq: Equation, path: Runepath): EquationTerms {
  const { anchor, joins } = sigil
  const pure = purifies(path)
  const power = anchor.power + path.steps.reduce((p, s) => p + s.rune.power, 0)
  const resistance = eq.base * GRADE_MULT[source.grade] * eq.step ** (path.flips + (eq.purifyStep === false ? 0 : pure))
  const out = outputs(sigil)
  // Reach floors at 1 either way, so a powerless anchor neither divides by nothing nor takes nothing for it.
  const reachUp = Math.max(1, anchor.power + joins.filter((j) => j.kind === 'side').reduce((p, j) => p + j.rune.power, 0)) * out.reachMult
  const reachDown = Math.max(1, anchor.power + joins.filter((j) => j.kind === 'tangent').reduce((p, j) => p + j.rune.power, 0))
  const multiplier = path.steps.reduce((m, s) => (s.kind === 'circumscribe' ? m * (eq.ring + s.rune.boost) : m / (eq.inscribe + s.rune.boost)), 1)
  const digest = !transmutes(path) ? [anchor, ...joins.map((j) => j.rune)].reduce((d, r) => d + r.digestion, 0) : 0
  return { path, purifies: pure, power, resistance, reachUp, reachDown, authority: Math.log(1 + power / resistance), multiplier, digest }
}

/** The neutral take for this pool, the power gate, and what the sigil wants after aiming. */
export function take(eq: Equation, t: EquationTerms, poolKg: number): { neutral: number; gate: number; wanted: number } {
  const neutral = eq.neutral + (eq.share ?? 0) * poolKg
  const gate = eq.gate ? Math.min(1, t.power / t.resistance) : 1
  // Digestion: a sigil that only purifies also takes a share of the pool, gated by power like the rest.
  return { neutral, gate, wanted: neutral * gate * (t.reachUp / t.reachDown) ** t.authority + (t.digest ?? 0) * gate * poolKg }
}

/** Work out exactly what casting this sigil does under the equation. */
export function resolveEquation(sigil: Sigil, pools: Pool[], selectedKey: string | undefined, eq: Equation, goal?: Target): Resolution {
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
  if (!path) return none('Circumscribe or inscribe a rune to seal the equation.')
  const seal = path.seal
  const candidates = sourcePools(sigil, pools)
  const source = candidates.find((p) => poolKey(p) === selectedKey) ?? candidates[0]
  if (!source) {
    if (pools.some((p) => p.elemental === aff) && !transmutes(path)) return none(`The ${aff} is already pure.`)
    return none(`There is no ${aff} in the amalgam.`)
  }
  const t = terms(sigil, source, eq, path)
  const { wanted } = take(eq, t, source.kg)
  const converted = Math.min(source.kg, wanted)
  const produced = converted * t.multiplier
  const target = { elemental: seal.to, grade: outputGrade(path, source.grade) }
  const mode = transmutes(path) ? 'transmute' : 'purify'
  let after = transfer(pools, source, converted, target, produced)
  // Magnesia: a transmuting seal also draws from every other element's pools,
  // a share of the main take each, homing in: never past the middle of an
  // element's band in the target.
  const gathered: { source: Pool; kg: number }[] = []
  if (seal.rune.magnesia > 0 && transmutes(path)) {
    const total = totalKg(after)
    const room: Partial<Record<Elemental, number>> = {}
    for (const p of after) {
      if (p.elemental === seal.to || poolKey(p) === poolKey(source)) continue
      const band = goal?.[p.elemental]
      const floor = band && (band.min > 0 || band.max < 1) ? ((band.min + band.max) / 2) * total : 0
      room[p.elemental] ??= Math.max(0, elementalKg(after, p.elemental) - floor)
      const kg = Math.min(p.kg, seal.rune.magnesia * converted, room[p.elemental]!)
      if (kg <= 0.001) continue
      room[p.elemental]! -= kg
      gathered.push({ source: p, kg })
    }
    for (const g of gathered) after = transfer(after, g.source, g.kg, { elemental: seal.to, grade: 0 }, g.kg * t.multiplier)
  }
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
    pools: after,
    ...(gathered.length ? { gathered } : {}),
  }
}
