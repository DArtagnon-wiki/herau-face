// Small animation helpers. Each channel runs one animation at a time: starting
// another on the same channel stops the first. Under reduced motion every
// animation jumps straight to its end.

import type { Pool } from '../sim/types'
import { normalize } from '../sim/alchemy'

export const reducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Ease out: fast at first, settling at the end. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3

const tokens = new Map<string, number>()

export function animate(channel: string, ms: number, frame: (t: number) => void, done?: () => void) {
  const id = (tokens.get(channel) ?? 0) + 1
  tokens.set(channel, id)
  if (reducedMotion() || typeof requestAnimationFrame === 'undefined') {
    frame(1)
    done?.()
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    if (tokens.get(channel) !== id) return
    const t = Math.min(1, (now - start) / ms)
    frame(t)
    if (t < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}

/** The amalgam part way from one state to another: every pool's kilos eased between the two. */
export function lerpPools(from: Pool[], to: Pool[], t: number): Pool[] {
  const key = (p: Pool) => `${p.elemental}:${p.grade}`
  const all = new Map<string, { a: number; b: number; p: Pool }>()
  for (const p of from) all.set(key(p), { a: p.kg, b: 0, p })
  for (const p of to) all.set(key(p), { a: all.get(key(p))?.a ?? 0, b: p.kg, p })
  return normalize([...all.values()].map(({ a, b, p }) => ({ ...p, kg: a + (b - a) * t })))
}
