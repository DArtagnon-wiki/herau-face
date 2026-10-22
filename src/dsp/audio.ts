// The attack as sound. Each element is a band of three notes, all harmonics
// of one root (earth the bass, water and air the mids, fire the treble), and
// each material is its own chord: how strongly it sounds each note. The attack
// is voiced through the material's chord, each band as loud as its share of
// the attack, so an attack that matches sounds exactly like the material. A
// band the material lacks sounds all three of its notes evenly. What is wrong
// makes it rough: every band holding more than the material's share gets
// detuned twins that beat against its notes (slowly in the bass, fast and
// harsh in the treble), and the whole tone shudders and hisses in proportion
// to how far the shape is from the material's. Smoothing glides from the rough
// sound to the smoothed one. Silent until the first tap, and muted with the
// rest of the game's sound.

import { sound } from '../ui/sound'
import { BANDS, NOTE_HARMONICS, ROOT_HZ, matchOf, poolTotal, type Commission, type Pool } from './engine'
import type { Elemental } from '../sim/types'

const WAVE: Record<Elemental, OscillatorType> = { earth: 'triangle', water: 'sine', air: 'sine', fire: 'sine' }
/** Higher bands sound louder at the same level; this evens them out. */
const LOUDNESS: Record<Elemental, number> = { earth: 1, water: 0.62, air: 0.48, fire: 0.24 }
const DETUNE = 1.035
const SHUDDER_HZ = 23

interface Shape {
  /** Each band's three notes' levels, and their rough twins'. */
  level: Record<Elemental, number[]>
  rough: Record<Elemental, number[]>
  /** How hard the whole tone shudders and hisses, 0 to 1. */
  wrong: number
}

/** The attack voiced through the material's chord. */
function shapeOf(attack: Pool, c: Commission): Shape {
  const target = c.target
  const a = poolTotal(attack)
  const t = poolTotal(target)
  const level: Record<Elemental, number[]> = { earth: [0, 0, 0], water: [0, 0, 0], air: [0, 0, 0], fire: [0, 0, 0] }
  const rough: Record<Elemental, number[]> = { earth: [0, 0, 0], water: [0, 0, 0], air: [0, 0, 0], fire: [0, 0, 0] }
  for (const e of BANDS) {
    const share = a ? attack[e] / a : 0
    const want = t ? target[e] / t : 0
    const chord = c.chord[e]
    const total = chord[0] + chord[1] + chord[2]
    const weights = total ? chord.map((x) => x / total) : [1 / 3, 1 / 3, 1 / 3]
    const wrong = Math.min(1, Math.max(0, share - want) * 2.2)
    for (let i = 0; i < 3; i++) {
      level[e][i] = Math.sqrt(share * weights[i]) * LOUDNESS[e] * 1.25
      rough[e][i] = wrong * Math.sqrt(weights[i]) * LOUDNESS[e]
    }
  }
  return { level, rough, wrong: a ? 1 - matchOf(attack, target) : 0 }
}

class SpectrumVoice {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private noise: AudioBuffer | null = null

  private ensure(): AudioContext | null {
    if (!sound.enabled) return null
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.ctx = new Ctx()
        this.out = this.ctx.createGain()
        this.out.gain.value = 0.32
        this.out.connect(this.ctx.destination)
        const len = this.ctx.sampleRate
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const d = this.noise.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      } catch {
        return null
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Call from a tap, so the browser lets sound start. */
  unlock() {
    this.ensure()
  }

  /**
   * Voice a spectrum: hold `from` for a moment, then glide to `to` (the same
   * shape when nothing changes), then fade.
   */
  private voice(from: Shape, to: Shape, hold: number, glide: number, tail: number) {
    const ctx = this.ensure()
    if (!ctx || !this.out || !this.noise) return
    const t0 = ctx.currentTime + 0.02
    const t1 = t0 + hold
    const t2 = t1 + glide
    const end = t2 + tail
    // The envelope over everything.
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(1, t0 + 0.08)
    env.gain.setValueAtTime(1, t2)
    env.gain.exponentialRampToValueAtTime(0.0008, end)
    env.connect(this.out)
    // The shudder: an amplitude wobble whose depth is how wrong the shape is.
    const am = ctx.createGain()
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = SHUDDER_HZ
    const d0 = 0.42 * from.wrong
    const d1 = 0.42 * to.wrong
    am.gain.setValueAtTime(1 - d0, t0)
    am.gain.setValueAtTime(1 - d0, t1)
    am.gain.linearRampToValueAtTime(1 - d1, t2)
    depth.gain.setValueAtTime(d0, t0)
    depth.gain.setValueAtTime(d0, t1)
    depth.gain.linearRampToValueAtTime(d1, t2)
    lfo.connect(depth)
    depth.connect(am.gain)
    am.connect(env)
    lfo.start(t0)
    lfo.stop(end)
    // Each note of each band, and its rough twin.
    for (const e of BANDS) {
      const pair: [number, number, number, number][] = [0, 1, 2].flatMap((i): [number, number, number, number][] => [
        [i, 1, from.level[e][i], to.level[e][i]],
        [i, DETUNE, from.rough[e][i], to.rough[e][i]],
      ])
      for (const [i, mult, g0, g1] of pair) {
        if (g0 < 0.001 && g1 < 0.001) continue
        const o = ctx.createOscillator()
        o.type = WAVE[e]
        o.frequency.value = ROOT_HZ * NOTE_HARMONICS[e][i] * mult
        const g = ctx.createGain()
        g.gain.setValueAtTime(g0, t0)
        g.gain.setValueAtTime(g0, t1)
        g.gain.linearRampToValueAtTime(g1, t2)
        o.connect(g)
        g.connect(am)
        o.start(t0)
        o.stop(end)
      }
    }
    // Hiss: noise through a band in the upper mids, as loud as the shape is wrong.
    if (from.wrong > 0.01 || to.wrong > 0.01) {
      const n = ctx.createBufferSource()
      n.buffer = this.noise
      n.loop = true
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1400
      bp.Q.value = 0.9
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.16 * from.wrong, t0)
      g.gain.setValueAtTime(0.16 * from.wrong, t1)
      g.gain.linearRampToValueAtTime(0.16 * to.wrong, t2)
      n.connect(bp)
      bp.connect(g)
      g.connect(am)
      n.start(t0)
      n.stop(end)
    }
  }

  /** The attack as it stands. */
  play(attack: Pool, c: Commission, long = false) {
    if (!poolTotal(attack)) return
    const s = shapeOf(attack, c)
    this.voice(s, s, long ? 1.6 : 0.7, 0.01, long ? 1.2 : 0.8)
  }

  /** Smoothing: the rough attack, filtered into the smoother one. */
  smooth(before: Pool, after: Pool, c: Commission) {
    this.voice(shapeOf(before, c), shapeOf(after, c), 0.55, 1.3, 1.4)
  }

  /** The material itself: its chord, the pure sound the attack is reaching for. */
  material(c: Commission) {
    const s = shapeOf(c.target, c)
    this.voice(s, s, 1.4, 0.01, 1.4)
  }
}

export const spectrumVoice = new SpectrumVoice()
