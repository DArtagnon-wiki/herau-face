import {
  CONDENSE_COST,
  CONDENSE_YIELD,
  GRADE_MULT,
  GRADE_NAMES,
  MAX_PLAYER_GRADE,
  STEP_COST,
  YIELD,
  poolKey,
  stepsBetween,
  transfer,
} from './alchemy'
import type { Elemental, Grade, Pool, Rune, Sigil } from './types'

export const REACH_PER_POWER = 0.2
export const WARD_PER_POWER = 1

export const runesOf = (s: Sigil): Rune[] => [s.anchor, ...s.joins.map((j) => j.rune)]

/**
 * Links are how many runes the anchor holds. A circle anchor makes a
 * two-rune sigil; a crescent or a triangle, with a link mote, makes three.
 * Links on joined runes do nothing; they matter when that rune anchors.
 */
export const openLinks = (s: Sigil): number => s.anchor.links - s.joins.length

/** Whether one more rune can join the sigil. */
export const canJoin = (s: Sigil, _rune?: Rune): boolean => openLinks(s) > 0

export interface Outputs {
  reach: number
  force: number
  ward: number
  /** Product of the sigil's reach motes. */
  reachMult: number
  /** Ward from guard motes, included in ward. */
  guard: number
  /** True when an inscribed rune shares the anchor's affinity. */
  condense: boolean
  /** Number of off-affinity inscribes; each halves Reach. */
  fine: number
  /** Anchor affinity, then each new circumscribed affinity in order. Null for an elementless anchor. */
  route: Elemental[] | null
}

export function outputs(sigil: Sigil): Outputs {
  const { anchor, joins } = sigil
  let reach = anchor.power * REACH_PER_POWER
  let force = anchor.power
  let ward = 0
  let condense = false
  let fine = 0
  for (const { kind, rune } of joins) {
    if (kind === 'circumscribe') force += rune.power
    else if (kind === 'side') reach += rune.power * REACH_PER_POWER
    else if (kind === 'entwine') ward += rune.power * WARD_PER_POWER
    else if (kind === 'inscribe') {
      force += rune.power
      if (anchor.affinity !== 'none' && rune.affinity === anchor.affinity) condense = true
      else fine += 1
    }
  }
  const all = runesOf(sigil)
  const reachMult = all.reduce((m, r) => m * r.reachMult, 1)
  const guard = all.reduce((g, r) => g + r.guard, 0)
  reach *= 0.5 ** fine * reachMult
  ward += guard

  let route: Elemental[] | null = null
  if (anchor.affinity !== 'none') {
    route = [anchor.affinity]
    for (const j of joins) {
      if (j.kind !== 'circumscribe' || j.rune.affinity === 'none') continue
      if (j.rune.affinity !== route[route.length - 1]) route.push(j.rune.affinity)
    }
  }
  return { reach, force, ward, reachMult, guard, condense, fine, route }
}

export interface Resolution {
  outputs: Outputs
  mode: 'transmute' | 'condense' | 'none'
  /** Why nothing changes, when mode is 'none'. */
  note: string
  source?: Pool
  target?: { elemental: Elemental; grade: Grade }
  required: number
  efficiency: number
  converted: number
  produced: number
  yieldFactor: number
  pools: Pool[]
}

const none = (out: Outputs, pools: Pool[], note: string, source?: Pool): Resolution => ({
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

/** Pools the anchor can work on, cheapest first. */
export function candidatePools(sigil: Sigil, pools: Pool[]): Pool[] {
  const aff = sigil.anchor.affinity
  if (aff === 'none') return []
  const out = outputs(sigil)
  return pools
    .filter((p) => p.elemental === aff && (!out.condense || p.grade < MAX_PLAYER_GRADE))
    .sort((a, b) => a.grade - b.grade)
}

export interface ResolveOptions {
  /**
   * When true, Force beyond the requirement multiplies Reach (circumscribe
   * as Balatro's mult). When false, the doc's formula: Force past the
   * requirement does nothing.
   */
  surplusForce: boolean
}

/** Work out exactly what casting this rune does to the amalgam. */
export function resolve(sigil: Sigil, pools: Pool[], selectedKey?: string, opts: ResolveOptions = { surplusForce: true }): Resolution {
  const out = outputs(sigil)
  const aff = sigil.anchor.affinity
  if (aff === 'none') return none(out, pools, 'An elementless anchor changes nothing. Its Ward still counts.')

  const candidates = candidatePools(sigil, pools)
  const source = candidates.find((p) => poolKey(p) === selectedKey) ?? candidates[0]
  if (!source) {
    if (out.condense && pools.some((p) => p.elemental === aff))
      return none(out, pools, `The ${aff} is already heavy.`)
    return none(out, pools, `There is no ${aff} in the amalgam.`)
  }

  let required: number
  let yieldFactor: number
  let target: { elemental: Elemental; grade: Grade }
  if (out.condense) {
    required = CONDENSE_COST * GRADE_MULT[source.grade]
    yieldFactor = CONDENSE_YIELD
    target = { elemental: aff, grade: (source.grade + 1) as Grade }
  } else {
    const route = out.route!
    if (route.length < 2) {
      const circled = sigil.joins.some((j) => j.kind === 'circumscribe' && j.rune.affinity !== 'none')
      return none(
        out,
        pools,
        circled
          ? `The ring matches the anchor. Inscribe ${aff} to condense instead.`
          : 'Circumscribe a rune to set where the change goes.',
        source,
      )
    }
    let cost = 0
    yieldFactor = 1
    for (let i = 1; i < route.length; i++) {
      const steps = stepsBetween(route[i - 1], route[i])
      cost += STEP_COST[steps as 1 | 2]
      yieldFactor *= YIELD[route[i - 1]][route[i]]
    }
    required = GRADE_MULT[source.grade] * cost
    target = { elemental: route[route.length - 1], grade: 0 }
  }

  const ratio = out.force / required
  const efficiency = opts.surplusForce ? ratio : Math.min(1, ratio)
  const converted = Math.min(source.kg, out.reach * efficiency)
  const produced = converted * yieldFactor
  return {
    outputs: out,
    mode: out.condense ? 'condense' : 'transmute',
    note: '',
    source,
    target,
    required,
    efficiency,
    converted,
    produced,
    yieldFactor,
    pools: transfer(pools, source, converted, target, produced),
  }
}

export const describePool = (p: { elemental: Elemental; grade: Grade }) => `${GRADE_NAMES[p.grade]} ${p.elemental}`
