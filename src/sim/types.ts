export type Elemental = 'earth' | 'water' | 'air' | 'fire'
export type Affinity = Elemental | 'none'

/** Purity: 0 impure, 1 medium, 2 pure, 3 perfect (bosses only). */
export type Grade = 0 | 1 | 2 | 3

/**
 * A rune's body: an N-gon with N bowls, a circle counting as a 1-gon and a
 * crescent as a 2-gon. The body sets its bowls; the forge sets power and links.
 */
export type Body = 'circle' | 'crescent' | 'triangle' | 'square' | 'pentagon' | 'hexagon'

/** How one rune joins another in a sigil. 'side' is a side link. */
export type JoinKind = 'circumscribe' | 'side' | 'entwine' | 'inscribe' | 'tangent'

export type MoteKind =
  | 'element'
  | 'link'
  | 'reach'
  | 'guard'
  | 'boost'
  // Archetype motes (see DESIGN.md, Archetypes).
  | 'glaze'
  | 'crucible'
  | 'lute'
  | 'press'
  | 'cohobation'
  | 'distillation'
  | 'multiplication'
  | 'rectification'
  | 'digestion'
  | 'resonance'
  | 'magnesia'
  | 'calcination'

/** Passive modifiers held for the whole run, the game's jokers and relics. */
export type Catalyst = 'pelican' | 'aqua-vitae' | 'caput-mortuum'

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
  /** Slag from a boss: power 1, no links, no element. */
  junk?: boolean
  /** Times it has been cast this commission while holding a multiplication mote: its other motes count this many times more. */
  stacks: number
  /** Ward its sigil gains for every rune in it (glaze). */
  glaze: number
  /** Ward this term when it is drawn (crucible). */
  crucible: number
  /** Ward from its sigil lasts until a flare spends it (lute). */
  lute: boolean
  /** Power for every Ward held when its sigil is cast (press). */
  press: number
  /** When it anchors, it returns to hand after the cast (cohobation). */
  cohobation: boolean
  /** Runes drawn when its sigil resolves (distillation). */
  distill: number
  /** Grows each time it is cast (multiplication). */
  multiplication: boolean
  /** Its inscribe step purifies two grades instead of one (rectification). */
  rectify: boolean
  /** The share of the pool a sigil that only purifies also takes (digestion). */
  digestion: number
  /** Power for every other rune of its element in the sigil (resonance). */
  resonance: number
  /** As the seal, the share drawn from every other element's pools, relative to the main take (magnesia). */
  magnesia: number
  /** Runes burned from hand when its sigil resolves (calcination). */
  calcination: number
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
