import { cloneForge, DEFAULT_FORGE, elementMote, LINK_MOTE, REACH_MOTE, GUARD_MOTE, standardDeck, type RuneSpec } from './deck'
import { standardSetup, type Setup } from './game'
import type { Elemental } from './types'

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

const FOUR: Elemental[] = ['water', 'earth', 'air', 'fire']
const circles = (): RuneSpec[] => FOUR.flatMap((e) => [0, 1].map(() => ({ body: 'circle' as const, motes: [elementMote(e)] })))
const plainTriangles = (): RuneSpec[] => [0, 1].map(() => ({ body: 'triangle' as const, motes: [LINK_MOTE, REACH_MOTE, GUARD_MOTE] }))

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
    note: 'About ten upgrades: each crescent becomes a triangle with two link motes, so it anchors four-rune sigils, and the hand holds 7.',
    handSize: 7,
    setup: () => ({
      ...standardSetup(),
      deck: [...circles(), ...FOUR.map((e) => ({ body: 'triangle' as const, motes: [elementMote(e), LINK_MOTE, LINK_MOTE] })), ...plainTriangles()],
    }),
  },
  {
    key: 'late',
    name: 'Late-run deck',
    note: 'About twenty upgrades: triangles hold 6 bowls, each elemental triangle carries four link motes and a reach mote, so it anchors six-rune sigils, and the hand holds 8.',
    handSize: 8,
    setup: () => {
      const forge = cloneForge(DEFAULT_FORGE)
      forge.bodies.triangle.bowls = 6
      return {
        ...standardSetup(),
        forge,
        deck: [
          ...circles(),
          ...FOUR.map((e) => ({ body: 'triangle' as const, motes: [elementMote(e), LINK_MOTE, LINK_MOTE, LINK_MOTE, LINK_MOTE, REACH_MOTE] })),
          ...plainTriangles(),
        ],
      }
    },
  },
]

export const presetByKey = (key: string): Preset | undefined => PRESETS.find((p) => p.key === key)

/** Sanity: every preset keeps the standard deck's size. */
export const PRESET_DECK_SIZE = standardDeck().length
