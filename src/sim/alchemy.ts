import type { Elemental, Grade, Pool } from './types'

export const ELEMENTALS: Elemental[] = ['earth', 'water', 'air', 'fire']

// The elemental square: each elemental has two qualities.
const QUALITIES: Record<Elemental, { hot: boolean; wet: boolean }> = {
  earth: { hot: false, wet: false },
  water: { hot: false, wet: true },
  air: { hot: true, wet: true },
  fire: { hot: true, wet: false },
}

export const OPPOSITE: Record<Elemental, Elemental> = {
  earth: 'air',
  air: 'earth',
  water: 'fire',
  fire: 'water',
}

/** 1 when one quality flips (a side of the square), 2 when both flip (a diagonal). */
export function stepsBetween(a: Elemental, b: Elemental): 0 | 1 | 2 {
  const q = QUALITIES[a]
  const r = QUALITIES[b]
  return ((q.hot !== r.hot ? 1 : 0) + (q.wet !== r.wet ? 1 : 0)) as 0 | 1 | 2
}

export const STEP_COST = { 1: 10, 2: 30 } as const
export const GRADE_MULT: Record<Grade, number> = { 0: 0.5, 1: 1, 2: 2, 3: 4 }
export const GRADE_NAMES: Record<Grade, string> = { 0: 'weak', 1: 'medium', 2: 'heavy', 3: 'inert' }

/**
 * Kg produced per kg changed, by from→to pair. Every elemental has a coarse
 * route and a fine route; the doc's anchors are Water→Fire 0.2, Earth→Air 20
 * and Water→Earth 0.6.
 */
export const YIELD: Record<Elemental, Record<Elemental, number>> = {
  earth: { earth: 1, water: 1.5, fire: 0.5, air: 20 },
  water: { water: 1, earth: 0.6, air: 3, fire: 0.2 },
  air: { air: 1, water: 0.3, fire: 1, earth: 0.05 },
  fire: { fire: 1, earth: 2, air: 1, water: 5 },
}

export const CONDENSE_COST = 10
export const CONDENSE_YIELD = 0.5
/** Players can condense up to heavy; inert is reserved for bosses. */
export const MAX_PLAYER_GRADE: Grade = 2

export const poolKey = (p: { elemental: Elemental; grade: Grade }) => `${p.elemental}:${p.grade}`

const round = (kg: number) => Math.round(kg * 1000) / 1000

/** Merge duplicate pools, drop empty ones, and sort by elemental then grade. */
export function normalize(pools: Pool[]): Pool[] {
  const merged = new Map<string, Pool>()
  for (const p of pools) {
    const key = poolKey(p)
    const prev = merged.get(key)
    merged.set(key, { ...p, kg: round((prev?.kg ?? 0) + p.kg) })
  }
  return [...merged.values()]
    .filter((p) => p.kg >= 0.005)
    .sort((a, b) => ELEMENTALS.indexOf(a.elemental) - ELEMENTALS.indexOf(b.elemental) || a.grade - b.grade)
}

export const totalKg = (pools: Pool[]) => pools.reduce((sum, p) => sum + p.kg, 0)

export const elementalKg = (pools: Pool[], e: Elemental) =>
  pools.filter((p) => p.elemental === e).reduce((sum, p) => sum + p.kg, 0)

export function share(pools: Pool[], e: Elemental): number {
  const total = totalKg(pools)
  return total > 0 ? elementalKg(pools, e) / total : 0
}

/** Move kg out of one pool and add produced kg to another, then normalize. */
export function transfer(
  pools: Pool[],
  from: { elemental: Elemental; grade: Grade },
  takeKg: number,
  to: { elemental: Elemental; grade: Grade },
  addKg: number,
): Pool[] {
  const next = pools.map((p) => (poolKey(p) === poolKey(from) ? { ...p, kg: p.kg - takeKg } : p))
  next.push({ elemental: to.elemental, grade: to.grade, kg: addKg })
  return normalize(next)
}
