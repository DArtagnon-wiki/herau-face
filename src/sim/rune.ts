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
import type { Elemental, Glyph, Grade, JoinKind, Pool, Rune, ShapeClass } from './types'

/** Each class joins one way especially well. */
export const APTITUDE: Record<ShapeClass, JoinKind> = {
  regular: 'entwine',
  isosceles: 'link',
  scalene: 'circumscribe',
}
export const APT_BONUS = 1.5
export const REACH_PER_VALUE = 0.2
export const WARD_PER_VALUE = 1.0

export const aptitude = (g: Glyph, kind: JoinKind) => (APTITUDE[g.shape] === kind ? APT_BONUS : 1)

export interface Outputs {
  reach: number
  force: number
  ward: number
  /** True when an inscribed element shares the anchor's affinity. */
  condense: boolean
  /** Number of off-affinity inscribes; each halves Reach. */
  fine: number
  /** Anchor affinity, then each new circumscribed affinity in order. Null for a neutral anchor. */
  route: Elemental[] | null
}

export function outputs(rune: Rune): Outputs {
  const { anchor, joins } = rune
  let reach = anchor.value * REACH_PER_VALUE
  let force = anchor.value
  let ward = 0
  let condense = false
  let fine = 0
  for (const { kind, glyph } of joins) {
    const apt = aptitude(glyph, kind)
    if (kind === 'circumscribe') force += glyph.value * apt
    else if (kind === 'link') reach += glyph.value * REACH_PER_VALUE * apt
    else if (kind === 'entwine') ward += glyph.value * WARD_PER_VALUE * apt
    else {
      force += glyph.value
      if (anchor.affinity !== 'none' && glyph.affinity === anchor.affinity) condense = true
      else fine += 1
    }
  }
  reach *= 0.5 ** fine

  let route: Elemental[] | null = null
  if (anchor.affinity !== 'none') {
    route = [anchor.affinity]
    for (const j of joins) {
      if (j.kind !== 'circumscribe' || j.glyph.affinity === 'none') continue
      if (j.glyph.affinity !== route[route.length - 1]) route.push(j.glyph.affinity)
    }
  }
  return { reach, force, ward, condense, fine, route }
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
export function candidatePools(rune: Rune, pools: Pool[]): Pool[] {
  const aff = rune.anchor.affinity
  if (aff === 'none') return []
  const out = outputs(rune)
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
export function resolve(rune: Rune, pools: Pool[], selectedKey?: string, opts: ResolveOptions = { surplusForce: true }): Resolution {
  const out = outputs(rune)
  const aff = rune.anchor.affinity
  if (aff === 'none') return none(out, pools, 'A neutral anchor changes nothing. Its joins still ward.')

  const candidates = candidatePools(rune, pools)
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
      const circled = rune.joins.some((j) => j.kind === 'circumscribe' && j.glyph.affinity !== 'none')
      return none(
        out,
        pools,
        circled
          ? `The ring matches the anchor. Inscribe ${aff} to condense instead.`
          : 'Circumscribe an element to set where the change goes.',
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
