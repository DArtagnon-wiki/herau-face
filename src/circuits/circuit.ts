// A card drawn as an alchemical circuit (runic schema v1, from the designer's
// sketch of Wash):
//
// - Stages are circles. Sigils inside a stage are its inputs; sigils outside
//   are its outputs, and lines to other stages are links.
// - Arcs across an output are its requirements: one arc on a link means the
//   stage before must run; N arcs before a principle mean the stage must
//   collect at least N.
// - Shapes name mechanics: a crescent is time on the moon, a triangle an
//   element, a square purification, the principle and metal signs those
//   materials, a ground symbol instability drained away.
//
// A card is a time stage (its crescents, the moon it costs) linked to a
// collecting stage (its element triangles, each with its capacity). The
// collector outputs a square (purification) below and its principle to the
// right behind its threshold arcs. Gain stages chain below the square,
// distilling stages after the principle, grounds hang down-left.
//
// Given a live result, the drawing lights up: triangles fill with what they
// would take, threshold arcs light one by one, and outputs that would fire
// glow; the rest dims.

import { GROUND_DRAIN, PRINCIPLE_OF, costOf, type Card, type CardResult, type Principle, type Recipe } from './engine'
import { ELEMENT_COLOR, card as cardSig, element, ground, homunculus, moon, numeral, principle, square, ward } from './sigils'

const LIT = 'var(--lit)'
const DIM = 'var(--dim)'
const LINE = 'var(--line)'

class Box {
  x0 = Infinity
  y0 = Infinity
  x1 = -Infinity
  y1 = -Infinity
  add(x: number, y: number, r = 0) {
    this.x0 = Math.min(this.x0, x - r)
    this.y0 = Math.min(this.y0, y - r)
    this.x1 = Math.max(this.x1, x + r)
    this.y1 = Math.max(this.y1, y + r)
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180
const polar = (cx: number, cy: number, r: number, deg: number) => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r] as const
const r2 = (n: number) => Math.round(n * 100) / 100

function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, stroke: string, width = 1.3): string {
  const [x0, y0] = polar(cx, cy, r, fromDeg)
  const [x1, y1] = polar(cx, cy, r, toDeg)
  return `<path d="M${r2(x0)} ${r2(y0)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x1)} ${r2(y1)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
}
const line = (x0: number, y0: number, x1: number, y1: number, stroke = LINE, width = 1.3) =>
  `<path d="M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y1)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
const ring = (cx: number, cy: number, r: number, stroke = LINE, width = 1.5) => `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="var(--stage)" stroke="${stroke}" stroke-width="${width}"/>`

/** The crescents for a cost in eighths: one per quarter, a small one for an odd eighth. */
function crescents(eighths: number, cx: number, cy: number, s: number, color: string): string {
  const quarters = Math.floor(eighths / 2)
  const half = eighths % 2
  const marks: number[] = [...Array(quarters).fill(1), ...(half ? [0.6] : [])]
  const gap = s * 1.5
  const x0 = cx - ((marks.length - 1) * gap) / 2
  return marks.map((k, i) => moon(x0 + i * gap, cy, s * k, { stroke: color })).join('')
}

/** The principles a card's channels yield, in order, without repeats; "any" can yield any of them. */
function principlesOf(c: Card): Principle[] {
  const out: Principle[] = []
  for (const ch of c.channels) {
    const ps: Principle[] = ch.element === 'any' ? ['salt', 'sulfur', 'mercury'] : [PRINCIPLE_OF[ch.element]]
    for (const p of ps) if (!out.includes(p)) out.push(p)
  }
  return out
}

export interface CircuitOptions {
  /** What playing it now would do, to light the circuit; omit to draw it plain. */
  live?: CardResult | null
  size?: number
}

/** A card's circuit as an SVG. */
export function circuitSvg(c: Card, opts: CircuitOptions = {}): string {
  const live = opts.live
  const parts: string[] = []
  const box = new Box()
  const on = (yes: boolean) => (live ? (yes ? LIT : DIM) : LIT)

  // The collecting stage, and the time stage that enables it.
  const C = { x: 0, y: 0, r: 24 }
  const T = { x: 31, y: -40, r: 12 }
  const dx = C.x - T.x
  const dy = C.y - T.y
  const dl = Math.hypot(dx, dy)
  const [ux, uy] = [dx / dl, dy / dl]
  const linkDeg = (Math.atan2(uy, ux) * 180) / Math.PI
  parts.push(line(T.x + ux * (T.r + 2), T.y + uy * (T.r + 2), C.x - ux * C.r, C.y - uy * C.r))
  parts.push(arc(T.x, T.y, T.r + 5, linkDeg - 32, linkDeg + 32, on(true), 1.4))
  parts.push(ring(T.x, T.y, T.r))
  parts.push(crescents(costOf(c), T.x, T.y, costOf(c) > 2 ? 4.2 : 6, 'var(--moon)'))
  box.add(T.x, T.y, T.r + 6)

  // Purification below, through any gain stages.
  const purifying = !live || live.purification > 0
  let y = C.y + C.r
  for (let g = 0; g < c.gain; g++) {
    const gy = y + 9 + 11
    parts.push(line(0, y, 0, gy - 11, on(purifying)))
    parts.push(ring(0, gy, 11))
    parts.push(square(0, gy, 4, { stroke: on(purifying) }))
    box.add(0, gy, 11)
    y = gy + 11
  }
  const sy = y + 9 + 7
  parts.push(line(0, y, 0, sy - 7, on(purifying)))
  parts.push(square(0, sy, c.gain ? 8 : 7, { stroke: on(purifying), fill: live && purifying ? 'var(--lit-fill)' : 'var(--stage)', width: 1.6 }))
  if (c.gain) parts.push(numeral(`×${1 + c.gain}`, 0, sy + 0.5, 8, purifying ? 'var(--ink)' : 'var(--ink-faint)'))
  box.add(0, sy, 8)

  // The principle to the right, behind its threshold arcs, then any distilling stages.
  const yields = !live || Object.values(live.principles).some((n) => n > 0)
  const pDeg = -14
  const arcs = Math.min(c.threshold, 6)
  const processed = live?.processed ?? 0
  for (let i = 1; i <= arcs; i++) parts.push(arc(C.x, C.y, C.r + 2.5 + i * 3.6, pDeg - 17, pDeg + 17, live ? (processed >= i ? LIT : DIM) : LINE, 1.3))
  if (c.threshold > 6) {
    const [nx, ny] = polar(C.x, C.y, C.r + 13, pDeg - 22)
    parts.push(numeral(c.threshold, nx, ny, 8))
  }
  const px = C.r + 2.5 + arcs * 3.6 + 7
  const [lx0, ly0] = polar(C.x, C.y, C.r, pDeg)
  const [lx1, ly1] = polar(C.x, C.y, px, pDeg)
  parts.push(line(lx0, ly0, lx1, ly1, on(yields)))
  const ps = principlesOf(c)
  const signAt = (x: number, yy: number, size: number, color: string) =>
    ps.map((p, i) => principle(p, x, yy + (i - (ps.length - 1) / 2) * (size * 1.9), size, { stroke: color })).join('')
  let [ex, ey] = polar(C.x, C.y, px + 8, pDeg)
  for (let d = 0; d < c.distill; d++) {
    parts.push(ring(ex + 4, ey, 11))
    parts.push(signAt(ex + 4, ey, ps.length > 1 ? 3.6 : 6, on(yields)))
    box.add(ex + 4, ey, 11)
    parts.push(line(ex + 15, ey, ex + 22, ey, on(yields)))
    ex += 30
  }
  parts.push(signAt(ex, ey, ps.length > 1 ? 4.2 : 7.5, on(yields)))
  if (c.distill) parts.push(numeral(`×${1 + c.distill}`, ex + 10, ey + 9, 7.5, yields ? 'var(--ink)' : 'var(--ink-faint)'))
  if (c.distill) box.add(ex + 10, ey + 9, 7)
  box.add(ex, ey, ps.length > 1 ? 12 : 9)

  // Grounds hang down-left.
  const grounded = live ? Object.values(live.drained).reduce((a, b) => a + b, 0) - live.processed : 0
  for (let g = 0; g < c.ground; g++) {
    const deg = 138 + g * 22
    const [gx0, gy0] = polar(C.x, C.y, C.r, deg)
    const [gx1, gy1] = polar(C.x, C.y, C.r + 10, deg)
    parts.push(line(gx0, gy0, gx1, gy1, on(grounded > g * GROUND_DRAIN)))
    parts.push(ground(gx1, gy1 + 5, 5, { stroke: on(grounded > g * GROUND_DRAIN) }))
    parts.push(numeral(GROUND_DRAIN, gx1 - 10, gy1 + 4, 7.5))
    box.add(gx1, gy1 + 6, 9)
  }

  // The collecting stage itself, its triangles inside, each with a lead to the rim.
  parts.push(ring(C.x, C.y, C.r, LINE, 1.7))
  const n = c.channels.length
  c.channels.forEach((ch, i) => {
    const ts = n > 1 ? 7.2 : 9
    const tr = n > 1 ? 13.5 : 11
    const deg = 180 + (i - (n - 1) / 2) * (n > 2 ? 58 : 64)
    const [tx, ty] = polar(C.x, C.y, tr, deg)
    const [rx0, ry0] = polar(C.x, C.y, tr + ts * 0.9, deg)
    const [rx1, ry1] = polar(C.x, C.y, C.r, deg)
    const color = ch.element === 'any' ? 'var(--gilt)' : ELEMENT_COLOR[ch.element]
    const took = live?.took[i] ?? 0
    parts.push(line(rx0, ry0, rx1, ry1, live && !took ? DIM : color, 1.3))
    const fill = live && took ? `color-mix(in srgb, ${color} ${Math.round(25 + 60 * Math.min(1, took / ch.capacity))}%, transparent)` : 'var(--stage)'
    parts.push(element(ch.element, tx, ty, ts, { stroke: live && !took ? DIM : color, fill, width: 1.5 }))
    const down = ch.element === 'water' || ch.element === 'earth'
    parts.push(numeral(ch.capacity, tx, ty + (down ? -ts * 0.15 : ts * 0.2), n > 1 ? 7.5 : 9, live && !took ? 'var(--ink-faint)' : 'var(--ink)'))
  })
  box.add(C.x, C.y, C.r)

  const pad = 3
  const w = box.x1 - box.x0 + 2 * pad
  const h = box.y1 - box.y0 + 2 * pad
  const size = opts.size ?? 96
  return `<svg class="circuit" viewBox="${r2(box.x0 - pad)} ${r2(box.y0 - pad)} ${r2(w)} ${r2(h)}" width="${size}" height="${r2((size * h) / w)}" aria-hidden="true">${parts.join('')}</svg>`
}

/** A recipe as a one-stage circuit: its principles and its moon inside, what it makes outside. */
export function recipeSvg(r: Recipe, affordable: boolean, size = 64): string {
  const parts: string[] = []
  const color = affordable ? LIT : DIM
  const inputs: { draw: (x: number, y: number) => string; n?: number }[] = [
    ...(['salt', 'sulfur', 'mercury'] as Principle[]).filter((p) => r.cost[p]).map((p) => ({ draw: (x: number, y: number) => principle(p, x, y, 5.2, { stroke: color }), n: r.cost[p] })),
    { draw: (x: number, y: number) => crescents(r.time, x, y, 4.2, 'var(--moon)') },
  ]
  const R = 18
  const spots: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-6.5, 0], [6.5, 0]],
    3: [[-7, -5.5], [7, -5.5], [0, 7]],
    4: [[-7, -6.5], [7, -6.5], [-7, 7], [7, 7]],
  }
  parts.push(line(R, 0, R + 7, 0, color))
  parts.push(ring(0, 0, R, LINE, 1.5))
  inputs.forEach((inp, i) => {
    const [x, y] = spots[inputs.length][i]
    parts.push(inp.draw(x - (inp.n && inp.n > 1 ? 1.5 : 0), y))
    if (inp.n && inp.n > 1) parts.push(numeral(inp.n, x + 4.5, y + 3.5, 7))
  })
  const ox = R + 16
  const out = r.key === 'tincture' ? ward(ox, 0, 8, { stroke: color }) : r.key === 'spirit' ? `${cardSig(ox - 2.5, -0.5, 7, { stroke: color })}${cardSig(ox + 2.5, 1, 7, { stroke: color, fill: 'var(--stage)' })}` : homunculus(ox, 0, 9.5, { stroke: color })
  parts.push(out)
  return `<svg class="circuit" viewBox="-21 -21 ${ox + 32} 42" width="${size}" height="${Math.round((size * 42) / (ox + 32))}" aria-hidden="true">${parts.join('')}</svg>`
}

/** A rune on offer between fights, drawn as the part it adds. */
export function offerSvg(kind: 'channel' | 'gain' | 'distill' | 'ground', el: Parameters<typeof element>[0] | null, capacity: number | null, size = 44): string {
  const parts: string[] = []
  if (kind === 'channel' && el) {
    const color = el === 'any' ? 'var(--gilt)' : ELEMENT_COLOR[el]
    parts.push(element(el, 0, 1, 11, { stroke: color, width: 1.8 }))
    parts.push(numeral(capacity ?? '', 0, el === 'water' || el === 'earth' ? -1 : 3, 9))
  }
  if (kind === 'gain') {
    parts.push(ring(0, 0, 12, LINE, 1.6))
    parts.push(square(0, 0, 5, { stroke: LIT }))
  }
  if (kind === 'distill') {
    parts.push(ring(0, 0, 12, LINE, 1.6))
    parts.push(principle('mercury', 0, 0.5, 7, { stroke: LIT }))
  }
  if (kind === 'ground') parts.push(ground(0, 2, 9, { stroke: LIT, width: 1.8 }))
  return `<svg class="circuit" viewBox="-16 -16 32 32" width="${size}" height="${size}" aria-hidden="true">${parts.join('')}</svg>`
}

