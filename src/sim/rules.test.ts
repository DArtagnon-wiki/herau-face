import { describe, expect, it } from 'vitest'
import { normalize, poolKey, stepsBetween } from './alchemy'
import { applyIntent, inBand, substanceName, type Intent } from './commission'
import { cast, discardGlyphs, newGame, previewTerm, invalidReason } from './game'
import { REACH_PER_VALUE, outputs, resolve } from './rune'

const capped = { surplusForce: false }
const R = REACH_PER_VALUE
import { imbalance, slumpTarget, strain, type TableEntry } from './table'
import type { Affinity, Glyph, JoinKind, Pool, Rune, ShapeClass } from './types'

let nextId = 1000
const g = (affinity: Affinity, value = 3, shape: ShapeClass = 'regular', sides = 4): Glyph => ({
  id: nextId++,
  affinity,
  value,
  sides,
  shape,
})
const rune = (anchor: Glyph, ...joins: [JoinKind, Glyph][]): Rune => ({
  anchor,
  joins: joins.map(([kind, glyph]) => ({ kind, glyph })),
})
const mud = (earth: number, water: number): Pool[] =>
  normalize([
    { elemental: 'earth', grade: 1, kg: earth },
    { elemental: 'water', grade: 0, kg: water },
  ])
const kgOf = (pools: Pool[], key: string) => pools.find((p) => poolKey(p) === key)?.kg ?? 0

describe('the elemental square', () => {
  it('makes water to air one step and earth to air two', () => {
    expect(stepsBetween('water', 'air')).toBe(1)
    expect(stepsBetween('earth', 'air')).toBe(2)
    expect(stepsBetween('water', 'fire')).toBe(2)
    expect(stepsBetween('earth', 'water')).toBe(1)
  })
})

describe('resolving a rune', () => {
  it('reproduces the doc worked example: Reach 2 at full Force against 5 kg of weak water', () => {
    const r = rune(g('water', 2 / R), ['circumscribe', g('earth', 1)])
    const res = resolve(r, mud(5, 5), undefined, capped)
    expect(res.mode).toBe('transmute')
    expect(res.outputs.reach).toBeCloseTo(2)
    expect(res.required).toBe(5)
    expect(res.efficiency).toBe(1)
    expect(res.converted).toBeCloseTo(2)
    expect(res.produced).toBeCloseTo(1.2)
    expect(kgOf(res.pools, 'water:0')).toBeCloseTo(3)
    expect(kgOf(res.pools, 'earth:1') + kgOf(res.pools, 'earth:0')).toBeCloseTo(6.2)
    // New material comes out weak, beside the medium earth.
    expect(kgOf(res.pools, 'earth:0')).toBeCloseTo(1.2)
  })

  it('scales the change down when Force falls short', () => {
    const r = rune(g('water', 3)) // Force 3, no target yet
    r.joins.push({ kind: 'link', glyph: g('air', 1) })
    expect(resolve(r, mud(5, 5)).mode).toBe('none')
    const weak = rune(g('water', 2), ['circumscribe', g('earth', 1)]) // Force 3 vs 5
    const res = resolve(weak, mud(5, 5))
    expect(res.efficiency).toBeCloseTo(0.6)
    expect(res.converted).toBeCloseTo(2 * R * 0.6)
  })

  it('lets surplus Force multiply Reach, unless capped', () => {
    const r = rune(g('water', 3), ['circumscribe', g('earth', 4)], ['circumscribe', g('earth', 3)]) // Force 10 vs 5
    expect(resolve(r, mud(5, 5)).converted).toBeCloseTo(3 * R * 2)
    expect(resolve(r, mud(5, 5), undefined, capped).converted).toBeCloseTo(3 * R)
  })

  it('routes through chained circumscribes: two easy steps cost 20, a direct jump 30', () => {
    const routed = rune(g('earth', 3), ['circumscribe', g('water', 3)], ['circumscribe', g('air', 3)])
    const res = resolve(routed, mud(5, 5))
    expect(res.outputs.route).toEqual(['earth', 'water', 'air'])
    expect(res.required).toBe(20)
    expect(res.yieldFactor).toBeCloseTo(4.5)
    const direct = resolve(rune(g('earth', 3), ['circumscribe', g('air', 3)]), mud(5, 5))
    expect(direct.required).toBe(30)
    expect(direct.yieldFactor).toBe(20)
  })

  it('condenses when the anchor inscribes its own affinity', () => {
    const pools = normalize([{ elemental: 'earth', grade: 0, kg: 4 }])
    const res = resolve(rune(g('earth', 5), ['inscribe', g('earth', 3)]), pools, undefined, capped)
    expect(res.mode).toBe('condense')
    expect(res.required).toBe(5)
    expect(res.converted).toBeCloseTo(5 * R)
    expect(kgOf(res.pools, 'earth:1')).toBeCloseTo(5 * R * 0.5)
    expect(kgOf(res.pools, 'earth:0')).toBeCloseTo(4 - 5 * R)
  })

  it('halves Reach for each off-affinity inscribe', () => {
    const base = outputs(rune(g('water', 5), ['circumscribe', g('earth', 3)]))
    const fine = outputs(rune(g('water', 5), ['circumscribe', g('earth', 3)], ['inscribe', g('fire', 3)]))
    expect(fine.reach).toBeCloseTo(base.reach / 2)
  })

  it('gives each class a bonus on its apt join', () => {
    expect(outputs(rune(g('water', 3), ['circumscribe', g('earth', 4, 'scalene')])).force).toBe(9)
    expect(outputs(rune(g('water', 3), ['link', g('air', 3, 'isosceles')])).reach).toBeCloseTo(3 * R + 3 * R * 1.5)
    expect(outputs(rune(g('none', 3), ['entwine', g('fire', 4, 'regular')])).ward).toBeCloseTo(6)
  })

  it('works the pool the player selects', () => {
    const pools = normalize([
      { elemental: 'water', grade: 0, kg: 3 },
      { elemental: 'water', grade: 1, kg: 2 },
      { elemental: 'earth', grade: 1, kg: 5 },
    ])
    const r = rune(g('water', 5), ['circumscribe', g('earth', 5)])
    expect(resolve(r, pools).source?.grade).toBe(0)
    const hard = resolve(r, pools, 'water:1')
    expect(hard.source?.grade).toBe(1)
    expect(hard.required).toBe(10)
  })
})

describe('the rune table', () => {
  const entry = (id: number, r: Rune): TableEntry => ({ id, term: id, rune: r })

  it('lets opposites cancel and adds strain past the free amount', () => {
    const table = [entry(1, rune(g('water'), ['circumscribe', g('earth')], ['link', g('water')], ['link', g('earth')]))]
    expect(imbalance(table)).toBe(4)
    expect(strain(table)).toBe(1)
    expect(strain(table, false)).toBe(0)
    const balanced = [entry(1, rune(g('water'), ['circumscribe', g('earth')], ['entwine', g('fire')], ['entwine', g('air')]))]
    expect(imbalance(balanced)).toBe(0)
  })

  it('slumps the rune holding the table most level, never an entwined one', () => {
    const lopsided = entry(1, rune(g('water'), ['circumscribe', g('earth')], ['link', g('water')]))
    const leveller = entry(2, rune(g('fire'), ['link', g('air')]))
    const held = entry(3, rune(g('fire'), ['entwine', g('air')]))
    expect(slumpTarget([lopsided, leveller])).toBe(leveller)
    expect(slumpTarget([lopsided, held])).toBe(lopsided)
    expect(slumpTarget([held])).toBeUndefined()
  })
})

describe('mud', () => {
  it('names the amalgam by its earth share', () => {
    expect(substanceName(mud(12, 12))).toBe('Mud')
    expect(substanceName(mud(8, 2))).toBe('Clay')
    expect(inBand(mud(8, 2))).toBe(true)
    expect(substanceName(mud(9.5, 0.5))).toBe('Hardpan')
  })

  it('seeps earth into water and hardens weak water', () => {
    const seep: Intent = { kind: 'seep', flare: 0, kg: 1, title: '', detail: '' }
    const after = applyIntent(seep, mud(12, 12), []).pools
    expect(kgOf(after, 'earth:1')).toBeCloseTo(11)
    expect(kgOf(after, 'water:0')).toBeCloseTo(13)
    const harden: Intent = { kind: 'harden', flare: 0, kg: 2, title: '', detail: '' }
    const hardened = applyIntent(harden, mud(12, 12), []).pools
    expect(kgOf(hardened, 'water:1')).toBeCloseTo(2)
    expect(kgOf(hardened, 'water:0')).toBeCloseTo(10)
  })
})

describe('a commission', () => {
  it('deals a hand and reveals the first action', () => {
    const s = newGame('regular', undefined, 42)
    expect(s.hand).toHaveLength(7)
    expect(s.draw).toHaveLength(9)
    expect(s.quintessence).toBe(100)
    expect(['flare', 'seep', 'harden', 'slump']).toContain(s.intent.kind)
  })

  it('casts exactly what the preview promised', () => {
    let s = newGame('regular', undefined, 7)
    const anchor = s.hand.find((h) => h.affinity === 'water') ?? s.hand[0]
    const other = s.hand.find((h) => h !== anchor)!
    const r = rune(anchor, ['entwine', other])
    const preview = previewTerm(s, r)
    const before = s.quintessence
    s = cast(s, r)
    expect(s.quintessence).toBeCloseTo(before - preview.paid)
    expect(s.pools).toEqual(preview.pools)
    expect(s.table).toHaveLength(preview.table.length)
    expect(s.hand).toHaveLength(7)
    expect(s.term).toBe(2)
  })

  it('finishes the moment the amalgam reaches clay, before mud can act', () => {
    let s = newGame('scalene', undefined, 3)
    s = { ...s, pools: mud(7, 2.6) }
    const anchor = { ...g('water', 3), id: s.hand[0].id }
    const target = { ...g('earth', 3), id: s.hand[1].id }
    s = { ...s, hand: [anchor, target, ...s.hand.slice(2)] }
    const next = cast(s, rune(anchor, ['circumscribe', target]))
    expect(next.phase).toBe('won')
    expect(next.history.at(-1)?.paid).toBe(0)
  })

  it('refuses elements that are not in hand and joins past the anchor sides', () => {
    const s = newGame('regular', undefined, 9)
    expect(invalidReason(s, rune(g('water')))).toMatch(/hand/)
    const tri = { ...s.hand[0], sides: 3 }
    const state = { ...s, hand: [tri, ...s.hand.slice(1)] }
    const four = s.hand.slice(1, 5).map((h) => ['link', h] as [JoinKind, Glyph])
    expect(invalidReason(state, rune(tri, ...four))).toMatch(/holds 3/)
  })

  it('spends a discard to redraw', () => {
    const s = newGame('isosceles', undefined, 11)
    const next = discardGlyphs(s, [s.hand[0].id, s.hand[1].id])
    expect(next.discardsLeft).toBe(1)
    expect(next.hand).toHaveLength(7)
    expect(next.hand.some((h) => h.id === s.hand[0].id)).toBe(false)
  })
})
