// The attack as a spectrum: one band per element, low to high (earth the
// bass, water and air the mids, fire the treble). Each band shows the share of
// the attack in it, filled in its element's colour, against the material's
// share, a gilt outline. A band the material has none of is noise, ringed in
// warning. A picked move shows its result as a dashed ghost.

import { ELEMENT_COLOR, element } from '../circuits/sigils'
import { BANDS, poolTotal, type Pool } from './engine'

const r2 = (n: number) => Math.round(n * 100) / 100
export const BAND_NAMES: Record<string, string> = { earth: 'bass', water: 'mid', air: 'high', fire: 'treble' }

export function spectrumSvg(attack: Pool, target: Pool, ghost?: Pool | null): string {
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
    if (want > 0) parts.push(`<rect x="${r2(cx - bw / 2 - 3)}" y="${r2(base - want * span)}" width="${bw + 6}" height="${r2(want * span)}" rx="2.5" fill="none" stroke="var(--gilt-bright)" stroke-width="1.4" stroke-dasharray="${want ? '0' : '3 2'}"/>`)
    if (ghost && g) {
      const gh = (ghost[e] / g) * span
      if (Math.abs(gh - h) > 0.5) parts.push(`<rect x="${r2(cx - bw / 2 + 3)}" y="${r2(base - gh)}" width="${bw - 6}" height="${r2(Math.max(gh, 0.01))}" rx="1.5" fill="none" stroke="var(--lit)" stroke-width="1.5" stroke-dasharray="3 2"/>`)
    }
    parts.push(element(e, cx - 22, base + 13, 5.5, { stroke: color, width: 1.4 }))
    parts.push(`<text x="${r2(cx + 4)}" y="${base + 14}" font-size="10" text-anchor="middle" dominant-baseline="central" fill="var(--ink-soft)" class="band-name">${BAND_NAMES[e]}</text>`)
  })
  return `<svg class="spectrum" viewBox="0 0 ${W} ${H}" role="img" aria-label="Attack spectrum: ${BANDS.map((e) => `${attack[e]} ${e}`).join(', ')}; material ${BANDS.filter((e) => target[e]).map((e) => `${target[e]} ${e}`).join(', ')}">${parts.join('')}</svg>`
}
