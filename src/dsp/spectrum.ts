// The attack as a spectrum: one band per element, low to high (earth the
// bass, water and air the mids, fire the treble). Each band shows the share of
// the attack in it, filled in its element's colour, against the material's
// share, a gilt outline. Inside the outline stand the material's notes in that
// band, its chord: a stem and a head each, as tall as the note is strong. A
// band the material has none of is noise, ringed in warning. A picked move
// shows its result as a dashed ghost.

import { ELEMENT_COLOR, element } from '../circuits/sigils'
import { BANDS, poolTotal, type Pool, type Voice } from './engine'

const r2 = (n: number) => Math.round(n * 100) / 100
export const BAND_NAMES: Record<string, string> = { earth: 'bass', water: 'mid', air: 'high', fire: 'treble' }

export function spectrumSvg(attack: Pool, target: Pool, ghost?: Pool | null, chord?: Voice): string {
  const W = 240
  const H = 84
  const top = 5
  const base = 58
  const span = base - top
  const a = poolTotal(attack)
  const t = poolTotal(target)
  const g = ghost ? poolTotal(ghost) : 0
  const bw = 30
  const step = W / BANDS.length
  const parts: string[] = []
  parts.push(`<line x1="4" y1="${base}" x2="${W - 4}" y2="${base}" stroke="var(--line)" stroke-opacity="0.5" stroke-width="1"/>`)
  BANDS.forEach((e, i) => {
    const cx = step * (i + 0.5)
    const color = ELEMENT_COLOR[e]
    const share = a ? attack[e] / a : 0
    const want = t ? target[e] / t : 0
    const h = share * span
    const noise = want === 0 && attack[e] > 0
    if (h > 0) parts.push(`<rect x="${r2(cx - bw / 2)}" y="${r2(base - h)}" width="${bw}" height="${r2(h)}" rx="2" fill="color-mix(in srgb, ${color} 62%, transparent)" stroke="${noise ? 'var(--warn)' : color}" stroke-width="${noise ? 1.6 : 1}"/>`)
    if (want > 0) parts.push(`<rect x="${r2(cx - bw / 2 - 3)}" y="${r2(base - want * span)}" width="${bw + 6}" height="${r2(want * span)}" rx="2.5" fill="none" stroke="var(--gilt-bright)" stroke-width="1.4"/>`)
    // The material's chord in this band: three notes, low to high, each as tall as it is strong.
    const notes = chord?.[e]
    const loudest = notes ? Math.max(...notes) : 0
    if (notes && loudest > 0 && want > 0) {
      notes.forEach((n, k) => {
        if (!n) return
        const x = cx + (k - 1) * 9.5
        const top = base - want * span * (n / loudest) + 3
        parts.push(`<path d="M${r2(x + 2)} ${r2(base - 1)}V${r2(top)}" stroke="var(--gilt-bright)" stroke-width="1.1" stroke-linecap="round" opacity="0.9"/><ellipse cx="${r2(x)}" cy="${r2(top + 0.5)}" rx="2.6" ry="1.9" transform="rotate(-20 ${r2(x)} ${r2(top + 0.5)})" fill="var(--gilt-bright)"/>`)
      })
    }
    if (ghost && g) {
      const gh = (ghost[e] / g) * span
      if (Math.abs(gh - h) > 0.5) parts.push(`<rect x="${r2(cx - bw / 2 + 3)}" y="${r2(base - gh)}" width="${bw - 6}" height="${r2(Math.max(gh, 0.01))}" rx="1.5" fill="none" stroke="var(--lit)" stroke-width="1.5" stroke-dasharray="3 2"/>`)
    }
    parts.push(element(e, cx - 22, base + 13, 5.5, { stroke: color, width: 1.4 }))
    parts.push(`<text x="${r2(cx + 4)}" y="${base + 14}" font-size="10" text-anchor="middle" dominant-baseline="central" fill="var(--ink-soft)" class="band-name">${BAND_NAMES[e]}</text>`)
  })
  return `<svg class="spectrum" viewBox="0 0 ${W} ${H}" role="img" aria-label="Attack spectrum: ${BANDS.map((e) => `${attack[e]} ${e}`).join(', ')}; material ${BANDS.filter((e) => target[e]).map((e) => `${target[e]} ${e}`).join(', ')}">${parts.join('')}</svg>`
}
