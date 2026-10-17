// Drawing for the circuits prototype: the moon dial, the three principles, and
// each circuit card as a sigil. The card-to-sigil mapping is provisional (see
// CIRCUITS.md, "Define a runic schema"): the anchor is the card's core and
// carries its first input's element; further inputs hang outside as side
// links; gain stages ring it (circumscribes); distilling stages sit inside it
// (inscribes); grounds are entwined.

import { elementMote, makeRune } from '../sim/deck'
import type { Elemental, JoinKind, Rune, Sigil } from '../sim/types'
import { sigilSvg } from '../ui/draw'
import { EIGHTHS, ELEMENTS, PHASES, type Card, type Fight, type Phase, type Principle } from './engine'

let nextRuneId = 1_000_000
const rune = (body: Rune['body'], element: Elemental | 'any' | null): Rune =>
  makeRune(nextRuneId++, { body, motes: element && element !== 'any' ? [elementMote(element)] : [] })

const cache = new Map<string, string>()

/** A card's circuit as a sigil, under the provisional schema. */
export function cardSigil(c: Card): Sigil {
  const [first, ...rest] = c.channels
  const join = (kind: JoinKind, r: Rune) => ({ kind, rune: r })
  return {
    anchor: rune(c.body, first?.element ?? null),
    joins: [
      ...rest.map((ch) => join('side', rune('circle', ch.element))),
      ...Array.from({ length: c.gain }, () => join('circumscribe', rune('circle', null))),
      ...Array.from({ length: c.distill }, () => join('inscribe', rune('circle', null))),
      ...Array.from({ length: c.ground }, () => join('entwine', rune('circle', null))),
    ],
  }
}

/** The card's sigil drawing, cached by what the card holds. */
export function cardSvg(c: Card, size = 92): string {
  const key = JSON.stringify([c.body, c.channels, c.gain, c.distill, c.ground, size])
  if (!cache.has(key)) cache.set(key, sigilSvg(cardSigil(c), size, 40))
  return cache.get(key)!
}

const ELEMENT_VAR: Record<Elemental, string> = { earth: 'var(--earth)', water: 'var(--water)', air: 'var(--air)', fire: 'var(--fire)' }
export const elementVar = (e: Elemental) => ELEMENT_VAR[e]

/** The three principles' signs, drawn small: salt a barred circle, sulfur a triangle on a cross, mercury horned over a cross. */
export function principleSvg(p: Principle, size = 18): string {
  const s = `width="${size}" height="${size}" viewBox="-10 -10 20 20" aria-hidden="true" class="psign psign-${p}"`
  const stroke = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"'
  switch (p) {
    case 'salt':
      return `<svg ${s}><circle r="6.5" ${stroke}/><path d="M-6.5 0H6.5" ${stroke}/></svg>`
    case 'sulfur':
      return `<svg ${s}><path d="M0 -9L6 1H-6Z" ${stroke}/><path d="M0 1V9M-3.5 5.5H3.5" ${stroke}/></svg>`
    case 'mercury':
      return `<svg ${s}><path d="M-4.5 -9.5A4.5 4.5 0 0 0 4.5 -9.5" ${stroke}/><circle cy="-2.5" r="3.6" ${stroke}/><path d="M0 1.1V9M-3 5.5H3" ${stroke}/></svg>`
  }
}

/** A moon at a phase: dark, lit on the right, full, lit on the left. */
function moon(phase: Phase, x: number, y: number, r: number): string {
  const lit = 'var(--gilt-bright)'
  const dark = 'rgba(9, 5, 20, 0.9)'
  const ring = `<circle cx="${x}" cy="${y}" r="${r}" fill="${dark}" stroke="var(--gilt)" stroke-width="1"/>`
  if (phase === 'new') return ring
  if (phase === 'full') return `<circle cx="${x}" cy="${y}" r="${r}" fill="${lit}" stroke="var(--gilt)" stroke-width="1"/>`
  const sweep = phase === 'first' ? 1 : 0
  return `${ring}<path d="M${x} ${y - r}A${r} ${r} 0 0 ${sweep} ${x} ${y + r}Z" fill="${lit}"/>`
}

const angleOf = (pos: number) => ((-90 + (pos % EIGHTHS) * (360 / EIGHTHS)) * Math.PI) / 180
const at = (pos: number, r: number) => [Math.cos(angleOf(pos)) * r, Math.sin(angleOf(pos)) * r] as const

/**
 * The moon dial: eight eighths around, a moon at each quarter, and outside the
 * ring what each phase brings (a flare where the commission attacks, an arrow
 * where it grows, a card where you draw). The needle shows where the dial
 * stands; the inner arc shows purification against the requirement.
 */
export function dialSvg(f: Fight, size = 260): string {
  const parts: string[] = []
  const R = 120
  parts.push(`<circle r="${R}" fill="rgba(9,5,20,0.35)" stroke="var(--gilt)" stroke-opacity="0.5" stroke-width="1.2"/>`)
  parts.push(`<circle r="${R - 6}" fill="none" stroke="var(--gilt)" stroke-opacity="0.18" stroke-width="0.6"/>`)
  for (let i = 0; i < EIGHTHS * 4; i++) {
    const a = (i / (EIGHTHS * 4)) * Math.PI * 2
    const r1 = i % 4 === 0 ? R - 12 : R - 6
    parts.push(`<line x1="${Math.cos(a) * r1}" y1="${Math.sin(a) * r1}" x2="${Math.cos(a) * R}" y2="${Math.sin(a) * R}" stroke="var(--gilt)" stroke-opacity="${i % 4 === 0 ? 0.6 : 0.25}" stroke-width="${i % 4 === 0 ? 1.2 : 0.7}"/>`)
  }
  const c = f.commission
  PHASES.forEach((phase, i) => {
    const pos = i * 2
    const [x, y] = at(pos, R)
    parts.push(moon(phase, x, y, 11))
    const marks: string[] = []
    if (c.attacks.includes(phase)) marks.push('attack')
    if (c.buffs?.includes(phase)) marks.push('buff')
    if (phase === 'new' || phase === 'full') marks.push('draw')
    marks.forEach((m, j) => {
      const [mx, my] = at(pos, R + 26 + j * 17)
      if (m === 'attack') parts.push(`<path d="M${mx} ${my - 7}L${mx + 2.4} ${my - 2}L${mx + 7} ${my}L${mx + 2.4} ${my + 2}L${mx} ${my + 7}L${mx - 2.4} ${my + 2}L${mx - 7} ${my}L${mx - 2.4} ${my - 2}Z" fill="var(--fire)"><title>${c.name} flares the pool</title></path>`)
      if (m === 'buff') parts.push(`<path d="M${mx} ${my - 6}L${mx + 5} ${my + 3}H${mx - 5}Z" fill="none" stroke="var(--warn)" stroke-width="1.4"><title>${c.name} grows</title></path>`)
      if (m === 'draw') parts.push(`<rect x="${mx - 4}" y="${my - 5.5}" width="8" height="11" rx="1.5" fill="none" stroke="var(--glass)" stroke-width="1.2"><title>You draw</title></rect>`)
    })
  })
  // Purification against the requirement.
  const frac = Math.min(1, f.purified / c.require)
  const pr = 86
  parts.push(`<circle r="${pr}" fill="none" stroke="var(--gilt)" stroke-opacity="0.15" stroke-width="6"/>`)
  if (frac > 0) {
    const a1 = -Math.PI / 2 + frac * Math.PI * 2 - (frac >= 1 ? 0.0001 : 0)
    const large = frac > 0.5 ? 1 : 0
    parts.push(`<path d="M0 ${-pr}A${pr} ${pr} 0 ${large} 1 ${Math.cos(a1) * pr} ${Math.sin(a1) * pr}" fill="none" stroke="var(--gilt-bright)" stroke-width="6" stroke-linecap="round"/>`)
  }
  // The needle: a short hand from the purification ring out to the dial, clear of the numbers in the middle.
  const [n0x, n0y] = at(f.dial, pr + 8)
  const [nx, ny] = at(f.dial, R - 4)
  parts.push(`<line class="needle" x1="${n0x}" y1="${n0y}" x2="${nx}" y2="${ny}" stroke="var(--gilt-bright)" stroke-width="2.4" stroke-linecap="round"/>`)
  const [dx, dy] = at(f.dial, R)
  parts.push(`<circle cx="${dx}" cy="${dy}" r="5" fill="var(--gilt-bright)" stroke="var(--night)" stroke-width="1.5"/>`)
  parts.push(`<text y="-8" text-anchor="middle" class="dial-num">${f.purified}</text><text y="14" text-anchor="middle" class="dial-of">of ${c.require} purified</text>`)
  return `<svg class="dial" viewBox="-180 -180 360 360" width="${size}" height="${size}" role="img" aria-label="Moon dial: ${f.purified} of ${c.require} purified">${parts.join('')}</svg>`
}

/** The pool as bars, one per element. */
export function poolBars(pool: Record<Elemental, number>, feed: Record<Elemental, number>): string {
  const max = Math.max(10, ...ELEMENTS.map((e) => pool[e]))
  return ELEMENTS.map(
    (e) => `<div class="pbar" style="--c:${ELEMENT_VAR[e]}">
      <span class="pname">${e}</span>
      <span class="ptrack"><span style="width:${(pool[e] / max) * 100}%"></span></span>
      <span class="num pval">${pool[e]}</span>
      <span class="pfeed num">${feed[e] ? `+${feed[e]}` : ''}</span>
    </div>`,
  ).join('')
}
