import { describe, expect, it } from 'vitest'
import { COMMISSIONS, DEFAULT_SETTINGS, METAL_GATE, TINCTURE_WARD, addRune, fits, costOf, craft, emptyPool, newRun, nextFight, playCard, poolTotal, resolveCard, smelt, startingDeck, takeRune, upcoming, wait, type Card, type Run } from './engine'

const pool = (p: Partial<Record<'water' | 'earth' | 'air' | 'fire', number>>) => ({ ...emptyPool(), ...p })
const wash: Card = { id: 1, name: 'Wash', channels: [{ element: 'water', capacity: 5 }], outputs: [{ kind: 'principle', principle: 'mercury', gate: 1 }], gain: 0, ground: 0 }

describe('a circuit card', () => {
  it('takes up to its capacity of its element, purifies that much, and leaves its principle', () => {
    const r = resolveCard(wash, pool({ water: 3, earth: 1 }))
    expect(r.drained).toEqual(pool({ water: 3 }))
    expect(r.purification).toBe(3)
    expect(r.principles).toEqual({ salt: 0, sulfur: 0, mercury: 1 })
    expect(resolveCard(wash, pool({ water: 9 })).purification).toBe(5)
  })

  it('yields its principle only once it takes its threshold: every opening metal creator needs 4', () => {
    const deck = startingDeck()
    const creators = deck.filter((c) => c.outputs.some((o) => o.kind === 'principle'))
    for (const c of creators) for (const o of c.outputs) expect(o.gate).toBe(METAL_GATE)
    expect(new Set(creators.map((c) => c.name))).toEqual(new Set(['Wash', 'Calcine', 'Fan', 'Kindle']))
    const calcine = deck.find((c) => c.name === 'Calcine')!
    expect(resolveCard(calcine, pool({ earth: 3 })).principles.salt).toBe(0)
    expect(resolveCard(calcine, pool({ earth: 4 })).principles.salt).toBe(1)
    const deckWash = deck.find((c) => c.name === 'Wash')!
    expect(resolveCard(deckWash, pool({ water: 3 })).principles.mercury).toBe(0)
    expect(resolveCard(deckWash, pool({ water: 3 })).purification).toBe(3)
    expect(resolveCard(deckWash, pool({ water: 4 })).principles.mercury).toBe(1)
    expect(resolveCard(deckWash, pool({ water: 4 })).took).toEqual([4])
  })

  it('makes the opening Sieve raise Ward for what it takes instead of leaving principles', () => {
    const sieve = startingDeck().find((c) => c.name === 'Sieve')!
    expect(sieve.outputs).toEqual([{ kind: 'ward', gate: 1 }])
    const r = resolveCard(sieve, pool({ water: 1, earth: 4 }))
    expect(r.ward).toBe(3)
    expect(r.purification).toBe(3)
    expect(r.principles).toEqual({ salt: 0, sulfur: 0, mercury: 0 })
  })

  it('takes distilling runes on any card: each adds a principle output gated at 4', () => {
    const sieve = startingDeck().find((c) => c.name === 'Sieve')!
    const salty = addRune(sieve, { kind: 'distill', principle: 'salt' })
    expect(fits({ kind: 'distill', principle: 'salt' }, sieve)).toBe(true)
    expect(salty.outputs).toHaveLength(2)
    const more: Card = { ...salty, channels: [{ element: 'any', capacity: 5 }] }
    expect(resolveCard(more, pool({ earth: 3 })).principles.salt).toBe(0)
    const r = resolveCard(more, pool({ earth: 4 }))
    expect(r.principles.salt).toBe(1)
    expect(r.ward).toBe(4)
    const twice = addRune(addRune(startingDeck()[0], { kind: 'distill', principle: 'mercury' }), { kind: 'distill', principle: 'salt' })
    expect(resolveCard(twice, pool({ water: 5 })).principles).toEqual({ salt: 1, sulfur: 0, mercury: 2 })
    expect(fits({ kind: 'distill', principle: 'sulfur' }, twice)).toBe(false)
  })

  it('carries Ward from a Sieve into the next flare', () => {
    let run = newRun(1)
    const sieve = startingDeck().find((c) => c.name === 'Sieve')!
    run = { ...run, fight: { ...run.fight, hand: [sieve, ...run.fight.hand.slice(1)] } }
    run = playCard(run, sieve.id)
    expect(run.fight.ward).toBe(3)
    // 4 fed, 3 taken, 4 fed at the first quarter: 5 flare at the full moon, Ward takes 3.
    run = wait(run)
    expect(run.fight.flares).toEqual([5])
    expect(run.quintessence).toBe(DEFAULT_SETTINGS.stock - 2)
    expect(run.fight.ward).toBe(0)
  })

  it('takes nothing and leaves nothing from an empty channel', () => {
    const r = resolveCard(wash, pool({ earth: 4 }))
    expect(r.purification).toBe(0)
    expect(r.principles.mercury).toBe(0)
  })

  it('lets an any-element channel take whatever is most plentiful, yielding its own principle whatever it took', () => {
    const sieve: Card = { ...wash, channels: [{ element: 'any', capacity: 3 }] }
    const r = resolveCard(sieve, pool({ water: 1, earth: 4 }))
    expect(r.drained).toEqual(pool({ earth: 3 }))
    expect(r.principles).toEqual({ salt: 0, sulfur: 0, mercury: 1 })
  })

  it('multiplies purification by its gain stages, each a tick slower, and grounds drain without purifying', () => {
    const big: Card = { ...wash, gain: 2, ground: 1 }
    const r = resolveCard(big, pool({ water: 5, earth: 4 }))
    expect(r.purification).toBe(15)
    expect(r.principles.mercury).toBe(1)
    expect(r.drained).toEqual(pool({ water: 5, earth: 3 }))
    expect(costOf(big)).toBe(4)
  })

  it('grows by adding runes, up to a cap for each kind of part', () => {
    const more = addRune(addRune(wash, { kind: 'channel', element: 'air', capacity: 4 }), { kind: 'gain' })
    expect(more.channels).toHaveLength(2)
    expect(more.gain).toBe(1)
    const twoGains = addRune(more, { kind: 'gain' })
    expect(twoGains.gain).toBe(2)
    expect(addRune(twoGains, { kind: 'gain' })).toBe(twoGains)
    const three = addRune(more, { kind: 'channel', element: 'fire', capacity: 4 })
    expect(addRune(three, { kind: 'channel', element: 'earth', capacity: 5 })).toBe(three)
  })
})

describe('the moon dial', () => {
  it('opens at the first quarter with the first feed and a hand of four', () => {
    const run = newRun(1)
    expect(run.fight.dial).toBe(0)
    expect(run.fight.hand).toHaveLength(4)
    expect(run.fight.pool).toEqual(pool({ water: 3, earth: 1 }))
  })

  it('moves an eighth of the moon for a plain card, feeding again at the next phase', () => {
    let run = newRun(1)
    const card = run.fight.hand[0]
    const before = poolTotal(run.fight.pool)
    const took = poolTotal(resolveCard(card, run.fight.pool).drained)
    run = playCard(run, card.id)
    expect(run.fight.dial).toBe(2)
    expect(poolTotal(run.fight.pool)).toBe(before - took + 4)
    expect(run.fight.hand).toHaveLength(3)
  })

  it('flares what is left at the full moon, Ward first, and refills the hand there', () => {
    let run: Run = newRun(1)
    run = { ...run, fight: { ...run.fight, ward: TINCTURE_WARD } }
    run = wait(run)
    run = wait(run)
    expect(run.fight.dial).toBe(4)
    // Fed at the new moon and first quarter: 8 instability, Ward takes 6, 2 paid; the full moon then feeds again.
    expect(run.fight.flares).toEqual([8])
    expect(run.quintessence).toBe(DEFAULT_SETTINGS.stock - 2)
    expect(run.fight.pool).toEqual(pool({ water: 3, earth: 1 }))
    expect(run.fight.hand).toHaveLength(4)
  })

  it('in half-moon turns, discards what is left at the full moon and draws 4', () => {
    let run = newRun(1, { ...DEFAULT_SETTINGS, draw: 'cycle' })
    expect(run.fight.hand).toHaveLength(4)
    const kept = run.fight.hand.slice(1).map((c) => c.id)
    run = playCard(run, run.fight.hand[0].id)
    run = wait(run)
    expect(run.fight.dial).toBe(4)
    expect(run.fight.hand).toHaveLength(4)
    expect(run.fight.discard.map((c) => c.id)).toEqual(expect.arrayContaining(kept))
  })

  it('moves the moon on by itself when nothing can be played', () => {
    let run = newRun(1, { ...DEFAULT_SETTINGS, draw: 'cycle' })
    run = { ...run, fight: { ...run.fight, hand: run.fight.hand.slice(0, 1) } }
    run = playCard(run, run.fight.hand[0].id)
    expect(run.fight.dial).toBe(4)
    expect(run.fight.hand).toHaveLength(4)
  })

  it('lists what the coming phases bring', () => {
    const next = upcoming(newRun(1).fight, 4)
    expect(next.map((x) => x.phase)).toEqual(['waxing-gibbous', 'full', 'waning-gibbous', 'last'])
    expect(next.find((x) => x.phase === 'full')!.attack).toBe(true)
  })
})

describe('recipes', () => {
  it('brews a homunculus that purifies on its own every quarter', () => {
    let run = newRun(1)
    run = { ...run, fight: { ...run.fight, principles: { salt: 2, sulfur: 1, mercury: 3 } } }
    run = craft(run, 'homunculus')
    expect(run.fight.homunculi).toBe(1)
    expect(run.fight.principles).toEqual({ salt: 0, sulfur: 0, mercury: 0 })
    expect(run.fight.dial).toBe(2)
    expect(run.fight.purified).toBe(2)
  })

  it('refuses a recipe it cannot afford', () => {
    expect(() => craft(newRun(1), 'tincture')).toThrow(/principles/)
  })

  it('smelts silver from mercury and salt, lead from any two principles', () => {
    expect(smelt({ salt: 2, sulfur: 1, mercury: 5 })).toEqual({ silver: 2, lead: 1, value: 7 })
  })
})

describe('the run', () => {
  it('wins a fight, offers runes, adds one to a card, and goes on to the next commission', () => {
    let run = newRun(1)
    run = { ...run, fight: { ...run.fight, purified: COMMISSIONS[0].require - 1 } }
    run = playCard(run, run.fight.hand.find((c) => c.channels[0].element === 'water' || c.channels[0].element === 'any')!.id)
    expect(run.stage).toBe('reward')
    expect(run.offer).toHaveLength(3)
    const i = 0
    const target = run.deck[0]
    run = takeRune(run, i, target.id)
    expect(run.tookFree).toBe(true)
    expect(run.deck[0]).not.toEqual(target)
    run = nextFight(run)
    expect(run.stage).toBe('fight')
    expect(run.fight.commission.key).toBe('peat')
  })
})
