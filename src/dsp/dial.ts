// The moon dial, as in Circuits: the outer ring is the moon (sixteen ticks,
// its eight phases drawn as they look, the new moon at the top), with what
// each phase brings marked outside it: a star where the commission feeds, a
// red star where it flares, a card where you draw, a struck card where you
// discard. The next flare carries a badge with what would flare now. In the
// middle, the pool, one triangle per element, and Ward under it. The inner
// ring fills as the spectrum closes on the chord: the number in the middle is
// how much of the starting distance is closed. A picked card shows as a ghost:
// where the needle would land, what the pool would lose to a drain, how far the
// ring would reach on the spectrum.

import { DISCARD_PHASES, DRAW_PHASES, PHASE_CYCLE, PHASES } from '../circuits/engine'
import { ELEMENT_COLOR, card as cardSig, element, moon, numeral, quintessence, ward as wardSig } from '../circuits/sigils'
import { ELEMENTS, TICKS, distance, distanceOf, threatOf, upcoming, type Fight, type Phase, type Pool } from './engine'

const rad = (deg: number) => (deg * Math.PI) / 180
const angleOf = (pos: number) => -90 + ((pos % TICKS) * 360) / TICKS
const at = (pos: number, r: number) => [Math.cos(rad(angleOf(pos))) * r, Math.sin(rad(angleOf(pos))) * r] as const
const r2 = (n: number) => Math.round(n * 100) / 100

function moonAt(phase: Phase, x: number, y: number, r: number): string {
  const lit = 'var(--moon)'
  const disc = `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="var(--stage)" stroke="var(--line)" stroke-width="1.2"/>`
  const f = PHASE_CYCLE[phase]
  if (f === 0) return disc
  if (f === 0.5) return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${lit}" stroke="var(--line)" stroke-width="1.2"/>`
  const waxing = f < 0.5
  const crescent = f < 0.25 || f > 0.75
  const rx = Math.abs(Math.cos(f * 2 * Math.PI)) * r
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
  /** The distance after the card is played on the spectrum. */
  distance: number
  /** What a drain would take from the pool, by element (negative). */
  delta: Pool
  /** Ward after the card raises it, if it can. */
  ward: number
}

export function dialSvg(f: Fight, preview?: DialPreview | null, flareFx = false): string {
  const parts: string[] = []
  const R = 136
  const c = f.commission
  const start = distanceOf(c.start, c.chord)
  const closed = start - distance(f)
  parts.push(`<circle r="${R}" fill="var(--well)" stroke="var(--line)" stroke-opacity="0.55" stroke-width="1.3"/>`)
  for (let i = 0; i < TICKS * 2; i++) {
    const a = rad(-90 + (i * 360) / (TICKS * 2))
    const major = i % 4 === 0
    const r1 = major ? R - 11 : R - 5
    parts.push(`<line x1="${r2(Math.cos(a) * r1)}" y1="${r2(Math.sin(a) * r1)}" x2="${r2(Math.cos(a) * R)}" y2="${r2(Math.sin(a) * R)}" stroke="var(--line)" stroke-opacity="${major ? 0.7 : 0.3}" stroke-width="${major ? 1.3 : 0.8}"/>`)
  }
  const next = upcoming(f, 8).find((x) => x.attack)
  const nextAttack = next ? next.pos % TICKS : -1
  PHASES.forEach((phase, i) => {
    const pos = i * 2
    const [x, y] = at(pos, R)
    const quarter = PHASE_CYCLE[phase] * 4 === Math.round(PHASE_CYCLE[phase] * 4)
    parts.push(moonAt(phase, x, y, quarter ? 12 : 9))
    const marks: string[] = []
    if (c.attacks.includes(phase)) marks.push('attack')
    if (c.feedAt.includes(phase)) marks.push('feed')
    if (DRAW_PHASES.includes(phase)) marks.push('draw')
    if (DISCARD_PHASES.includes(phase)) marks.push('discard')
    const ta = rad(angleOf(pos))
    marks.forEach((m, j) => {
      const [cx0, cy0] = at(pos, R + 24)
      const off = (j - (marks.length - 1) / 2) * 16
      const mx = cx0 - Math.sin(ta) * off
      const my = cy0 + Math.cos(ta) * off
      if (m === 'attack') parts.push(quintessence(mx, my, 8, { stroke: 'var(--fire)', fill: 'var(--fire)', width: 1 }))
      if (m === 'draw') parts.push(cardSig(mx, my, 6, { stroke: 'var(--ink-soft)', width: 1.3 }))
      if (m === 'discard') parts.push(`${cardSig(mx, my, 6, { stroke: 'var(--ink-faint)', width: 1.2 })}<path d="M${r2(mx - 5.5)} ${r2(my + 6.5)}L${r2(mx + 5.5)} ${r2(my - 6.5)}" stroke="var(--ink-soft)" stroke-width="1.3" stroke-linecap="round"/>`)
      if (m === 'feed') parts.push(element('any', mx, my, 7, { stroke: 'var(--ink-soft)', width: 1.2 }))
    })
    if (pos === nextAttack) {
      const threat = threatOf(f)
      const [bx, by] = at(pos, R + 23)
      const a = rad(angleOf(pos))
      const off = [-Math.sin(a) * 21, Math.cos(a) * 21]
      parts.push(`<g class="threat${flareFx ? ' hit' : ''}"><circle cx="${r2(bx + off[0])}" cy="${r2(by + off[1])}" r="10.5" fill="var(--fire)"/><text x="${r2(bx + off[0])}" y="${r2(by + off[1] + 0.8)}" font-size="12.5" text-anchor="middle" dominant-baseline="central" class="badge-num" fill="var(--night)">${threat}</text></g>`)
    }
  })
  // The spectrum closing on the chord.
  const pr = 114
  const frac = start ? Math.min(1, closed / start) : 1
  parts.push(`<circle r="${pr}" fill="none" stroke="var(--line)" stroke-opacity="0.16" stroke-width="8"/>`)
  if (preview && start) parts.push(progressArc(pr, frac, Math.min(1, (start - preview.distance) / start), 'var(--ghost)', 8))
  parts.push(progressArc(pr, 0, frac, 'var(--lit)', 8))
  if (preview && preview.dial !== f.dial) {
    const [gx, gy] = at(preview.dial, R)
    parts.push(`<circle cx="${r2(gx)}" cy="${r2(gy)}" r="6.5" fill="none" stroke="var(--lit)" stroke-width="1.6" stroke-dasharray="2.5 2"/>`)
  }
  const [n0x, n0y] = at(f.dial, pr + 7)
  const [n1x, n1y] = at(f.dial, R - 3)
  parts.push(`<line x1="${r2(n0x)}" y1="${r2(n0y)}" x2="${r2(n1x)}" y2="${r2(n1y)}" stroke="var(--lit)" stroke-width="2.6" stroke-linecap="round"/>`)
  const [dx, dy] = at(f.dial, R)
  parts.push(`<circle cx="${r2(dx)}" cy="${r2(dy)}" r="5.5" fill="var(--lit)" stroke="var(--night)" stroke-width="1.6"/>`)
  // The pool: one triangle per element, what waits in it, and what the next feed adds.
  const feed = { water: 0, earth: 0, air: 0, fire: 0, ...c.feed }
  const spots: Record<string, [number, number]> = { water: [-40, -27], earth: [40, -27], air: [-40, 33], fire: [40, 33] }
  for (const e of ELEMENTS) {
    const [x, y] = spots[e]
    const n = f.pool[e]
    const color = ELEMENT_COLOR[e]
    const fill = n ? `color-mix(in srgb, ${color} ${Math.round(18 + 62 * Math.min(1, n / 10))}%, transparent)` : 'none'
    const down = e === 'water' || e === 'earth'
    parts.push(element(e, x, y, 25, { stroke: n ? color : 'var(--dim)', fill, width: 2 }))
    parts.push(numeral(n, x, y + (down ? -4 : 6), 21, n ? 'var(--ink)' : 'var(--ink-faint)'))
    const d = preview?.delta[e] ?? 0
    if (d) parts.push(numeral(d < 0 ? `−${-d}` : `+${d}`, x + (x < 0 ? -33 : 33), y + (down ? -4 : 6), 14, d < 0 ? 'var(--lit)' : 'var(--warn)'))
    if (feed[e]) parts.push(numeral(`+${feed[e]}`, x, down ? y + 33 : y - 32, 11, 'var(--ink-faint)'))
  }
  const shown = preview ? start - preview.distance : closed
  parts.push(numeral(shown, 0, -4, 22, preview && shown !== closed ? 'var(--lit)' : 'var(--ink)'))
  parts.push(numeral(`/${start}`, 0, 15, 11, 'var(--ink-faint)'))
  // Ward, under the pool, when there is any or a play would raise it.
  const wardShown = preview && preview.ward !== f.ward ? preview.ward : f.ward
  if (wardShown) {
    parts.push(wardSig(-9, 78, 10, { stroke: 'var(--glass)', fill: 'color-mix(in srgb, var(--glass) 18%, transparent)', width: 1.6 }))
    parts.push(numeral(wardShown, 11, 79, 16, wardShown !== f.ward ? 'var(--lit)' : 'var(--ink)'))
  }
  return `<svg class="dial${flareFx ? ' flared' : ''}" viewBox="-182 -182 364 364" role="img" aria-label="Moon dial: ${closed} of ${start} closed; Ward ${f.ward}; pool ${ELEMENTS.map((e) => `${f.pool[e]} ${e}`).join(', ')}">${parts.join('')}</svg>`
}

export const waitIcon = () => `<svg class="sig" viewBox="-12 -12 24 24" width="18" height="18" aria-hidden="true">${moon(0, 0, 8, { stroke: 'var(--moon)' })}</svg>`
