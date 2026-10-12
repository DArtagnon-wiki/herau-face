import { describe, expect, it } from 'vitest'
import { normalize, poolKey } from './alchemy'
import { CLAY_TARGET, composeIntent, inBand, miss } from './commission'
import { DEFAULT_FORGE, LINK_MOTE, REACH_MOTE, elementMote, grow, makeRune, mote, type RuneSpec } from './deck'
import { DEFAULT_SETTINGS, autoBurn, cast, endTerm, newGame, previewCast, previewEnd, standardSetup, type GameState } from './game'
import { AQUA_VITAE, CAPUT_POWER, PELICAN_WARD, catalystPower, effectiveSigil, refinedShare } from './catalysts'
import { DEFAULT_EQUATION, outputGrade, resolveEquation, runepath, take, terms } from './equation'
import { outputs } from './sigil'
import type { Elemental, JoinKind, MoteKind, Pool, Rune, Sigil } from './types'
import { ARCHETYPE_DECKS } from './presets'

let nextId = 5000
const r = (e: Elemental | 'none', ...kinds: Exclude<MoteKind, 'element'>[]): Rune =>
  makeRune(nextId++, { body: 'triangle', motes: [...(e === 'none' ? [] : [elementMote(e)]), ...kinds.map((k) => (k === 'link' ? LINK_MOTE : k === 'reach' ? REACH_MOTE : mote(k)))] })
const sigil = (anchor: Rune, ...joins: [JoinKind, Rune][]): Sigil => ({ anchor, joins: joins.map(([kind, rune]) => ({ kind, rune })) })
const pools = (...ps: [Elemental, 0 | 1 | 2 | 3, number][]): Pool[] => normalize(ps.map(([elemental, grade, kg]) => ({ elemental, grade, kg })))
const kgOf = (ps: Pool[], key: string) => ps.find((p) => poolKey(p) === key)?.kg ?? 0
const eqSettings = { ...DEFAULT_SETTINGS, equation: { ...DEFAULT_EQUATION } }

/** A game whose hand is exactly these runes, with an empty draw pile unless given one. */
function withHand(hand: Rune[], draw: Rune[] = [], extra: Partial<GameState> = {}): GameState {
  const s = newGame(eqSettings, 42)
  return { ...s, hand, draw, discard: [], intent: composeIntent([]), termWard: 0, ...extra }
}

describe('consistent ward', () => {
  it('glaze gives its sigil Ward for every rune in it', () => {
    const s = sigil(r('water', 'glaze', 'link'), ['circumscribe', r('earth')], ['entwine', r('none')])
    expect(outputs(s).glaze).toBe(2 * 3)
    expect(outputs(s).ward).toBe(5 + 6)
  })

  it('crucible lends Ward when drawn', () => {
    const deck: RuneSpec[] = Array.from({ length: 8 }, () => ({ body: 'crescent', motes: [elementMote('earth'), mote('crucible')] }))
    const s = newGame(eqSettings, 1, { ...standardSetup(), deck })
    expect(s.termWard).toBe(6 * 3)
  })

  it('lute keeps Ward the flares leave, term to term', () => {
    const a = r('none', 'lute', 'link')
    const b = r('none')
    let s = withHand([a, b], [], { intent: { ...composeIntent([]), flare: 4 } })
    s = cast(s, sigil(a, ['entwine', b]))
    expect(s.keptWard).toBe(5)
    expect(s.termWard).toBe(0)
    expect(previewEnd(s).kept).toBe(1)
    s = endTerm(s)
    expect(s.keptWard).toBe(1)
  })

  it('spends this term’s Ward before lasting Ward', () => {
    const s = withHand([], [], { intent: { ...composeIntent([]), flare: 6 }, termWard: 4, keptWard: 5 })
    const e = previewEnd(s)
    expect(e.paid).toBe(0)
    expect(e.kept).toBe(3)
  })
})

describe('combo', () => {
  it('cohobation returns its anchor to hand', () => {
    const a = r('water', 'cohobation')
    const b = r('earth')
    const c = r('earth')
    let s = withHand([a, b, c])
    s = cast(s, sigil(a, ['circumscribe', b]))
    expect(s.hand.map((x) => x.id).sort()).toEqual([a.id, c.id].sort())
    s = cast(s, sigil(s.hand.find((x) => x.id === a.id)!, ['circumscribe', c]))
    expect(s.hand.map((x) => x.id)).toEqual([a.id])
    expect(s.casts).toHaveLength(2)
  })

  it('distillation draws a rune after the cast', () => {
    const a = r('water')
    const b = r('earth', 'distillation')
    const spare = r('air')
    let s = withHand([a, b], [spare])
    s = cast(s, sigil(a, ['circumscribe', b]))
    expect(s.hand.map((x) => x.id)).toEqual([spare.id])
  })

  it('a cohobating anchor with distilling joins never runs dry', () => {
    const a = r('water', 'cohobation')
    const joins = Array.from({ length: 3 }, () => r('earth', 'distillation'))
    let s = withHand([a, joins[0]], joins.slice(1))
    for (let i = 0; i < 12 && s.phase === 'compose'; i++) {
      const anchor = s.hand.find((x) => x.id === a.id)!
      const join = s.hand.find((x) => x.id !== a.id)!
      s = cast(s, sigil(anchor, ['circumscribe', join]))
    }
    // Every cast draws the next join, so the loop runs until the commission is done or the cap is reached.
    expect(s.casts.length).toBeGreaterThan(4)
    if (s.phase === 'compose') expect(s.hand.some((x) => x.id === a.id)).toBe(true)
  })

  it('pelican lends Ward when a rune returns', () => {
    const a = r('water', 'cohobation')
    const b = r('earth')
    const s = withHand([a, b], [], { catalysts: ['pelican'] })
    expect(previewCast(s, sigil(a, ['circumscribe', b])).termWard).toBe(PELICAN_WARD)
  })
})

describe('one great rune', () => {
  it('multiplication counts its other motes once more each cast', () => {
    const a = makeRune(1, { body: 'triangle', motes: [elementMote('water'), mote('multiplication'), REACH_MOTE] })
    expect(a.reachMult).toBe(1.5)
    const once = grow(a, DEFAULT_FORGE)
    const twice = grow(once, DEFAULT_FORGE)
    expect(once.reachMult).toBeCloseTo(1.5 ** 2)
    expect(twice.reachMult).toBeCloseTo(1.5 ** 3)
    expect(twice.stacks).toBe(2)
    const linker = makeRune(2, { body: 'triangle', motes: [elementMote('water'), mote('multiplication'), LINK_MOTE] })
    expect(grow(grow(linker, DEFAULT_FORGE), DEFAULT_FORGE).links).toBe(1 + 3)
  })

  it('a cast grows the rune where it lands', () => {
    const a = r('water', 'multiplication', 'reach')
    const b = r('earth')
    const s = cast(withHand([a, b]), sigil(a, ['circumscribe', b]))
    expect(s.discard.find((x) => x.id === a.id)!.stacks).toBe(1)
  })
})

describe('purity maxing', () => {
  it('rectification purifies two grades for one step of resistance', () => {
    const s = sigil(r('earth', 'link'), ['inscribe', r('earth', 'rectification')])
    const path = runepath(s)!
    expect(outputGrade(path, 0)).toBe(2)
    const plain = runepath(sigil(r('earth', 'link'), ['inscribe', r('earth')]))!
    const src = pools(['earth', 0, 20])[0]
    expect(terms(s, src, DEFAULT_EQUATION, path).resistance).toBe(terms(sigil(r('earth', 'link'), ['inscribe', r('earth')]), src, DEFAULT_EQUATION, plain).resistance)
  })

  it('digestion lets a sigil that only purifies take part of the pool', () => {
    const plain = sigil(r('earth', 'link'), ['inscribe', r('earth')])
    const digesting = sigil(r('earth', 'digestion'), ['inscribe', r('earth')])
    const ps = pools(['earth', 0, 20])
    const a = resolveEquation(plain, ps, undefined, DEFAULT_EQUATION)
    const b = resolveEquation(digesting, ps, undefined, DEFAULT_EQUATION)
    const t = terms(digesting, ps[0], DEFAULT_EQUATION, runepath(digesting)!)
    expect(b.converted - a.converted).toBeCloseTo(0.25 * take(DEFAULT_EQUATION, t, 20).gate * 20)
    // A transmuting sigil gets nothing from digestion.
    const ring = sigil(r('earth', 'digestion'), ['circumscribe', r('water')])
    expect(terms(ring, ps[0], DEFAULT_EQUATION, runepath(ring)!).digest).toBe(0)
  })

  it('aqua vitae gives power while the amalgam is refined', () => {
    expect(refinedShare(pools(['earth', 1, 8], ['water', 0, 2]))).toBeCloseTo(0.8)
    expect(catalystPower(['aqua-vitae'], pools(['earth', 1, 8], ['water', 0, 2]), 0)).toBe(AQUA_VITAE.power)
    expect(catalystPower(['aqua-vitae'], pools(['earth', 1, 7], ['water', 0, 3]), 0)).toBe(0)
  })
})

describe('element mastery', () => {
  it('resonance adds power for every other rune of its element', () => {
    const a = r('water', 'resonance', 'link')
    const s = effectiveSigil(sigil(a, ['side', r('water')], ['side', r('water')], ['circumscribe', r('earth')]), 0)
    expect(s.anchor.power).toBe(5 + 2 * 2)
    expect(s.joins[2].rune.power).toBe(5)
  })

  it('a magnesia seal draws from the other elements into its own', () => {
    const s = sigil(r('water', 'link'), ['circumscribe', r('earth', 'magnesia')])
    const ps = pools(['earth', 1, 18], ['water', 0, 18], ['air', 1, 2], ['fire', 1, 2])
    const res = resolveEquation(s, ps, undefined, DEFAULT_EQUATION)
    expect(res.gathered).toHaveLength(2)
    const each = Math.min(2, 0.25 * res.converted)
    expect(kgOf(res.pools, 'air:1')).toBeCloseTo(2 - each)
    expect(kgOf(res.pools, 'fire:1')).toBeCloseTo(2 - each)
  })
})

describe('deck thinning', () => {
  it('calcination burns slag first, then plain circles', () => {
    const slag = makeRune(90, { body: 'circle', motes: [], junk: true })
    const circle = makeRune(91, { body: 'circle', motes: [elementMote('air')] })
    const crescent = makeRune(92, { body: 'crescent', motes: [elementMote('air'), LINK_MOTE] })
    expect(autoBurn([crescent, circle, slag], 1)).toEqual([90])
    expect(autoBurn([crescent, circle, slag], 3)).toEqual([90, 91])
  })

  it('a calcining sigil burns from hand, and the caput mortuum turns burns into power', () => {
    const a = r('water', 'calcination')
    const b = r('earth')
    const slag = makeRune(93, { body: 'circle', motes: [], junk: true })
    const s = cast(withHand([a, b, slag], [], { catalysts: ['caput-mortuum'] }), sigil(a, ['circumscribe', b]))
    expect(s.hand).toHaveLength(0)
    expect(s.burned.map((x) => x.id)).toEqual([93])
    expect(catalystPower(s.catalysts, s.pools, s.burned.length)).toBe(CAPUT_POWER)
  })

  it('lets the player choose what burns', () => {
    const a = r('water', 'calcination')
    const b = r('earth')
    const keep = makeRune(94, { body: 'circle', motes: [elementMote('fire')] })
    const other = r('air')
    const s = cast(withHand([a, b, keep, other]), sigil(a, ['circumscribe', b]), undefined, { burn: [other.id] })
    expect(s.burned.map((x) => x.id)).toEqual([other.id])
  })
})

describe('archetype decks', () => {
  it('each keeps 14 runes and holds its archetype’s motes', () => {
    for (const d of ARCHETYPE_DECKS) {
      const setup = d.setup()
      expect(setup.deck.length, d.key).toBeLessThanOrEqual(14)
      expect(setup.deck.some((spec) => spec.motes.some((m) => d.motes.includes(m.kind))), d.key).toBe(true)
    }
  })
})

describe('the great rune deck', () => {
  it('gives its water triangle all four motes', () => {
    const setup = ARCHETYPE_DECKS.find((d) => d.key === 'great')!.setup()
    const great = setup.deck.find((r) => r.motes.some((m) => m.kind === 'multiplication'))!
    expect(makeRune(1, great, setup.forge).reachMult).toBe(1.5)
    expect(makeRune(1, great, setup.forge).links).toBe(2)
  })
})

describe('press, homing magnesia and purity targets', () => {
  it('press turns Ward held into power on its rune', () => {
    const a = r('water', 'link')
    const p = r('none', 'press')
    const s = effectiveSigil(sigil(a, ['side', p]), 0, 10)
    expect(s.joins[0].rune.power).toBe(5 + 0.5 * 10)
    const g = withHand([a, p], [], { termWard: 4, keptWard: 6 })
    const t = previewCast(g, sigil(a, ['side', p]))
    expect(t.cast.resolution.mode).toBe('none')
  })

  it('magnesia stops at the middle of each band', () => {
    const s = sigil(r('water', 'link', 'reach', 'reach'), ['circumscribe', r('earth', 'magnesia')], ['side', r('none')])
    const ps = pools(['earth', 1, 18], ['water', 0, 18], ['air', 1, 2], ['fire', 1, 2])
    const target = { earth: { min: 0.75, max: 0.85 }, water: { min: 0, max: 1 }, air: { min: 0.01, max: 0.03 }, fire: { min: 0.01, max: 0.03 } }
    const res = resolveEquation(s, ps, undefined, DEFAULT_EQUATION, target)
    const total = res.pools.reduce((n, p) => n + p.kg, 0)
    expect(kgOf(res.pools, 'air:1') / total).toBeGreaterThanOrEqual(0.02 - 0.002)
  })

  it('a purity target holds the finish until enough of the element is pure', () => {
    const t = { ...CLAY_TARGET, purity: { elemental: 'earth' as const, grade: 2 as const, share: 0.5 } }
    const clay = pools(['earth', 1, 32], ['water', 0, 6.8], ['air', 1, 0.8], ['fire', 1, 0.8])
    expect(inBand(clay, CLAY_TARGET)).toBe(true)
    expect(inBand(clay, t)).toBe(false)
    const fine = pools(['earth', 1, 15], ['earth', 2, 17], ['water', 0, 6.8], ['air', 1, 0.8], ['fire', 1, 0.8])
    expect(inBand(fine, t)).toBe(true)
    expect(miss(clay, t)).toBeGreaterThan(miss(fine, t))
  })
})
