// Tunes the rogues gallery so the element-symmetric opening cards come out
// worth the same: the four metal makers equal, the six purifiers equal.
//
// A card's worth is a sum over enemies, so a change to one enemy only moves
// that enemy's column. The tuner measures variants of each new enemy (each
// element it feeds one more or one less, its requirement three more or less)
// against a blank twelfth card and each symmetric card as the twelfth; then it
// searches the combination of variants that best evens out both groups,
// keeping each enemy inside its band of difficulty (what it costs with a blank
// twelfth card).
//
//   npx tsx scripts/circuits-gallery-tune.ts --measure [--slice 0/2] [--seeds 200] --out cols.json
//   npx tsx scripts/circuits-gallery-tune.ts --search cols0.json cols1.json [--out tuned.json]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ELEMENTS, GALLERY, type Commission, type Phase, type Pool } from '../src/circuits/engine'
import { blankCard, byName, measureDeck, twelfth, withPrinciple } from './circuits-bench'

const args = process.argv.slice(2)
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const SEEDS = Number(arg('--seeds') ?? 200)

const SYMMETRIC = ['Wash', 'Calcine', 'Fan', 'Kindle', 'Dissolve', 'Circulate', 'Digest', 'Sublime', 'Coagulate', 'Cupel']
const MAKERS = 4

/** What each enemy should cost with a blank twelfth card: easy, middling or hard. */
const BANDS: Record<string, [number, number]> = {
  wisp: [2, 8],
  dust: [5, 13],
  fog: [14, 24],
  squall: [4, 12],
  geyser: [6, 14],
  spring: [4, 12],
  sandstorm: [14, 24],
  kiln: [8, 20],
  magma: [12, 22],
  prism: [14, 26],
}
const FIXED = GALLERY.filter((c) => c.key !== 'mire' && !(c.key in BANDS))
const TUNED = GALLERY.filter((c) => c.key in BANDS)

/** Variants of an enemy: each element it feeds one more or one less, its requirement three more or less. */
function variants(c: Commission): Commission[] {
  const reqs = [-3, 0, 3].map((d) => c.require + d)
  // Prism feeds all four alike: only its requirement moves.
  if (c.key === 'prism') return [-6, -3, 0, 3, 6].map((d) => ({ ...c, require: c.require + d }))
  // Each feeding spot: the base feed, or a phase's own feed.
  const spots: { phase: Phase | null; e: (typeof ELEMENTS)[number] }[] = []
  for (const e of ELEMENTS) if (c.feed[e]) spots.push({ phase: null, e })
  for (const [ph, f] of Object.entries(c.feedsAt ?? {})) for (const e of ELEMENTS) if (f?.[e]) spots.push({ phase: ph as Phase, e })
  const usable = c.feedsAt ? spots.filter((s) => s.phase) : spots
  let combos: number[][] = [[]]
  for (let k = 0; k < usable.length; k++) combos = combos.flatMap((cmb) => [-1, 0, 1].map((d) => [...cmb, d]))
  const out: Commission[] = []
  for (const cmb of combos) {
    const feed: Partial<Pool> = { ...c.feed }
    const feedsAt = c.feedsAt ? Object.fromEntries(Object.entries(c.feedsAt).map(([k, v]) => [k, { ...v }])) : undefined
    let ok = true
    usable.forEach((s, k) => {
      const tgt = s.phase ? feedsAt![s.phase]! : feed
      const v = (tgt[s.e] ?? 0) + cmb[k]
      if (v < 1) ok = false
      tgt[s.e] = v
    })
    if (!ok) continue
    for (const require of reqs) out.push({ ...c, feed, ...(feedsAt ? { feedsAt } : {}), require })
  }
  return out
}

interface Column {
  key: string
  variant: Commission
  /** Cost with a blank twelfth card, and what each symmetric card saves on it. */
  blank: number
  saves: number[]
}

/** One enemy's column for each build: the blank, then each symmetric card as the twelfth. */
function column(c: Commission, base: number): Column {
  const blank = measureDeck(twelfth(() => blankCard), [c], SEEDS, base).costs[0]
  const saves = SYMMETRIC.map((name) => blank - measureDeck(twelfth((p) => withPrinciple(byName(name), p)), [c], SEEDS, base).costs[0])
  return { key: c.key, variant: c, blank, saves }
}

const describe = (c: Commission) =>
  `${c.key}: feed ${JSON.stringify(c.feedsAt ?? c.feed).replace(/"/g, '')}, require ${c.require}`

if (args.includes('--measure')) {
  const [k, n] = (arg('--slice') ?? '0/1').split('/').map(Number)
  // Picks up where an earlier run into the same file left off.
  const cols: Column[] = existsSync(arg('--out')!) ? JSON.parse(readFileSync(arg('--out')!, 'utf8')) : []
  const jobs = [...FIXED.map((c) => [c]), ...TUNED.map(variants)].flat()
  jobs.forEach((c, i) => {
    if (i % n !== k || cols.some((x) => describe(x.variant) === describe(c))) return
    cols.push(column(c, 5000))
    console.log(`${describe(c)}: blank ${cols[cols.length - 1].blank.toFixed(1)}`)
    writeFileSync(arg('--out')!, JSON.stringify(cols))
  })
} else if (args.includes('--search')) {
  const files = args.slice(args.indexOf('--search') + 1).filter((a) => a.endsWith('.json') && a !== arg('--out'))
  const cols: Column[] = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))
  const fixed = cols.filter((c) => FIXED.some((f) => f.key === c.key))
  const options = TUNED.map((t) => cols.filter((c) => c.key === t.key && c.blank >= BANDS[t.key][0] && c.blank <= BANDS[t.key][1]))
  for (const [i, o] of options.entries()) if (!o.length) throw new Error(`No variant of ${TUNED[i].key} inside its band.`)
  // Start from each enemy as it stands, or its nearest variant inside the band.
  const same = (a: Commission, b: Commission) => JSON.stringify(a) === JSON.stringify(b)
  const pick = options.map((o, i) => Math.max(0, o.findIndex((c) => same(c.variant, TUNED[i]))))
  const totals = (p: number[]) => {
    const t = SYMMETRIC.map((_, j) => fixed.reduce((n, c) => n + c.saves[j], 0) + p.reduce((n, k, i) => n + options[i][k].saves[j], 0))
    return t
  }
  const cv2 = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length / (m * m)
  }
  const score = (p: number[]) => {
    const t = totals(p)
    return cv2(t.slice(0, MAKERS)) + cv2(t.slice(MAKERS))
  }
  console.log(`As it stands: ${totals(pick).map((x) => x.toFixed(1)).join(', ')} (score ${score(pick).toFixed(4)})`)
  // Coordinate descent, then again from the best until nothing improves.
  for (let round = 0; round < 20; round++) {
    let improved = false
    for (let i = 0; i < options.length; i++) {
      let best = pick[i]
      let bestScore = score(pick)
      for (let k = 0; k < options[i].length; k++) {
        const trial = pick.slice()
        trial[i] = k
        const s = score(trial)
        if (s < bestScore - 1e-9) {
          best = k
          bestScore = s
        }
      }
      if (best !== pick[i]) {
        pick[i] = best
        improved = true
      }
    }
    if (!improved) break
  }
  const t = totals(pick)
  const unit = t[0]
  console.log(`Tuned: ${t.map((x) => x.toFixed(1)).join(', ')} (score ${score(pick).toFixed(4)})`)
  console.log(`In Washes: makers ${t.slice(0, MAKERS).map((x) => (x / unit).toFixed(2)).join(', ')}; purifiers ${t.slice(MAKERS).map((x) => (x / unit).toFixed(2)).join(', ')}`)
  for (const [i, k] of pick.entries()) {
    const c = options[i][k]
    console.log(`  ${describe(c.variant)} (blank ${c.blank.toFixed(1)})`)
  }
  if (arg('--out')) writeFileSync(arg('--out')!, JSON.stringify(pick.map((k, i) => options[i][k].variant), null, 1))
}
