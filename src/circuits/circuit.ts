// A card drawn as an alchemical circuit (runic schema v1, from the designer's
// sketch of Wash):
//
// - Stages are circles. Sigils inside a stage are its inputs, each with a lead
//   to the rim; sigils outside are its outputs, and lines to other stages are
//   links.
// - Arcs across a line are its requirements: one arc where a link meets the
//   stage before means that stage must run; N arcs on an output mean the
//   stage must collect at least N for it to fire.
// - Shapes name mechanics: a crescent is time on the moon, a triangle an
//   element, a square purification (a square drawn around it, circumscribed,
//   multiplies it once more), the principle signs those materials, a shield
//   Ward, a ground symbol instability grounded away.
//
// A card is a time stage (its crescents, entering from the top) linked to a
// collecting stage (its element triangles in a column, entering from the
// left, each with its capacity). The collector outputs its square below and
// its side outputs to the right, each behind its own arcs. A ground stage is
// a stage of its own, hanging down to the left: a wild 3 inside (it takes 3 of
// whatever is most plentiful), a ground sign outside; a second hangs from the
// first.
//
// Given a live result, the drawing lights up: triangles fill with what they
// would take, arcs light one by one as the take grows, and outputs that would
// fire glow; the rest dims.

import { GROUND_DRAIN, costOf, type Card, type CardResult, type Output, type Principle, type Recipe } from './engine'
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
/** Where a horizontal line at height y meets a circle's rim on the left. */
const rimLeft = (cx: number, cy: number, r: number, y: number) => cx - Math.sqrt(Math.max(0, r * r - (y - cy) ** 2))
const rimTop = (cx: number, cy: number, r: number, x: number) => cy - Math.sqrt(Math.max(0, r * r - (x - cx) ** 2))

/**
 * The crescents for a cost in ticks inside a stage, each with a lead up to its
 * rim: one crescent per eighth of the moon, a small one for an odd tick.
 */
function timeInputs(ticks: number, mx: number, my: number, stage: { x: number; y: number; r: number }, color: string): string {
  const eighths = Math.floor(ticks / 2)
  const marks: number[] = [...Array(eighths).fill(1), ...(ticks % 2 ? [0.6] : [])]
  const s = marks.length > 1 ? 4.2 : 5.6
  const gap = s * 1.7
  const x0 = mx - ((marks.length - 1) * gap) / 2
  return marks
    .map((k, i) => {
      const x = x0 + i * gap
      const y = my
      const lx = x + s * k * 0.2
      return `${line(lx, y - s * k, lx, rimTop(stage.x, stage.y, stage.r, lx), color, 1.1)}${moon(x, y, s * k, { stroke: color })}`
    })
    .join('')
}

/** The angles of a card's side outputs on the collector, clockwise from upper right. */
const outputAngles = (k: number): number[] => (k <= 1 ? [-6] : k === 2 ? [-15, 20] : [-21, 11, 43])

function outputSigil(o: Output, x: number, y: number, size: number, color: string, lit: boolean): string {
  if (o.kind === 'ward') return ward(x, y, size, { stroke: color, fill: lit ? 'var(--lit-fill)' : 'none', width: 1.6 })
  return principle(o.principle, x, y, size, { stroke: color, width: 1.4 })
}

/** Inside a ground stage: its wild input, the six-pointed star with the 3 it takes, and a lead up to the rim. */
function groundStageInside(G: { x: number; y: number; r: number }, took: number, live: boolean): string {
  const color = 'var(--gilt)'
  const s = 6.2
  const cy = G.y + 1.5
  const fill = live && took ? `color-mix(in srgb, ${color} ${Math.round(25 + 60 * Math.min(1, took / GROUND_DRAIN))}%, transparent)` : 'var(--stage)'
  const stroke = live && !took ? DIM : color
  return `${line(G.x, cy - s, G.x, G.y - G.r, stroke, 1.1)}${element('any', G.x, cy, s, { stroke, fill, width: 1.3 })}${numeral(GROUND_DRAIN, G.x, cy + 0.3, 6.5, live && !took ? 'var(--ink-faint)' : 'var(--ink)')}`
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
  const n = c.channels.length
  const processed = live?.processed ?? 0

  // The collecting stage, and the time stage up to its right that enables it.
  const C = { x: 0, y: 0, r: n > 2 ? 27 : 24 }
  const u = [0.613, -0.79] as const
  const T = { x: C.x + u[0] * (C.r + 26.5), y: C.y + u[1] * (C.r + 26.5), r: 12 }
  const linkDeg = (Math.atan2(-u[1], -u[0]) * 180) / Math.PI
  // The link runs from the collector up to the requirement arc, which hugs the time stage.
  const reqR = T.r + 5
  parts.push(line(C.x + u[0] * C.r, C.y + u[1] * C.r, T.x - u[0] * reqR, T.y - u[1] * reqR))
  parts.push(arc(T.x, T.y, reqR, linkDeg - 30, linkDeg + 30, on(true), 1.4))
  parts.push(ring(T.x, T.y, T.r))
  parts.push(timeInputs(costOf(c), T.x, T.y + 1.5, T, 'var(--moon)'))
  box.add(T.x, T.y, T.r + 2)
  box.add(...polar(T.x, T.y, reqR, linkDeg - 30), 1)
  box.add(...polar(T.x, T.y, reqR, linkDeg + 30), 1)

  // Purification below: the square, with a square drawn around it for each gain.
  const purifying = !live || live.purification > 0
  const h0 = 6
  const hOut = h0 + c.gain * 3.4
  const sy = C.y + C.r + 8 + hOut
  parts.push(line(0, C.y + C.r, 0, sy - hOut, on(purifying)))
  for (let g = c.gain; g >= 0; g--) {
    const h = h0 + g * 3.4
    parts.push(square(0, sy, h, { stroke: on(purifying), fill: g === 0 ? (live && purifying ? 'var(--lit-fill)' : 'var(--stage)') : 'var(--stage)', width: g === 0 ? 1.6 : 1.3 }))
  }
  box.add(0, sy, hOut + 1)

  // The side outputs to the right, each behind its own arcs.
  const angles = outputAngles(c.outputs.length)
  c.outputs.forEach((o, j) => {
    const a = angles[j]
    const fires = !live || (processed > 0 && processed >= o.gate)
    const arcs = Math.min(o.gate, 6)
    const span = c.outputs.length > 1 ? 8.5 : 14
    for (let i = 1; i <= arcs; i++) parts.push(arc(C.x, C.y, C.r + 2.5 + i * 3.4, a - span, a + span, live ? (processed >= i ? LIT : DIM) : LINE, 1.25))
    if (o.gate > 6) parts.push(numeral(o.gate, ...polar(C.x, C.y, C.r + 13, a - span - 7), 7.5))
    const px = C.r + 2.5 + arcs * 3.4 + 5
    const size = o.kind === 'ward' ? 7 : c.outputs.length > 1 ? 6 : 7
    parts.push(line(...polar(C.x, C.y, C.r, a), ...polar(C.x, C.y, px, a), on(fires)))
    const [ox, oy] = polar(C.x, C.y, px + size + 1.5, a)
    parts.push(outputSigil(o, ox, oy, size, on(fires), !!live && fires))
    box.add(ox, oy, size + 2)
  })

  // Ground stages hang down to the left: the first linked to the collector, a second from the first.
  let prev: { x: number; y: number; r: number } = C
  for (let g = 0; g < c.ground; g++) {
    const G = g === 0 ? (() => { const [x, y] = polar(C.x, C.y, C.r + 19, 125); return { x, y, r: 11 } })() : { x: prev.x - 23, y: prev.y + 11, r: 11 }
    const took = live?.grounded[g] ?? 0
    const lit = !live || took > 0
    const dx = G.x - prev.x
    const dy = G.y - prev.y
    const d = Math.hypot(dx, dy)
    parts.push(line(prev.x + (dx / d) * prev.r, prev.y + (dy / d) * prev.r, G.x - (dx / d) * G.r, G.y - (dy / d) * G.r, on(lit)))
    parts.push(ring(G.x, G.y, G.r))
    parts.push(groundStageInside(G, took, !!live))
    parts.push(ground(G.x, G.y + G.r + 5, 4.5, { stroke: on(lit) }))
    box.add(G.x, G.y, G.r + 1)
    box.add(G.x, G.y + G.r + 9, 5)
    prev = G
  }

  // The collecting stage itself, its triangles in a column inside, each with a lead to the rim.
  parts.push(ring(C.x, C.y, C.r, LINE, 1.7))
  const ys = n === 1 ? [0] : n === 2 ? [-8.5, 8.5] : [-14, 0, 14]
  const ts = n === 1 ? 9 : n === 2 ? 7.5 : 6.6
  const tx = -C.r * 0.36
  c.channels.forEach((ch, i) => {
    const ty = C.y + ys[i]
    const color = ch.element === 'any' ? 'var(--gilt)' : ELEMENT_COLOR[ch.element]
    const took = live?.took[i] ?? 0
    const edge = tx - ts * (ch.element === 'any' ? 0.58 : 0.5)
    parts.push(line(rimLeft(C.x, C.y, C.r, ty), ty, edge, ty, live && !took ? DIM : color, 1.3))
    const fill = live && took ? `color-mix(in srgb, ${color} ${Math.round(25 + 60 * Math.min(1, took / ch.capacity))}%, transparent)` : 'var(--stage)'
    parts.push(element(ch.element, tx, ty, ts, { stroke: live && !took ? DIM : color, fill, width: 1.5 }))
    const down = ch.element === 'water' || ch.element === 'earth'
    parts.push(numeral(ch.capacity, tx, ty + (down ? -ts * 0.15 : ts * 0.2), n > 1 ? 7.5 : 9, live && !took ? 'var(--ink-faint)' : 'var(--ink)'))
  })
  box.add(C.x, C.y, C.r + 1)

  const pad = 3
  const w = box.x1 - box.x0 + 2 * pad
  const hh = box.y1 - box.y0 + 2 * pad
  const size = opts.size ?? 96
  return `<svg class="circuit" viewBox="${r2(box.x0 - pad)} ${r2(box.y0 - pad)} ${r2(w)} ${r2(hh)}" width="${size}" height="${r2((size * hh) / w)}" aria-hidden="true">${parts.join('')}</svg>`
}

/** A recipe as a one-stage circuit: its principles entering from the left, its moon from the top, what it makes outside. */
export function recipeSvg(r: Recipe, affordable: boolean, size = 64): string {
  const parts: string[] = []
  const color = affordable ? LIT : DIM
  const R = 20
  const ps = (['salt', 'sulfur', 'mercury'] as Principle[]).filter((p) => r.cost[p])
  const ys = ps.length === 1 ? [0] : ps.length === 2 ? [-6, 6] : [-11, 0, 11]
  const sx = -8
  parts.push(line(R, 0, R + 6, 0, color))
  parts.push(ring(0, 0, R, LINE, 1.5))
  ps.forEach((p, i) => {
    const y = ys[i]
    parts.push(line(rimLeft(0, 0, R, y), y, sx - 3.6, y, color, 1.1))
    parts.push(principle(p, sx, y, 4.6, { stroke: color }))
    if ((r.cost[p] ?? 0) > 1) parts.push(numeral(r.cost[p]!, sx + 6.2, y + 2.5, 7))
  })
  parts.push(timeInputs(r.time, 10, -2, { x: 0, y: 0, r: R }, 'var(--moon)'))
  const ox = R + 15
  const out = r.key === 'tincture' ? ward(ox, 0, 8, { stroke: color }) : r.key === 'spirit' ? `${cardSig(ox - 2.5, -0.5, 7, { stroke: color })}${cardSig(ox + 2.5, 1, 7, { stroke: color, fill: 'var(--stage)' })}` : homunculus(ox, 0, 9.5, { stroke: color })
  parts.push(out)
  return `<svg class="circuit" viewBox="-23 -23 ${ox + 34} 46" width="${size}" height="${Math.round((size * 46) / (ox + 34))}" aria-hidden="true">${parts.join('')}</svg>`
}

/** A rune on offer between fights, drawn as the part it adds. */
export function offerSvg(r: { kind: 'channel'; element: Parameters<typeof element>[0]; capacity: number } | { kind: 'gain' } | { kind: 'distill'; principle: Principle } | { kind: 'ground' }, size = 44): string {
  const parts: string[] = []
  if (r.kind === 'channel') {
    const color = r.element === 'any' ? 'var(--gilt)' : ELEMENT_COLOR[r.element]
    parts.push(line(-15, 1, -9.5, 1, color, 1.4))
    parts.push(element(r.element, 0, 1, 11, { stroke: color, width: 1.8 }))
    parts.push(numeral(r.capacity, 0, r.element === 'water' || r.element === 'earth' ? -1 : 3, 9))
  }
  if (r.kind === 'gain') {
    parts.push(square(0, 0, 11, { stroke: LIT, width: 1.4 }))
    parts.push(square(0, 0, 6.5, { stroke: LIT, width: 1.7 }))
  }
  if (r.kind === 'distill') {
    parts.push(line(-15, 0, 4, 0, LIT, 1.3))
    for (let i = 0; i < 4; i++) parts.push(arc(-24, 0, 12 + i * 3.4, -18, 18, LIT, 1.2))
    parts.push(principle(r.principle, 9, 0, 7, { stroke: LIT, width: 1.5 }))
  }
  if (r.kind === 'ground') {
    parts.push(ring(0, -3, 10, LINE, 1.5))
    parts.push(groundStageInside({ x: 0, y: -3, r: 10 }, 0, false))
    parts.push(ground(0, 12, 4, { stroke: LIT, width: 1.5 }))
  }
  return `<svg class="circuit" viewBox="-16 -16 32 32" width="${size}" height="${size}" aria-hidden="true">${parts.join('')}</svg>`
}
