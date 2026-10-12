// SVG drawing for runes, sigils, and the vessel (amalgam + table).
// Everything returns markup strings; colors come from CSS custom properties.

import { ELEMENTALS } from '../sim/alchemy'
import type { Range } from '../sim/commission'
import type { TableEntry } from '../sim/table'
import { elementMote, LINK_MOTE, makeRune } from '../sim/deck'
import { runepath } from '../sim/equation'
import type { Affinity, Body, Elemental, Grade, JoinKind, Mote, Pool, Rune, Sigil } from '../sim/types'

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

/**
 * The seal's second line inside a crescent: the outer arc drawn smaller and the
 * hollow's arc drawn larger, both about their own centres, so the line runs
 * parallel to the first all the way round and meets itself in shorter horns.
 * Empty when the crescent is too thin to hold it.
 */
function crescentInset(r: number, gap: number, rotDeg: number, cx: number, cy: number): string {
  const d = CRESCENT_INNER.dx * r
  const outer = r - gap
  const hollow = CRESCENT_INNER.r * r + gap
  const x = (d * d + outer * outer - hollow * hollow) / (2 * d)
  const yy = outer * outer - x * x
  if (outer <= 0 || yy <= 0) return ''
  const y = Math.sqrt(yy)
  const at = (p: Pt) => {
    const [px, py] = rotate(p, rotDeg - 90)
    return `${f(cx + px)} ${f(cy + py)}`
  }
  return `M ${at([x, -y])} A ${f(outer)} ${f(outer)} 0 ${x > 0 ? 1 : 0} 0 ${at([x, y])} A ${f(hollow)} ${f(hollow)} 0 ${x > d ? 1 : 0} 1 ${at([x, -y])} Z`
}

/** Where each bowl sits on a body, in unit coordinates (horns up for a crescent), by how many bowls it has. */
function bowlSpots(body: Body, n: number): { at: Pt[]; r: number } {
  if (body === 'circle') {
    if (n <= 1) return { at: [[0, 0]], r: 0.34 }
    const ring = (rad: number) => Array.from({ length: n }, (_, i) => rotate([0, -rad], (360 * i) / n))
    return { at: ring(n === 2 ? 0.38 : 0.42), r: n === 2 ? 0.24 : 0.19 }
  }
  if (body === 'crescent') {
    if (n <= 2) return { at: [[-0.42, 0.6], [0.42, 0.6]], r: 0.2 }
    return { at: [[-0.62, 0.42], [0, 0.68], [0.62, 0.42], [-0.8, 0.05], [0.8, 0.05]].slice(0, n) as Pt[], r: 0.15 }
  }
  if (n <= 3) return { at: [[0, -0.42], [0.37, 0.22], [-0.37, 0.22]], r: 0.19 }
  // Corners first, then the middles of the edges.
  return { at: [[0, -0.58], [0.5, 0.29], [-0.5, 0.29], [0, 0.36], [-0.31, -0.18], [0.31, -0.18]].slice(0, n) as Pt[], r: 0.14 }
}

export const moteColor = (m: Mote) => (m.kind === 'element' ? AFFINITY_VAR[m.elemental!] : 'var(--opal)')

/**
 * A mote drawn in its bowl: an element is a drop of its colour; abilities are
 * marks: a ring for a link, an arrowhead pointing out for reach, a lozenge for
 * guard, a cross for boost.
 */
function moteMark(m: Mote | undefined, x: number, y: number, br: number): string {
  const bowl = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(br)}" fill="var(--bowl)" stroke="var(--gilt)" stroke-opacity="0.45" stroke-width="0.8"/>`
  if (!m) return bowl
  const ink = 'stroke="var(--opal)" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"'
  switch (m.kind) {
    case 'element':
      return `${bowl}<circle cx="${f(x)}" cy="${f(y)}" r="${f(br * 0.62)}" fill="${moteColor(m)}"/>`
    case 'link':
      return `${bowl}<circle cx="${f(x)}" cy="${f(y)}" r="${f(br * 0.42)}" ${ink}/>`
    case 'reach': {
      // An arrowhead pointing away from the rune's centre.
      const len = Math.hypot(x, y)
      const [ux, uy] = len > 0.01 ? [x / len, y / len] : [0, -1]
      const [px, py] = [-uy, ux]
      const pt = (along: number, across: number) => `${f(x + ux * br * along + px * br * across)} ${f(y + uy * br * along + py * br * across)}`
      return `${bowl}<path d="M ${pt(0.55, 0)} L ${pt(-0.35, 0.45)} L ${pt(-0.15, 0)} L ${pt(-0.35, -0.45)} Z" fill="var(--opal)"/>`
    }
    case 'guard': {
      const d = br * 0.48
      return `${bowl}<path d="M ${f(x)} ${f(y - d)} L ${f(x + d * 0.75)} ${f(y)} L ${f(x)} ${f(y + d)} L ${f(x - d * 0.75)} ${f(y)} Z" fill="var(--opal)"/>`
    }
    case 'boost': {
      const d = br * 0.45
      return `${bowl}<path d="M ${f(x - d)} ${f(y)} H ${f(x + d)} M ${f(x)} ${f(y - d)} V ${f(y + d)}" ${ink}/>`
    }
  }
  // Archetype motes: small marks of their own.
  const d = br * 0.48
  const P = (dx: number, dy: number) => `${f(x + dx * d)} ${f(y + dy * d)}`
  const fill = 'fill="var(--opal)"'
  const marks: Record<string, string> = {
    // A coat over the top half.
    glaze: `<path d="M ${P(-1, 0.15)} A ${f(d)} ${f(d)} 0 0 1 ${P(1, 0.15)} Z" ${fill}/>`,
    // A crucible: wide mouth, narrow foot.
    crucible: `<path d="M ${P(-0.95, -0.7)} L ${P(-0.5, 0.8)} L ${P(0.5, 0.8)} L ${P(0.95, -0.7)}" ${ink}/>`,
    // Lute: the seal of a vessel, two bars.
    lute: `<path d="M ${P(-0.9, -0.35)} H ${f(x + 0.9 * d)} M ${P(-0.9, 0.35)} H ${f(x + 0.9 * d)}" ${ink}/>`,
    // Press: a weight bearing down.
    press: `<path d="M ${P(-0.9, -0.55)} H ${f(x + 0.9 * d)} M ${P(0, -0.55)} V ${f(y + 0.35 * d)}" ${ink}/><path d="M ${P(-0.55, 0.35)} H ${f(x + 0.55 * d)} L ${P(0.4, 0.85)} H ${f(x - 0.4 * d)} Z" ${fill}/>`,
    // Cohobation: a loop with an arrow.
    cohobation: `<path d="M ${P(0.8, 0.1)} A ${f(d * 0.8)} ${f(d * 0.8)} 0 1 1 ${P(0.1, -0.8)}" ${ink}/><path d="M ${P(0.1, -1.15)} L ${P(0.55, -0.8)} L ${P(0.1, -0.45)} Z" ${fill}/>`,
    // Distillation: a falling drop.
    distillation: `<path d="M ${P(0, -1)} C ${P(0.25, -0.4)} ${P(0.75, 0.05)} ${P(0.7, 0.4)} A ${f(d * 0.7)} ${f(d * 0.7)} 0 0 1 ${P(-0.7, 0.4)} C ${P(-0.75, 0.05)} ${P(-0.25, -0.4)} ${P(0, -1)} Z" ${fill}/>`,
    // Multiplication: a cross turned on its side.
    multiplication: `<path d="M ${P(-0.75, -0.75)} L ${P(0.75, 0.75)} M ${P(0.75, -0.75)} L ${P(-0.75, 0.75)}" ${ink}/>`,
    // Rectification: up twice.
    rectification: `<path d="M ${P(-0.75, -0.05)} L ${P(0, -0.8)} L ${P(0.75, -0.05)} M ${P(-0.75, 0.75)} L ${P(0, 0)} L ${P(0.75, 0.75)}" ${ink}/>`,
    // Digestion: a ring round a kernel.
    digestion: `<circle cx="${f(x)}" cy="${f(y)}" r="${f(d * 0.85)}" ${ink}/><circle cx="${f(x)}" cy="${f(y)}" r="${f(d * 0.3)}" ${fill}/>`,
    // Resonance: a wave.
    resonance: `<path d="M ${P(-1, 0.1)} C ${P(-0.6, -0.8)} ${P(-0.2, -0.8)} ${P(0, 0)} S ${P(0.6, 0.9)} ${P(1, -0.1)}" ${ink}/>`,
    // Calcination: a flame's triangle.
    calcination: `<path d="M ${P(0, -0.9)} L ${P(0.8, 0.6)} L ${P(-0.8, 0.6)} Z" ${ink}/>`,
  }
  if (m.kind === 'magnesia') {
    // An arrowhead pointing in: it draws toward the rune.
    const len = Math.hypot(x, y)
    const [ux, uy] = len > 0.01 ? [-x / len, -y / len] : [0, 1]
    const [px, py] = [-uy, ux]
    const pt = (along: number, across: number) => `${f(x + ux * br * along + px * br * across)} ${f(y + uy * br * along + py * br * across)}`
    return `${bowl}<path d="M ${pt(0.55, 0)} L ${pt(-0.35, 0.45)} L ${pt(-0.15, 0)} L ${pt(-0.35, -0.45)} Z" fill="none" stroke="var(--opal)" stroke-width="0.9" stroke-linejoin="round"/>`
  }
  return `${bowl}${marks[m.kind] ?? ''}`
}

function bowls(rune: Rune, r: number): string {
  const spec = bowlSpots(rune.body, Math.max(rune.bowls, rune.motes.length))
  return spec.at.map((p, i) => moteMark(rune.motes[i], p[0] * r, p[1] * r, spec.r * r)).join('')
}

/** A rune as it appears on a card: its body in line, with each bowl showing its mote. */
export function runeSvg(rune: Rune, size = 56): string {
  const r = size * 0.42
  const box = `viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}"`
  if (rune.junk) {
    return `<svg class="glyph" ${box} aria-hidden="true">
      <path d="${bodyPath('circle', r)}" fill="none" stroke="var(--slag)" stroke-width="1.6" stroke-dasharray="1.5 3" stroke-linecap="round"/>
      <path d="${bodyPath('circle', r * 0.45)}" fill="var(--slag)" fill-opacity="0.35"/>
    </svg>`
  }
  const c = AFFINITY_VAR[rune.affinity]
  return `<svg class="glyph" ${box} aria-hidden="true">
    <path d="${bodyPath(rune.body, r)}" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
    ${bowls(rune, r)}
  </svg>`
}

// ---------------------------------------------------------------------------
// Sigils, drawn as their equation reads (see "Drawing a sigil" in DESIGN.md):
// the anchor innermost with a dot at its heart; circumscribed runes nest
// outward and inscribed runes inward, in runepath order; the seal, where the
// runepath ends, is drawn with a double line; side links hang outside pointing
// out (reach up) and tangents sit inside pointing in (reach down), each on a
// short stem; entwined runes are laced through, dashed.

/** The anchor's radius at scale 1. */
const UNIT = 22
/** The gap between the seal's two lines, at scale 1. */
const SEAL_GAP = 2.4

interface Layer {
  body: Body
  cx: number
  cy: number
  r: number
  /** 0 or 180: triangles nested in triangles alternate, like a hexagram's halves. */
  rot: number
}

type Prim =
  | { t: 'body'; body: Body; cx: number; cy: number; r: number; rot: number; c: string; w: number; fill?: number; dash?: boolean; seal?: boolean }
  | { t: 'point'; body: Body; cx: number; cy: number; r: number; dir: number; c: string; w: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; c: string; w: number }
  | { t: 'dot'; cx: number; cy: number; r: number; c: string }

const rad = (deg: number) => (deg * Math.PI) / 180
const colorOf = (r: Rune) => (r.junk ? 'var(--slag)' : AFFINITY_VAR[r.affinity])

/**
 * How an outer body holds an inner one: the outer's radius per unit of the
 * inner's, where the inner's centre sits (in outer radii below the outer's
 * centre), and how the inner turns. A crescent cradles what it holds in its
 * hollow; a triangle holds another triangle inverted.
 */
function holds(outer: Body, inner: Body): { k: number; dy: number; flip: boolean } {
  if (outer === 'circle') return { k: 1.3, dy: 0, flip: false }
  if (outer === 'triangle') return { k: 2.15, dy: 0, flip: inner === 'triangle' }
  return { k: 1.95, dy: -0.25, flip: false }
}

/** Distance from a layer's centre to its outline along a direction (degrees). */
function edgeAt(l: Layer, deg: number): number {
  if (l.body !== 'triangle') return l.r
  const a = deg - l.rot - 90
  const d = (((a % 120) + 120 + 60) % 120) - 60
  return (0.5 * l.r) / Math.cos(rad(d))
}

/** Where tangents sit inside an anchor of radius 1, and how big each is. */
function tangentSpots(body: Body, n: number): { x: number; y: number; s: number }[] {
  const ring = (radius: number, start: number, count: number, s: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = rad(start + (360 * i) / count)
      return { x: Math.cos(a) * radius, y: Math.sin(a) * radius, s }
    })
  if (body === 'circle') return ring(n === 1 ? 0.66 : 0.72, -90 + 180 / n, n, n === 1 ? 0.24 : Math.min(0.18, 0.5 / n))
  if (body === 'triangle') {
    const corners = ring(0.56, -90, 3, 0.2)
    const order = n === 1 ? [0] : n === 2 ? [1, 2] : [0, 1, 2]
    return [...order.map((i) => corners[i]), ...ring(0.24, 90, 3, 0.1)].slice(0, n)
  }
  const band = [
    { x: -0.45, y: 0.58, s: 0.13 },
    { x: 0.45, y: 0.58, s: 0.13 },
    { x: -0.74, y: 0.2, s: 0.11 },
    { x: 0.74, y: 0.2, s: 0.11 },
  ]
  return band.slice(0, n).concat(Array.from({ length: Math.max(0, n - band.length) }, () => ({ x: 0, y: 0.7, s: 0.12 })))
}

/** Directions (degrees, 90 is down) to hang side links from the outermost layer: off a triangle's edges, a crescent's back. */
function sideAngles(n: number, outer: Layer): number[] {
  if (outer.body === 'crescent') return n === 1 ? [90] : Array.from({ length: n }, (_, i) => 25 + (130 * i) / (n - 1))
  const sets: Record<number, number[]> =
    outer.body === 'triangle' && outer.rot === 180
      ? { 1: [90], 2: [30, 150], 3: [30, 150, 270] }
      : { 1: [90], 2: [210, 330], 3: [90, 210, 330], 4: [45, 135, 225, 315] }
  return sets[n] ?? Array.from({ length: n }, (_, i) => 90 + (360 * i) / n)
}

/** How far a pointing rune's back sits behind its centre. */
const backOf = (body: Body, r: number) => (body === 'triangle' ? r * 0.5 : r)

/** Lay a sigil out at scale 1, as primitives in sigil coordinates. */
function layout(sigil: Sigil): Prim[] {
  const out: Prim[] = []
  const a = sigil.anchor
  const R = UNIT
  const anchor: Layer = { body: a.body, cx: 0, cy: 0, r: R, rot: 0 }
  const path = runepath(sigil)
  const steps: { rune: Rune; kind: 'circumscribe' | 'inscribe' }[] = path
    ? path.steps.map((st) => ({ rune: st.rune, kind: st.kind }))
    : sigil.joins.filter((j) => j.kind === 'circumscribe' || j.kind === 'inscribe').map((j) => ({ rune: j.rune, kind: j.kind as 'circumscribe' | 'inscribe' }))
  const seal = path ? path.steps[path.steps.length - 1].rune : undefined
  const tangents = sigil.joins.filter((j) => j.kind === 'tangent')

  // Outward: each circumscribe holds everything inside it.
  let outer = anchor
  const rings: { layer: Layer; rune: Rune }[] = []
  for (const st of steps.filter((x) => x.kind === 'circumscribe')) {
    const h = holds(st.rune.body, outer.body)
    const r = outer.r * h.k
    const layer: Layer = { body: st.rune.body, cx: outer.cx, cy: outer.cy - h.dy * r, r, rot: h.flip ? (outer.rot + 180) % 360 : 0 }
    rings.push({ layer, rune: st.rune })
    outer = layer
  }
  // Inward: each inscribe sits inside the last; tangents crowd a circle anchor's middle.
  let inner = anchor
  const cores: { layer: Layer; rune: Rune }[] = []
  for (const st of steps.filter((x) => x.kind === 'inscribe')) {
    const h = holds(inner.body, st.rune.body)
    const crowded = inner === anchor && tangents.length > 0 && inner.body !== 'crescent'
    const k = crowded ? (inner.body === 'circle' ? 1.9 : 3.4) : h.k
    const layer: Layer = { body: st.rune.body, cx: inner.cx, cy: inner.cy + h.dy * inner.r, r: inner.r / k, rot: h.flip ? (inner.rot + 180) % 360 : 0 }
    cores.push({ layer, rune: st.rune })
    inner = layer
  }

  const ring = (l: Layer, rune: Rune, w: number) =>
    out.push({ t: 'body', body: l.body, cx: l.cx, cy: l.cy, r: l.r, rot: l.rot, c: colorOf(rune), w, seal: rune === seal })
  rings.forEach(({ layer, rune }) => ring(layer, rune, 1.7))
  sigil.joins
    .filter((j) => j.kind === 'entwine')
    .forEach((j, i) => out.push({ t: 'body', body: j.rune.body, cx: 0, cy: 0, r: R * 1.18, rot: 60 + i * 37, c: colorOf(j.rune), w: 1.3, dash: true }))
  out.push({ t: 'body', body: a.body, cx: 0, cy: 0, r: R, rot: 0, c: colorOf(a), w: 2, fill: 0.1 })
  cores.forEach(({ layer, rune }) => ring(layer, rune, 1.5))

  // Tangents: inside the anchor, pointing at its heart, each on a stem to the edge it touches.
  tangentSpots(a.body, tangents.length).forEach((spot, i) => {
    const rune = tangents[i].rune
    const [x, y, s] = [spot.x * R, spot.y * R, spot.s * R]
    const dir = (Math.atan2(-y, -x) * 180) / Math.PI
    const away = dir + 180
    const back = backOf(rune.body, s)
    const [ux, uy] = [Math.cos(rad(away)), Math.sin(rad(away))]
    const edge = a.body === 'crescent' ? Math.hypot(x, y) + s * 1.6 : edgeAt(anchor, away)
    out.push({ t: 'line', x1: x + ux * back, y1: y + uy * back, x2: ux * edge, y2: uy * edge, c: colorOf(rune), w: 1 })
    out.push({ t: 'point', body: rune.body, cx: x, cy: y, r: s, dir, c: colorOf(rune), w: 1.3 })
  })

  // The anchor's mark.
  const dot = a.body === 'crescent' ? { x: 0, y: 0.7 * R } : { x: 0, y: 0 }
  out.push({ t: 'dot', cx: dot.x, cy: dot.y, r: Math.max(2, R * 0.11), c: colorOf(a) })

  // Side links: hung outside the outermost layer, pointing out.
  const sides = sigil.joins.filter((j) => j.kind === 'side')
  sideAngles(sides.length, outer).forEach((deg, i) => {
    const rune = sides[i].rune
    const s = R * 0.48
    const stem = R * 0.32
    const [ux, uy] = [Math.cos(rad(deg)), Math.sin(rad(deg))]
    const e = edgeAt(outer, deg)
    const [ex, ey] = [outer.cx + ux * e, outer.cy + uy * e]
    const d = stem + backOf(rune.body, s)
    out.push({ t: 'line', x1: ex, y1: ey, x2: ex + ux * stem, y2: ey + uy * stem, c: colorOf(rune), w: 1.1 })
    out.push({ t: 'point', body: rune.body, cx: ex + ux * d, cy: ey + uy * d, r: s, dir: deg, c: colorOf(rune), w: 1.5 })
  })
  return out
}

/** A circle that points: a drop whose tip faces dir. */
function dropPath(r: number, dir: number, cx: number, cy: number): string {
  const rho = r * 0.78
  const tip = r * 1.3
  const al = Math.acos(rho / tip)
  const t = rad(dir)
  const p = (ang: number, d: number) => `${f(cx + Math.cos(ang) * d)} ${f(cy + Math.sin(ang) * d)}`
  return `M ${p(t, tip)} L ${p(t + al, rho)} A ${f(rho)} ${f(rho)} 0 1 1 ${p(t - al, rho)} Z`
}

function extent(p: Prim): [number, number, number, number] {
  if (p.t === 'line') return [Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2)]
  const r = p.t === 'point' && p.body === 'circle' ? p.r * 1.3 : p.r
  return [p.cx - r, p.cy - r, p.cx + r, p.cy + r]
}

function paint(prims: Prim[], scale: number, ox: number, oy: number): string {
  const X = (x: number) => f((x - ox) * scale)
  const Y = (y: number) => f((y - oy) * scale)
  const w = (n: number) => f(Math.max(0.6, n * Math.min(1, scale * 1.4)))
  const ln = 'stroke-linejoin="round" stroke-linecap="round"'
  return prims
    .map((p) => {
      if (p.t === 'line') return `<line x1="${X(p.x1)}" y1="${Y(p.y1)}" x2="${X(p.x2)}" y2="${Y(p.y2)}" stroke="${p.c}" stroke-opacity="0.75" stroke-width="${w(p.w)}" stroke-linecap="round"/>`
      if (p.t === 'dot') return `<circle cx="${X(p.cx)}" cy="${Y(p.cy)}" r="${f(Math.max(1, p.r * scale))}" fill="${p.c}"/>`
      const cx = Number(X(p.cx))
      const cy = Number(Y(p.cy))
      const r = p.r * scale
      if (p.t === 'point') {
        const d = p.body === 'circle' ? dropPath(r, p.dir, cx, cy) : bodyPath(p.body, r, p.dir + 90, cx, cy)
        return `<path d="${d}" fill="${p.c}" fill-opacity="0.12" stroke="${p.c}" stroke-width="${w(p.w)}" ${ln}/>`
      }
      const main = `<path d="${bodyPath(p.body, r, p.rot, cx, cy)}" fill="${p.fill ? p.c : 'none'}"${p.fill ? ` fill-opacity="${p.fill}"` : ''} stroke="${p.c}" stroke-width="${w(p.w)}"${p.dash ? ` stroke-dasharray="${f(4 * scale + 1)} ${f(2.5 * scale + 1)}"` : ''} ${ln}/>`
      if (!p.seal) return main
      // The seal's second line, just inside the first. A triangle's edges sit half its radius in, so it shrinks twice as far;
      // a crescent's two arcs move apart from their own centres.
      const gap = SEAL_GAP * scale
      const second = p.body === 'crescent' ? crescentInset(r, gap, p.rot, cx, cy) : bodyPath(p.body, Math.max(r * 0.4, r - gap * (p.body === 'triangle' ? 2 : 1)), p.rot, cx, cy)
      return second ? main + `<path d="${second}" fill="none" stroke="${p.c}" stroke-width="${w(p.w * 0.75)}" ${ln}/>` : main
    })
    .join('')
}

/**
 * A composed sigil as SVG markup centred on the origin, and the radius it
 * needs. With fit, the sigil is scaled to fit inside that radius instead.
 */
export function sigilBody(sigil: Sigil, scale = 1, fit?: number): { markup: string; radius: number } {
  const prims = layout(sigil)
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of prims) {
    const [a0, b0, a1, b1] = extent(p)
    ;[x0, y0, x1, y1] = [Math.min(x0, a0), Math.min(y0, b0), Math.max(x1, a1), Math.max(y1, b1)]
  }
  const half = Math.max(x1 - x0, y1 - y0) / 2 + 2
  const k = fit ? Math.min(scale, fit / half) : scale
  return { markup: paint(prims, k, (x0 + x1) / 2, (y0 + y1) / 2), radius: half * k }
}

export function sigilSvg(sigil: Sigil | null, size = 148, minHalf = 48): string {
  if (!sigil) {
    return `<svg class="rune-svg" viewBox="-66 -66 132 132" width="${size}" height="${size}" aria-hidden="true">
      <circle r="44" fill="none" stroke="var(--gilt)" stroke-opacity="0.35" stroke-dasharray="3 5"/>
      <circle r="22" fill="none" stroke="var(--gilt)" stroke-opacity="0.25"/>
      <circle r="2.4" fill="var(--gilt)" fill-opacity="0.5"/>
    </svg>`
  }
  const body = sigilBody(sigil)
  const half = Math.max(minHalf, body.radius + 4)
  // A faint glow, as if the lines were drawn in light.
  const glowId = `sigil-glow-${Math.round(half)}`
  const glow = `<defs><filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(half / 60)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
  return `<svg class="rune-svg" viewBox="${f(-half)} ${f(-half)} ${f(half * 2)} ${f(half * 2)}" width="${size}" height="${size}" aria-hidden="true">${glow}<g filter="url(#${glowId})">${body.markup}</g></svg>`
}

/** A small example of how each join is drawn, around a water circle anchor, for the rules. */
export function joinSketch(kind: JoinKind | 'anchor', size = 52): string {
  const rune = (body: Body, e?: Elemental) => makeRune(-1, { body, motes: e ? [elementMote(e), LINK_MOTE] : [LINK_MOTE] })
  const anchor = makeRune(-2, { body: 'circle', motes: [elementMote('water'), LINK_MOTE] })
  const joined: Record<JoinKind, Rune> = {
    circumscribe: rune('triangle', 'fire'),
    inscribe: rune('triangle', 'air'),
    side: rune('crescent', 'earth'),
    tangent: rune('triangle', 'air'),
    entwine: rune('triangle'),
  }
  return sigilSvg(kind === 'anchor' ? { anchor, joins: [] } : { anchor, joins: [{ kind, rune: joined[kind] }] }, size, 30)
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
    const body = sigilBody(entry.sigil, 0.42, 25)
    const threatened = entry.id === opts.threatenedId
    parts.push(`<g transform="translate(${f(Math.cos(a) * 131)} ${f(Math.sin(a) * 131)})">${threatened ? `<circle r="${f(body.radius + 3)}" fill="none" stroke="var(--fire)" stroke-width="1.2" stroke-dasharray="2 2"/>` : ''}${body.markup}</g>`)
  })
  if (opts.previewSigil && table.length < slots) {
    const a = TOP + ((table.length + 0.5) / slots) * Math.PI * 2
    const body = sigilBody(opts.previewSigil, 0.42, 25)
    parts.push(`<g transform="translate(${f(Math.cos(a) * 131)} ${f(Math.sin(a) * 131)})" opacity="0.45">${body.markup}</g>`)
  }

  return `<svg class="vessel-svg" viewBox="-164 -164 328 328" role="img" aria-label="The amalgam and the table">${parts.join('')}</svg>`
}

// ---------------------------------------------------------------------------
// The level's star: drawn when a commission ends. One point for every sigil
// cast, holding that sigil, and between the points the amalgam's composition
// after it, so the level reads clockwise from twelve o'clock: the start just
// right of the top, the finish just left of it.

/** One cast in the level, in order, and the amalgam after it. */
export interface StarStep {
  sigil: Sigil
  term: number
  /** The amalgam right after this cast. */
  after: Pool[]
  /** The amalgam after the commission acted, when the term ended after this cast. */
  endOfTerm?: Pool[]
}

export interface StarOptions {
  /** The earth band, marked as two dotted rings. */
  band?: Range
  title?: string
  subtitle?: string
}

const PURITY_OPACITY = [0.38, 0.62, 0.86, 1]

/** An annular sector from radius r0 to r1, between two angles (radians). */
function annular(r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${p(r1, a0)} A ${f(r1)} ${f(r1)} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${f(r0)} ${f(r0)} 0 ${large} 0 ${p(r0, a0)} Z`
}

/** The composition as stacked rings from r0 outward: earth innermost, then water, air, fire, each split paler to purer. */
function compositionBands(pools: Pool[], r0: number, r1: number, a0: number, a1: number): string {
  const total = pools.reduce((n, p) => n + p.kg, 0)
  if (total <= 0 || a1 <= a0) return ''
  let r = r0
  const out: string[] = []
  for (const e of ELEMENTALS) {
    for (const p of pools.filter((q) => q.elemental === e && q.kg > 0).sort((a, b) => a.grade - b.grade)) {
      const dr = ((r1 - r0) * p.kg) / total
      out.push(`<path d="${annular(r, r + dr, a0, a1)}" fill="${AFFINITY_VAR[e]}" fill-opacity="${PURITY_OPACITY[p.grade]}"/>`)
      r += dr
    }
  }
  return out.join('')
}

let starCount = 0

export function starSvg(start: Pool[], steps: StarStep[], opts: StarOptions = {}): string {
  const clip = `star-notches-${++starCount}`
  const n = Math.max(1, steps.length)
  const R = 182
  const ri = R * (n <= 2 ? 0.42 : n <= 4 ? 0.5 : n <= 8 ? 0.56 : 0.62)
  const top = -Math.PI / 2
  const step = (Math.PI * 2) / n
  const tip = (k: number) => top + (k + 0.5) * step
  const valley = (k: number) => tip(k) + step / 2
  const at = (r: number, a: number): Pt => [Math.cos(a) * r, Math.sin(a) * r]
  // Each point spans at most 80°; with one or two sigils the gaps between points become arcs.
  const w = Math.min(step / 2, (40 * Math.PI) / 180)
  const star =
    Array.from({ length: n }, (_, k) => {
      const [lx, ly] = at(ri, tip(k) - w)
      const [tx, ty] = at(R, tip(k))
      const [rx, ry] = at(ri, tip(k) + w)
      const gap = step - 2 * w
      const arc = gap > 1e-6 ? ` A ${f(ri)} ${f(ri)} 0 ${gap > Math.PI ? 1 : 0} 1 ${f(at(ri, tip(k) + w + gap)[0])} ${f(at(ri, tip(k) + w + gap)[1])}` : ''
      return `${k ? 'L' : 'M'} ${f(lx)} ${f(ly)} L ${f(tx)} ${f(ty)} L ${f(rx)} ${f(ry)}${arc}`
    }).join(' ') + ' Z'
  const circle = `M ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 Z`

  // The composition, segment by segment around the circle.
  const bands: string[] = []
  const ticks: string[] = []
  bands.push(compositionBands(start, ri, R, top, tip(0)))
  steps.forEach((st, k) => {
    const a0 = tip(k)
    const a1 = k === n - 1 ? top + Math.PI * 2 : tip(k + 1)
    const mid = k === n - 1 ? a0 + (a1 - a0) / 2 : valley(k)
    if (st.endOfTerm) {
      bands.push(compositionBands(st.after, ri, R, a0, mid))
      bands.push(compositionBands(st.endOfTerm, ri, R, mid, a1))
      const [x0, y0] = at(R + 2, mid)
      const [x1, y1] = at(R + 9, mid)
      const [tx, ty] = at(R + 17, mid)
      ticks.push(`<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="var(--gilt)" stroke-width="1.2"/><text x="${f(tx)}" y="${f(ty)}" class="star-term">${st.term}</text>`)
    } else bands.push(compositionBands(st.after, ri, R, a0, a1))
  })

  // The earth band as two dotted rings, where the earth's edge should end up.
  const rings = opts.band
    ? [opts.band.min, opts.band.max]
        .filter((x) => x > 0 && x < 1)
        .map((x) => `<circle r="${f(ri + (R - ri) * x)}" fill="none" stroke="var(--gilt-bright)" stroke-opacity="0.8" stroke-width="1" stroke-dasharray="1.5 3"/>`)
        .join('')
    : ''

  // Each sigil, fitted into its point: the biggest circle on the point's axis
  // that stays inside the star and clear of the title in the middle.
  const hub = ri * 0.55
  const segDist = ([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt) => {
    const [dx, dy] = [bx - ax, by - ay]
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - ax - t * dx, py - ay - t * dy)
  }
  // Work on the point at angle 0; every point is the same shape.
  const T: Pt = [R, 0]
  const V: Pt = at(ri, w)
  const Tn: Pt = w < step / 2 ? at(ri, step - w) : at(R, step)
  let fit = { r: (ri + R) / 2, rho: 0 }
  for (let i = 0; i <= 60; i++) {
    const r = hub + ((R - hub) * i) / 60
    const P: Pt = [r, 0]
    const rho = Math.min(segDist(P, T, V), segDist(P, V, Tn), r - hub - 2)
    if (rho > fit.rho) fit = { r, rho }
  }
  const sigils = steps
    .map((st, k) => {
      const [x, y] = at(fit.r, tip(k))
      const body = sigilBody(st.sigil, 1, fit.rho * 0.94)
      return `<g transform="translate(${f(x)} ${f(y)})">${body.markup}</g>`
    })
    .join('')

  const seam = at(R + 9, top)
  const title = opts.title ? `<text x="0" y="${opts.subtitle ? -4 : 6}" class="star-title">${opts.title}</text>` : ''
  const subtitle = opts.subtitle ? `<text x="0" y="16" class="star-sub">${opts.subtitle}</text>` : ''
  return `<svg class="star-svg" viewBox="-206 -206 412 412" role="img" aria-label="The commission as a star: ${steps.length} sigils clockwise from the top, the amalgam between them">
    <defs><clipPath id="${clip}"><path d="${circle} ${star}" clip-rule="evenodd"/></clipPath></defs>
    <g clip-path="url(#${clip})">${bands.join('')}</g>
    ${rings}
    <circle r="${R}" fill="none" stroke="var(--gilt)" stroke-opacity="0.55" stroke-width="1"/>
    <path d="${star}" fill="var(--night)" fill-opacity="0.82" stroke="var(--gilt)" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="${star}" fill="none" stroke="var(--gilt)" stroke-opacity="0.5" stroke-width="0.8" stroke-linejoin="round" transform="scale(0.965)"/>
    <circle r="${f(hub)}" fill="none" stroke="var(--gilt)" stroke-opacity="0.3" stroke-width="0.8"/>
    ${ticks.join('')}
    <path d="M ${f(seam[0])} ${f(seam[1] - 5)} L ${f(seam[0] + 4)} ${f(seam[1])} L ${f(seam[0])} ${f(seam[1] + 5)} L ${f(seam[0] - 4)} ${f(seam[1])} Z" fill="var(--gilt-bright)"/>
    ${sigils}
    ${title}${subtitle}
  </svg>`
}

/** A small outline of a body, for table headers. */
export function bodyIcon(body: Body, size = 16): string {
  const r = size * 0.42
  return `<svg class="body-icon" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><path d="${bodyPath(body, r)}" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linejoin="round"/></svg>`
}
