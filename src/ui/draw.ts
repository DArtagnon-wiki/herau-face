// SVG drawing for runes, sigils, and the vessel (amalgam + table).
// Everything returns markup strings; colors come from CSS custom properties.

import { ELEMENTALS } from '../sim/alchemy'
import type { Range } from '../sim/commission'
import type { TableEntry } from '../sim/table'
import type { Affinity, Body, Elemental, Grade, Mote, Pool, Rune, Sigil } from '../sim/types'

export const AFFINITY_VAR: Record<Affinity, string> = {
  earth: 'var(--earth)',
  water: 'var(--water)',
  air: 'var(--air)',
  fire: 'var(--fire)',
  none: 'var(--glass)',
}

type Pt = [number, number]
const f = (n: number) => n.toFixed(1)

function rotate([x, y]: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

// Crescent geometry (unit radius): outer circle at the origin, inner circle
// offset toward the horns. Horns point up by default.
const CRESCENT_INNER = { dx: 0.45, r: 0.8 }
const CRESCENT_HORN_X = (CRESCENT_INNER.dx ** 2 + 1 - CRESCENT_INNER.r ** 2) / (2 * CRESCENT_INNER.dx)
const CRESCENT_HORN_Y = Math.sqrt(1 - CRESCENT_HORN_X ** 2)

/** Outline of a body at radius r, centred on (cx, cy), rotated rotDeg. */
export function bodyPath(body: Body, r: number, rotDeg = 0, cx = 0, cy = 0): string {
  const at = (p: Pt) => {
    const [x, y] = rotate(p, rotDeg)
    return `${f(cx + x * r)} ${f(cy + y * r)}`
  }
  if (body === 'circle') {
    return `M ${f(cx - r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} Z`
  }
  if (body === 'triangle') {
    const pts = [-90, 30, 150].map((a) => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)] as Pt)
    return `M ${pts.map(at).join(' L ')} Z`
  }
  // Crescent with horns up: rotate the horns-right construction by -90°.
  const base = rotDeg - 90
  const atC = (p: Pt) => {
    const [x, y] = rotate(p, base)
    return `${f(cx + x * r)} ${f(cy + y * r)}`
  }
  const top: Pt = [CRESCENT_HORN_X, -CRESCENT_HORN_Y]
  const bottom: Pt = [CRESCENT_HORN_X, CRESCENT_HORN_Y]
  const ri = CRESCENT_INNER.r * r
  return `M ${atC(top)} A ${f(r)} ${f(r)} 0 1 0 ${atC(bottom)} A ${f(ri)} ${f(ri)} 0 1 1 ${atC(top)} Z`
}

/** Where each bowl sits on a body, in unit coordinates (horns up for a crescent). */
const BOWLS: Record<Body, { at: Pt[]; r: number }> = {
  circle: { at: [[0, 0]], r: 0.34 },
  crescent: { at: [[-0.42, 0.6], [0.42, 0.6]], r: 0.2 },
  triangle: { at: [[0, -0.42], [0.37, 0.22], [-0.37, 0.22]], r: 0.19 },
}

export const moteColor = (m: Mote) => (m.kind === 'element' ? AFFINITY_VAR[m.elemental!] : 'var(--opal)')

function bowls(rune: Rune, r: number): string {
  const spec = BOWLS[rune.body]
  return spec.at
    .map((p, i) => {
      const [x, y] = [p[0] * r, p[1] * r]
      const br = spec.r * r
      const mote = rune.motes[i]
      const fill = mote
        ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(br * 0.72)}" fill="${moteColor(mote)}"/><circle cx="${f(x - br * 0.22)}" cy="${f(y - br * 0.25)}" r="${f(br * 0.2)}" fill="#fff" fill-opacity="0.55"/>`
        : ''
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(br)}" fill="var(--bowl)" stroke="var(--gilt)" stroke-opacity="0.6" stroke-width="0.8"/>${fill}`
    })
    .join('')
}

/** A rune as it appears on a card: its body, with each bowl showing its mote. */
export function runeSvg(rune: Rune, size = 56): string {
  const c = AFFINITY_VAR[rune.affinity]
  const r = size * 0.42
  return `<svg class="glyph" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <path d="${bodyPath(rune.body, r)}" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
    ${bowls(rune, r)}
  </svg>`
}

/**
 * A composed sigil, centered on the origin: the anchor in the middle with its
 * motes, circumscribed runes ringing it, entwined runes laced through it,
 * inscribed runes inside, and side links hanging at the sides.
 */
export function sigilBody(sigil: Sigil, scale = 1): { markup: string; radius: number } {
  const parts: string[] = []
  const a = sigil.anchor
  const ac = AFFINITY_VAR[a.affinity]
  const s = (n: number) => n * scale
  const sw = (n: number) => Math.max(0.6, n * scale)

  const circs = sigil.joins.filter((j) => j.kind === 'circumscribe')
  const outer = 26 + circs.length * 9
  circs.forEach((j, i) => {
    const c = AFFINITY_VAR[j.rune.affinity]
    parts.push(`<path d="${bodyPath(j.rune.body, s(34 + i * 9), i * 20)}" fill="none" stroke="${c}" stroke-width="${sw(1.6)}" stroke-linejoin="round"/>`)
  })
  sigil.joins
    .filter((j) => j.kind === 'entwine')
    .forEach((j, i) => {
      const c = AFFINITY_VAR[j.rune.affinity]
      parts.push(`<path d="${bodyPath(j.rune.body, s(27), 60 + i * 37)}" fill="none" stroke="${c}" stroke-width="${sw(1.4)}" stroke-dasharray="${s(4)} ${s(2.5)}" stroke-linejoin="round"/>`)
    })
  parts.push(`<path d="${bodyPath(a.body, s(22))}" fill="${ac}" fill-opacity="0.22" stroke="${ac}" stroke-width="${sw(1.8)}" stroke-linejoin="round"/>`)
  if (scale >= 0.8) parts.push(bowls(a, s(22)))
  sigil.joins
    .filter((j) => j.kind === 'inscribe')
    .forEach((j, i) => {
      const c = AFFINITY_VAR[j.rune.affinity]
      parts.push(`<path d="${bodyPath(j.rune.body, s(9 - i * 3), i * 30)}" fill="${c}" fill-opacity="0.6" stroke="${c}" stroke-width="${sw(1)}" stroke-linejoin="round"/>`)
    })
  sigil.joins
    .filter((j) => j.kind === 'side')
    .forEach((j, i) => {
      const c = AFFINITY_VAR[j.rune.affinity]
      const side = i % 2 === 0 ? 1 : -1
      const x = side * s(outer + 16)
      const y = s(i < 2 ? 0 : 18)
      parts.push(`<line x1="${f(side * s(outer - 2))}" y1="0" x2="${f(x - side * s(10))}" y2="${f(y)}" stroke="var(--gilt)" stroke-opacity="0.6" stroke-width="${sw(0.9)}"/>`)
      parts.push(`<path d="${bodyPath(j.rune.body, s(10), 0, x, y)}" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="${sw(1.2)}" stroke-linejoin="round"/>`)
    })
  const sides = sigil.joins.some((j) => j.kind === 'side')
  return { markup: parts.join(''), radius: s(outer + (sides ? 28 : 10)) }
}

export function sigilSvg(sigil: Sigil | null, size = 132): string {
  if (!sigil) {
    return `<svg class="rune-svg" viewBox="-66 -66 132 132" width="${size}" height="${size}" aria-hidden="true">
      <circle r="44" fill="none" stroke="var(--gilt)" stroke-opacity="0.35" stroke-dasharray="3 5"/>
      <circle r="22" fill="none" stroke="var(--gilt)" stroke-opacity="0.25"/>
    </svg>`
  }
  const body = sigilBody(sigil)
  const half = Math.max(66, body.radius + 6)
  return `<svg class="rune-svg" viewBox="${-half} ${-half} ${half * 2} ${half * 2}" width="${size}" height="${size}" aria-hidden="true">${body.markup}</svg>`
}

// ---------------------------------------------------------------------------
// The vessel: amalgam circle, target band, and the table around it.

const GRADE_RADIUS: Record<Grade, number> = { 0: 88, 1: 66, 2: 46, 3: 30 }

function wedge(r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 Z`
  const p = (a: number) => `${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M 0 0 L ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)} Z`
}

function arc(r: number, a0: number, a1: number): string {
  const p = (a: number) => `${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`
}

const TOP = -Math.PI / 2
const angleAt = (fraction: number) => TOP + fraction * Math.PI * 2

/** Draw order: earth from the top, clockwise, then water, air, fire; heavier pools first within each. */
export function orderedPools(pools: Pool[]): Pool[] {
  return ELEMENTALS.flatMap((e: Elemental) => pools.filter((p) => p.elemental === e).sort((a, b) => b.grade - a.grade))
}

export interface VesselOptions {
  /** Earth share after the previewed cast, drawn as a dashed tick. */
  previewShare?: number
  selectedKey?: string
  /** Table entry a slump would knock loose, highlighted. */
  threatenedId?: number
  previewSigil?: Sigil | null
  /** The earth band to mark on the rim, when the target constrains earth. */
  band?: Range
}

export function vesselSvg(pools: Pool[], table: TableEntry[], earth: number, opts: VesselOptions = {}): string {
  const total = pools.reduce((s, p) => s + p.kg, 0)
  const parts: string[] = []

  parts.push(`<circle r="160" fill="none" stroke="var(--gilt)" stroke-opacity="0.35" stroke-width="1"/>`)
  parts.push(`<circle r="155" fill="none" stroke="var(--gilt)" stroke-opacity="0.18" stroke-width="0.6"/>`)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const r0 = i % 4 === 0 ? 150 : 153
    parts.push(`<line x1="${f(Math.cos(a) * r0)}" y1="${f(Math.sin(a) * r0)}" x2="${f(Math.cos(a) * 155)}" y2="${f(Math.sin(a) * 155)}" stroke="var(--gilt)" stroke-opacity="0.35" stroke-width="0.6"/>`)
  }
  for (const g of [0, 1, 2] as Grade[]) {
    parts.push(`<circle r="${GRADE_RADIUS[g]}" fill="none" stroke="var(--ink)" stroke-opacity="0.08" stroke-width="0.8"/>`)
  }

  let at = 0
  for (const p of orderedPools(pools)) {
    const frac = total > 0 ? p.kg / total : 0
    const c = AFFINITY_VAR[p.elemental]
    const selected = `${p.elemental}:${p.grade}` === opts.selectedKey
    parts.push(`<path d="${wedge(GRADE_RADIUS[p.grade], angleAt(at), angleAt(at + frac))}" fill="${c}" fill-opacity="${selected ? 0.5 : 0.3}" stroke="${c}" stroke-width="${selected ? 2.2 : 1.2}" stroke-linejoin="round"/>`)
    at += frac
  }

  if (opts.band) {
    const b0 = angleAt(Math.max(0, opts.band.min))
    const b1 = angleAt(Math.min(1, opts.band.max))
    parts.push(`<path d="${arc(97, b0, b1)}" fill="none" stroke="var(--gilt-bright)" stroke-width="7" stroke-opacity="0.75"/>`)
    parts.push(`<path d="${wedge(96, b0, b1)}" fill="var(--gilt)" fill-opacity="0.07"/>`)
    for (const b of [b0, b1]) {
      parts.push(`<line x1="0" y1="0" x2="${f(Math.cos(b) * 104)}" y2="${f(Math.sin(b) * 104)}" stroke="var(--gilt)" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="2 3"/>`)
    }
  }

  const edge = angleAt(earth)
  parts.push(`<line x1="${f(Math.cos(edge) * 80)}" y1="${f(Math.sin(edge) * 80)}" x2="${f(Math.cos(edge) * 108)}" y2="${f(Math.sin(edge) * 108)}" stroke="var(--earth)" stroke-width="2.5" stroke-linecap="round"/>`)
  if (opts.previewShare !== undefined && Math.abs(opts.previewShare - earth) > 0.001) {
    const pe = angleAt(opts.previewShare)
    parts.push(`<path d="${arc(112, Math.min(edge, pe), Math.max(edge, pe))}" fill="none" stroke="var(--earth)" stroke-opacity="0.55" stroke-width="1.2" stroke-dasharray="3 3"/>`)
    parts.push(`<circle cx="${f(Math.cos(pe) * 112)}" cy="${f(Math.sin(pe) * 112)}" r="4" fill="var(--night)" stroke="var(--earth)" stroke-width="1.5"/>`)
  }

  const slots = 12
  table.slice(-slots).forEach((entry, i) => {
    const a = TOP + ((i + 0.5) / slots) * Math.PI * 2
    const body = sigilBody(entry.sigil, 0.36)
    const threatened = entry.id === opts.threatenedId
    parts.push(`<g transform="translate(${f(Math.cos(a) * 131)} ${f(Math.sin(a) * 131)})">${threatened ? `<circle r="${f(body.radius + 3)}" fill="none" stroke="var(--fire)" stroke-width="1.2" stroke-dasharray="2 2"/>` : ''}${body.markup}</g>`)
  })
  if (opts.previewSigil && table.length < slots) {
    const a = TOP + ((table.length + 0.5) / slots) * Math.PI * 2
    const body = sigilBody(opts.previewSigil, 0.36)
    parts.push(`<g transform="translate(${f(Math.cos(a) * 131)} ${f(Math.sin(a) * 131)})" opacity="0.45">${body.markup}</g>`)
  }

  return `<svg class="vessel-svg" viewBox="-164 -164 328 328" role="img" aria-label="The amalgam and the table">${parts.join('')}</svg>`
}

/** A small outline of a body, for table headers. */
export function bodyIcon(body: Body, size = 16): string {
  const r = size * 0.42
  return `<svg class="body-icon" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><path d="${bodyPath(body, r)}" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linejoin="round"/></svg>`
}
