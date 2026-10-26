import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  MUD,
  distance,
  distanceOf,
  emptyPool,
  matched,
  modesOf,
  newGame,
  playCard,
  poolTotal,
  resolve,
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
  it('starts 20 from its chord, with nothing in hand to show for it yet', () => {
    const g = newGame(7)
    expect(distanceOf(MUD.start, MUD.chord)).toBe(20)
    expect(distance(g.fight)).toBe(20)
    expect(g.fight.charge).toBe(0)
    expect(g.fight.ward).toBe(0)
    expect(g.fight.pool).toEqual(P({ water: 5, earth: 2 }))
    expect(g.fight.hand).toHaveLength(DEFAULT_SETTINGS.hand)
    expect(g.quintessence).toBe(40)
  })

  it('each kind has its own two ways', () => {
    expect(modesOf(named('Decant'))).toEqual(['drain', 'spectrum'])
    expect(modesOf(named('Dissolve'))).toEqual(['ward', 'spectrum'])
    expect(() => resolve(newGame(1).fight, named('Decant'), 'ward')).toThrow()
  })

  it('a drain takes from the pool and charges by what it took', () => {
    const g = rigged(['Decant', 'Snuff'])
    const r = resolve(g.fight, named('Decant'), 'drain')
    expect(r.took).toEqual(P({ water: 3, earth: 2 }))
    expect(r.charge).toBe(5)
    const a = playCard(g, named('Decant').id, 'drain')
    expect(a.fight.pool).toEqual(P({ water: 2 }))
    expect(a.fight.charge).toBe(5)
    expect(a.fight.dial).toBe(2)
    // Snuff finds no air or fire in Mud's pool: nothing to take.
    expect(resolve(a.fight, named('Snuff'), 'drain').charge).toBe(0)
  })

  it('Ward spends up to 3 charge for each of its elements, 1 Ward for each', () => {
    const g = rigged(['Dissolve', 'Cupel'], [], { charge: 8 })
    const r = resolve(g.fight, named('Dissolve'), 'ward')
    expect(r.charge).toBe(-6)
    expect(r.ward).toBe(6)
    const a = playCard(g, named('Dissolve').id, 'ward')
    expect(a.fight.charge).toBe(2)
    expect(a.fight.ward).toBe(6)
    expect(resolve(a.fight, named('Cupel'), 'ward').ward).toBe(2)
    expect(resolve({ ...a.fight, charge: 0 }, named('Cupel'), 'ward').ward).toBe(0)
  })

  it('Ward catches a flare before it reaches quintessence, and what is left of it stays', () => {
    let g = rigged(['Cupel', 'Digest', 'Sublime'], ['Quench'], { ward: 10 })
    g = wait(wait(g))
    expect(g.fight.flares).toEqual([7])
    expect(g.quintessence).toBe(40)
    expect(g.fight.ward).toBe(3)
    expect(g.fight.paid).toBe(0)
  })

  it('on the spectrum, each band has its furthest line moved toward the chord, stopping there', () => {
    const g = rigged(['Snuff', 'Dissolve', 'Decant'])
    const s = resolve(g.fight, named('Snuff'), 'spectrum')
    expect(s.moves).toEqual([
      { element: 'air', line: 0, from: 2, to: 0 },
      { element: 'fire', line: 2, from: 2, to: 0 },
    ])
    const d = resolve(g.fight, named('Dissolve'), 'spectrum')
    expect(d.moves.map((m) => [m.element, m.line, m.to])).toEqual([
      ['water', 1, 5],
      ['earth', 0, 5],
    ])
    const a = playCard(g, named('Dissolve').id, 'spectrum')
    expect(distance(a.fight)).toBe(14)
  })

  it('a spectrum play finds nothing when no line in its bands is off in its direction', () => {
    const f = { ...newGame(1).fight, spectrum: { ...MUD.chord } }
    expect(resolve(f, named('Snuff'), 'spectrum').moves).toEqual([])
  })

  it('is won on a complete match, and only then', () => {
    const near = { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 0, 2] }
    const g = rigged(['Snuff', 'Decant'], ['Quench'], { spectrum: near, charge: 50 })
    expect(matched(g.fight)).toBe(false)
    expect(playCard(g, named('Decant').id, 'drain').stage).toBe('fight')
    const t = playCard(g, named('Snuff').id, 'spectrum')
    expect(t.stage).toBe('won')
    expect(distance(t.fight)).toBe(0)
  })

  it('flares the pool at 3/8, which empties it', () => {
    let g = rigged(['Cupel', 'Digest', 'Sublime'], ['Quench'])
    g = wait(g)
    expect(g.fight.flares).toEqual([])
    g = wait(g)
    expect(g.fight.dial).toBe(8)
    expect(g.fight.flares).toEqual([7])
    expect(g.quintessence).toBe(33)
    expect(poolTotal(g.fight.pool)).toBe(7)
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
