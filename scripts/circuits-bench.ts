// The balance bench's core: decks, fights and scores, shared by the balance
// simulator (scripts/circuits-balance.ts) and the gallery tuner.
//
// What a fight costs is the quintessence it takes, less METAL_WORTH for each
// metal smelted after it. A build's worth is what it saves against a blank
// twelfth card that does nothing, over what a second Wash saves: blank 0,
// Wash 1. So that no element is tied to a principle, the metal makers'
// principles turn over the seeds, and so does any principle output of the card
// being measured.

import { DEFAULT_SETTINGS, PRINCIPLES, fightWith, startingDeck, type Card, type Commission, type Principle } from '../src/circuits/engine'
import { apply, greedyMove } from './circuits-players'

/** Quintessence a metal is worth: the tincture of salt sets a floor of about 3, and metal probably counts for more, since it scales the run. */
export let METAL_WORTH = 3
/** Price metal differently, as the upgrades it buys suggest. */
export function setMetalWorth(x: number): void {
  METAL_WORTH = x
}

// ---------------------------------------------------------------------------
// Decks

export const opening = startingDeck()
export const ID = 100
export const blankCard: Card = { id: ID, name: 'Blank', channels: [], outputs: [], purifies: false, gain: 0, time: 2, ground: 0 }
export const washCard: Card = { ...opening.find((c) => c.name === 'Wash')!, id: ID }
export const byName = (name: string) => opening.find((c) => c.name === name)!

export const withPrinciple = (c: Card, p: Principle): Card => ({ ...c, outputs: c.outputs.map((o) => (o.kind === 'principle' ? { ...o, principle: p } : o)) })
const makerIds = opening.filter((c) => !c.purifies).map((c) => c.id)
/** The opening deck with the metal makers' principles turned by seed: each yields every principle equally often. */
/** The deck the bench builds on: the opening cards, less any left out. */
let base = opening
/** Leave these opening cards out of every deck the bench builds. */
export function leaveOut(names: string[]): void {
  base = opening.filter((c) => !names.includes(c.name))
}
export const baseDeck = (i: number): Card[] =>
  base.map((c) => {
    const k = makerIds.indexOf(c.id)
    return k < 0 ? c : withPrinciple(c, PRINCIPLES[(i + k) % 3])
  })

/** Seed i's deck. */
export type DeckOf = (i: number) => Card[]
/** A twelfth card beside the opening eleven; its principle outputs turn by seed. */
export const twelfth = (make: (p: Principle) => Card): DeckOf => (i) => [...baseDeck(i), { ...make(PRINCIPLES[i % 3]), id: ID }]
/** One opening card changed, with a blank twelfth card so the deck stays twelve. */
export const changed = (id: number, change: (c: Card, p: Principle) => Card): DeckOf => (i) => [...baseDeck(i).map((c) => (c.id === id ? change(c, PRINCIPLES[i % 3]) : c)), blankCard]

// ---------------------------------------------------------------------------
// Playing and scoring

export interface Outcome {
  cost: number
  /** Metal smelted after the fight. */
  metal: number
  /** Times the watched card was drawn, and played. */
  draws: number
  plays: number
}

/** One fight: what it costs (quintessence lost, less metal), and how often the watched card came up and was played. */
export function playFight(deck: Card[], against: Commission, seed: number, watch: number): Outcome {
  let r = fightWith(seed, deck, against, DEFAULT_SETTINGS)
  const start = r.quintessence
  let draws = 0
  let plays = 0
  let had = false
  for (let g = 0; g < 400 && r.stage === 'fight'; g++) {
    const has = r.fight.hand.some((c) => c.id === watch)
    if (has && !had) draws++
    const m = greedyMove(r)
    if (m.kind === 'card' && m.id === watch) plays++
    had = has && !(m.kind === 'card' && m.id === watch)
    r = apply(r, m)
  }
  const metal = r.stage === 'reward' || r.stage === 'won' ? (r.smelted?.value ?? 0) : 0
  return { cost: start - r.quintessence - METAL_WORTH * metal, metal, draws, plays }
}

export interface Measure {
  /** Mean cost of each enemy. */
  costs: number[]
  /** Each seed's cost summed over the enemies, for paired errors. */
  bySeed: number[]
  /** Metal smelted a fight. */
  metal: number
  /** Per fight: times the watched card was drawn and played. */
  draws: number
  plays: number
}

export function measureDeck(deckOf: DeckOf, fights: Commission[], seeds: number, base: number, watch = ID): Measure {
  let draws = 0
  let plays = 0
  let metal = 0
  const bySeed = new Array<number>(seeds).fill(0)
  const costs = fights.map((against) => {
    let total = 0
    for (let i = 0; i < seeds; i++) {
      const o = playFight(deckOf(i), against, base + i, watch)
      total += o.cost
      bySeed[i] += o.cost
      draws += o.draws
      plays += o.plays
      metal += o.metal
    }
    return total / seeds
  })
  const n = fights.length * seeds
  return { costs, bySeed, metal: metal / n, draws: draws / n, plays: plays / n }
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Scoring over one run of seeds: the blank and the Wash measured on the same seeds as the builds. */
export function scorer(fights: Commission[], seeds: number, base: number) {
  const blank = measureDeck(twelfth(() => blankCard), fights, seeds, base)
  const wash = measureDeck(twelfth((p) => withPrinciple(washCard, p)), fights, seeds, base)
  const unit = sum(blank.costs) - sum(wash.costs)
  return {
    blank,
    wash,
    unit,
    measure: (deckOf: DeckOf, watch = ID) => measureDeck(deckOf, fights, seeds, base, watch),
    /** A build's worth in Washes: what it saves over a blank twelfth card, against what a Wash saves. */
    worth: (m: Measure) => (sum(blank.costs) - sum(m.costs)) / unit,
    /** What it saves against the blank, enemy by enemy. */
    saves: (m: Measure) => m.costs.map((c, i) => blank.costs[i] - c),
    /** The standard error of its worth: from the spread of what it saves seed by seed (paired with the blank on the same seeds). */
    error: (m: Measure) => {
      const d = m.bySeed.map((c, i) => blank.bySeed[i] - c)
      const mean = sum(d) / d.length
      const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (d.length - 1))
      return sd / Math.sqrt(d.length) / unit
    },
  }
}

