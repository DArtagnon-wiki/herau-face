export type Elemental = 'earth' | 'water' | 'air' | 'fire'
export type Affinity = Elemental | 'none'

/** 0 weak, 1 medium, 2 heavy, 3 inert (bosses only). */
export type Grade = 0 | 1 | 2 | 3

/** A rune's body sets its power, links and bowls. */
export type Body = 'circle' | 'crescent' | 'triangle'

/** How one rune joins another in a sigil. 'side' is a side link. */
export type JoinKind = 'circumscribe' | 'side' | 'entwine' | 'inscribe' | 'tangent'

export type MoteKind = 'element' | 'link' | 'reach' | 'guard' | 'boost'

/** A mote sits in a bowl and gives the rune its element or an ability. */
export interface Mote {
  kind: MoteKind
  elemental?: Elemental
}

/** One card in the deck: a body holding motes in its bowls. */
export interface Rune {
  id: number
  body: Body
  power: number
  bowls: number
  motes: Mote[]
  // Derived from body and motes (see makeRune).
  affinity: Affinity
  /** How many other runes it can join to in a sigil. */
  links: number
  reachMult: number
  guard: number
  /** Added to this rune's multiplier at its step of the equation (boost motes). */
  boost: number
}

/** One elemental at one grade within the amalgam. */
export interface Pool {
  elemental: Elemental
  grade: Grade
  kg: number
}

export interface Join {
  kind: JoinKind
  rune: Rune
}

/** What the player casts in one term: an anchor rune plus joined runes. */
export interface Sigil {
  anchor: Rune
  joins: Join[]
}
