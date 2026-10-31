// The material's spectrum: three to five lines a band, low to high (earth the
// bass, water and air the mids, fire the treble). Each line stands as tall
// as its amplitude, in its element's colour, up to the chord; the chord's
// height is a gilt bar across it with a note head. What stands above the chord
// is excess, tinted and ringed in warning; what is missing below it is a dashed
// outline. A line that matches the chord is locked: a gilt frame round it, and
// no tap moves it. A picked attack makes every line a target to tap; once it
// is lined up, the lines its kernel covers are lit with each tap over its line,
// and its result shows as a dashed ghost on the lines it would move.

import { ELEMENT_COLOR, element } from '../circuits/sigils'
import { BANDS, perBand, tapWords, type Spectrum, type Tap } from './engine'

const r2 = (n: number) => Math.round(n * 100) / 100
export const BAND_NAMES: Record<string, string> = { earth: 'bass', water: 'mid', air: 'high', fire: 'treble' }

/** A picked attack: every line is a target; once lined up, the lines under its taps (null off the ends) and the taps as they would land. */
export interface Aim {
  lines: (number | null)[]
  taps: Tap[]
}

export function spectrumSvg(s: Spectrum, chord: Spectrum, ghost?: Spectrum | null, aim?: Aim | null): string {
  const W = 260
  const H = 100
  const top = 16
  const base = 74
  const span = base - top
  const per = perBand(chord)
  const idx = Array.from({ length: per }, (_, i) => i)
  const peak = Math.max(6, ...BANDS.flatMap((e) => idx.flatMap((i) => [s[e][i], chord[e][i], ghost?.[e][i] ?? 0])))
  const y = (v: number) => base - (v / peak) * span
  const band = W / BANDS.length
  // Lines spread across each band: three sit wide apart, five close together.
  const margin = per === 3 ? 0.24 : per === 4 ? 0.18 : 0.15
  const step = (1 - 2 * margin) / Math.max(1, per - 1)
  const bw = per === 3 ? 11 : per === 4 ? 9 : 7.5
  const parts: string[] = []
  const xOf = (k: number) => Math.floor(k / per) * band + band * (margin + step * (k % per))
  const hit = band * step
  // The lines an attack would cover, lit behind, with each tap over its line.
  aim?.lines.forEach((k, j) => {
    if (k === null) return
    const x = xOf(k)
    const t = aim.taps[j]
    const color = t.op === 'times' ? 'var(--glass)' : t.v > 0 ? 'var(--lit)' : 'var(--warn)'
    const e = BANDS[Math.floor(k / per)]
    const locked = s[e][k % per] === chord[e][k % per]
    parts.push(`<rect x="${r2(x - hit / 2)}" y="${top - 12}" width="${r2(hit)}" height="${base - top + 12}" rx="3" fill="color-mix(in srgb, ${locked ? 'var(--gilt)' : color} ${locked ? 8 : 14}%, transparent)"/>`)
    parts.push(`<text x="${r2(x)}" y="${top - 5}" font-size="${per === 3 ? 9.5 : 8}" text-anchor="middle" dominant-baseline="central" class="sig-num" fill="${locked ? 'var(--ink-faint)' : color}"${locked ? ' text-decoration="line-through"' : ''}>${tapWords(t)}</text>`)
  })
  parts.push(`<line x1="3" y1="${base}" x2="${W - 3}" y2="${base}" stroke="var(--line)" stroke-opacity="0.5" stroke-width="1"/>`)
  BANDS.forEach((e, b) => {
    const color = ELEMENT_COLOR[e]
    const x0 = b * band
    if (b) parts.push(`<line x1="${r2(x0)}" y1="${top}" x2="${r2(x0)}" y2="${base}" stroke="var(--line)" stroke-opacity="0.18" stroke-width="1"/>`)
    for (let i = 0; i < per; i++) {
      const cx = xOf(b * per + i)
      const v = s[e][i]
      const t = chord[e][i]
      const lo = Math.min(v, t)
      // Locked: matches the chord, so a gilt frame round the whole line (or a gilt dot where both are zero).
      if (v === t) parts.push(t > 0 ? `<rect x="${r2(cx - bw / 2 - 2)}" y="${r2(y(t) - 2)}" width="${bw + 4}" height="${r2(base - y(t) + 2)}" rx="2.5" fill="none" stroke="var(--gilt)" stroke-width="1" stroke-opacity="0.8"/>` : `<circle cx="${r2(cx)}" cy="${base - 3}" r="1.6" fill="var(--gilt)" fill-opacity="0.7"/>`)
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
  // While an attack is picked, every line is a target.
  if (aim) for (let k = 0; k < BANDS.length * per; k++) parts.push(`<rect class="aim-spot" data-act="aim" data-k="${k}" x="${r2(xOf(k) - hit / 2)}" y="0" width="${r2(hit)}" height="${base + 4}" fill="transparent"/>`)
  const words = BANDS.map((e) => `${e} ${s[e].join(', ')} (chord ${chord[e].join(', ')})`).join('; ')
  return `<svg class="spectrum" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spectrum, low to high: ${words}">${parts.join('')}</svg>`
}
