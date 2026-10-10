import type { Body, Elemental, Mote, Rune } from './types'

// A rune is a body holding motes. The body sets power, links and bowls; the
// motes in its bowls give the element and any abilities. The numbers behind
// bodies and motes live in a Forge, so the sandbox can change them live.

export interface BodySpec {
  power: number
  links: number
  bowls: number
}

export interface MoteValues {
  /** A reach mote multiplies the sigil's Reach by this. */
  reach: number
  /** A guard mote adds this much Ward. */
  guard: number
  /** A boost mote adds this to its rune's multiplier in the equation. */
  boost: number
}

export interface Forge {
  bodies: Record<Body, BodySpec>
  values: MoteValues
}

export const BODY_LIST: Body[] = ['circle', 'crescent', 'triangle']
export const BODY_NAMES: Record<Body, string> = { circle: 'Circle', crescent: 'Crescent', triangle: 'Triangle' }

export const DEFAULT_FORGE: Forge = {
  bodies: {
    circle: { power: 5, links: 1, bowls: 1 },
    crescent: { power: 5, links: 1, bowls: 2 },
    triangle: { power: 5, links: 1, bowls: 3 },
  },
  values: { reach: 1.5, guard: 4, boost: 0.1 },
}

export const cloneForge = (f: Forge): Forge => ({
  bodies: { circle: { ...f.bodies.circle }, crescent: { ...f.bodies.crescent }, triangle: { ...f.bodies.triangle } },
  values: { ...f.values },
})

export const GEMS: Record<Elemental, string> = { water: 'Sapphire', earth: 'Emerald', air: 'Topaz', fire: 'Ruby' }

export const elementMote = (elemental: Elemental): Mote => ({ kind: 'element', elemental })
export const LINK_MOTE: Mote = { kind: 'link' }
export const REACH_MOTE: Mote = { kind: 'reach' }
export const GUARD_MOTE: Mote = { kind: 'guard' }
export const BOOST_MOTE: Mote = { kind: 'boost' }

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
  }
}

/** What a rune is made of, before the forge's numbers are applied. */
export interface RuneSpec {
  body: Body
  motes: Mote[]
}

/**
 * Build a rune from its body and motes. Motes past the body's bowls are
 * dropped. The first element mote sets the element.
 */
export function makeRune(id: number, spec: RuneSpec, forge: Forge = DEFAULT_FORGE, power?: number): Rune {
  const b = forge.bodies[spec.body]
  const motes = spec.motes.slice(0, b.bowls)
  const element = motes.find((m) => m.kind === 'element')
  return {
    id,
    body: spec.body,
    power: power ?? b.power,
    bowls: b.bowls,
    motes,
    affinity: element?.elemental ?? 'none',
    links: b.links + motes.filter((m) => m.kind === 'link').length,
    reachMult: motes.filter((m) => m.kind === 'reach').reduce((x) => x * forge.values.reach, 1),
    guard: motes.filter((m) => m.kind === 'guard').length * forge.values.guard,
    boost: motes.filter((m) => m.kind === 'boost').length * (forge.values.boost ?? 0),
  }
}

/** Re-apply the forge's numbers to an existing rune, keeping its id, body and motes. */
export const reforge = (r: Rune, forge: Forge): Rune => makeRune(r.id, { body: r.body, motes: r.motes }, forge)

const FOUR: Elemental[] = ['water', 'earth', 'air', 'fire']

/**
 * The standard starting deck, 14 runes:
 * 8 circles, two of each element;
 * 4 crescents, one of each element, each with a link mote;
 * 2 elementless triangles with a link, a reach and a guard mote.
 */
export function standardDeck(): RuneSpec[] {
  const deck: RuneSpec[] = []
  for (const e of FOUR) for (let i = 0; i < 2; i++) deck.push({ body: 'circle', motes: [elementMote(e)] })
  for (const e of FOUR) deck.push({ body: 'crescent', motes: [elementMote(e), LINK_MOTE] })
  for (let i = 0; i < 2; i++) deck.push({ body: 'triangle', motes: [LINK_MOTE, REACH_MOTE, GUARD_MOTE] })
  return deck
}

export const buildDeck = (specs: RuneSpec[], forge: Forge = DEFAULT_FORGE): Rune[] =>
  specs.map((spec, i) => makeRune(i + 1, spec, forge))

export const startingDeck = (forge: Forge = DEFAULT_FORGE): Rune[] => buildDeck(standardDeck(), forge)
