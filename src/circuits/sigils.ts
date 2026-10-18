// The sigil alphabet of the circuits prototype. Each sigil's shape names a
// mechanic: a crescent is time on the moon, a triangle an element (the
// alchemical element triangles: fire and air point up, water and earth down,
// air and earth barred; the hexagram, all four at once, is "any"), a square
// purification, and the principles and metals keep their alchemical signs.
// Every function returns SVG markup centered on (x, y), sized by s.

import type { Elemental } from '../sim/types'
import type { Principle } from './engine'

export const ELEMENT_COLOR: Record<Elemental, string> = { earth: 'var(--earth)', water: 'var(--water)', air: 'var(--air)', fire: 'var(--fire)' }
const f = (n: number) => Math.round(n * 100) / 100

interface Paint {
  stroke?: string
  fill?: string
  width?: number
  opacity?: number
  cls?: string
}
const paint = ({ stroke = 'currentColor', fill = 'none', width = 1.4, opacity, cls }: Paint) =>
  `stroke="${stroke}" fill="${fill}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${opacity !== undefined ? ` opacity="${opacity}"` : ''}${cls ? ` class="${cls}"` : ''}`

/** A crescent: time on the moon. Horns point right. */
export function moon(x: number, y: number, s: number, p: Paint = {}): string {
  return `<path d="M${f(x + s * 0.2)} ${f(y - s)}A${f(s)} ${f(s)} 0 1 0 ${f(x + s * 0.2)} ${f(y + s)}A${f(s * 0.62)} ${f(s * 0.95)} 0 1 1 ${f(x + s * 0.2)} ${f(y - s)}Z" ${paint({ fill: p.stroke ?? 'currentColor', ...p })}/>`
}

/** An element's triangle; "any" is the hexagram of all four. */
export function element(e: Elemental | 'any', x: number, y: number, s: number, p: Paint = {}): string {
  const up = (dy = 0) => `M${f(x)} ${f(y - s + dy)}L${f(x + 0.866 * s)} ${f(y + 0.5 * s + dy)}L${f(x - 0.866 * s)} ${f(y + 0.5 * s + dy)}Z`
  const down = (dy = 0) => `M${f(x)} ${f(y + s + dy)}L${f(x + 0.866 * s)} ${f(y - 0.5 * s + dy)}L${f(x - 0.866 * s)} ${f(y - 0.5 * s + dy)}Z`
  if (e === 'any') return `<path d="${up()}${down()}" ${paint(p)}/>`
  const tri = e === 'fire' || e === 'air' ? up(0.15 * s) : down(-0.15 * s)
  const barY = e === 'air' ? y + 0.05 * s : y - 0.05 * s
  const bar = e === 'air' || e === 'earth' ? `<path d="M${f(x - 0.62 * s)} ${f(barY)}H${f(x + 0.62 * s)}" ${paint({ ...p, fill: 'none' })}/>` : ''
  return `<path d="${tri}" ${paint(p)}/>${bar}`
}

/** A square: purification. */
export function square(x: number, y: number, s: number, p: Paint = {}): string {
  return `<rect x="${f(x - s)}" y="${f(y - s)}" width="${f(2 * s)}" height="${f(2 * s)}" rx="${f(s * 0.12)}" ${paint(p)}/>`
}

/** The three principles: salt a barred circle, sulfur a triangle on a cross, mercury horned over a cross. */
export function principle(pr: Principle, x: number, y: number, s: number, p: Paint = {}): string {
  const k = s / 9
  const P = paint({ ...p, fill: 'none' })
  switch (pr) {
    case 'salt':
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(6.5 * k)}" ${P}/><path d="M${f(x - 6.5 * k)} ${f(y)}H${f(x + 6.5 * k)}" ${P}/>`
    case 'sulfur':
      return `<path d="M${f(x)} ${f(y - 9 * k)}L${f(x + 6 * k)} ${f(y + 1 * k)}H${f(x - 6 * k)}Z" ${P}/><path d="M${f(x)} ${f(y + 1 * k)}V${f(y + 9 * k)}M${f(x - 3.5 * k)} ${f(y + 5.5 * k)}H${f(x + 3.5 * k)}" ${P}/>`
    case 'mercury':
      return `<path d="M${f(x - 4.5 * k)} ${f(y - 9.5 * k)}A${f(4.5 * k)} ${f(4.5 * k)} 0 0 0 ${f(x + 4.5 * k)} ${f(y - 9.5 * k)}" ${P}/><circle cx="${f(x)}" cy="${f(y - 2.5 * k)}" r="${f(3.6 * k)}" ${P}/><path d="M${f(x)} ${f(y + 1.1 * k)}V${f(y + 9 * k)}M${f(x - 3 * k)} ${f(y + 5.5 * k)}H${f(x + 3 * k)}" ${P}/>`
  }
}

/** Gold's sign, a circle with a point: metal, counted by its worth. */
export function metal(x: number, y: number, s: number, p: Paint = {}): string {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" ${paint({ ...p, fill: 'none' })}/><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.22)}" ${paint({ ...p, fill: p.stroke ?? 'currentColor' })}/>`
}

/** Lead's sign (Saturn): a cross over a hooked tail. */
export function lead(x: number, y: number, s: number, p: Paint = {}): string {
  const k = s / 9
  return `<path d="M${f(x - 2 * k)} ${f(y - 9 * k)}V${f(y + 2 * k)}M${f(x - 6 * k)} ${f(y - 5 * k)}H${f(x + 2 * k)}M${f(x - 2 * k)} ${f(y - 1 * k)}C${f(x + 4 * k)} ${f(y - 4 * k)} ${f(x + 7 * k)} ${f(y + 3 * k)} ${f(x + 2 * k)} ${f(y + 9 * k)}" ${paint({ ...p, fill: 'none' })}/>`
}

/** Silver's sign: the moon, here a crescent opening left so it is not read as time. */
export function silver(x: number, y: number, s: number, p: Paint = {}): string {
  return `<path d="M${f(x - s * 0.2)} ${f(y - s)}A${f(s)} ${f(s)} 0 1 1 ${f(x - s * 0.2)} ${f(y + s)}A${f(s * 0.62)} ${f(s * 0.95)} 0 1 0 ${f(x - s * 0.2)} ${f(y - s)}Z" ${paint({ ...p, fill: 'none' })}/>`
}

/** An electrical ground: instability drained away, purifying nothing. */
export function ground(x: number, y: number, s: number, p: Paint = {}): string {
  return `<path d="M${f(x)} ${f(y - s)}V${f(y)}M${f(x - s)} ${f(y)}H${f(x + s)}M${f(x - s * 0.62)} ${f(y + s * 0.4)}H${f(x + s * 0.62)}M${f(x - s * 0.25)} ${f(y + s * 0.8)}H${f(x + s * 0.25)}" ${paint({ ...p, fill: 'none' })}/>`
}

/** A shield: Ward against the next flare. */
export function ward(x: number, y: number, s: number, p: Paint = {}): string {
  return `<path d="M${f(x)} ${f(y - s)}L${f(x + 0.85 * s)} ${f(y - 0.6 * s)}V${f(y + 0.05 * s)}C${f(x + 0.85 * s)} ${f(y + 0.55 * s)} ${f(x + 0.4 * s)} ${f(y + 0.85 * s)} ${f(x)} ${f(y + s)}C${f(x - 0.4 * s)} ${f(y + 0.85 * s)} ${f(x - 0.85 * s)} ${f(y + 0.55 * s)} ${f(x - 0.85 * s)} ${f(y + 0.05 * s)}V${f(y - 0.6 * s)}Z" ${paint(p)}/>`
}

/** A card: drawing from the deck. */
export function card(x: number, y: number, s: number, p: Paint = {}): string {
  return `<rect x="${f(x - 0.68 * s)}" y="${f(y - s)}" width="${f(1.36 * s)}" height="${f(2 * s)}" rx="${f(0.18 * s)}" ${paint(p)}/>`
}

/** A small figure in a flask: the homunculus. */
export function homunculus(x: number, y: number, s: number, p: Paint = {}): string {
  const P = paint({ ...p, fill: 'none' })
  return `<path d="M${f(x - 0.3 * s)} ${f(y - s)}H${f(x + 0.3 * s)}M${f(x - 0.22 * s)} ${f(y - s)}V${f(y - 0.45 * s)}C${f(x - 0.9 * s)} ${f(y - 0.2 * s)} ${f(x - 0.95 * s)} ${f(y + s)} ${f(x)} ${f(y + s)}C${f(x + 0.95 * s)} ${f(y + s)} ${f(x + 0.9 * s)} ${f(y - 0.2 * s)} ${f(x + 0.22 * s)} ${f(y - 0.45 * s)}V${f(y - s)}" ${P}/><circle cx="${f(x)}" cy="${f(y + 0.12 * s)}" r="${f(0.16 * s)}" ${P}/><path d="M${f(x)} ${f(y + 0.28 * s)}V${f(y + 0.62 * s)}M${f(x - 0.22 * s)} ${f(y + 0.42 * s)}H${f(x + 0.22 * s)}" ${P}/>`
}

/** A five-pointed star: quintessence, the fifth element. */
export function quintessence(x: number, y: number, s: number, p: Paint = {}): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? s * 0.42 : s
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return `${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}`
  })
  return `<path d="M${pts.join('L')}Z" ${paint(p)}/>`
}

/** A card struck through: a card thrown away. */
export function discard(x: number, y: number, s: number, p: Paint = {}): string {
  return `${card(x, y, s, p)}<path d="M${f(x - 0.9 * s)} ${f(y + 1.05 * s)}L${f(x + 0.9 * s)} ${f(y - 1.05 * s)}" ${paint({ ...p, fill: 'none' })}/>`
}

/** A crescent inside a turning arrow: an eighth of the moon given back. */
export function regain(x: number, y: number, s: number, p: Paint = {}): string {
  const r = s
  const a0 = (-60 * Math.PI) / 180
  const a1 = (210 * Math.PI) / 180
  const [x0, y0] = [x + Math.cos(a0) * r, y + Math.sin(a0) * r]
  const [x1, y1] = [x + Math.cos(a1) * r, y + Math.sin(a1) * r]
  const P = paint({ ...p, fill: 'none' })
  // The arrow turns back, against the moon's way round the dial, its head at the end.
  return `<path d="M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 1 0 ${f(x1)} ${f(y1)}" ${P}/><path d="M${f(x1 - 0.42 * s)} ${f(y1 - 0.05 * s)}L${f(x1)} ${f(y1)}L${f(x1 + 0.12 * s)} ${f(y1 - 0.45 * s)}" ${P}/>${moon(x - 0.05 * s, y, s * 0.5, { stroke: p.stroke })}`
}

/**
 * The statuses' signs: settle a chevron sinking onto its sediment, starve the
 * feed's six-pointed star struck through, expose an eye, thorns a barbed stem,
 * stall an hourglass, volatile a bolt, condense two arrows pressing in, mend
 * a cross in a ring, retain a card held by a clip, foresight a card beside the
 * half moon of the quarter.
 */
export function status(key: string, x: number, y: number, s: number, p: Paint = {}): string {
  const P = paint({ ...p, fill: 'none' })
  const d = (path: string) => `<path d="${path}" ${P}/>`
  const X = (k: number) => f(x + k * s)
  const Y = (k: number) => f(y + k * s)
  switch (key) {
    case 'settle':
      return d(`M${X(-0.65)} ${Y(-0.85)}L${X(0)} ${Y(-0.2)}L${X(0.65)} ${Y(-0.85)}M${X(-0.9)} ${Y(0.35)}H${X(0.9)}M${X(-0.6)} ${Y(0.7)}H${X(0.6)}M${X(-0.3)} ${Y(1.02)}H${X(0.3)}`)
    case 'starve':
      return `${element('any', x, y, s * 0.85, { ...p, fill: 'none' })}${d(`M${X(-0.95)} ${Y(0.95)}L${X(0.95)} ${Y(-0.95)}`)}`
    case 'expose':
      return `${d(`M${X(-1)} ${Y(0)}Q${X(0)} ${Y(-0.85)} ${X(1)} ${Y(0)}Q${X(0)} ${Y(0.85)} ${X(-1)} ${Y(0)}Z`)}<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.28 * s)}" ${paint({ ...p, fill: p.stroke ?? 'currentColor' })}/>`
    case 'thorns':
      return d(`M${X(0)} ${Y(-1)}V${Y(1)}M${X(0)} ${Y(-0.45)}L${X(0.55)} ${Y(-0.8)}M${X(0)} ${Y(0.05)}L${X(-0.55)} ${Y(-0.3)}M${X(0)} ${Y(0.55)}L${X(0.55)} ${Y(0.2)}`)
    case 'stall':
      return d(`M${X(-0.62)} ${Y(-1)}H${X(0.62)}L${X(-0.62)} ${Y(1)}H${X(0.62)}Z`)
    case 'volatile':
      return d(`M${X(0.3)} ${Y(-1)}L${X(-0.5)} ${Y(0.12)}H${X(0.08)}L${X(-0.3)} ${Y(1)}L${X(0.55)} ${Y(-0.18)}H${X(-0.04)}Z`)
    case 'condense':
      return `${d(`M${X(-1)} ${Y(-0.62)}L${X(-0.38)} ${Y(0)}L${X(-1)} ${Y(0.62)}M${X(1)} ${Y(-0.62)}L${X(0.38)} ${Y(0)}L${X(1)} ${Y(0.62)}`)}<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.16 * s)}" ${paint({ ...p, fill: p.stroke ?? 'currentColor' })}/>`
    case 'mend':
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" ${P}/>${d(`M${X(0)} ${Y(-0.55)}V${Y(0.55)}M${X(-0.55)} ${Y(0)}H${X(0.55)}`)}`
    case 'retain':
      return `${card(x, y + 0.1 * s, s * 0.88, p)}${d(`M${X(-0.28)} ${Y(-0.55)}V${Y(-1.08)}H${X(0.28)}V${Y(-0.35)}`)}`
    case 'foresight':
      return `${card(x - 0.32 * s, y + 0.1 * s, s * 0.82, p)}<path d="M${X(0.62)} ${Y(-1.02)}A${f(0.5 * s)} ${f(0.5 * s)} 0 0 1 ${X(0.62)} ${Y(-0.02)}Z" ${paint({ ...p, fill: p.stroke ?? 'currentColor' })}/>`
  }
  return ''
}

/** A small number, legible over lines. */
export function numeral(n: number | string, x: number, y: number, size: number, color = 'var(--ink)'): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" text-anchor="middle" dominant-baseline="central" class="sig-num" fill="${color}">${n}</text>`
}

/** A sigil on its own, for buttons and the resource strip. */
export function icon(markup: string, size = 22, box = 12): string {
  return `<svg class="sig" viewBox="${-box} ${-box} ${2 * box} ${2 * box}" width="${size}" height="${size}" aria-hidden="true">${markup}</svg>`
}
