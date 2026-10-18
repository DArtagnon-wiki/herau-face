import { describe, expect, it } from 'vitest'
import { COMMISSIONS, DEFAULT_SETTINGS, METAL_GATE, catalystCard, TINCTURE_WARD, addRune, fits, costOf, craft, emptyPool, newRun, nextFight, playCard, poolTotal, resolveCard, smelt, startingDeck, takeRune, upcoming, wait, type Card, type Run } from './engine'

const pool = (p: Partial<Record<'water' | 'earth' | 'air' | 'fire', number>>) => ({ ...emptyPool(), ...p })
const wash: Card = { id: 1, name: 'Wash', channels: [{ element: 'water', capacity: 5 }], outputs: [{ kind: 'principle', principle: 'mercury', gate: 1 }], purifies: true, gain: 0, time: 2, ground: 0 }

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
    expect(resolveCard(deckWash, pool({ water: 3 })).purification).toBe(0)
    expect(resolveCard(deckWash, pool({ water: 4 })).principles.mercury).toBe(1)
    expect(resolveCard(deckWash, pool({ water: 4 })).took).toEqual([4])
  })

  it('opens with five metal makers that ground, five two-element purifiers, and the Sieve', () => {
    const deck = startingDeck()
    expect(deck).toHaveLength(11)
    const metal = deck.filter((c) => !c.purifies)
    const purifiers = deck.filter((c) => c.purifies && c.outputs.length === 0)
    expect(metal.map((c) => c.channels[0].element).sort()).toEqual(['air', 'earth', 'fire', 'water', 'water'])
    expect(purifiers).toHaveLength(5)
    for (const c of purifiers) {
      expect(c.channels.map((ch) => ch.capacity)).toEqual([3, 3])
      expect(costOf(c)).toBe(2)
    }
    const wash = metal.find((c) => c.name === 'Wash')!
    const r = resolveCard(wash, pool({ water: 7 }))
    expect(r.purification).toBe(0)
    expect(r.drained).toEqual(pool({ water: 5 }))
    expect(r.principles.mercury).toBe(1)
    expect(fits({ kind: 'gain' }, wash)).toBe(false)
    const dissolve = purifiers.find((c) => c.name === 'Dissolve')!
    expect(resolveCard(dissolve, pool({ water: 4, earth: 5 })).purification).toBe(6)
    expect(resolveCard(dissolve, pool({ water: 4, earth: 5 })).principles).toEqual({ salt: 0, sulfur: 0, mercury: 0 })
  })

  it('lets a Catalyst make the next card purify ×2, once', () => {
    let run = newRun(1)
    const cat = catalystCard(90)
    const dissolve = startingDeck().find((c) => c.name === 'Dissolve')!
    const coag = startingDeck().find((c) => c.name === 'Coagulate')!
    run = { ...run, fight: { ...run.fight, pool: pool({ water: 9, earth: 9 }), hand: [cat, dissolve, coag] } }
    run = playCard(run, cat.id)
    expect(run.fight.purified).toBe(2)
    expect(run.fight.catalyst).toBe(2)
    run = { ...run, fight: { ...run.fight, pool: pool({ water: 9, earth: 9 }) } }
    run = playCard(run, dissolve.id)
    expect(run.fight.purified).toBe(2 + 12)
    expect(run.fight.catalyst).toBe(1)
    const purified = run.fight.purified
    run = { ...run, fight: { ...run.fight, pool: pool({ water: 9, earth: 9 }), hand: [coag] } }
    run = playCard(run, coag.id)
    expect(run.fight.purified).toBe(purified + 6)
  })

  it('offers the Catalyst as a whole new card for the deck', () => {
    let run = newRun(1)
    run = { ...run, fight: { ...run.fight, purified: COMMISSIONS[0].require - 1, hand: [startingDeck().find((c) => c.name === 'Dissolve')!] } }
    run = playCard(run, run.fight.hand[0].id)
    run = { ...run, offer: [{ kind: 'card', card: 'catalyst' }] }
    const before = run.deck.length
    run = takeRune(run, 0)
    expect(run.deck).toHaveLength(before + 1)
    expect(run.deck[run.deck.length - 1].name).toBe('Catalyst')
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
    // 7 fed at the new moon, 3 taken: 4 flare at 3/8, Ward takes 3.
    run = wait(run)
    expect(run.fight.flares).toEqual([4])
    expect(run.quintessence).toBe(DEFAULT_SETTINGS.stock - 1)
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
    const big: Card = addRune(addRune(addRune(wash, { kind: 'gain' }), { kind: 'gain' }), { kind: 'ground' })
    const r = resolveCard(big, pool({ water: 5, earth: 4 }))
    expect(r.purification).toBe(15)
    expect(r.principles.mercury).toBe(1)
    expect(r.drained).toEqual(pool({ water: 5, earth: 3 }))
    expect(r.grounded).toEqual([3])
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
  it('opens at the new moon with the first bulk feed and a hand of four', () => {
    const run = newRun(1)
    expect(run.fight.dial).toBe(0)
    expect(run.fight.hand).toHaveLength(4)
    expect(run.fight.pool).toEqual(pool(COMMISSIONS[0].feed))
  })

  it('moves an eighth of the moon for a plain card, with no feed until the next new or full moon', () => {
    let run = newRun(1)
    const card = run.fight.hand[0]
    const before = poolTotal(run.fight.pool)
    const took = poolTotal(resolveCard(card, run.fight.pool).drained)
    run = playCard(run, card.id)
    expect(run.fight.dial).toBe(2)
    expect(poolTotal(run.fight.pool)).toBe(before - took)
    expect(run.fight.hand).toHaveLength(3)
  })

  it('discards the hand at the first quarter, flares at 3/8, and feeds and draws 4 at the full moon', () => {
    let run = newRun(1)
    const card = run.fight.hand[0]
    const left = poolTotal(run.fight.pool) - poolTotal(resolveCard(card, run.fight.pool).drained)
    run = playCard(run, card.id)
    run = wait(run)
    // Discarded at the first quarter with nothing to brew, the moon moves on by itself to the next draw.
    expect(run.fight.dial).toBe(8)
    expect(run.fight.flares).toEqual([left])
    expect(run.quintessence).toBe(DEFAULT_SETTINGS.stock - left)
    expect(poolTotal(run.fight.pool)).toBe(left + poolTotal(pool(COMMISSIONS[0].feed)))
    expect(run.fight.hand).toHaveLength(4)
  })

  it('takes a flare out of Ward first, and leaves the pool in place', () => {
    let run: Run = newRun(1)
    run = { ...run, fight: { ...run.fight, ward: TINCTURE_WARD + 4, hand: [] } }
    run = wait(run)
    expect(run.fight.flares).toEqual([7])
    expect(run.quintessence).toBe(DEFAULT_SETTINGS.stock)
    expect(run.fight.ward).toBe(TINCTURE_WARD + 4 - 7)
    expect(run.fight.pool).toEqual(pool({ water: 10, earth: 4 }))
  })

  it('grows the Mire at each bulk feed after the first', () => {
    let run: Run = newRun(1)
    run = { ...run, fight: { ...run.fight, commission: COMMISSIONS[3], pool: emptyPool(), hand: [] } }
    run = wait(run)
    expect(run.fight.dial).toBe(8)
    expect(run.fight.pool).toEqual(pool({ water: 5, earth: 4, fire: 1 }))
  })

  it('lists what the coming phases bring', () => {
    const next = upcoming(newRun(1).fight, 4)
    expect(next.map((x) => x.phase)).toEqual(['waxing-crescent', 'first', 'waxing-gibbous', 'full'])
    expect(next.find((x) => x.phase === 'first')!.discard).toBe(true)
    expect(next.find((x) => x.phase === 'waxing-gibbous')!.attack).toBe(true)
    const full = next.find((x) => x.phase === 'full')!
    expect(full.feed && full.draw).toBe(true)
  })
})

describe('recipes', () => {
  it('brews in no time; a homunculus then purifies on its own at every phase', () => {
    let run = newRun(1)
    run = { ...run, fight: { ...run.fight, principles: { salt: 2, sulfur: 1, mercury: 3 } } }
    run = craft(run, 'homunculus')
    expect(run.fight.homunculi).toBe(1)
    expect(run.fight.principles).toEqual({ salt: 0, sulfur: 0, mercury: 0 })
    expect(run.fight.dial).toBe(0)
    expect(run.fight.purified).toBe(0)
    run = wait(run)
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
    run = { ...run, fight: { ...run.fight, hand: [startingDeck().find((c) => c.name === 'Dissolve')!, ...run.fight.hand.slice(1)] } }
    run = playCard(run, run.fight.hand[0].id)
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
