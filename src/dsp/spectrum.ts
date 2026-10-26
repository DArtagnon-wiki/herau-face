// The material's spectrum: twelve lines, three to a band, low to high (earth
// the bass, water and air the mids, fire the treble). Each line stands as tall
// as its amplitude, in its element's colour, up to the chord; the chord's
// height is a gilt bar across it with a note head. What stands above the chord
// is excess, tinted and ringed in warning; what is missing below it is a dashed
// outline. A picked move shows its result as a dashed ghost on the lines it
// would move.

import { ELEMENT_COLOR, element } from '../circuits/sigils'
import { BANDS, type Spectrum } from './engine'

const r2 = (n: number) => Math.round(n * 100) / 100
export const BAND_NAMES: Record<string, string> = { earth: 'bass', water: 'mid', air: 'high', fire: 'treble' }

export function spectrumSvg(s: Spectrum, chord: Spectrum, ghost?: Spectrum | null): string {
  const W = 260
  const H = 92
  const top = 6
  const base = 66
  const span = base - top
  const peak = Math.max(6, ...BANDS.flatMap((e) => [0, 1, 2].flatMap((i) => [s[e][i], chord[e][i], ghost?.[e][i] ?? 0])))
  const y = (v: number) => base - (v / peak) * span
  const band = W / BANDS.length
  const bw = 11
  const parts: string[] = []
  parts.push(`<line x1="3" y1="${base}" x2="${W - 3}" y2="${base}" stroke="var(--line)" stroke-opacity="0.5" stroke-width="1"/>`)
  BANDS.forEach((e, b) => {
    const color = ELEMENT_COLOR[e]
    const x0 = b * band
    if (b) parts.push(`<line x1="${r2(x0)}" y1="${top}" x2="${r2(x0)}" y2="${base}" stroke="var(--line)" stroke-opacity="0.18" stroke-width="1"/>`)
    for (let i = 0; i < 3; i++) {
      const cx = x0 + band * (0.24 + 0.26 * i)
      const v = s[e][i]
      const t = chord[e][i]
      const lo = Math.min(v, t)
      // Up to the chord, in the element's colour.
      if (lo > 0) parts.push(`<rect x="${r2(cx - bw / 2)}" y="${r2(y(lo))}" width="${bw}" height="${r2(base - y(lo))}" rx="1.5" fill="color-mix(in srgb, ${color} 60%, transparent)" stroke="${color}" stroke-width="1"/>`)
      // Excess above the chord.
      if (v > t) parts.push(`<rect x="${r2(cx - bw / 2)}" y="${r2(y(v))}" width="${bw}" height="${r2(y(t) - y(v))}" rx="1.5" fill="color-mix(in srgb, var(--warn) 30%, transparent)" stroke="var(--warn)" stroke-width="1.3"/>`)
      // Missing below the chord.
      if (t > v) parts.push(`<rect x="${r2(cx - bw / 2)}" y="${r2(y(t))}" width="${bw}" height="${r2(y(v) - y(t))}" rx="1.5" fill="none" stroke="${color}" stroke-width="1.1" stroke-dasharray="2.5 2"/>`)
      // The chord: a gilt bar and a note head.
      if (t > 0) parts.push(`<path d="M${r2(cx - bw / 2 - 2)} ${r2(y(t))}H${r2(cx + bw / 2 + 2)}" stroke="var(--gilt-bright)" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="${r2(cx + bw / 2 + 3.5)}" cy="${r2(y(t) - 1.6)}" rx="2.6" ry="1.9" transform="rotate(-20 ${r2(cx + bw / 2 + 3.5)} ${r2(y(t) - 1.6)})" fill="var(--gilt-bright)"/>`)
      // A picked move's result.
      const gv = ghost?.[e][i]
      if (gv !== undefined && gv !== v) parts.push(`<rect x="${r2(cx - bw / 2 - 2.5)}" y="${r2(y(gv))}" width="${bw + 5}" height="${r2(Math.max(0.6, base - y(gv)))}" rx="2" fill="none" stroke="var(--lit)" stroke-width="1.6" stroke-dasharray="3 2"/>`)
    }
    parts.push(element(e, x0 + band * 0.16, base + 13, 5.5, { stroke: color, width: 1.4 }))
    parts.push(`<text x="${r2(x0 + band * 0.27)}" y="${base + 14}" font-size="10" text-anchor="start" dominant-baseline="central" fill="var(--ink-soft)" class="band-name">${BAND_NAMES[e]}</text>`)
  })
  const words = BANDS.map((e) => `${e} ${s[e].join(', ')} (chord ${chord[e].join(', ')})`).join('; ')
  return `<svg class="spectrum" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spectrum, low to high: ${words}">${parts.join('')}</svg>`
}
