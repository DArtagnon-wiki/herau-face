import { describe, expect, it } from 'vitest'
import { DEFAULT_EQUATION } from './equation'
import { DEFAULT_SETTINGS, cast, dismantleMachine, endTerm, extendMachine, fireMachine, fireReason, invalidReason, machineOpen, newGame, previewCast, type GameState } from './game'
import { makeRune, mote, DEFAULT_FORGE, elementMote, LINK_MOTE } from './deck'
import type { Rune, Sigil } from './types'
import { deckSpecs } from './sandbox'
import { allRunes } from './game'

const settings = { ...DEFAULT_SETTINGS, equation: DEFAULT_EQUATION, machines: 2, machineApart: 'hand' as const }

/** A water anchor ringed by earth, from the opening hand (which always holds both). */
function waterToEarth(s: GameState): Sigil {
  const water = s.hand.filter((r) => r.affinity === 'water').sort((a, b) => b.links - a.links)[0]
  const earth = s.hand.find((r) => r.affinity === 'earth')!
  return { anchor: water, joins: [{ kind: 'circumscribe', rune: earth }] }
}

describe('table machines', () => {
  it('keeps a cast sigil on the table with its runes, fired this term', () => {
    const s = newGame(settings, 3)
    const sigil = waterToEarth(s)
    const next = cast(s, sigil)
    expect(next.table).toHaveLength(1)
    expect(next.table[0].fired).toBe(1)
    expect(next.table[0].sigil.anchor.id).toBe(sigil.anchor.id)
    expect(next.discard).toHaveLength(0)
    expect(next.hand.some((r) => r.id === sigil.anchor.id)).toBe(false)
  })

  it('fires once a term, from the next term on, without runes from hand', () => {
    let s = cast(newGame(settings, 3), waterToEarth(newGame(settings, 3)))
    const id = s.table[0].id
    expect(fireReason(s, id)).toMatch(/already fired/)
    s = endTerm(s)
    expect(s.phase).toBe('compose')
    expect(fireReason(s, id)).toBeNull()
    const hand = s.hand.map((r) => r.id)
    const preview = previewCast(s, s.table[0].sigil, undefined, id)
    const fired = fireMachine(s, id)
    expect(fired.pools).toEqual(preview.cast.pools)
    expect(fired.hand.map((r) => r.id)).toEqual(hand)
    expect(fired.casts).toHaveLength(1)
    expect(fired.table).toHaveLength(1)
    expect(fireReason(fired, id)).toMatch(/already fired/)
  })

  it('refuses a new sigil when the table is full', () => {
    let s = newGame({ ...settings, machines: 1 }, 3)
    s = cast(s, waterToEarth(s))
    const anchor = s.hand.find((r) => r.links > 0)!
    expect(invalidReason(s, { anchor, joins: [] })).toMatch(/table is full/)
  })

  it('takes runes from hand while it has open links, and gains a link each term it stands', () => {
    let s = newGame(settings, 3)
    const sigil = waterToEarth(s)
    s = cast(s, sigil)
    const id = s.table[0].id
    expect(machineOpen(s, s.table[0])).toBe(sigil.anchor.links - 1)
    // Fill what's open now, then the next one fails.
    for (let i = 0; i < sigil.anchor.links - 1; i++) s = extendMachine(s, id, [{ kind: 'side', runeId: s.hand[0].id }])
    expect(() => extendMachine(s, id, [{ kind: 'side', runeId: s.hand[0].id }])).toThrow(/open link/)
    s = endTerm(s)
    expect(s.phase).toBe('compose')
    expect(machineOpen(s, s.table[0])).toBe(1)
    const spare = s.hand[0]
    const next = extendMachine(s, id, [{ kind: 'entwine', runeId: spare.id }])
    expect(next.table[0].sigil.joins.map((j) => j.rune.id)).toContain(spare.id)
    expect(next.hand.some((r) => r.id === spare.id)).toBe(false)
    expect(machineOpen({ ...next, settings: { ...next.settings, machineGrowth: 0 } }, next.table[0])).toBe(-1)
  })

  it('drops its runes into the discard pile when taken apart, by default', () => {
    let s = newGame({ ...settings, machineApart: undefined }, 3)
    const sigil = waterToEarth(s)
    s = endTerm(cast(s, sigil))
    const next = dismantleMachine(s, s.table[0].id)
    expect(next.discard.map((r) => r.id)).toEqual(expect.arrayContaining([sigil.anchor.id, sigil.joins[0].rune.id]))
  })

  it('comes apart into the hand, but not in a term it fired', () => {
    let s = newGame(settings, 3)
    const sigil = waterToEarth(s)
    s = cast(s, sigil)
    expect(() => dismantleMachine(s, s.table[0].id)).toThrow(/next term/)
    s = endTerm(s)
    expect(s.phase).toBe('compose')
    const next = dismantleMachine(s, s.table[0].id)
    expect(next.table).toHaveLength(0)
    expect(next.hand.map((r) => r.id)).toEqual(expect.arrayContaining([sigil.anchor.id, sigil.joins[0].rune.id]))
  })

  it('grows a great rune on the table each time it fires', () => {
    const great: Rune = makeRune(900, { body: 'triangle', motes: [elementMote('water'), mote('multiplication'), LINK_MOTE] }, DEFAULT_FORGE)
    let s = newGame(settings, 3)
    s = { ...s, hand: [great, ...s.hand] }
    const earth = s.hand.find((r) => r.affinity === 'earth')!
    s = cast(s, { anchor: great, joins: [{ kind: 'circumscribe', rune: earth }] })
    expect(s.table[0].sigil.anchor.stacks).toBe(1)
    s = endTerm(s)
    expect(s.phase).toBe('compose')
    s = fireMachine(s, s.table[0].id)
    expect(s.table[0].sigil.anchor.stacks).toBe(2)
  })

  it('leaves the old rules alone when off: cast runes go to the discard pile', () => {
    const s = newGame({ ...settings, machines: 0 }, 3)
    const next = cast(s, waterToEarth(s))
    expect(next.discard).toHaveLength(2)
    expect(next.table[0].fired).toBeUndefined()
  })

  it('counts runes in machines as part of the deck: fresh ids skip them, and a restart keeps them', () => {
    let s = newGame(settings, 3)
    s = cast(s, waterToEarth(s))
    s = { ...s, intent: { ...s.intent, junk: 2 } }
    const next = endTerm(s)
    const ids = allRunes(next).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(deckSpecs(s)).toHaveLength(allRunes(s).length)
  })
})
