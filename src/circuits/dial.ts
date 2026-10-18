// The moon dial: the one picture of the fight's state. The outer ring is the
// moon (sixteen ticks, its eight phases drawn as they look, the new moon at the
// top and the full moon at the bottom), with what each phase brings
// marked outside it: a red star where the commission flares, an arrow where
// it grows, a card where you draw. The next flare carries a badge with what
// would flare now. The inner ring fills with purification against the
// requirement. In the middle, the pool: one element triangle each, with how
// much instability waits in it. A picked card or recipe shows as a ghost:
// where the needle would land, how far purification would reach, what the
// pool would lose.

import { DEFAULT_VESSEL, ELEMENTS, PHASES, PHASE_CYCLE, TICKS, flareOf, phaseAt, poolTotal, type Fight, type Phase, type Pool, type Settings } from './engine'
import { ELEMENT_COLOR, card as cardSig, element, moon, numeral, quintessence } from './sigils'

const rad = (deg: number) => (deg * Math.PI) / 180
/** Position 0 is the first quarter, on the right; the new moon (position 12) is at the top. */
const angleOf = (pos: number) => -90 + (((pos + 4) % TICKS) * 360) / TICKS
const at = (pos: number, r: number) => [Math.cos(rad(angleOf(pos))) * r, Math.sin(rad(angleOf(pos))) * r] as const
const r2 = (n: number) => Math.round(n * 100) / 100

/** The moon as it looks at a phase: lit on the right while waxing, on the left while waning. */
function moonAt(phase: Phase, x: number, y: number, r: number): string {
  const lit = 'var(--moon)'
  const disc = `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="var(--stage)" stroke="var(--line)" stroke-width="1.2"/>`
  const f = PHASE_CYCLE[phase]
  if (f === 0) return disc
  if (f === 0.5) return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${lit}" stroke="var(--line)" stroke-width="1.2"/>`
  const waxing = f < 0.5
  const crescent = f < 0.25 || f > 0.75
  const rx = Math.abs(Math.cos(f * 2 * Math.PI)) * r
  // The lit limb is a half circle; the terminator an half ellipse, bulging toward the limb for a crescent.
  const limb = waxing ? 1 : 0
  const term = waxing === crescent ? 0 : 1
  return `${disc}<path d="M${r2(x)} ${r2(y - r)}A${r} ${r} 0 0 ${limb} ${r2(x)} ${r2(y + r)}A${r2(rx)} ${r} 0 0 ${term} ${r2(x)} ${r2(y - r)}Z" fill="${lit}"/>`
}

function progressArc(r: number, from: number, to: number, stroke: string, width: number): string {
  if (to <= from) return ''
  const a0 = -Math.PI / 2 + from * Math.PI * 2
  const a1 = -Math.PI / 2 + Math.min(to, 0.9999) * Math.PI * 2
  const large = to - from > 0.5 ? 1 : 0
  return `<path d="M${r2(Math.cos(a0) * r)} ${r2(Math.sin(a0) * r)}A${r} ${r} 0 ${large} 1 ${r2(Math.cos(a1) * r)} ${r2(Math.sin(a1) * r)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
}

export interface DialPreview {
  dial: number
  purified: number
  /** What the picked card would take from the pool, by element. */
  drain: Pool
  /** Flares the action would bring on, and what they would cost. */
  flares: number[]
}

export function dialSvg(f: Fight, feed: Pool, drawAt: Phase[], rule: Settings['flare'], preview?: DialPreview | null, flareFx = false): string {
  const parts: string[] = []
  const R = 136
  const c = f.commission
  const flaring = flareOf(f.pool, c, rule)
  parts.push(`<circle r="${R}" fill="var(--well)" stroke="var(--line)" stroke-opacity="0.55" stroke-width="1.3"/>`)
  for (let i = 0; i < TICKS * 2; i++) {
    const a = rad(-90 + (i * 360) / (TICKS * 2))
    const major = i % 4 === 0
    const r1 = major ? R - 11 : R - 5
    parts.push(`<line x1="${r2(Math.cos(a) * r1)}" y1="${r2(Math.sin(a) * r1)}" x2="${r2(Math.cos(a) * R)}" y2="${r2(Math.sin(a) * R)}" stroke="var(--line)" stroke-opacity="${major ? 0.7 : 0.3}" stroke-width="${major ? 1.3 : 0.8}"/>`)
  }
  // What each phase brings, outside the ring; the next flare carries what would flare now.
  const nextAttack = (() => {
    for (let pos = f.dial + 1; pos <= f.dial + TICKS; pos++) {
      const ph = phaseAt(pos)
      if (ph && c.attacks.includes(ph)) return pos % TICKS
    }
    return -1
  })()
  PHASES.forEach((phase, i) => {
    const pos = i * 2
    const [x, y] = at(pos, R)
    const quarter = PHASE_CYCLE[phase] * 4 === Math.round(PHASE_CYCLE[phase] * 4)
    parts.push(moonAt(phase, x, y, quarter ? 12 : 9))
    const marks: string[] = []
    if (c.attacks.includes(phase)) marks.push('attack')
    if (c.buffs?.includes(phase)) marks.push('buff')
    if (drawAt.includes(phase)) marks.push('draw')
    marks.forEach((m, j) => {
      const [mx, my] = at(pos, R + 23 + j * 15)
      if (m === 'attack') parts.push(quintessence(mx, my, 8, { stroke: 'var(--fire)', fill: 'var(--fire)', width: 1 }))
      if (m === 'buff') parts.push(`<path d="M${r2(mx)} ${r2(my - 6)}L${r2(mx + 5.5)} ${r2(my + 4)}H${r2(mx - 5.5)}Z" fill="none" stroke="var(--warn)" stroke-width="1.6"/>`)
      if (m === 'draw') parts.push(cardSig(mx, my, 6, { stroke: 'var(--ink-soft)', width: 1.3 }))
    })
    if (pos === nextAttack) {
      const threat = Math.max(0, poolTotal(flaring) - f.ward)
      const [bx, by] = at(pos, R + 23)
      // Beside the star, a little way clockwise along the ring.
      const a = rad(angleOf(pos))
      const off = [-Math.sin(a) * 21, Math.cos(a) * 21]
      parts.push(`<g class="threat${flareFx ? ' hit' : ''}"><circle cx="${r2(bx + off[0])}" cy="${r2(by + off[1])}" r="10.5" fill="var(--fire)"/><text x="${r2(bx + off[0])}" y="${r2(by + off[1] + 0.8)}" font-size="12.5" text-anchor="middle" dominant-baseline="central" class="badge-num" fill="var(--night)">${threat}</text></g>`)
    }
  })
  // Purification against the requirement.
  const pr = 114
  const frac = Math.min(1, f.purified / c.require)
  parts.push(`<circle r="${pr}" fill="none" stroke="var(--line)" stroke-opacity="0.16" stroke-width="8"/>`)
  if (preview) parts.push(progressArc(pr, frac, Math.min(1, preview.purified / c.require), 'var(--ghost)', 8))
  parts.push(progressArc(pr, 0, frac, 'var(--lit)', 8))
  // The needle, and where it would land.
  if (preview && preview.dial !== f.dial) {
    const [gx, gy] = at(preview.dial, R)
    parts.push(`<circle cx="${r2(gx)}" cy="${r2(gy)}" r="6.5" fill="none" stroke="var(--lit)" stroke-width="1.6" stroke-dasharray="2.5 2"/>`)
  }
  const [n0x, n0y] = at(f.dial, pr + 7)
  const [n1x, n1y] = at(f.dial, R - 3)
  parts.push(`<line x1="${r2(n0x)}" y1="${r2(n0y)}" x2="${r2(n1x)}" y2="${r2(n1y)}" stroke="var(--lit)" stroke-width="2.6" stroke-linecap="round"/>`)
  const [dx, dy] = at(f.dial, R)
  parts.push(`<circle cx="${r2(dx)}" cy="${r2(dy)}" r="5.5" fill="var(--lit)" stroke="var(--night)" stroke-width="1.6"/>`)
  // The pool: one triangle per element, how much waits in it.
  const spots: Record<string, [number, number]> = { water: [-40, -27], earth: [40, -27], air: [-40, 33], fire: [40, 33] }
  for (const e of ELEMENTS) {
    const [x, y] = spots[e]
    const n = f.pool[e]
    const color = ELEMENT_COLOR[e]
    const fill = n ? `color-mix(in srgb, ${color} ${Math.round(18 + 62 * Math.min(1, n / 10))}%, transparent)` : 'none'
    const down = e === 'water' || e === 'earth'
    // Over the vessel: a red rim, and the count in red; that much would flare.
    const over = rule === 'overflow' && flaring[e] > 0
    if (over) parts.push(element(e, x, y, 29.5, { stroke: 'var(--fire)', width: 1.6, opacity: 0.85 }))
    parts.push(element(e, x, y, 25, { stroke: n ? color : 'var(--dim)', fill, width: 2 }))
    parts.push(numeral(n, x, y + (down ? -4 : 6), 21, over ? 'var(--fire)' : n ? 'var(--ink)' : 'var(--ink-faint)'))
    if (preview?.drain[e]) parts.push(numeral(`−${preview.drain[e]}`, x + (x < 0 ? -33 : 33), y + (down ? -4 : 6), 14, 'var(--lit)'))
    // What the commission feeds it at each phase, at the triangle's point.
    if (feed[e]) parts.push(numeral(`+${feed[e]}`, x, down ? y + 33 : y - 32, 11, 'var(--ink-faint)'))
  }
  // Purified so far, in the middle.
  parts.push(numeral(preview ? preview.purified : f.purified, 0, -4, 22, preview ? 'var(--lit)' : 'var(--ink)'))
  parts.push(numeral(`/${c.require}`, 0, 15, 11, 'var(--ink-faint)'))
  // The vessel: how much of each element is safe from a flare.
  if (rule === 'overflow') parts.push(numeral(`vessel ${c.vessel ?? DEFAULT_VESSEL}`, 0, 72, 10.5, 'var(--ink-faint)'))
  return `<svg class="dial${flareFx ? ' flared' : ''}" viewBox="-182 -182 364 364" role="img" aria-label="Moon dial: ${f.purified} of ${c.require} purified; pool ${ELEMENTS.map((e) => `${f.pool[e]} ${e}`).join(', ')}">${parts.join('')}</svg>`
}

/** A crescent icon for the wait button. */
export const waitIcon = () => `<svg class="sig" viewBox="-12 -12 24 24" width="18" height="18" aria-hidden="true">${moon(0, 0, 8, { stroke: 'var(--moon)' })}</svg>`
