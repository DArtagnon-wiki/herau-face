import { describe, expect, it } from 'vitest'
import { elementMote, LINK_MOTE, makeRune } from '../sim/deck'
import type { Body, Elemental, JoinKind, Rune, Sigil } from '../sim/types'
import { bodyPath, sigilBody, starInner, starSvg } from './draw'

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

  it('runs a crescent seal\'s second line parallel to both of its arcs', () => {
    const m = sigilBody(sigil(rune('triangle', 'fire'), ['circumscribe', rune('crescent', 'water')])).markup
    const paths = m.split('<path ').filter((x) => x.includes('stroke="var(--water)"'))
    expect(paths).toHaveLength(2)
    // Each outline is two arcs: the back and the hollow.
    for (const path of paths) expect(path.match(/ A /g)).toHaveLength(2)
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

  it('draws a level as a star with one point and one sigil per cast, each star clipped on its own', () => {
    const pools = [{ elemental: 'earth' as const, grade: 1 as const, kg: 18 }, { elemental: 'water' as const, grade: 0 as const, kg: 18 }]
    const s = sigil(rune('crescent', 'water'), ['circumscribe', rune('circle', 'earth')])
    const steps = [0, 1, 2, 3, 4].map((i) => ({ sigil: s, term: 1 + Math.floor(i / 2), after: pools, ...(i % 2 ? { endOfTerm: pools } : {}) }))
    const a = starSvg(pools, steps)
    const b = starSvg(pools, steps.slice(0, 1))
    // The star outline has a tip per sigil: five Ls for tips plus five for valleys after the first M.
    expect(a.match(/<g transform="translate/g)).toHaveLength(5)
    expect(a.match(/class="star-term"/g)).toHaveLength(2)
    expect(a.match(/clipPath id="([^"]+)"/)![1]).not.toBe(b.match(/clipPath id="([^"]+)"/)![1])
  })
})

describe('rarity as stars', () => {
  it('draws a common polygon plain and rarer ones as pointier stars', () => {
    expect(starInner('square', 'common')).toBeCloseTo(Math.cos(Math.PI / 4))
    expect(starInner('square', 'uncommon')).toBeLessThan(starInner('square', 'common'))
    expect(starInner('square', 'rare')).toBeLessThan(starInner('square', 'uncommon'))
    expect(starInner('crescent', 'rare')).toBe(1)
    const corners = (d: string) => (d.match(/L/g) ?? []).length + 1
    expect(corners(bodyPath('pentagon', 10, 0, 0, 0, false, starInner('pentagon', 'common')))).toBe(5)
    expect(corners(bodyPath('pentagon', 10, 0, 0, 0, false, starInner('pentagon', 'rare')))).toBe(10)
  })
})
