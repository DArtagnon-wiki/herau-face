import { describe, expect, it } from 'vitest'
import { elementMote, LINK_MOTE, makeRune } from '../sim/deck'
import type { Body, Elemental, JoinKind, Rune, Sigil } from '../sim/types'
import { sigilBody } from './draw'

let id = 1
const rune = (body: Body, e?: Elemental, links = 2): Rune =>
  makeRune(id++, { body, motes: [...(e ? [elementMote(e)] : []), ...Array.from({ length: links }, () => LINK_MOTE)] })
const sigil = (anchor: Rune, ...joins: [JoinKind, Rune][]): Sigil => ({ anchor, joins: joins.map(([kind, r]) => ({ kind, rune: r })) })
const strokes = (markup: string, color: string) => markup.split(`stroke="var(--${color})"`).length - 1

describe('drawing a sigil', () => {
  it('draws the seal with a double line', () => {
    const s = sigil(rune('triangle', 'water'), ['circumscribe', rune('circle', 'earth')])
    // The earth circle is the seal: its outline twice.
    expect(strokes(sigilBody(s).markup, 'earth')).toBe(2)
    // A ring that is not the seal is drawn once.
    const two = sigil(rune('triangle', 'water'), ['circumscribe', rune('circle', 'earth')], ['circumscribe', rune('circle', 'fire')])
    expect(strokes(sigilBody(two).markup, 'earth')).toBe(1)
  })

  it('marks the anchor with a dot and draws side links and tangents on stems', () => {
    const s = sigil(rune('triangle', 'water'), ['side', rune('crescent', 'earth')], ['tangent', rune('triangle', 'air')], ['circumscribe', rune('circle', 'fire')])
    const m = sigilBody(s).markup
    expect(m).toContain('fill="var(--water)"/>')
    expect(m.match(/<line /g)).toHaveLength(2)
  })

  it('fits a big sigil inside a table slot', () => {
    const s = sigil(rune('triangle', 'earth', 4), ['circumscribe', rune('crescent', 'air')], ['circumscribe', rune('circle', 'fire')], ['circumscribe', rune('triangle', 'earth')], ['side', rune('circle', 'water')])
    expect(sigilBody(s).radius).toBeGreaterThan(60)
    expect(sigilBody(s, 0.42, 25).radius).toBeLessThanOrEqual(25.01)
  })
})
