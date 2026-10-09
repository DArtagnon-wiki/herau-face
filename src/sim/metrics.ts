import { ELEMENTALS } from './alchemy'
import { BODY_LIST } from './deck'
import { runesOf } from './sigil'
import type { Affinity, Body, Elemental, Sigil } from './types'

// Candidate measures of table balance, tracked so we can see which one
// matches how play feels. Strain currently uses rune counts.

/** Sides per body, as a counting measure: circle 1, crescent 2, triangle 3. */
export const SIDES: Record<Body, number> = { circle: 1, crescent: 2, triangle: 3 }

export const AFFINITIES: Affinity[] = [...ELEMENTALS, 'none']

export interface Metrics {
  sigils: number
  runes: number
  /** Runes by element, by the element they count as. */
  runesBy: Record<Affinity, number>
  /** Gems played, by element. A rune can hold more than one. */
  motes: Record<Elemental, number>
  /** Runes by element and body. */
  grid: Record<Affinity, Record<Body, number>>
  bodies: Record<Body, number>
  /** Sides of runes, by the runes' element. */
  sidesBy: Record<Affinity, number>
  sides: number
}

export type Measure = 'runes' | 'motes' | 'sides'

export interface Balance {
  /** Earth minus Air. */
  earthAir: number
  /** Water minus Fire. */
  waterFire: number
  /** |Earth − Air| + |Water − Fire|. */
  total: number
}

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>

export function metricsOf(sigils: Sigil[]): Metrics {
  const m: Metrics = {
    sigils: sigils.length,
    runes: 0,
    runesBy: zero(AFFINITIES),
    motes: zero(ELEMENTALS),
    grid: Object.fromEntries(AFFINITIES.map((a) => [a, zero(BODY_LIST)])) as Record<Affinity, Record<Body, number>>,
    bodies: zero(BODY_LIST),
    sidesBy: zero(AFFINITIES),
    sides: 0,
  }
  for (const sigil of sigils) {
    for (const r of runesOf(sigil)) {
      m.runes += 1
      m.runesBy[r.affinity] += 1
      m.grid[r.affinity][r.body] += 1
      m.bodies[r.body] += 1
      m.sidesBy[r.affinity] += SIDES[r.body]
      m.sides += SIDES[r.body]
      for (const mote of r.motes) if (mote.kind === 'element') m.motes[mote.elemental!] += 1
    }
  }
  return m
}

export function balance(m: Metrics, measure: Measure): Balance {
  const by: Record<Elemental, number> = measure === 'runes' ? m.runesBy : measure === 'motes' ? m.motes : m.sidesBy
  const earthAir = by.earth - by.air
  const waterFire = by.water - by.fire
  return { earthAir, waterFire, total: Math.abs(earthAir) + Math.abs(waterFire) }
}
