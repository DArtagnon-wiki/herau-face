import type { Body, Elemental, Mote, MoteKind, Rarity, Rune } from './types'

// A rune is a body holding motes. The body is an N-gon with N bowls (a
// circle is a 1-gon, a crescent a 2-gon); the motes in its bowls give the
// element and any abilities. Power and links per body, and the motes'
// numbers, live in a Forge, so the sandbox can change them live.

export interface BodySpec {
  power: number
  links: number
}

export interface MoteValues {
  /** A reach mote multiplies the sigil's Reach by this. */
  reach: number
  /** A guard mote adds this much Ward. */
  guard: number
  /** A boost mote adds this to its rune's multiplier in the equation. */
  boost: number
  /** A glaze mote: Ward its sigil gains for every rune in it. */
  glaze?: number
  /** A crucible mote: Ward when its rune is drawn. */
  crucible?: number
  /** A press mote: power for every Ward held when its sigil is cast. */
  press?: number
  /** A digestion mote: the share of the pool a sigil that only purifies also takes. */
  digestion?: number
  /** A resonance mote: power for every other rune of its element in the sigil. */
  resonance?: number
  /** A magnesia mote: what its seal draws from each other element's pools, relative to the main take. */
  magnesia?: number
}

/** The archetype motes' numbers, for forges made before they existed. */
export const ARCHETYPE_VALUES = { glaze: 2, crucible: 3, press: 0.5, digestion: 0.25, resonance: 2, magnesia: 0.25 }

export interface Forge {
  bodies: Record<Body, BodySpec>
  values: MoteValues
}

export const BODY_LIST: Body[] = ['circle', 'crescent', 'triangle', 'square', 'pentagon', 'hexagon']
export const BODY_NAMES: Record<Body, string> = { circle: 'Circle', crescent: 'Crescent', triangle: 'Triangle', square: 'Square', pentagon: 'Pentagon', hexagon: 'Hexagon' }

/** Sides of each body, and so its bowls: an N-gon holds N motes. */
export const SIDES: Record<Body, number> = { circle: 1, crescent: 2, triangle: 3, square: 4, pentagon: 5, hexagon: 6 }

/** The body with this many sides, from a circle (1) to a hexagon (6). */
export const bodyWithSides = (n: number): Body => BODY_LIST[Math.min(BODY_LIST.length, Math.max(1, n)) - 1]

export const DEFAULT_FORGE: Forge = {
  bodies: Object.fromEntries(BODY_LIST.map((b) => [b, { power: 5, links: 1 }])) as Record<Body, BodySpec>,
  values: { reach: 1.5, guard: 4, boost: 0.1, ...ARCHETYPE_VALUES },
}

export const cloneForge = (f: Forge): Forge => ({
  bodies: Object.fromEntries(BODY_LIST.map((b) => [b, { ...(f.bodies[b] ?? DEFAULT_FORGE.bodies[b]) }])) as Record<Body, BodySpec>,
  values: { ...f.values },
})

export const GEMS: Record<Elemental, string> = { water: 'Sapphire', earth: 'Emerald', air: 'Topaz', fire: 'Ruby' }

export const elementMote = (elemental: Elemental): Mote => ({ kind: 'element', elemental })
export const LINK_MOTE: Mote = { kind: 'link' }
export const REACH_MOTE: Mote = { kind: 'reach' }
export const GUARD_MOTE: Mote = { kind: 'guard' }
export const BOOST_MOTE: Mote = { kind: 'boost' }
export const mote = (kind: Exclude<MoteKind, 'element'>): Mote => ({ kind })

/** Archetype motes in the order the sandbox lists them, with the archetype each serves. */
export const ARCHETYPE_MOTES: { kind: Exclude<MoteKind, 'element'>; name: string; archetype: string }[] = [
  { kind: 'glaze', name: 'Glaze', archetype: 'Consistent ward' },
  { kind: 'crucible', name: 'Crucible', archetype: 'Consistent ward' },
  { kind: 'lute', name: 'Lute', archetype: 'Consistent ward' },
  { kind: 'press', name: 'Press', archetype: 'Consistent ward' },
  { kind: 'cohobation', name: 'Cohobation', archetype: 'Combo' },
  { kind: 'distillation', name: 'Distillation', archetype: 'Combo' },
  { kind: 'multiplication', name: 'Multiplication', archetype: 'One great rune' },
  { kind: 'rectification', name: 'Rectification', archetype: 'Purity maxing' },
  { kind: 'digestion', name: 'Digestion', archetype: 'Purity maxing' },
  { kind: 'resonance', name: 'Resonance', archetype: 'Element mastery' },
  { kind: 'magnesia', name: 'Magnesia', archetype: 'Element mastery' },
  { kind: 'calcination', name: 'Calcination', archetype: 'Deck thinning' },
]

/** Every mote the sandbox offers, keyed for form controls. */
export const MOTE_OPTIONS: { key: string; mote: Mote }[] = [
  { key: 'water', mote: elementMote('water') },
  { key: 'earth', mote: elementMote('earth') },
  { key: 'air', mote: elementMote('air') },
  { key: 'fire', mote: elementMote('fire') },
  { key: 'link', mote: LINK_MOTE },
  { key: 'reach', mote: REACH_MOTE },
  { key: 'guard', mote: GUARD_MOTE },
  { key: 'boost', mote: BOOST_MOTE },
  ...ARCHETYPE_MOTES.map((m) => ({ key: m.kind as string, mote: mote(m.kind) })),
]
export const moteKey = (m: Mote) => (m.kind === 'element' ? m.elemental! : m.kind)
export const moteFromKey = (key: string): Mote | undefined => MOTE_OPTIONS.find((o) => o.key === key)?.mote

export function moteName(m: Mote): string {
  switch (m.kind) {
    case 'element':
      return `Basic ${GEMS[m.elemental!].toLowerCase()}`
    case 'link':
      return 'Link mote'
    case 'reach':
      return 'Reach mote'
    case 'guard':
      return 'Guard mote'
    case 'boost':
      return 'Boost mote'
    default:
      return ARCHETYPE_MOTES.find((a) => a.kind === m.kind)!.name
  }
}

export function moteEffect(m: Mote, values: MoteValues = DEFAULT_FORGE.values): string {
  switch (m.kind) {
    case 'element':
      return `${m.elemental![0].toUpperCase()}${m.elemental!.slice(1)}`
    case 'link':
      return '+1 link'
    case 'reach':
      return `Reach ×${values.reach}`
    case 'guard':
      return `+${values.guard} Ward`
    case 'boost':
      return `+${values.boost} multiplier`
    case 'glaze':
      return `+${values.glaze ?? ARCHETYPE_VALUES.glaze} Ward per rune in its sigil`
    case 'crucible':
      return `+${values.crucible ?? ARCHETYPE_VALUES.crucible} Ward when drawn`
    case 'lute':
      return 'Its sigil’s Ward lasts until spent'
    case 'press':
      return `+${values.press ?? ARCHETYPE_VALUES.press} power per Ward held`
    case 'cohobation':
      return 'Anchoring, returns to hand'
    case 'distillation':
      return 'Draw a rune after casting'
    case 'multiplication':
      return 'Other motes count once more each cast'
    case 'rectification':
      return 'Inscribed, purifies two grades'
    case 'digestion':
      return `Purifying takes ${Math.round(100 * (values.digestion ?? ARCHETYPE_VALUES.digestion))}% of the pool too`
    case 'resonance':
      return `+${values.resonance ?? ARCHETYPE_VALUES.resonance} power per rune of its element`
    case 'magnesia':
      return `As seal, draws ${Math.round(100 * (values.magnesia ?? ARCHETYPE_VALUES.magnesia))}% from other elements`
    case 'calcination':
      return 'Burn a rune from hand after casting'
  }
}

/** What a rune is made of, before the forge's numbers are applied. */
export interface RuneSpec {
  body: Body
  motes: Mote[]
  /** Slag a boss throws into the deck: power 1, no links, no element. */
  junk?: boolean
  /** Common unless given. */
  rarity?: Rarity
}

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare']
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' }

/**
 * Build a rune from its body and motes. An N-gon holds N motes; any past
 * that are dropped. The first element mote sets the element. A rune holding a
 * multiplication mote that has been cast `stacks` times counts each of its
 * other motes 1 + stacks times.
 */
export function makeRune(id: number, spec: RuneSpec, forge: Forge = DEFAULT_FORGE, power?: number, stacks = 0): Rune {
  const blank = { stacks: 0, glaze: 0, crucible: 0, lute: false, press: 0, cohobation: false, distill: 0, multiplication: false, rectify: false, digestion: 0, resonance: 0, magnesia: 0, calcination: 0 }
  if (spec.junk) return { id, body: 'circle', power: 1, bowls: 0, motes: [], rarity: 'common', affinity: 'none', links: 0, reachMult: 1, guard: 0, boost: 0, junk: true, ...blank }
  const b = forge.bodies[spec.body] ?? DEFAULT_FORGE.bodies[spec.body]
  const v = { ...ARCHETYPE_VALUES, ...forge.values }
  const bowls = SIDES[spec.body]
  const motes = spec.motes.slice(0, bowls)
  const element = motes.find((m) => m.kind === 'element')
  const multiplication = motes.some((m) => m.kind === 'multiplication')
  const k = multiplication ? 1 + stacks : 1
  const n = (kind: MoteKind) => motes.filter((m) => m.kind === kind).length * k
  return {
    id,
    body: spec.body,
    power: power ?? b.power,
    bowls,
    motes,
    rarity: spec.rarity ?? 'common',
    affinity: element?.elemental ?? 'none',
    links: b.links + n('link'),
    reachMult: forge.values.reach ** n('reach'),
    guard: n('guard') * forge.values.guard,
    boost: n('boost') * (forge.values.boost ?? 0),
    stacks: multiplication ? stacks : 0,
    glaze: n('glaze') * v.glaze,
    crucible: n('crucible') * v.crucible,
    lute: n('lute') > 0,
    press: n('press') * v.press,
    cohobation: n('cohobation') > 0,
    distill: n('distillation'),
    multiplication,
    rectify: n('rectification') > 0,
    digestion: n('digestion') * v.digestion,
    resonance: n('resonance') * v.resonance,
    magnesia: n('magnesia') * v.magnesia,
    calcination: n('calcination'),
  }
}

/** Re-apply the forge's numbers to an existing rune, keeping its id, body and motes. */
export const reforge = (r: Rune, forge: Forge): Rune => (r.junk ? r : makeRune(r.id, { body: r.body, motes: r.motes, rarity: r.rarity }, forge, undefined, r.stacks))

/** The rune after one more cast: a multiplication mote makes its other motes count once more. */
export const grow = (r: Rune, forge: Forge): Rune => (r.multiplication ? makeRune(r.id, { body: r.body, motes: r.motes, rarity: r.rarity }, forge, r.power, r.stacks + 1) : r)

const FOUR: Elemental[] = ['water', 'earth', 'air', 'fire']

/**
 * The standard starting deck, 14 runes:
 * 4 circles, one of each element;
 * 8 crescents, two of each element, each with a link mote;
 * 2 elementless triangles with a link, a reach and a guard mote.
 * Mostly two-link runes: a one-link anchor can only seal, never aim.
 */
export function standardDeck(): RuneSpec[] {
  return mixedDeck(1, 2)
}

/**
 * A starting deck with this many circles and crescents of each element (the
 * crescents carry a link mote), plus elementless triangles with a link, a
 * reach and a guard mote.
 */
export function mixedDeck(circlesEach: number, crescentsEach: number, triangles = 2): RuneSpec[] {
  const deck: RuneSpec[] = []
  for (const e of FOUR) for (let i = 0; i < circlesEach; i++) deck.push({ body: 'circle', motes: [elementMote(e)] })
  for (const e of FOUR) for (let i = 0; i < crescentsEach; i++) deck.push({ body: 'crescent', motes: [elementMote(e), LINK_MOTE] })
  for (let i = 0; i < triangles; i++) deck.push({ body: 'triangle', motes: [LINK_MOTE, REACH_MOTE, GUARD_MOTE] })
  return deck
}

export const buildDeck = (specs: RuneSpec[], forge: Forge = DEFAULT_FORGE): Rune[] =>
  specs.map((spec, i) => makeRune(i + 1, spec, forge))

export const startingDeck = (forge: Forge = DEFAULT_FORGE): Rune[] => buildDeck(standardDeck(), forge)
