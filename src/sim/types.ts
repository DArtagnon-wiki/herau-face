export type Elemental = 'earth' | 'water' | 'air' | 'fire'
export type Affinity = Elemental | 'none'

/** 0 weak, 1 medium, 2 heavy, 3 inert (bosses only). */
export type Grade = 0 | 1 | 2 | 3

export type ShapeClass = 'regular' | 'isosceles' | 'scalene'
export type JoinKind = 'circumscribe' | 'link' | 'entwine' | 'inscribe'

/** A runic element: one card in the deck. */
export interface Glyph {
  id: number
  affinity: Affinity
  /** Side count; also how many joins it can hold as an anchor. */
  sides: number
  value: number
  shape: ShapeClass
}

/** One elemental at one grade within the amalgam. */
export interface Pool {
  elemental: Elemental
  grade: Grade
  kg: number
}

export interface Join {
  kind: JoinKind
  glyph: Glyph
}

/** What the player plays in one term: an anchor plus joins. */
export interface Rune {
  anchor: Glyph
  joins: Join[]
}
