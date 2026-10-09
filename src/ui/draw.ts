// SVG drawing for glyphs, runes, and the vessel (amalgam + rune table).
// Everything returns markup strings; colors come from CSS custom properties.

import { ELEMENTALS, GRADE_NAMES } from '../sim/alchemy'
import { CLAY_BAND } from '../sim/commission'
import { makeRng } from '../sim/rng'
import type { TableEntry } from '../sim/table'
import type { Affinity, Elemental, Glyph, Grade, Pool, Rune, ShapeClass } from '../sim/types'

export const AFFINITY_VAR: Record<Affinity, string> = {
  earth: 'var(--earth)',
  water: 'var(--water)',
  air: 'var(--air)',
  fire: 'var(--fire)',
  none: 'var(--glass)',
}

type Pt = [number, number]

// Isosceles templates: symmetric about the vertical axis only.
const ISOSCELES: Record<number, Pt[]> = {
  3: [[0, -1], [0.6, 0.82], [-0.6, 0.82]],
  4: [[0, -1], [0.66, -0.2], [0, 1], [-0.66, -0.2]],
  5: [[0, -1], [0.78, -0.3], [0.78, 0.86], [-0.78, 0.86], [-0.78, -0.3]],
  6: [[0.32, -1], [0.88, -0.18], [0.46, 0.9], [-0.46, 0.9], [-0.88, -0.18], [-0.32, -1]],
}

/** Unit-radius outline for a glyph's shape. Scalene shapes are fixed per glyph id. */
export function outline(sides: number, shape: ShapeClass, id: number): Pt[] {
  if (shape === 'isosceles' && ISOSCELES[sides]) return ISOSCELES[sides]
  if (shape === 'scalene') {
    const rng = makeRng(id * 7919 + sides)
    const step = (Math.PI * 2) / sides
    const start = -Math.PI / 2 + (rng.float() - 0.5) * 0.4
    return Array.from({ length: sides }, (_, i) => {
      const a = start + i * step + (rng.float() - 0.5) * step * 0.55
      const r = 0.68 + rng.float() * 0.32
      return [Math.cos(a) * r, Math.sin(a) * r] as Pt
    })
  }
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / sides
    return [Math.cos(a), Math.sin(a)] as Pt
  })
}

const f = (n: number) => n.toFixed(1)

export function polygon(g: Pick<Glyph, 'sides' | 'shape' | 'id'>, r: number, rotateDeg = 0, cx = 0, cy = 0): string {
  const rot = (rotateDeg * Math.PI) / 180
  return outline(g.sides, g.shape, g.id)
    .map(([x, y]) => {
      const rx = x * Math.cos(rot) - y * Math.sin(rot)
      const ry = x * Math.sin(rot) + y * Math.cos(rot)
      return `${f(cx + rx * r)},${f(cy + ry * r)}`
    })
    .join(' ')
}

/** A single element as it appears on a card. */
export function glyphSvg(g: Glyph, size = 56): string {
  const c = AFFINITY_VAR[g.affinity]
  const r = size * 0.4
  return `<svg class="glyph" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <polygon points="${polygon(g, r)}" fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
    <polygon points="${polygon(g, r * 0.55)}" fill="none" stroke="${c}" stroke-opacity="0.45" stroke-width="0.8" stroke-linejoin="round"/>
  </svg>`
}

/**
 * A composed rune, centered on the origin: the anchor in the middle,
 * inscribed elements inside it, circumscribed rings around it, entwined
 * elements laced through the anchor, and links hanging at the sides.
 */
export function runeBody(rune: Rune, scale = 1): { markup: string; radius: number } {
  const parts: string[] = []
  const a = rune.anchor
  const ac = AFFINITY_VAR[a.affinity]
  const s = (n: number) => n * scale
  const sw = (n: number) => Math.max(0.6, n * scale)

  const circs = rune.joins.filter((j) => j.kind === 'circumscribe')
  const outer = 22 + circs.length * 9
  circs.forEach((j, i) => {
    const c = AFFINITY_VAR[j.glyph.affinity]
    parts.push(`<polygon points="${polygon(j.glyph, s(30 + i * 9), i * 14)}" fill="${c}" fill-opacity="0.05" stroke="${c}" stroke-width="${sw(1.6)}" stroke-linejoin="round"/>`)
  })
  rune.joins
    .filter((j) => j.kind === 'entwine')
    .forEach((j, i) => {
      const c = AFFINITY_VAR[j.glyph.affinity]
      parts.push(`<polygon points="${polygon(j.glyph, s(24), 180 / j.glyph.sides + i * 23)}" fill="none" stroke="${c}" stroke-width="${sw(1.4)}" stroke-dasharray="${s(4)} ${s(2.5)}" stroke-linejoin="round"/>`)
    })
  parts.push(`<polygon points="${polygon(a, s(20))}" fill="${ac}" fill-opacity="0.3" stroke="${ac}" stroke-width="${sw(1.8)}" stroke-linejoin="round"/>`)
  rune.joins
    .filter((j) => j.kind === 'inscribe')
    .forEach((j, i) => {
      const c = AFFINITY_VAR[j.glyph.affinity]
      parts.push(`<polygon points="${polygon(j.glyph, s(11 - i * 4), i * 30)}" fill="${c}" fill-opacity="0.55" stroke="${c}" stroke-width="${sw(1)}" stroke-linejoin="round"/>`)
    })
  rune.joins
    .filter((j) => j.kind === 'link')
    .forEach((j, i) => {
      const c = AFFINITY_VAR[j.glyph.affinity]
      const side = i % 2 === 0 ? 1 : -1
      const row = Math.floor(i / 2)
      const x = side * s(outer + 14)
      const y = s((row - 0.5) * 20 + (i < 2 ? 10 : 0))
      parts.push(`<line x1="${f(side * s(outer - 2))}" y1="0" x2="${f(x)}" y2="${f(y)}" stroke="var(--gilt)" stroke-opacity="0.55" stroke-width="${sw(0.8)}"/>`)
      parts.push(`<polygon points="${polygon(j.glyph, s(9), 0, x, y)}" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="${sw(1.2)}" stroke-linejoin="round"/>`)
    })
  const links = rune.joins.filter((j) => j.kind === 'link').length
  return { markup: parts.join(''), radius: s(outer + (links ? 26 : 8)) }
}

export function runeSvg(rune: Rune | null, size = 132): string {
  if (!rune) {
    return `<svg class="rune-svg" viewBox="-66 -66 132 132" width="${size}" height="${size}" aria-hidden="true">
      <circle r="44" fill="none" stroke="var(--gilt)" stroke-opacity="0.35" stroke-dasharray="3 5"/>
      <circle r="20" fill="none" stroke="var(--gilt)" stroke-opacity="0.25"/>
    </svg>`
  }
  const body = runeBody(rune)
  const half = Math.max(66, body.radius + 6)
  return `<svg class="rune-svg" viewBox="${-half} ${-half} ${half * 2} ${half * 2}" width="${size}" height="${size}" aria-hidden="true">${body.markup}</svg>`
}

// ---------------------------------------------------------------------------
// The vessel: amalgam circle, target band, and the rune table around it.

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
  return ELEMENTALS.flatMap((e: Elemental) =>
    pools.filter((p) => p.elemental === e).sort((a, b) => b.grade - a.grade),
  )
}

export interface VesselOptions {
  /** Earth share after the previewed cast, drawn as a dashed tick. */
  previewShare?: number
  selectedKey?: string
  /** Table entries a slump would knock loose, highlighted. */
  threatenedId?: number
  previewRune?: Rune | null
}

export function vesselSvg(pools: Pool[], table: TableEntry[], earth: number, opts: VesselOptions = {}): string {
  const total = pools.reduce((s, p) => s + p.kg, 0)
  const parts: string[] = []

  // Etched field ring and table slots.
  parts.push(`<circle r="160" fill="none" stroke="var(--gilt)" stroke-opacity="0.35" stroke-width="1"/>`)
  parts.push(`<circle r="155" fill="none" stroke="var(--gilt)" stroke-opacity="0.18" stroke-width="0.6"/>`)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const r0 = i % 4 === 0 ? 150 : 153
    parts.push(`<line x1="${f(Math.cos(a) * r0)}" y1="${f(Math.sin(a) * r0)}" x2="${f(Math.cos(a) * 155)}" y2="${f(Math.sin(a) * 155)}" stroke="var(--gilt)" stroke-opacity="0.35" stroke-width="0.6"/>`)
  }

  // Grade rings (faint guides).
  for (const g of [0, 1, 2] as Grade[]) {
    parts.push(`<circle r="${GRADE_RADIUS[g]}" fill="none" stroke="var(--ink)" stroke-opacity="0.08" stroke-width="0.8"/>`)
  }

  // Pools as wedges: angle is share of mass, radius is grade.
  let at = 0
  for (const p of orderedPools(pools)) {
    const frac = total > 0 ? p.kg / total : 0
    const a0 = angleAt(at)
    const a1 = angleAt(at + frac)
    const c = AFFINITY_VAR[p.elemental]
    const key = `${p.elemental}:${p.grade}`
    const selected = key === opts.selectedKey
    parts.push(`<path d="${wedge(GRADE_RADIUS[p.grade], a0, a1)}" fill="${c}" fill-opacity="${selected ? 0.5 : 0.3}" stroke="${c}" stroke-width="${selected ? 2.2 : 1.2}" stroke-linejoin="round"/>`)
    at += frac
  }

  // Target band: a gilt ghost arc on the rim where earth's edge must land.
  const b0 = angleAt(CLAY_BAND[0])
  const b1 = angleAt(CLAY_BAND[1])
  parts.push(`<path d="${arc(97, b0, b1)}" fill="none" stroke="var(--gilt-bright)" stroke-width="7" stroke-opacity="0.75" stroke-linecap="butt"/>`)
  parts.push(`<path d="${wedge(96, b0, b1)}" fill="var(--gilt)" fill-opacity="0.07"/>`)
  for (const b of [b0, b1]) {
    parts.push(`<line x1="0" y1="0" x2="${f(Math.cos(b) * 104)}" y2="${f(Math.sin(b) * 104)}" stroke="var(--gilt)" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="2 3"/>`)
  }

  // Earth's current edge, and where the previewed cast would leave it.
  const edge = angleAt(earth)
  parts.push(`<line x1="${f(Math.cos(edge) * 80)}" y1="${f(Math.sin(edge) * 80)}" x2="${f(Math.cos(edge) * 108)}" y2="${f(Math.sin(edge) * 108)}" stroke="var(--earth)" stroke-width="2.5" stroke-linecap="round"/>`)
  if (opts.previewShare !== undefined && Math.abs(opts.previewShare - earth) > 0.001) {
    const pe = angleAt(opts.previewShare)
    parts.push(`<path d="${arc(112, Math.min(edge, pe), Math.max(edge, pe))}" fill="none" stroke="var(--earth)" stroke-opacity="0.55" stroke-width="1.2" stroke-dasharray="3 3"/>`)
    parts.push(`<circle cx="${f(Math.cos(pe) * 112)}" cy="${f(Math.sin(pe) * 112)}" r="4" fill="var(--night)" stroke="var(--earth)" stroke-width="1.5"/>`)
  }

  // Rune table: every cast rune sits in a slot around the amalgam.
  const slots = 12
  table.slice(-slots).forEach((entry, i) => {
    const a = TOP + ((i + 0.5) / slots) * Math.PI * 2
    const x = Math.cos(a) * 131
    const y = Math.sin(a) * 131
    const body = runeBody(entry.rune, 0.36)
    const threatened = entry.id === opts.threatenedId
    parts.push(`<g transform="translate(${f(x)} ${f(y)})" class="${threatened ? 'threatened' : ''}">${threatened ? `<circle r="${f(body.radius + 3)}" fill="none" stroke="var(--fire)" stroke-width="1.2" stroke-dasharray="2 2"/>` : ''}${body.markup}</g>`)
  })
  if (opts.previewRune && table.length < slots) {
    const i = table.length
    const a = TOP + ((i + 0.5) / slots) * Math.PI * 2
    const body = runeBody(opts.previewRune, 0.36)
    parts.push(`<g transform="translate(${f(Math.cos(a) * 131)} ${f(Math.sin(a) * 131)})" opacity="0.45">${body.markup}</g>`)
  }

  return `<svg class="vessel-svg" viewBox="-164 -164 328 328" role="img" aria-label="The amalgam and the rune table">${parts.join('')}</svg>`
}

export const gradeName = (g: Grade) => GRADE_NAMES[g]
