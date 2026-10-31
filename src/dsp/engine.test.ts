import { describe, expect, it } from 'vitest'
import {
  COMMISSIONS,
  DEFAULT_SETTINGS,
  ELEMENTS,
  FOG,
  MUD,
  bandNotes,
  isLocked,
  lineName,
  perBand,
  bestLine,
  boostTap,
  distance,
  distanceOf,
  emptyPool,
  footprint,
  lineAt,
  matched,
  newGame,
  playCard,
  poolTotal,
  resolve,
  startingDeck,
  upcoming,
  wait,
  type AttackCard,
  type Card,
  type Game,
  type Pool,
} from './engine'

const P = (p: Partial<Pool>): Pool => ({ ...emptyPool(), ...p })
const deck = startingDeck()
const named = (name: string) => deck.find((c) => c.name === name)!
const attack = (name: string) => named(name) as AttackCard
/** A game whose hand and draw pile are set by name, for exact tests. */
function rigged(hand: string[], draw: string[] = [], over: Partial<Game['fight']> = {}): Game {
  const g = newGame(1)
  const pick = (names: string[]) => {
    const left = deck.slice()
    return names.map((n) => left.splice(left.findIndex((c) => c.name === n), 1)[0] as Card)
  }
  return { ...g, fight: { ...g.fight, hand: pick(hand), draw: pick(draw), discard: [], ...over } }
}

describe('the opening deck', () => {
  it('is a drain for each pair of elements, six attacks and a power', () => {
    expect(deck).toHaveLength(13)
    const drains = deck.filter((c) => c.kind === 'drain')
    expect(drains).toHaveLength(6)
    expect(new Set(drains.map((c) => (c.kind === 'drain' ? c.elements.slice().sort().join('+') : ''))).size).toBe(6)
    for (const e of ELEMENTS) expect(drains.filter((c) => c.kind === 'drain' && c.elements.includes(e))).toHaveLength(3)
    expect(deck.filter((c) => c.kind === 'attack')).toHaveLength(6)
    expect(deck.filter((c) => c.kind === 'power')).toHaveLength(1)
    expect(new Set(deck.map((c) => c.id)).size).toBe(13)
  })
})

describe('the commissions', () => {
  it('run easiest first, each with as many lines in its start as in its chord, within 2 to win', () => {
    let last = 0
    for (const c of COMMISSIONS) {
      const per = perBand(c.chord)
      for (const e of ELEMENTS) {
        expect(c.chord[e]).toHaveLength(per)
        expect(c.start[e]).toHaveLength(per)
      }
      expect(distanceOf(c.start, c.chord)).toBeGreaterThan(last)
      last = distanceOf(c.start, c.chord)
      expect(c.tolerance).toBe(2)
      expect(newGame(1, DEFAULT_SETTINGS, c).fight.hand).toHaveLength(4)
    }
    expect(COMMISSIONS.map((c) => perBand(c.chord))).toEqual([3, 3, 4, 4, 5, 5])
  })

  it('put their notes in A major, as many to a band as it has lines', () => {
    expect(bandNotes('earth', 3)).toEqual([110, 165, 220])
    expect(bandNotes('fire', 5).map(Math.round)).toEqual([1320, 1467, 1650, 1760, 1980])
    expect(bandNotes('water', 4)).toHaveLength(4)
  })

  it('line kernels up across bands of any size', () => {
    expect(lineAt(4, 4)).toEqual({ element: 'water', i: 0 })
    expect(lineName(9, 5)).toBe('water highest')
    expect(footprint(attack('Sharpen'), 19, 20)).toEqual([18, 19, null])
    const f = newGame(1, DEFAULT_SETTINGS, FOG).fight
    // Lift on water's high middle line (line 6 of 16): water 1 → 3 and 0 → 2.
    expect(resolve(f, attack('Lift'), 6).spectrum.water).toEqual([5, 2, 3, 2])
  })
})

describe('kernels', () => {
  it('cover the lines around the one they are lined up on, losing taps off the ends', () => {
    expect(footprint(attack('Sharpen'), 4)).toEqual([3, 4, 5])
    expect(footprint(attack('Sharpen'), 0)).toEqual([null, 0, 1])
    expect(footprint(attack('Lift'), 11)).toEqual([11, null])
    expect(lineAt(4)).toEqual({ element: 'water', i: 1 })
  })

  it('work each tap on its own line: adds, takes away, cuts, whole and never below zero', () => {
    const f = newGame(1).fight
    // Sharpen on earth's low line: +3 there, −1 on earth's middle line, the left tap off the end.
    const s = resolve(f, attack('Sharpen'), 0)
    expect(s.spectrum.earth).toEqual([5, 2, 3])
    // Damp on air's middle line: ×⅓ on 2, 2 and 0 leaves 0, 0, 0.
    expect(resolve(f, attack('Damp'), 7).spectrum.air).toEqual([0, 0, 0])
    // Cut on fire's middle line: 1 and 2 less 2 is 0 and 0.
    expect(resolve(f, attack('Cut'), 10).spectrum.fire).toEqual([0, 0, 0])
  })

  it('leave a line that matches the chord locked', () => {
    const f = newGame(1).fight
    // Sharpen on Mud's earth low line lifts it 2 → 5 and takes earth middle 3 → 2: both now match the chord.
    const g = rigged(['Sharpen', 'Cut'])
    const a = playCard(g, attack('Sharpen').id, 0)
    expect(a.fight.spectrum.earth).toEqual([5, 2, 3])
    // Now Cut on earth low and middle moves neither: both are locked. Earth high is not.
    const r = resolve(a.fight, attack('Cut'), 1)
    expect(r.spectrum.earth).toEqual([5, 2, 1])
    expect(r.moves.map((m) => m.line)).toEqual([2])
    expect(isLocked(a.fight.spectrum, f.commission.chord, 'earth', 0)).toBe(true)
  })

  it('find where they close the spectrum on the chord most', () => {
    const f = newGame(1).fight
    // Cut on earth's high line takes earth high 3 → 1 and water low 5 → 3, both onto the chord.
    expect(bestLine(f, attack('Cut'))).toEqual({ line: 2, closed: 4 })
    expect(distance(f)).toBe(20)
  })
})

describe('charge and powers', () => {
  it('drains bank what they take as charge of that element', () => {
    const g = rigged(['Decant', 'Sift'])
    const a = playCard(g, named('Decant').id)
    expect(a.fight.pool).toEqual(P({ water: 2 }))
    expect(a.fight.charge).toEqual(P({ water: 3, earth: 2 }))
    expect(a.fight.dial).toBe(2)
  })

  it('a power stays in play, and Resonance strengthens every attack for one charge of its element', () => {
    expect(boostTap({ op: 'add', v: 3 })).toEqual({ op: 'add', v: 4 })
    expect(boostTap({ op: 'add', v: -1 })).toEqual({ op: 'add', v: -2 })
    const quarter = boostTap({ op: 'times', v: 1 / 3 })
    expect(quarter.op === 'times' && Math.abs(quarter.v - 0.25) < 1e-9).toBe(true)
    let g = rigged(['Resonance of water', 'Sharpen', 'Lift', 'Cut'], [], { charge: P({ water: 1 }) })
    g = playCard(g, named('Resonance of water').id)
    expect(g.fight.powers.map((p) => p.name)).toEqual(['Resonance of water'])
    expect(g.fight.discard.map((c) => c.name)).not.toContain('Resonance of water')
    const r = resolve(g.fight, attack('Lift'), 4)
    expect(r.kernel).toEqual([{ op: 'add', v: 3 }, { op: 'add', v: 3 }])
    expect(r.charge.water).toBe(-1)
    g = playCard(g, attack('Lift').id, 4)
    expect(g.fight.spectrum.water).toEqual([5, 5, 5])
    expect(g.fight.charge.water).toBe(0)
  })

  it('a power with no charge left goes quiet', () => {
    const g = rigged(['Lift'], [], { charge: P({}), powers: [named('Resonance of water') as never] })
    const r = resolve(g.fight, attack('Lift'), 4)
    expect(r.boosted).toEqual([])
    expect(r.kernel).toEqual(attack('Lift').kernel)
  })
})

describe('Mud', () => {
  it('opens 20 from its chord, with its feed and a hand of 4', () => {
    const g = newGame(7)
    expect(distanceOf(MUD.start, MUD.chord)).toBe(20)
    expect(g.fight.pool).toEqual(P({ water: 5, earth: 2 }))
    expect(g.fight.hand).toHaveLength(DEFAULT_SETTINGS.hand)
    expect(g.quintessence).toBe(40)
  })

  it('is won once the spectrum is within 2 of the chord, and not before', () => {
    expect(matched({ ...newGame(1).fight, spectrum: { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 1, 1] } })).toBe(true)
    const near = { earth: [5, 2, 1], water: [3, 6, 3], air: [0, 0, 0], fire: [0, 1, 2] }
    const g = rigged(['Cut', 'Decant'], ['Quench'], { spectrum: near })
    expect(matched(g.fight)).toBe(false)
    expect(playCard(g, named('Decant').id).stage).toBe('fight')
    const t = playCard(g, attack('Cut').id, 10)
    expect(t.stage).toBe('won')
    expect(distance(t.fight)).toBe(0)
  })

  it('flares the pool at 3/8, which empties it', () => {
    let g = rigged(['Sharpen', 'Lift', 'Cut'], ['Quench'])
    g = wait(g)
    expect(g.fight.flares).toEqual([])
    g = wait(g)
    expect(g.fight.dial).toBe(8)
    expect(g.fight.flares).toEqual([7])
    expect(g.quintessence).toBe(33)
    expect(poolTotal(g.fight.pool)).toBe(7)
  })

  it('is lost when the flares take all your quintessence', () => {
    let g: Game = { ...rigged(['Cut']), quintessence: 5 }
    for (let i = 0; i < 4 && g.stage === 'fight'; i++) g = wait(g)
    expect(g.stage).toBe('lost')
  })

  it('shows what comes next on the dial', () => {
    const up = upcoming(newGame(3).fight, 4)
    expect(up.map((u) => u.phase)).toEqual(['waxing-crescent', 'first', 'waxing-gibbous', 'full'])
    expect(up.find((u) => u.attack)?.phase).toBe('waxing-gibbous')
  })
})
