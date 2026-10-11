import { describe, expect, it } from 'vitest'
import { normalize, poolKey, stepsBetween } from './alchemy'
import { CLAY_TARGET, applyIntent, inBand, miss, substanceName, type Intent } from './commission'
import { DEFAULT_FORGE, GUARD_MOTE, LINK_MOTE, REACH_MOTE, cloneForge, elementMote, makeRune, startingDeck } from './deck'
import { addRune, deckSpecs, editRune, removeRune, setComposition, setForge, setTarget } from './sandbox'
import { DEFAULT_SETTINGS, cast, discardRunes, endTerm, fairOpening, invalidReason, newGame, previewCast, previewEnd, sigilsPlayed, standardSetup } from './game'
import { REACH_PER_POWER, canJoin, openLinks, outputs, resolve } from './sigil'
import { imbalance, slumpTarget, strain, type TableEntry } from './table'
import type { Affinity, Body, JoinKind, Pool, Rune, Sigil } from './types'
import { PRESETS, presetByKey } from './presets'
import { totalKg } from './alchemy'
import { buildDeck, BOOST_MOTE } from './deck'
import { DEFAULT_EQUATION, resolveEquation, runepath } from './equation'

const capped = { surplusForce: false }
const R = REACH_PER_POWER

let nextId = 1000
const rune = (affinity: Affinity, body: Body = 'circle', power?: number): Rune => {
  const motes = affinity === 'none' ? [] : [elementMote(affinity)]
  if (body === 'crescent') motes.push(LINK_MOTE)
  return makeRune(nextId++, { body, motes }, DEFAULT_FORGE, power)
}
const triangle = () => makeRune(nextId++, { body: 'triangle', motes: [LINK_MOTE, REACH_MOTE, GUARD_MOTE] })
const { reach: REACH_X, guard: GUARD_W } = DEFAULT_FORGE.values
const sigil = (anchor: Rune, ...joins: [JoinKind, Rune][]): Sigil => ({
  anchor,
  joins: joins.map(([kind, r]) => ({ kind, rune: r })),
})
const mud = (earth: number, water: number, air = 0, fire = 0): Pool[] =>
  normalize([
    { elemental: 'earth', grade: 1, kg: earth },
    { elemental: 'water', grade: 0, kg: water },
    { elemental: 'air', grade: 1, kg: air },
    { elemental: 'fire', grade: 1, kg: fire },
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

describe('the starting deck', () => {
  it('holds 8 circles, 4 crescents and 2 triangles, all power 5', () => {
    const deck = startingDeck()
    const count = (b: Body) => deck.filter((r) => r.body === b).length
    expect([count('circle'), count('crescent'), count('triangle')]).toEqual([8, 4, 2])
    expect(deck.every((r) => r.power === 5)).toBe(true)
    expect(deck.every((r) => r.motes.length === r.bowls)).toBe(true)
  })

  it('gives each element three runes, and leaves the triangles elementless', () => {
    const deck = startingDeck()
    for (const e of ['water', 'earth', 'air', 'fire']) expect(deck.filter((r) => r.affinity === e)).toHaveLength(3)
    const tri = deck.filter((r) => r.body === 'triangle')
    expect(tri.every((r) => r.affinity === 'none' && r.links === 2 && r.reachMult === REACH_X && r.guard === GUARD_W)).toBe(true)
  })

  it('takes its links from the body plus link motes', () => {
    const deck = startingDeck()
    expect(deck.filter((r) => r.body === 'circle').every((r) => r.links === 1)).toBe(true)
    expect(deck.filter((r) => r.body === 'crescent').every((r) => r.links === 2)).toBe(true)
  })
})

describe('links', () => {
  it('lets a 1-link anchor hold exactly one rune', () => {
    const s = sigil(rune('water'), ['circumscribe', rune('earth')])
    expect(openLinks(s)).toBe(0)
    expect(canJoin(s, rune('air'))).toBe(false)
  })

  it('counts only the anchor’s links', () => {
    expect(canJoin(sigil(rune('water', 'crescent'), ['circumscribe', rune('earth')]), rune('air'))).toBe(true)
    expect(openLinks(sigil(rune('water', 'crescent'), ['circumscribe', rune('earth')], ['side', rune('air')]))).toBe(0)
    expect(canJoin(sigil(rune('water'), ['circumscribe', rune('earth', 'crescent')]), rune('air'))).toBe(false)
  })

  it('refuses a sigil with more joins than links', () => {
    const s = newGame(undefined, 5)
    const [a, b, c] = s.hand.filter((r) => r.links === 1)
    const state = { ...s, hand: [a, b, c, ...s.hand.filter((r) => r.links !== 1)] }
    expect(invalidReason(state, sigil(a, ['side', b], ['side', c]))).toMatch(/links/)
    expect(invalidReason(state, sigil(a, ['side', b]))).toBeNull()
  })
})

describe('resolving a sigil', () => {
  it('reproduces the doc worked example: Reach 2 at full Force against 5 kg of weak water', () => {
    const res = resolve(sigil(rune('water', 'circle', 2 / R), ['circumscribe', rune('earth', 'circle', 1)]), mud(5, 5), undefined, capped)
    expect(res.mode).toBe('transmute')
    expect(res.outputs.reach).toBeCloseTo(2)
    expect(res.required).toBe(5)
    expect(res.efficiency).toBe(1)
    expect(res.converted).toBeCloseTo(2)
    expect(res.produced).toBeCloseTo(1.2)
    expect(kgOf(res.pools, 'water:0')).toBeCloseTo(3)
    expect(kgOf(res.pools, 'earth:0')).toBeCloseTo(1.2)
  })

  it('lets surplus Force multiply Reach: two circles convert 2 kg', () => {
    const s = sigil(rune('water'), ['circumscribe', rune('earth')])
    expect(resolve(s, mud(12, 12)).converted).toBeCloseTo(5 * R * 2)
    expect(resolve(s, mud(12, 12), undefined, capped).converted).toBeCloseTo(5 * R)
  })

  it('scales the change down when Force falls short', () => {
    const res = resolve(sigil(rune('water', 'circle', 2), ['circumscribe', rune('earth', 'circle', 1)]), mud(5, 5))
    expect(res.efficiency).toBeCloseTo(0.6)
    expect(res.converted).toBeCloseTo(2 * R * 0.6)
  })

  it('needs a circumscribe to set a target', () => {
    expect(resolve(sigil(rune('water'), ['side', rune('air')]), mud(5, 5)).mode).toBe('none')
  })

  it('routes through chained circumscribes: two easy steps cost 20, a direct jump 30', () => {
    const routed = sigil(rune('earth', 'crescent'), ['circumscribe', rune('water')], ['circumscribe', rune('air')])
    const res = resolve(routed, mud(5, 5))
    expect(res.outputs.route).toEqual(['earth', 'water', 'air'])
    expect(res.required).toBe(20)
    expect(res.yieldFactor).toBeCloseTo(4.5)
    const direct = resolve(sigil(rune('earth'), ['circumscribe', rune('air')]), mud(5, 5))
    expect(direct.required).toBe(30)
    expect(direct.yieldFactor).toBe(20)
  })

  it('condenses when the anchor inscribes its own element', () => {
    const pools = normalize([{ elemental: 'earth', grade: 0, kg: 4 }])
    const res = resolve(sigil(rune('earth'), ['inscribe', rune('earth')]), pools, undefined, capped)
    expect(res.mode).toBe('condense')
    expect(res.required).toBe(5)
    expect(res.converted).toBeCloseTo(5 * R)
    expect(kgOf(res.pools, 'earth:1')).toBeCloseTo(5 * R * 0.5)
  })

  it('halves Reach for each off-element inscribe', () => {
    const base = outputs(sigil(rune('water', 'crescent'), ['circumscribe', rune('earth')]))
    const fine = outputs(sigil(rune('water', 'crescent'), ['circumscribe', rune('earth')], ['inscribe', rune('fire')]))
    expect(fine.reach).toBeCloseTo(base.reach / 2)
  })

  it('applies a triangle’s reach and guard motes wherever it sits', () => {
    const plain = outputs(sigil(rune('water', 'crescent'), ['circumscribe', rune('earth', 'crescent')]))
    const withTri = outputs(sigil(rune('water', 'crescent'), ['circumscribe', rune('earth', 'crescent')], ['side', triangle()]))
    expect(withTri.reachMult).toBe(REACH_X)
    expect(withTri.reach).toBeCloseTo((plain.reach + 5 * R) * REACH_X)
    expect(withTri.ward).toBe(GUARD_W)
  })

  it('works the pool the player selects', () => {
    const pools = normalize([
      { elemental: 'water', grade: 0, kg: 3 },
      { elemental: 'water', grade: 1, kg: 2 },
      { elemental: 'earth', grade: 1, kg: 5 },
    ])
    const s = sigil(rune('water'), ['circumscribe', rune('earth')])
    expect(resolve(s, pools).source?.grade).toBe(0)
    const hard = resolve(s, pools, 'water:1')
    expect(hard.source?.grade).toBe(1)
    expect(hard.required).toBe(10)
  })
})

describe('the table', () => {
  const entry = (id: number, s: Sigil): TableEntry => ({ id, term: id, sigil: s })

  it('lets opposites cancel and adds strain past the free amount', () => {
    const table = [
      entry(1, sigil(rune('water'), ['circumscribe', rune('earth')])),
      entry(2, sigil(rune('water'), ['circumscribe', rune('earth')])),
    ]
    expect(imbalance(table)).toBe(4)
    expect(strain(table)).toBe(1)
    expect(strain(table, false)).toBe(0)
    const balanced = [entry(1, sigil(rune('water', 'crescent'), ['circumscribe', rune('fire')], ['entwine', rune('fire')]))]
    expect(imbalance(balanced)).toBe(1)
  })

  it('slumps the sigil holding the table most level, never an entwined one', () => {
    const lopsided = entry(1, sigil(rune('water', 'crescent'), ['circumscribe', rune('earth')], ['side', rune('water')]))
    const leveller = entry(2, sigil(rune('fire'), ['side', rune('air')]))
    const held = entry(3, sigil(rune('fire'), ['entwine', rune('air')]))
    expect(slumpTarget([lopsided, leveller])).toBe(leveller)
    expect(slumpTarget([lopsided, held])).toBe(lopsided)
    expect(slumpTarget([held])).toBeUndefined()
  })
})

describe('mud', () => {
  it('starts with 5% each of air and fire', () => {
    const g = newGame(undefined, 1)
    const total = g.pools.reduce((n, p) => n + p.kg, 0)
    expect(total).toBe(40)
    for (const e of ['air', 'fire'] as const) expect(g.pools.find((p) => p.elemental === e)!.kg / total).toBeCloseTo(0.05)
  })

  it('becomes clay only with earth 75–85% and air and fire each between 1% and 3%', () => {
    expect(inBand(mud(8, 1.6, 0.2, 0.2))).toBe(true)
    expect(substanceName(mud(8, 1.6, 0.2, 0.2))).toBe('Clay')
    expect(substanceName(mud(8, 2))).toBe('Lean clay')
    expect(substanceName(mud(8, 1, 0.5, 0.5))).toBe('Organic clay')
    expect(substanceName(mud(12, 12, 1, 1))).toBe('Mud')
    expect(substanceName(mud(9.5, 0.3, 0.1, 0.1))).toBe('Hardpan')
  })

  it('treats the band edges as strict', () => {
    const exact = mud(12, 3.5, 0.25, 0.25) // 16 kg: earth exactly 75%
    expect(inBand(exact)).toBe(false)
  })

  it('measures distance to the target in band widths', () => {
    expect(miss(mud(8, 1.6, 0.2, 0.2))).toBe(0)
    const start = newGame(undefined, 1).pools
    expect(miss(start, CLAY_TARGET)).toBeCloseTo(3 + 1 + 1)
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
  it('deals a 6-rune hand from the 14-rune deck and reveals the first move', () => {
    const s = newGame(undefined, 42)
    expect(s.hand).toHaveLength(6)
    expect(s.draw).toHaveLength(8)
    expect(s.quintessence).toBe(100)
    expect(['flare', 'seep', 'harden', 'slump']).toContain(s.intent.kind)
  })

  it('always opens with at least one water and one earth', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const hand = newGame(undefined, seed).hand
      expect(hand.some((h) => h.affinity === 'water')).toBe(true)
      expect(hand.some((h) => h.affinity === 'earth')).toBe(true)
    }
    const stacked = startingDeck().sort((a, b) => Number(b.affinity === 'air') - Number(a.affinity === 'air'))
    expect(fairOpening(stacked, 3).slice(0, 3).map((r) => r.affinity)).toEqual(expect.arrayContaining(['water', 'earth']))
  })

  it('resolves each cast at once and lets mud act only when the term ends', () => {
    let s = newGame(undefined, 7)
    const water = s.hand.find((h) => h.affinity === 'water')!
    const earth = s.hand.find((h) => h.affinity === 'earth')!
    const first = sigil(water, ['circumscribe', earth])
    const p = previewCast(s, first)
    s = cast(s, first)
    expect(s.pools).toEqual(p.cast.pools)
    expect(s.hand).toHaveLength(4)
    expect(s.term).toBe(1)
    expect(s.casts).toHaveLength(1)
    const end = previewEnd(s)
    expect(end).toEqual(p.end)
    const before = s.quintessence
    s = endTerm(s)
    expect(s.quintessence).toBeCloseTo(before - end.paid)
    expect(s.term).toBe(2)
    expect(s.hand).toHaveLength(6)
    expect(s.history[0].casts).toHaveLength(1)
  })

  it('gathers Ward across a term’s sigils', () => {
    let s = newGame(undefined, 12)
    const [a, b, c, d] = s.hand
    s = cast(s, sigil(a, ['entwine', b]))
    s = cast(s, sigil(c, ['entwine', d]))
    expect(s.termWard).toBe(outputs(sigil(a, ['entwine', b])).ward + outputs(sigil(c, ['entwine', d])).ward)
    expect(previewEnd(s).ward).toBe(s.termWard)
    expect(sigilsPlayed(s)).toHaveLength(2)
  })

  it('caps sigils a term when told to', () => {
    let s = newGame({ ...DEFAULT_SETTINGS, castsPerTerm: 1 }, 13)
    const [a, b, c] = s.hand
    s = cast(s, sigil(a))
    expect(invalidReason(s, sigil(b, ['entwine', c]))).toMatch(/No more sigils/)
  })

  it('finishes the moment the amalgam reaches clay, before mud can act', () => {
    let s = newGame(undefined, 3)
    const water = makeRune(s.hand[0].id, { body: 'circle', motes: [elementMote('water')] })
    const earth = makeRune(s.hand[1].id, { body: 'circle', motes: [elementMote('earth')] })
    s = { ...s, pools: mud(8, 4, 0.25, 0.25), hand: [water, earth, ...s.hand.slice(2)] }
    const next = cast(s, sigil(water, ['circumscribe', earth]))
    expect(next.phase).toBe('won')
  })

  it('refuses runes that are not in hand', () => {
    const s = newGame(undefined, 9)
    expect(invalidReason(s, sigil(rune('water')))).toMatch(/hand/)
  })

  it('spends a discard to redraw', () => {
    const s = newGame(undefined, 11)
    const next = discardRunes(s, [s.hand[0].id, s.hand[1].id])
    expect(next.discardsLeft).toBe(1)
    expect(next.hand).toHaveLength(6)
    expect(next.hand.some((h) => h.id === s.hand[0].id)).toBe(false)
  })
})

describe('the sandbox', () => {
  it('changes a body for every rune at once', () => {
    const s = newGame(undefined, 21)
    const forge = cloneForge(s.forge)
    forge.bodies.circle = { power: 8, links: 2, bowls: 1 }
    const next = setForge(s, forge)
    const circles = [...next.hand, ...next.draw, ...next.discard].filter((r) => r.body === 'circle')
    expect(circles).toHaveLength(8)
    expect(circles.every((r) => r.power === 8 && r.links === 2)).toBe(true)
  })

  it('drops motes that no longer fit when bowls shrink', () => {
    const s = newGame(undefined, 22)
    const forge = cloneForge(s.forge)
    forge.bodies.triangle.bowls = 1
    const tri = [...setForge(s, forge).hand, ...setForge(s, forge).draw].find((r) => r.body === 'triangle')!
    expect(tri.motes).toHaveLength(1)
    expect(tri.links).toBe(2)
    expect(tri.guard).toBe(0)
  })

  it('adds a rune to the hand, edits one anywhere, and removes one', () => {
    let s = newGame(undefined, 23)
    s = addRune(s, { body: 'triangle', motes: [elementMote('water'), LINK_MOTE, LINK_MOTE] })
    expect(s.hand).toHaveLength(7)
    expect(s.hand.at(-1)).toMatchObject({ affinity: 'water', links: 3 })
    const target = s.draw[0]
    s = editRune(s, target.id, { body: 'circle', motes: [elementMote('fire')] })
    expect(s.draw[0]).toMatchObject({ id: target.id, affinity: 'fire', body: 'circle' })
    s = removeRune(s, target.id)
    expect(deckSpecs(s)).toHaveLength(14)
  })

  it('starts the next commission from the edited deck', () => {
    let s = newGame(undefined, 24)
    s = addRune(s, { body: 'crescent', motes: [elementMote('earth'), GUARD_MOTE] })
    const next = newGame(undefined, 25, { ...standardSetup(), forge: s.forge, deck: deckSpecs(s) })
    expect([...next.hand, ...next.draw]).toHaveLength(15)
  })
})

describe('table metrics', () => {
  it('counts gems, bodies and sides, by element', async () => {
    const { metricsOf, balance } = await import('./metrics')
    const s1 = sigil(rune('water'), ['circumscribe', rune('earth')])
    const s2 = sigil(rune('water', 'crescent'), ['circumscribe', rune('earth')], ['entwine', triangle()])
    const m = metricsOf([s1, s2])
    expect(m.runes).toBe(5)
    expect(m.motes).toEqual({ earth: 2, water: 2, air: 0, fire: 0 })
    expect(m.bodies).toEqual({ circle: 3, crescent: 1, triangle: 1 })
    expect(m.sides).toBe(1 + 1 + 2 + 1 + 3)
    expect(m.sidesBy.water).toBe(3)
    expect(m.sidesBy.none).toBe(3)
    expect(balance(m, 'sides')).toEqual({ earthAir: 2, waterFire: 3, total: 5 })
    expect(balance(m, 'motes').total).toBe(4)
  })

  it('counts every gem a rune holds', async () => {
    const { metricsOf } = await import('./metrics')
    const twoGems = makeRune(nextId++, { body: 'triangle', motes: [elementMote('fire'), elementMote('water'), LINK_MOTE] })
    const m = metricsOf([sigil(twoGems)])
    expect(m.motes).toEqual({ earth: 0, water: 1, air: 0, fire: 1 })
    expect(m.runesBy.fire).toBe(1)
  })
})

describe('sandbox compositions', () => {
  it('replaces the amalgam and keeps it as the starting composition', () => {
    const s = setComposition(newGame(undefined, 30), mud(10, 10, 1, 0))
    expect(s.pools.find((p) => p.elemental === 'fire')).toBeUndefined()
    expect(s.start).toEqual(s.pools)
  })

  it('changes the target live', () => {
    let s = newGame(undefined, 31)
    s = setTarget(s, { earth: { min: 0.4, max: 0.5 }, water: { min: 0, max: 1 }, air: { min: 0, max: 1 }, fire: { min: 0, max: 1 } })
    expect(inBand(s.pools, s.target)).toBe(true)
  })
})

describe('decks along a run', () => {
  it('keeps the standard deck size at every point', () => {
    for (const p of PRESETS) expect(p.setup().deck).toHaveLength(14)
  })

  it('gives the late deck six-rune anchors', () => {
    const late = presetByKey('late')!.setup()
    const deck = buildDeck(late.deck, late.forge)
    const anchors = deck.filter((r) => r.body === 'triangle' && r.affinity !== 'none')
    expect(anchors).toHaveLength(4)
    for (const a of anchors) {
      expect(a.links).toBe(5)
      expect(a.reachMult).toBe(DEFAULT_FORGE.values.reach)
    }
  })

  it('loops earth through air and fire back to earth at ×40, turning mud into clay in one cast', () => {
    const late = presetByKey('late')!.setup()
    const deck = buildDeck(late.deck, late.forge)
    const find = (e: Affinity, body: Body) => deck.find((r) => r.affinity === e && r.body === body)!
    const s = sigil(find('earth', 'triangle'), ['circumscribe', find('air', 'circle')], ['circumscribe', find('fire', 'circle')], ['circumscribe', find('earth', 'circle')], ...deck.filter((x) => x.affinity === 'water' && x.body === 'circle').map((x): [JoinKind, Rune] => ['side', x]))
    const r = resolve(s, late.start)
    expect(r.yieldFactor).toBe(40)
    expect(r.produced).toBeCloseTo(r.converted * 40)
    expect(inBand(r.pools, late.target)).toBe(true)
    expect(totalKg(r.pools)).toBeGreaterThan(100)
  })
})

describe('the alchemical equation', () => {
  // Round numbers for readable arithmetic; the game's defaults live in DEFAULT_EQUATION.
  const eq = { ...DEFAULT_EQUATION, base: 10, step: 2, ring: 1.1, inscribe: 1.1, neutral: 1 }
  const weakWater: Pool = { elemental: 'water', grade: 0, kg: 18 }

  it('walks the square easiest step first and ends at the seal', () => {
    const s = sigil(rune('earth'), ['circumscribe', rune('air')], ['circumscribe', rune('water')], ['circumscribe', rune('fire')])
    const p = runepath(s)!
    expect(p.steps.map((x) => x.to)).toEqual(['water', 'air', 'fire'])
    expect(p.flips).toBe(3)
  })

  it('breaks ties earth, fire, air, water', () => {
    const s = sigil(rune('fire'), ['circumscribe', rune('air')], ['circumscribe', rune('earth')], ['circumscribe', rune('water')])
    expect(runepath(s)!.steps.map((x) => x.to)).toEqual(['earth', 'air', 'water'])
  })

  it('takes the neutral kilo at a reach ratio of 1, and more as power and reach rise', () => {
    const base = resolveEquation(sigil(rune('water'), ['circumscribe', rune('earth')]), [weakWater], undefined, eq)
    expect(base.required).toBe(10)
    expect(base.converted).toBeCloseTo(1)
    expect(base.produced).toBeCloseTo(1.1)
    const reach = resolveEquation(sigil(rune('water'), ['circumscribe', rune('earth')], ['side', rune('fire')]), [weakWater], undefined, eq)
    expect(reach.converted).toBeCloseTo(2 ** Math.log(2))
    const less = resolveEquation(sigil(rune('water'), ['circumscribe', rune('earth')], ['tangent', rune('fire')]), [weakWater], undefined, eq)
    expect(less.converted).toBeCloseTo(0.5 ** Math.log(2))
  })

  it('lets an inscribe seal the equation and divide the output', () => {
    const r = resolveEquation(sigil(rune('water'), ['inscribe', rune('earth')]), [weakWater], undefined, eq)
    expect(r.target).toEqual({ elemental: 'earth', grade: 0 })
    expect(r.produced).toBeCloseTo(r.converted / 1.1)
  })

  it('condenses when the seal is an inscribe of the anchor element', () => {
    const r = resolveEquation(sigil(rune('earth'), ['inscribe', rune('earth')]), [{ elemental: 'earth', grade: 1, kg: 10 }], undefined, eq)
    expect(r.mode).toBe('condense')
    expect(r.required).toBe(20)
    expect(r.target).toEqual({ elemental: 'earth', grade: 2 })
  })

  it('adds boost motes to their rune multiplier', () => {
    const boosted = makeRune(nextId++, { body: 'crescent', motes: [elementMote('earth'), BOOST_MOTE] })
    const r = resolveEquation(sigil(rune('water'), ['circumscribe', boosted]), [weakWater], undefined, eq)
    expect(r.yieldFactor).toBeCloseTo(1.2)
  })
})
