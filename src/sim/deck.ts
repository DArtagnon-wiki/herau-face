import type { Affinity, Glyph, ShapeClass } from './types'

// Every starting deck has the same elements; the class decides their shapes,
// and so which join each one is apt for.
const RECIPE: [Affinity, number][] = [
  ['water', 3],
  ['water', 4],
  ['water', 4],
  ['water', 5],
  ['water', 6],
  ['earth', 3],
  ['earth', 4],
  ['earth', 4],
  ['earth', 5],
  ['air', 3],
  ['air', 4],
  ['air', 5],
  ['fire', 3],
  ['fire', 4],
  ['fire', 5],
  ['none', 4],
]

/** Fewer sides hit harder; more sides hold more joins. */
export const VALUE_BY_SIDES: Record<number, number> = { 3: 4, 4: 3, 5: 3, 6: 2 }

export function startingDeck(shape: ShapeClass): Glyph[] {
  return RECIPE.map(([affinity, sides], i) => ({ id: i + 1, affinity, sides, value: VALUE_BY_SIDES[sides], shape }))
}
