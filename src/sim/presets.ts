import { cloneForge, DEFAULT_FORGE, elementMote, GUARD_MOTE, LINK_MOTE, mote, REACH_MOTE, standardDeck, type RuneSpec } from './deck'
import { standardSetup, type Setup } from './game'
import type { Catalyst, Elemental, Mote, MoteKind } from './types'

// Decks from points along a run, for feeling and simulating the power arc.
// Each keeps the standard deck's 14 runes and upgrades a few of them, about
// one upgrade per commission: the opening deck, one ten commissions in, and
// one at the end of a run of twenty.

export interface Preset {
  key: string
  name: string
  note: string
  handSize: number
  setup: () => Setup
}

const elementOf = (spec: RuneSpec): Elemental | undefined => spec.motes.find((m) => m.kind === 'element')?.elemental

/** Upgrade the first crescent of each element into a triangle holding these motes. */
function upgradeCrescents(deck: RuneSpec[], motes: (e: Elemental) => Mote[]): RuneSpec[] {
  const done = new Set<Elemental>()
  return deck.map((spec) => {
    const e = elementOf(spec)
    if (spec.body !== 'crescent' || !e || done.has(e)) return spec
    done.add(e)
    return { body: 'triangle', motes: motes(e) }
  })
}

export const PRESETS: Preset[] = [
  {
    key: 'opening',
    name: 'Opening deck',
    note: 'The standard 14 runes and a 6-rune hand.',
    handSize: 6,
    setup: standardSetup,
  },
  {
    key: 'mid',
    name: 'Mid-run deck',
    note: 'About ten upgrades: one crescent of each element becomes a triangle with two link motes, so it anchors four-rune sigils, and the hand holds 7.',
    handSize: 7,
    setup: () => ({ ...standardSetup(), deck: upgradeCrescents(standardDeck(), (e) => [elementMote(e), LINK_MOTE, LINK_MOTE]) }),
  },
  {
    key: 'late',
    name: 'Late-run deck',
    note: 'About twenty upgrades: triangles hold 6 bowls, and one triangle of each element carries four link motes and a reach mote, so it anchors six-rune sigils, and the hand holds 8.',
    handSize: 8,
    setup: () => {
      const forge = cloneForge(DEFAULT_FORGE)
      forge.bodies.triangle.bowls = 6
      return {
        ...standardSetup(),
        forge,
        deck: upgradeCrescents(standardDeck(), (e) => [elementMote(e), LINK_MOTE, LINK_MOTE, LINK_MOTE, LINK_MOTE, REACH_MOTE]),
      }
    },
  },
]

// Archetype decks: the mid-run deck's budget of about ten upgrades spent on
// one archetype instead of on links (see DESIGN.md, Archetypes). Each has a
// late version, about twenty upgrades and an 8-rune hand, for the Mire.

export interface ArchetypeDeck extends Preset {
  /** The archetype motes it is built on. */
  motes: MoteKind[]
  catalysts: Catalyst[]
}

const E = elementMote
const M = (k: Exclude<MoteKind, 'element'>) => mote(k)
const tri = (...motes: Mote[]): RuneSpec => ({ body: 'triangle', motes })
const cres = (...motes: Mote[]): RuneSpec => ({ body: 'crescent', motes })
const circ = (e: Elemental): RuneSpec => ({ body: 'circle', motes: [E(e)] })
const PLAIN = tri(LINK_MOTE, REACH_MOTE, GUARD_MOTE)
const FOUR: Elemental[] = ['water', 'earth', 'air', 'fire']
const late = (bowls = 6) => {
  const forge = cloneForge(DEFAULT_FORGE)
  forge.bodies.triangle.bowls = bowls
  return forge
}

/** The standard deck with each listed element's first crescent made into a triangle holding these motes. */
const shaped = (by: Partial<Record<Elemental, Mote[]>>, rest: (e: Elemental) => RuneSpec = (e) => cres(E(e), LINK_MOTE)): RuneSpec[] => {
  const deck: RuneSpec[] = []
  for (const e of FOUR) deck.push(circ(e))
  for (const e of FOUR) {
    deck.push(by[e] ? tri(...by[e]!) : rest(e))
    deck.push(rest(e))
  }
  deck.push(PLAIN, PLAIN)
  return deck
}

function archetype(
  key: string,
  name: string,
  motes: MoteKind[],
  catalysts: Catalyst[],
  mid: { note: string; deck: () => RuneSpec[]; bowls?: number },
  lateDeck: { note: string; deck: () => RuneSpec[] },
): ArchetypeDeck[] {
  return [
    { key, name, note: mid.note, handSize: 7, motes, catalysts, setup: () => ({ ...standardSetup(), ...(mid.bowls ? { forge: late(mid.bowls) } : {}), deck: mid.deck(), catalysts }) },
    { key: `${key}-late`, name: `${name}, late`, note: lateDeck.note, handSize: 8, motes, catalysts, setup: () => ({ ...standardSetup(), forge: late(), deck: lateDeck.deck(), catalysts }) },
  ]
}

const L = LINK_MOTE
export const ARCHETYPE_DECKS: ArchetypeDeck[] = [
  ...archetype(
    'ward',
    'Consistent ward',
    ['glaze', 'crucible', 'lute', 'press'],
    [],
    {
      note: 'Each element’s triangle holds a link and a glaze, so its sigils defend as they work; the plain triangles hold a lute, a crucible and a press, so Ward kept becomes power.',
      deck: () => shaped({ water: [E('water'), L, M('glaze')], earth: [E('earth'), L, M('glaze')], air: [E('air'), L, M('glaze')], fire: [E('fire'), L, M('glaze')] }).map((r) => (r === PLAIN ? tri(M('lute'), M('crucible'), M('press')) : r)),
    },
    {
      note: 'Six-bowl triangles: four links, a glaze and a lute on each element’s triangle; the plain triangles hold a reach, two crucibles and two presses.',
      deck: () => shaped(Object.fromEntries(FOUR.map((e) => [e, [E(e), L, L, L, M('glaze'), M('lute')]]))).map((r) => (r === PLAIN ? tri(REACH_MOTE, M('crucible'), M('crucible'), M('press'), M('press'), GUARD_MOTE) : r)),
    },
  ),
  ...archetype(
    'combo',
    'Combo',
    ['cohobation', 'distillation'],
    ['pelican'],
    {
      note: 'Water and earth triangles anchor with cohobation and a link; every crescent distils instead of linking; the pelican.',
      deck: () => shaped({ water: [E('water'), M('cohobation'), L], earth: [E('earth'), M('cohobation'), L] }, (e) => cres(E(e), M('distillation'))),
    },
    {
      note: 'Six-bowl triangles: every element’s triangle anchors with cohobation, three links and a reach; crescents distil; the pelican.',
      deck: () => shaped(Object.fromEntries(FOUR.map((e) => [e, [E(e), M('cohobation'), L, L, L, REACH_MOTE]])), (e) => cres(E(e), M('distillation'))),
    },
  ),
  ...archetype(
    'great',
    'One great rune',
    ['multiplication', 'calcination'],
    [],
    {
      note: 'One water triangle with four bowls holds multiplication, a link and a reach; two earth crescents calcine to thin the deck; earth and air get the usual triangles.',
      bowls: 4,
      deck: () =>
        shaped({ earth: [E('earth'), L, L], air: [E('air'), L, L] }).map((r, i) => (i === 4 ? { body: 'triangle', motes: [E('water'), M('multiplication'), L, REACH_MOTE] } : r.body === 'crescent' && r.motes[0].elemental === 'earth' ? cres(E('earth'), M('calcination')) : r)),
    },
    {
      note: 'The great rune is a six-bowl water triangle holding multiplication, a link, a reach and calcination, so each cast also burns more of the deck and it comes round sooner; the other triangles stay at mid-run strength.',
      deck: () =>
        shaped({ water: [E('water'), M('multiplication'), L, REACH_MOTE, M('calcination')], earth: [E('earth'), L, L], air: [E('air'), L, L], fire: [E('fire'), L, L] }).map((r) =>
          r.body === 'crescent' && r.motes[0].elemental === 'earth' ? cres(E('earth'), M('calcination')) : r,
        ),
    },
  ),
  ...archetype(
    'purity',
    'Purity maxing',
    ['rectification', 'digestion'],
    ['aqua-vitae'],
    {
      note: 'Earth triangles anchor with digestion and a link; earth crescents inscribe with rectification; a water triangle; aqua vitae.',
      deck: () => shaped({ water: [E('water'), L, L], earth: [E('earth'), M('digestion'), L] }).map((r) => (r.body === 'crescent' && r.motes[0].elemental === 'earth' ? cres(E('earth'), M('rectification')) : r)),
    },
    {
      note: 'Six-bowl triangles with four links and a reach, the earth one with digestion in place of a link; earth crescents rectify; aqua vitae.',
      deck: () =>
        shaped(Object.fromEntries(FOUR.map((e) => [e, e === 'earth' ? [E(e), M('digestion'), L, L, L, REACH_MOTE] : [E(e), L, L, L, L, REACH_MOTE]]))).map((r) =>
          r.body === 'crescent' && r.motes[0].elemental === 'earth' ? cres(E('earth'), M('rectification')) : r,
        ),
    },
  ),
  ...archetype(
    'mastery',
    'Element mastery',
    ['resonance', 'magnesia'],
    [],
    {
      note: 'No air or fire runes: water triangles anchor, water crescents resonate as side links, earth crescents seal with magnesia to pull the traces in.',
      deck: () => [
        circ('water'),
        circ('earth'),
        tri(E('water'), L, L),
        tri(E('water'), L, L),
        cres(E('water'), M('resonance')),
        cres(E('water'), M('resonance')),
        cres(E('water'), L),
        cres(E('water'), L),
        cres(E('earth'), M('magnesia')),
        cres(E('earth'), M('magnesia')),
        cres(E('earth'), L),
        cres(E('earth'), L),
        PLAIN,
        PLAIN,
      ],
    },
    {
      note: 'Six-bowl water triangles with four links and a reach; resonant water crescents; magnesia earth seals; an earth triangle.',
      deck: () => [
        circ('water'),
        circ('earth'),
        tri(E('water'), L, L, L, L, REACH_MOTE),
        tri(E('water'), L, L, L, L, REACH_MOTE),
        cres(E('water'), M('resonance')),
        cres(E('water'), M('resonance')),
        cres(E('water'), M('resonance')),
        cres(E('water'), L),
        cres(E('earth'), M('magnesia')),
        cres(E('earth'), M('magnesia')),
        tri(E('earth'), L, L, L, L, REACH_MOTE),
        cres(E('earth'), L),
        PLAIN,
        PLAIN,
      ],
    },
  ),
  ...archetype(
    'thinning',
    'Deck thinning',
    ['calcination'],
    ['caput-mortuum'],
    {
      note: 'The mid-run triangles, with calcination in place of a link on water and earth, burn slag and plain circles; the caput mortuum turns each burn into power.',
      deck: () => shaped({ water: [E('water'), L, M('calcination')], earth: [E('earth'), L, M('calcination')], air: [E('air'), L, L], fire: [E('fire'), L, L] }),
    },
    {
      note: 'The late-run triangles, with calcination in place of a link on every element; the caput mortuum.',
      deck: () => shaped(Object.fromEntries(FOUR.map((e) => [e, [E(e), L, L, L, M('calcination'), REACH_MOTE]]))),
    },
  ),
]

export const presetByKey = (key: string): Preset | undefined => PRESETS.find((p) => p.key === key) ?? ARCHETYPE_DECKS.find((p) => p.key === key)

/** Sanity: every preset keeps the standard deck's size. */
export const PRESET_DECK_SIZE = standardDeck().length
