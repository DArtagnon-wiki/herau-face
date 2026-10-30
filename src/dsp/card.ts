// A DSP card drawn on the circuit schema: a stage with its time stage up to
// the right. A drain's element triangles are inside the stage, each with a
// lead to the rim (what it draws in), with the cell below that charges with
// what it takes. An attack's kernel hangs below the stage as a row of taps,
// its anchor tap underlined. A power holds its element inside, draws on that
// element's charge (the cell below), and gives out what it adds (at the right).

import { moon, numeral, element, ELEMENT_COLOR } from '../circuits/sigils'
import { DRAIN, tapWords, type Card, type Tap } from './engine'
import type { Elemental } from '../sim/types'

const LIT = 'var(--lit)'
const DIM = 'var(--dim)'
const LINE = 'var(--line)'
const r2 = (n: number) => Math.round(n * 100) / 100
const rad = (deg: number) => (deg * Math.PI) / 180
const polar = (cx: number, cy: number, r: number, deg: number) => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r] as const
const line = (x0: number, y0: number, x1: number, y1: number, stroke = LINE, width = 1.3) =>
  `<path d="M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y1)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
const ring = (cx: number, cy: number, r: number, stroke = LINE, width = 1.5) => `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="var(--stage)" stroke="${stroke}" stroke-width="${width}"/>`
function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, stroke: string, width = 1.3): string {
  const [x0, y0] = polar(cx, cy, r, fromDeg)
  const [x1, y1] = polar(cx, cy, r, toDeg)
  return `<path d="M${r2(x0)} ${r2(y0)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x1)} ${r2(y1)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
}
const rimLeft = (cx: number, cy: number, r: number, y: number) => cx - Math.sqrt(Math.max(0, r * r - (y - cy) ** 2))
const rimTop = (cx: number, cy: number, r: number, x: number) => cy - Math.sqrt(Math.max(0, r * r - (x - cx) ** 2))

/**
 * A battery cell, the electrical sign: a long plate and a short thick one, with
 * a lead in from above. Charge, stored.
 */
export function battery(x: number, y: number, s: number, p: { stroke?: string; width?: number; fill?: string } = {}): string {
  const st = p.stroke ?? 'currentColor'
  const w = p.width ?? 1.5
  return `<path d="M${r2(x)} ${r2(y - s)}V${r2(y - s * 0.32)}M${r2(x - s)} ${r2(y - s * 0.32)}H${r2(x + s)}" stroke="${st}" stroke-width="${w}" stroke-linecap="round" fill="none"/><path d="M${r2(x - s * 0.55)} ${r2(y + s * 0.18)}H${r2(x + s * 0.55)}" stroke="${st}" stroke-width="${w * 2.1}" stroke-linecap="round"/><path d="M${r2(x)} ${r2(y + s * 0.18)}V${r2(y + s)}" stroke="${st}" stroke-width="${w}" stroke-linecap="round"/><path d="M${r2(x + s * 0.72)} ${r2(y - s * 0.78)}h${r2(s * 0.5)}M${r2(x + s * 0.97)} ${r2(y - s * 1.03)}v${r2(s * 0.5)}" stroke="${st}" stroke-width="${w * 0.8}" stroke-linecap="round"/>`
}

/** A battery on its side, for chips and buttons. */
export function batteryIcon(x: number, y: number, s: number, stroke: string, level = 1): string {
  const w = s * 1.7
  const h = s
  const fillW = Math.max(0, Math.min(1, level)) * (w - 3)
  return `<rect x="${r2(x - w / 2)}" y="${r2(y - h / 2)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(h * 0.18)}" fill="none" stroke="${stroke}" stroke-width="1.5"/><rect x="${r2(x + w / 2)}" y="${r2(y - h * 0.22)}" width="${r2(s * 0.18)}" height="${r2(h * 0.44)}" fill="${stroke}"/>${fillW ? `<rect x="${r2(x - w / 2 + 1.5)}" y="${r2(y - h / 2 + 1.5)}" width="${r2(fillW)}" height="${r2(h - 3)}" rx="1" fill="${stroke}" opacity="0.55"/>` : ''}`
}

const down = (e: Elemental) => e === 'water' || e === 'earth'

export interface CardArtOptions {
  /** What a drain would take from the pool now, to light its sigils; omit to draw it plain. */
  took?: Partial<Record<Elemental, number>> | null
  /** For a power drawn live: whether its element has charge to draw on. */
  charged?: boolean
  size?: number
}

/** A kernel's taps as a row of cells, the anchor tap underlined: adds in gold, takes in warning, cuts in glass. */
export function kernelStrip(kernel: Tap[], anchor: number, cx: number, cy: number, cell = 12): string {
  const parts: string[] = []
  const w = kernel.length * cell
  kernel.forEach((t, j) => {
    const x = cx - w / 2 + j * cell
    const color = t.op === 'times' ? 'var(--glass)' : t.v > 0 ? 'var(--lit)' : 'var(--warn)'
    parts.push(`<rect x="${r2(x + 0.6)}" y="${r2(cy - cell / 2)}" width="${r2(cell - 1.2)}" height="${r2(cell)}" rx="2" fill="color-mix(in srgb, ${color} 16%, var(--stage))" stroke="${color}" stroke-width="1.1"/>`)
    parts.push(`<text x="${r2(x + cell / 2)}" y="${r2(cy + 0.4)}" font-size="${r2(cell * 0.56)}" text-anchor="middle" dominant-baseline="central" class="sig-num" fill="var(--ink)">${tapWords(t)}</text>`)
    if (j === anchor) parts.push(`<path d="M${r2(x + 2.5)} ${r2(cy + cell / 2 + 2.2)}H${r2(x + cell - 2.5)}" stroke="var(--gilt-bright)" stroke-width="1.6" stroke-linecap="round"/>`)
  })
  return parts.join('')
}

/** A card's circuit as an SVG. */
export function cardSvg(c: Card, opts: CardArtOptions = {}): string {
  const parts: string[] = []
  const live = opts.took !== undefined && opts.took !== null
  const C = { x: 0, y: 0, r: 22 }
  // The time stage, up to the right, and the arc where its link meets it: it must run first.
  const u = [0.613, -0.79] as const
  const T = { x: C.x + u[0] * (C.r + 25), y: C.y + u[1] * (C.r + 25), r: 11 }
  const linkDeg = (Math.atan2(-u[1], -u[0]) * 180) / Math.PI
  const reqR = T.r + 4.5
  parts.push(line(C.x + u[0] * C.r, C.y + u[1] * C.r, T.x - u[0] * reqR, T.y - u[1] * reqR))
  parts.push(arc(T.x, T.y, reqR, linkDeg - 30, linkDeg + 30, LIT, 1.4))
  parts.push(ring(T.x, T.y, T.r))
  const ms = 5
  parts.push(line(T.x + ms * 0.2, T.y + 1.5 - ms, T.x + ms * 0.2, rimTop(T.x, T.y, T.r, T.x + ms * 0.2), 'var(--moon)', 1.1))
  parts.push(moon(T.x, T.y + 1.5, ms, { stroke: 'var(--moon)' }))

  if (c.kind === 'drain') {
    // Below: the cell, charging with what it drains.
    const charging = !live || c.elements.some((e) => (opts.took![e] ?? 0) > 0)
    const color = live ? (charging ? LIT : DIM) : LIT
    parts.push(line(0, C.r, 0, C.r + 6, color))
    parts.push(battery(0, C.r + 13, 7, { stroke: color, width: 1.5 }))
    parts.push(ring(C.x, C.y, C.r, LINE, 1.7))
    // Inside: what it draws in, each with a lead to the rim.
    const ys = c.elements.length === 1 ? [0] : [-8, 8]
    const tx = -C.r * 0.3
    c.elements.forEach((e, i) => {
      const ty = ys[i]
      const ecolor = ELEMENT_COLOR[e]
      const took = live ? (opts.took![e] ?? 0) : 0
      const fill = live && took ? `color-mix(in srgb, ${ecolor} ${Math.round(25 + 60 * Math.min(1, took / DRAIN))}%, transparent)` : 'var(--stage)'
      const stroke = live && !took ? DIM : ecolor
      const sz = 7.2
      parts.push(line(rimLeft(C.x, C.y, C.r, ty), ty, tx - sz * 0.5, ty, stroke, 1.3))
      parts.push(element(e, tx, ty, sz, { stroke, fill, width: 1.5 }))
      parts.push(numeral(DRAIN, tx, ty + (down(e) ? -1.1 : 1.4), 7, live && !took ? 'var(--ink-faint)' : 'var(--ink)'))
    })
  } else if (c.kind === 'attack') {
    // The kernel itself, below the stage, on a lead from its rim: what it puts out onto the lines.
    parts.push(ring(C.x, C.y, C.r, LINE, 1.7))
    parts.push(line(0, C.r, 0, C.r + 5, LIT))
    parts.push(kernelStrip(c.kernel, c.anchor, 0, C.r + 13, 12.5))
    // Inside: a wave, the spectrum it works on.
    parts.push(`<path d="M-13 2C-9 -9 -5 -9 -1 2S7 13 11 2" fill="none" stroke="var(--lit)" stroke-width="1.6" stroke-linecap="round"/>`)
  } else {
    // A power: its element inside, drawing on that element's charge (the cell at the left, a lead in);
    // what it gives out at the right: +1 on every tap.
    const color = opts.charged === false ? DIM : LIT
    parts.push(line(0, C.r, 0, C.r + 6, color))
    parts.push(battery(0, C.r + 13, 7, { stroke: color, width: 1.5 }))
    parts.push(ring(C.x, C.y, C.r, LINE, 1.7))
    parts.push(element(c.element, 0, -1, 10, { stroke: ELEMENT_COLOR[c.element], fill: `color-mix(in srgb, ${ELEMENT_COLOR[c.element]} 22%, transparent)`, width: 1.7 }))
    const [ox, oy] = polar(C.x, C.y, C.r + 13, 18)
    parts.push(line(...polar(C.x, C.y, C.r, 18), ...polar(C.x, C.y, C.r + 6, 18), color))
    parts.push(`<rect x="${r2(ox - 7)}" y="${r2(oy - 6.5)}" width="14" height="13" rx="2.5" fill="var(--stage)" stroke="${color}" stroke-width="1.2"/>`)
    parts.push(numeral('+1', ox, oy + 0.4, 7.5, opts.charged === false ? 'var(--ink-faint)' : 'var(--ink)'))
  }

  // One frame for every card, so all kinds sit alike in a hand.
  const [x0, y0, w, hh] = [-27, -55, 75, 99]
  const size = opts.size ?? 96
  return `<svg class="circuit" viewBox="${x0} ${y0} ${w} ${hh}" width="${size}" height="${r2((size * hh) / w)}" aria-hidden="true">${parts.join('')}</svg>`
}
