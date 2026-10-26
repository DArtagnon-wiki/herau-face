import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  MUD,
  SEAL_BASE,
  distance,
  distanceOf,
  emptyPool,
  needOf,
  newGame,
  playCard,
  poolTotal,
  resolve,
  sealed,
  startingDeck,
  upcoming,
  wait,
  type Game,
  type Pool,
} from './engine'

const P = (p: Partial<Pool>): Pool => ({ ...emptyPool(), ...p })
const named = (name: string) => startingDeck().find((c) => c.name === name)!
/** A game whose hand and draw pile are set by name, for exact tests. */
function rigged(hand: string[], draw: string[] = [], over: Partial<Game['fight']> = {}): Game {
  const g = newGame(1)
  return { ...g, fight: { ...g.fight, hand: hand.map(named), draw: draw.map(named), discard: [], ...over } }
}

describe('the opening deck', () => {
  it('is an Attenuate and an Amplify for each pair of elements', () => {
    const deck = startingDeck()
    expect(deck).toHaveLength(12)
    expect(deck.filter((c) => c.kind === 'attenuate')).toHaveLength(6)
    expect(deck.filter((c) => c.kind === 'amplify')).toHaveLength(6)
    expect(new Set(deck.map((c) => c.elements.join())).size).toBe(6)
    expect(new Set(deck.map((c) => c.id)).size).toBe(12)
  })
})

describe('Mud', () => {
  it('starts 20 from its chord, so the seal needs 30', () => {
    const g = newGame(7)
    expect(distanceOf(MUD.start, MUD.chord)).toBe(20)
    expect(needOf(g.fight)).toBe(SEAL_BASE + 20)
    expect(g.fight.pool).toEqual(P({ water: 5, earth: 2 }))
    expect(g.fight.hand).toHaveLength(DEFAULT_SETTINGS.hand)
    expect(g.quintessence).toBe(40)
  })

  it('Attenuate on instability takes from the pool and charges by what it took', () => {
    const g = rigged(['Decant', 'Snuff'])
    const r = resolve(g.fight, named('Decant'), 'instability')
    expect(r.took).toEqual(P({ water: 3, earth: 2 }))
    expect(r.charge).toBe(5)
    const a = playCard(g, named('Decant').id, 'instability')
    expect(a.fight.pool).toEqual(P({ water: 2 }))
    expect(a.fight.charge).toBe(5)
    expect(a.fight.dial).toBe(2)
    // Snuff finds no air or fire in Mud's pool: nothing to take.
    expect(resolve(a.fight, named('Snuff'), 'instability').charge).toBe(0)
  })

  it('Amplify on instability adds to the pool and charges by the same', () => {
    const g = rigged(['Dissolve', 'Snuff'])
    const a = playCard(g, named('Dissolve').id, 'instability')
    expect(a.fight.pool).toEqual(P({ water: 8, earth: 5 }))
    expect(a.fight.charge).toBe(6)
  })

  it('on the spectrum, each band has its furthest line moved toward the chord, stopping there', () => {
    const g = rigged(['Snuff', 'Dissolve', 'Decant'])
    // Snuff (air and fire): air's low line 2 → 0 and fire's high line 2 → 0; distance 20 → 16.
    const s = resolve(g.fight, named('Snuff'), 'spectrum')
    expect(s.moves).toEqual([
      { element: 'air', line: 0, from: 2, to: 0 },
      { element: 'fire', line: 2, from: 2, to: 0 },
    ])
    expect(s.charge).toBe(0)
    // Dissolve (water and earth) raises: water's middle 2 → 5 (of 6), earth's low 2 → 5.
    const d = resolve(g.fight, named('Dissolve'), 'spectrum')
    expect(d.moves.map((m) => [m.element, m.line, m.to])).toEqual([
      ['water', 1, 5],
      ['earth', 0, 5],
    ])
    const a = playCard(g, named('Dissolve').id, 'spectrum')
    expect(distance(a.fight)).toBe(14)
    expect(needOf(a.fight)).toBe(24)
  })

  it('a spectrum play finds nothing when no line in its bands is off in its direction', () => {
    const f = { ...newGame(1).fight, spectrum: { ...MUD.chord } }
    expect(resolve(f, named('Snuff'), 'spectrum').moves).toEqual([])
  })

  it('seals the moment charge reaches the base plus the distance', () => {
    const near = { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 0, 2] }
    const g = rigged(['Snuff', 'Decant'], ['Quench'], { spectrum: near, charge: 10 })
    expect(needOf(g.fight)).toBe(12)
    expect(sealed(g.fight)).toBe(false)
    const t = playCard(g, named('Snuff').id, 'spectrum')
    expect(t.stage).toBe('won')
    const c = playCard(g, named('Decant').id, 'instability')
    expect(c.stage).toBe('won')
  })

  it('flares the pool at 3/8, which empties it', () => {
    let g = rigged(['Cupel', 'Digest', 'Sublime'], ['Quench'])
    g = wait(g)
    expect(g.fight.flares).toEqual([])
    g = wait(g)
    // At the first quarter the hand goes; the moon runs on through the flare to the full moon's feed and draw.
    expect(g.fight.dial).toBe(8)
    expect(g.fight.flares).toEqual([7])
    expect(g.quintessence).toBe(33)
    expect(poolTotal(g.fight.pool)).toBe(7)
  })

  it('makes Amplify on instability cost at the next flare', () => {
    let g = rigged(['Dissolve', 'Cupel', 'Snuff', 'Digest'])
    g = playCard(g, named('Dissolve').id, 'instability')
    g = playCard(g, named('Cupel').id, 'spectrum')
    expect(g.fight.flares).toEqual([13])
  })

  it('is lost when the flares take all your quintessence', () => {
    let g: Game = { ...rigged(['Cupel']), quintessence: 5 }
    for (let i = 0; i < 4 && g.stage === 'fight'; i++) g = wait(g)
    expect(g.stage).toBe('lost')
  })

  it('shows what comes next on the dial', () => {
    const up = upcoming(newGame(3).fight, 4)
    expect(up.map((u) => u.phase)).toEqual(['waxing-crescent', 'first', 'waxing-gibbous', 'full'])
    expect(up.find((u) => u.attack)?.phase).toBe('waxing-gibbous')
    expect(up.find((u) => u.discard)?.phase).toBe('first')
  })
})
