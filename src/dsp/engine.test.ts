import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  MATCH_TO_FINISH,
  MUD,
  emptyPool,
  emptyVoice,
  finishes,
  noteMatch,
  smoothNotes,
  voicing,
  isDrainer,
  isSculptor,
  matchOf,
  newGame,
  playCard,
  poolTotal,
  resolve,
  smooth,
  startingDeck,
  tune,
  upcoming,
  wait,
  type Card,
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
  it('is a drainer and a sculptor for each pair of elements', () => {
    const deck = startingDeck()
    expect(deck).toHaveLength(12)
    expect(deck.filter(isDrainer)).toHaveLength(6)
    expect(deck.filter(isSculptor)).toHaveLength(6)
    expect(deck.filter((c) => isDrainer(c) && isSculptor(c))).toHaveLength(0)
    expect(new Set(deck.map((c) => c.id)).size).toBe(12)
    for (const c of deck) expect(poolTotal(P(c.takes)) + poolTotal(P(c.gives))).toBe(6)
  })
})

describe('matching the material', () => {
  it('compares shape only', () => {
    expect(matchOf(P({ water: 12, earth: 8 }), MUD.target)).toBeCloseTo(1)
    expect(matchOf(P({ water: 24, earth: 16 }), MUD.target)).toBeCloseTo(1)
    expect(matchOf(P({ water: 3, earth: 3 }), MUD.target)).toBeCloseTo(0.9)
    expect(matchOf(P({ air: 3, fire: 3 }), MUD.target)).toBe(0)
    expect(matchOf(emptyPool(), MUD.target)).toBe(0)
  })

  it('finishes at the size and close enough to the shape', () => {
    expect(finishes(P({ water: 12, earth: 8 }), MUD.target)).toBe(true)
    expect(finishes(P({ water: 6, earth: 4 }), MUD.target)).toBe(false)
    expect(finishes(P({ water: 12, earth: 6, fire: 6 }), MUD.target)).toBe(false)
    expect(matchOf(P({ water: 12, earth: 8, fire: 4 }), MUD.target)).toBeGreaterThanOrEqual(MATCH_TO_FINISH)
  })
})

describe('smoothing', () => {
  it('moves off-target noise into the band most short of the shape, a unit a charge', () => {
    const s = smooth(P({ water: 3, earth: 3, fire: 6 }), MUD.target, 2)
    expect(s.spent).toBe(2)
    expect(s.moved.every((m) => m.from === 'fire')).toBe(true)
    expect(s.attack).toEqual(P({ water: 5, earth: 3, fire: 4 }))
  })

  it('never makes the match worse, and stops when nothing helps', () => {
    const a = P({ water: 12, earth: 8 })
    expect(smooth(a, MUD.target, 5).spent).toBe(0)
    const rough = P({ water: 6, air: 9, fire: 6, earth: 3 })
    const s = smooth(rough, MUD.target, 100)
    expect(matchOf(s.attack, MUD.target)).toBeGreaterThan(0.95)
    expect(poolTotal(s.attack)).toBe(poolTotal(rough))
    expect(s.spent).toBeLessThan(100)
  })
})

describe('Mud', () => {
  it('opens with its feed and a hand of 4', () => {
    const g = newGame(7)
    expect(g.fight.pool).toEqual(P({ water: 5, earth: 2 }))
    expect(g.fight.hand).toHaveLength(DEFAULT_SETTINGS.hand)
    expect(g.quintessence).toBe(40)
  })

  it('drainers take from the pool and charge the battery; sculptors play into the attack', () => {
    const g = rigged(['Decant', 'Cupel'])
    expect(resolve(g.fight, named('Decant'))).toMatchObject({ took: P({ water: 3, earth: 2 }), charge: 5 })
    const a = playCard(g, named('Decant').id)
    expect(a.fight.pool).toEqual(P({ water: 2 }))
    expect(a.fight.charge).toBe(5)
    expect(a.fight.dial).toBe(2)
    const b = playCard(a, named('Cupel').id)
    expect(b.fight.attack).toEqual(P({ air: 3, fire: 3 }))
    // Then the hand is empty, so the moon runs on: the 2 water left flares at 3/8 and is gone, and the full moon feeds again.
    expect(b.fight.flares).toEqual([2])
    expect(b.fight.pool).toEqual(P({ water: 5, earth: 2 }))
  })

  it('flares the pool at 3/8, which empties it', () => {
    let g = rigged(['Cupel', 'Digest', 'Sublime'], ['Quench'])
    g = wait(g)
    expect(g.fight.flares).toEqual([])
    // At the first quarter the hand goes; the moon runs on through the flare to the full moon's feed and draw.
    g = wait(g)
    expect(g.fight.dial).toBe(8)
    expect(g.fight.flares).toEqual([7])
    expect(g.quintessence).toBe(33)
    // Emptied by the flare, then fed again at the full moon.
    expect(poolTotal(g.fight.pool)).toBe(7)
  })

  it('discards the hand at the quarter and moves on to the next draw when nothing is left', () => {
    let g = rigged(['Cupel', 'Digest', 'Sublime', 'Decant'], ['Quench', 'Sift', 'Snuff', 'Dissolve'])
    g = playCard(g, named('Cupel').id)
    g = playCard(g, named('Digest').id)
    // At the first quarter the other two go; with nothing in hand the moon runs on to the full moon's draw.
    expect(g.fight.dial).toBe(8)
    expect(g.fight.hand.map((c) => c.name).sort()).toEqual(['Dissolve', 'Quench', 'Sift', 'Snuff'])
    expect(g.fight.flares).toEqual([7])
    expect(g.fight.pool).toEqual(P({ water: 5, earth: 2 }))
  })

  it('is won once smoothing brings a big enough attack close enough', () => {
    const g = rigged(['Snuff'], ['Quench'], { attack: P({ water: 9, earth: 6, fire: 9 }), charge: 5 })
    expect(finishes(g.fight.attack, MUD.target)).toBe(false)
    const t = tune(g)
    expect(t.stage).toBe('won')
    expect(t.fight.charge).toBe(0)
    expect(t.fight.attack).toEqual(P({ water: 12, earth: 8, fire: 4 }))
    expect(t.fight.dial).toBe(g.fight.dial)
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

  it('refuses to smooth with no charge or nothing to fix', () => {
    expect(() => tune(rigged(['Cupel']))).toThrow()
    expect(() => tune(rigged(['Cupel'], [], { attack: P({ water: 12, earth: 8 }), charge: 3 }))).toThrow()
  })
})

void (null as unknown as Card)

describe('notes and chords', () => {
  it("gives Mud a chord whose notes add up to its material", () => {
    for (const e of ['water', 'earth', 'air', 'fire'] as const) expect(MUD.chord[e].reduce((a, b) => a + b, 0)).toBe(MUD.target[e])
  })

  it('voices what a sculptor plays by its timbre', () => {
    expect(voicing(3, 'dark')).toEqual([2, 1, 0])
    expect(voicing(3, 'bright')).toEqual([0, 1, 2])
    expect(voicing(3)).toEqual([1, 1, 1])
    const g = rigged(['Dissolve'])
    const dark = { ...g, fight: { ...g.fight, hand: [{ ...named('Dissolve'), timbre: 'dark' as const }] } }
    const a = playCard(dark, named('Dissolve').id)
    expect(a.fight.voice.water).toEqual([2, 1, 0])
    expect(a.fight.voice.earth).toEqual([2, 1, 0])
  })

  it('matches note by note when the setting asks, and smooths there too', () => {
    const chord = MUD.chord
    expect(noteMatch(chord, chord)).toBeCloseTo(1)
    const v = { ...emptyVoice(), water: [1, 1, 1], earth: [1, 1, 1] }
    // Right elements, wrong voicing: elements match 90%, notes less.
    expect(noteMatch(v, chord)).toBeLessThan(0.9)
    const s = smoothNotes({ ...emptyVoice(), water: [4, 4, 4], earth: [3, 3, 2], fire: [0, 0, 4] }, chord, 6)
    expect(s.spent).toBeGreaterThan(0)
    expect(s.voice.fire[2]).toBeLessThan(4)
    expect(noteMatch(s.voice, chord)).toBeGreaterThan(noteMatch({ ...emptyVoice(), water: [4, 4, 4], earth: [3, 3, 2], fire: [0, 0, 4] }, chord))
  })

  it('keeps the voice in step with the attack when smoothing by element', () => {
    const g = rigged(['Snuff'], ['Quench'], { attack: P({ water: 9, earth: 6, fire: 9 }), voice: { ...emptyVoice(), water: [3, 3, 3], earth: [2, 2, 2], fire: [3, 3, 3] }, charge: 5 })
    const t = tune(g)
    for (const e of ['water', 'earth', 'air', 'fire'] as const) expect(t.fight.voice[e].reduce((a, b) => a + b, 0)).toBeCloseTo(t.fight.attack[e])
  })
})
