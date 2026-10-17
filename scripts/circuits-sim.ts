// A simple player for the circuits prototype, to check the first numbers.
// It plays whichever card, recipe or wait leaves the best position: purified
// so far, quintessence kept, the pool it would have to face, helpers made.
//
//   npx tsx scripts/circuits-sim.ts [--runs 300] [--draw refill|draw] [--hand 4] [--stock 60]

import { COMMISSIONS, DEFAULT_SETTINGS, RECIPES, canAfford, craft, fits, newRun, nextFight, playCard, poolTotal, takeRune, wait, EXTRA_RUNE_PRICE, type Run, type Settings } from '../src/circuits/engine'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const runs = Number(arg('--runs') ?? 300)
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  draw: (arg('--draw') as Settings['draw']) ?? DEFAULT_SETTINGS.draw,
  hand: Number(arg('--hand') ?? DEFAULT_SETTINGS.hand),
  stock: Number(arg('--stock') ?? DEFAULT_SETTINGS.stock),
}

function value(r: Run, start: Run): number {
  if (r.stage === 'lost') return -1e6
  if (r.stage !== 'fight') return 1e6 + r.quintessence
  const f = r.fight
  return f.purified - 3 * (start.quintessence - r.quintessence) - 0.6 * poolTotal(f.pool) + 10 * f.homunculi + 0.5 * f.ward + 0.8 * f.hand.length
}

function choose(r: Run): { run: Run; kind: 'card' | 'brew' | 'wait' } {
  const options: { run: Run; kind: 'card' | 'brew' | 'wait' }[] = []
  for (const c of r.fight.hand) options.push({ run: playCard(r, c.id), kind: 'card' })
  for (const rec of RECIPES) if (canAfford(r.fight, rec)) options.push({ run: craft(r, rec.key), kind: 'brew' })
  options.push({ run: wait(r), kind: 'wait' })
  return options.reduce((a, b) => (value(b.run, r) > value(a.run, r) ? b : a))
}

/** Between fights: put each rune where it helps most, the free one and as many more as metal buys. */
function reward(r: Run): Run {
  let run = r
  for (let guard = 0; guard < 5 && run.offer.length; guard++) {
    if (run.tookFree && run.metals < EXTRA_RUNE_PRICE) break
    const order = run.offer.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o))
    let done = false
    for (const { o, i } of order) {
      const cards = run.deck.filter((c) => fits(o, c))
      if (!cards.length) continue
      // Gains and distillers go on the water cards (mud feeds water most), channels on a card of another element.
      const pick =
        o.kind === 'channel'
          ? cards.find((c) => !c.channels.some((ch) => ch.element === o.element)) ?? cards[0]
          : o.kind === 'expand'
            ? cards.find((c) => c.gain > 0) ?? cards[0]
            : cards.find((c) => c.channels[0].element === 'water') ?? cards[0]
      run = takeRune(run, i, pick.id)
      done = true
      break
    }
    if (!done) break
  }
  return nextFight(run)
}
const rank = (o: Run['offer'][number]) => ({ gain: 0, channel: 1, distill: 2, ground: 3, expand: 4 })[o.kind]

type FightStat = { won: boolean; paid: number; moons: number; plays: number; brewed: number; principles: number; waits: number }
const stats: FightStat[][] = COMMISSIONS.map(() => [])
let runsWon = 0
const endQuint: number[] = []
for (let i = 0; i < runs; i++) {
  let r = newRun(7000 + i, settings)
  let plays = 0
  let brewed = 0
  let gathered = 0
  let waits = 0
  for (let guard = 0; guard < 2000; guard++) {
    if (r.stage === 'fight') {
      const before = r
      const { run: next, kind } = choose(r)
      if (kind === 'card') plays++
      if (kind === 'brew') brewed++
      if (kind === 'wait') waits++
      const got = (x: Run) => x.fight.principles.salt + x.fight.principles.sulfur + x.fight.principles.mercury
      if (next.fightIndex === before.fightIndex && next.stage === 'fight') gathered += Math.max(0, got(next) - got(before) + (kind === 'brew' ? 0 : 0))
      if (next.stage !== 'fight' || next.fightIndex !== before.fightIndex) {
        const f = next.fightIndex === before.fightIndex ? next.fight : before.fight
        stats[before.fightIndex].push({ won: next.stage !== 'lost', paid: f.paid, moons: f.dial / 8, plays, brewed, principles: gathered, waits })
        plays = 0
        brewed = 0
        gathered = 0
        waits = 0
      }
      r = next
    } else if (r.stage === 'reward') r = reward(r)
    else break
  }
  if (r.stage === 'won') {
    runsWon++
    endQuint.push(r.quintessence)
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const med = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN)
console.log(`${runs} runs · draw ${settings.draw} ${settings.hand} at new and full moons · stock ${settings.stock}`)
COMMISSIONS.forEach((c, i) => {
  const s = stats[i]
  if (!s.length) return console.log(`${c.name}: never reached`)
  console.log(
    `${c.name} (needs ${c.require}): reached ${s.length}, won ${Math.round((100 * s.filter((x) => x.won).length) / s.length)}% · paid median ${med(s.map((x) => x.paid))} · moons ${mean(s.map((x) => x.moons)).toFixed(1)} · cards ${mean(s.map((x) => x.plays)).toFixed(1)} · principles ${mean(s.map((x) => x.principles)).toFixed(1)} · brews ${mean(s.map((x) => x.brewed)).toFixed(1)} · waits ${mean(s.map((x) => x.waits)).toFixed(1)}`,
  )
})
console.log(`runs won ${Math.round((100 * runsWon) / runs)}% · quintessence left median ${med(endQuint)}`)
