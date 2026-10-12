// Sound: everything synthesized with Web Audio, no files. Each element has a
// voice on one D minor pentatonic, so any sigil's runes sound together as a
// chord: earth a low hollow triangle, water a sine with a slow vibrato, fire a
// warm filtered saw, air a high sine with breath in it. A small generated
// reverb gives the room. Nothing plays until the first tap, as browsers ask.

import type { Resolution } from '../sim/sigil'
import type { Affinity, JoinKind, Rune, Sigil } from '../sim/types'
import { runepath } from '../sim/equation'

interface Voice {
  type: OscillatorType
  freq: number
  /** Low-pass cutoff, for the saw. */
  filter?: number
  /** Vibrato depth as a share of the pitch. */
  vibrato?: number
  /** How much breathy noise rides along. */
  breath?: number
}

const VOICES: Record<Affinity, Voice> = {
  earth: { type: 'triangle', freq: 146.83 }, // D3
  water: { type: 'sine', freq: 220.0, vibrato: 0.006 }, // A3
  fire: { type: 'sawtooth', freq: 261.63, filter: 1500 }, // C4
  air: { type: 'sine', freq: 349.23, breath: 0.05 }, // F4
  none: { type: 'sine', freq: 196.0 }, // G3
}

/** How a join colours its rune's note: rings ring an octave up, side links a fifth, tangents a fourth down; entwines are muted. */
const JOIN_STEP: Record<JoinKind, number> = { circumscribe: 12, inscribe: 0, side: 7, tangent: -5, entwine: 0 }

const KEY = 'herau-sound'
const semis = (f: number, n: number) => f * 2 ** (n / 12)

class Engine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private wet: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private on = true

  constructor() {
    try {
      this.on = localStorage.getItem(KEY) !== '0'
    } catch {
      this.on = true
    }
  }

  get enabled() {
    return this.on
  }

  setEnabled(on: boolean) {
    this.on = on
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      // Storage can be unavailable; the choice still holds for this visit.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05)
  }

  /** Create or wake the audio context; call from a tap. */
  unlock() {
    if (typeof window === 'undefined') return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    if (!this.ctx) {
      try {
        this.ctx = new Ctor()
      } catch {
        return
      }
      const ctx = this.ctx
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.ratio.value = 4
      comp.connect(ctx.destination)
      this.master = ctx.createGain()
      this.master.gain.value = this.on ? 0.5 : 0
      this.master.connect(comp)
      // A short room: stereo noise falling away over two seconds.
      const verb = ctx.createConvolver()
      const len = Math.floor(ctx.sampleRate * 2.2)
      const ir = ctx.createBuffer(2, len, ctx.sampleRate)
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c)
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
      }
      verb.buffer = ir
      this.wet = ctx.createGain()
      this.wet.gain.value = 0.28
      this.wet.connect(verb)
      verb.connect(this.master)
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const n = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private ready(): AudioContext | null {
    return this.on && this.ctx && this.master ? this.ctx : null
  }

  /** Route a node to the dry mix and the reverb. */
  private out(node: AudioNode, send = 1) {
    node.connect(this.master!)
    if (this.wet && send > 0) {
      const g = this.ctx!.createGain()
      g.gain.value = send
      node.connect(g)
      g.connect(this.wet)
    }
  }

  private envelope(t: number, attack: number, peak: number, decay: number): GainNode {
    const g = this.ctx!.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    return g
  }

  /** One rune's note in its element's voice. */
  private pluck(voice: Voice, freq: number, t: number, gain = 0.14, decay = 0.9, muted = false) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = voice.type
    osc.frequency.setValueAtTime(freq, t)
    const env = this.envelope(t, 0.008, gain, decay)
    let last: AudioNode = osc
    if (voice.filter || muted) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = muted ? 700 : voice.filter!
      last.connect(lp)
      last = lp
    }
    if (voice.vibrato) {
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.frequency.value = 5
      depth.gain.value = freq * voice.vibrato
      lfo.connect(depth)
      depth.connect(osc.frequency)
      lfo.start(t)
      lfo.stop(t + decay + 0.1)
    }
    last.connect(env)
    this.out(env, 0.6)
    osc.start(t)
    osc.stop(t + decay + 0.1)
    if (voice.breath) this.noise(t, decay * 0.6, 'bandpass', freq * 2, voice.breath * (gain / 0.14), 4)
  }

  /** A struck bell: frequency modulation at an inharmonic ratio, the brightness dying faster than the tone. */
  private bell(freq: number, t: number, gain = 0.12, decay = 1.6, ratio = 3.5) {
    const ctx = this.ctx!
    const car = ctx.createOscillator()
    const mod = ctx.createOscillator()
    const idx = ctx.createGain()
    car.frequency.value = freq
    mod.frequency.value = freq * ratio
    idx.gain.setValueAtTime(freq * 2.2, t)
    idx.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay * 0.6)
    mod.connect(idx)
    idx.connect(car.frequency)
    const env = this.envelope(t, 0.004, gain, decay)
    car.connect(env)
    this.out(env, 0.9)
    car.start(t)
    mod.start(t)
    car.stop(t + decay + 0.1)
    mod.stop(t + decay + 0.1)
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, gain: number, q = 1) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const env = this.envelope(t, Math.min(0.03, dur / 3), gain, dur)
    src.connect(f)
    f.connect(env)
    this.out(env, 0.4)
    src.start(t)
    src.stop(t + dur + 0.1)
  }

  /** A low blow: a sine falling in pitch, with a thump of filtered noise. */
  private thud(t: number, gain: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(130, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.3)
    const env = this.envelope(t, 0.005, gain, 0.45)
    osc.connect(env)
    this.out(env, 0.3)
    osc.start(t)
    osc.stop(t + 0.6)
    this.noise(t, 0.18, 'lowpass', 500, gain * 0.6)
  }

  /** Quintessence draining away: a low saw sinking. */
  private drain(t: number, gain: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, t)
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.7)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1400, t)
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.7)
    const env = this.envelope(t, 0.02, gain, 0.8)
    osc.connect(lp)
    lp.connect(env)
    this.out(env, 0.5)
    osc.start(t)
    osc.stop(t + 1)
  }

  /** Ward catching a blow: a little cluster of glassy bells. */
  private shimmer(t: number, gain: number) {
    ;[1174.66, 1396.91, 1760, 2093].forEach((fq, i) => this.bell(fq, t + i * 0.035, gain * (1 - i * 0.15), 1.1, 2.01))
  }

  /** Tapping a rune to anchor a sigil. */
  tap(rune: Rune) {
    const ctx = this.ready()
    if (!ctx) return
    const v = VOICES[rune.affinity]
    this.pluck(v, v.freq, ctx.currentTime, 0.12, 0.6)
  }

  /** Joining a rune to the sigil. */
  join(rune: Rune, kind: JoinKind) {
    const ctx = this.ready()
    if (!ctx) return
    const v = VOICES[rune.affinity]
    this.pluck(v, semis(v.freq, JOIN_STEP[kind]), ctx.currentTime, 0.11, kind === 'entwine' ? 0.35 : 0.6, kind === 'entwine')
  }

  /** A cast: the sigil's runes as a rising arpeggio from the anchor out to the seal, then what it did. */
  cast(sigil: Sigil, r: Resolution) {
    const ctx = this.ready()
    if (!ctx) return
    const t0 = ctx.currentTime + 0.02
    const path = runepath(sigil)
    const onPath = path ? path.steps.map((s) => ({ rune: s.rune, kind: s.kind as JoinKind })) : []
    const rest = sigil.joins.filter((j) => j.kind !== 'circumscribe' && j.kind !== 'inscribe').map((j) => ({ rune: j.rune, kind: j.kind }))
    const notes = [{ rune: sigil.anchor, kind: null as JoinKind | null }, ...onPath, ...rest]
    notes.forEach((n, i) => {
      const v = VOICES[n.rune.affinity]
      this.pluck(v, n.kind ? semis(v.freq, JOIN_STEP[n.kind]) : v.freq, t0 + i * 0.07, 0.1, 1.1, n.kind === 'entwine')
    })
    const t = t0 + notes.length * 0.07 + 0.05
    const sealVoice = VOICES[r.target?.elemental ?? sigil.anchor.affinity]
    const weight = Math.min(1, Math.log1p(r.converted) / Math.log1p(40))
    if (r.mode === 'transmute') {
      this.bell(semis(sealVoice.freq, 12), t, 0.08 + 0.1 * weight, 1.4 + weight)
      this.noise(t, 0.5 + weight, 'lowpass', 300 + 900 * weight, 0.05 + 0.08 * weight)
    } else if (r.mode === 'purify') {
      this.bell(semis(sealVoice.freq, 24), t, 0.1, 1.8, 2)
      this.bell(semis(sealVoice.freq, 31), t + 0.09, 0.07, 1.6, 2)
    } else {
      this.noise(t, 0.12, 'bandpass', 900, 0.04, 2)
    }
    if (r.outputs.ward > 0) this.shimmer(t + 0.1, Math.min(0.06, 0.02 + r.outputs.ward / 400))
  }

  /** The commission's turn: a blow for every flare, a shimmer where Ward catches it, a sinking tone for quintessence paid. */
  turn(flares: number[], absorbed: number, paid: number) {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime + 0.02
    if (!flares.length) {
      this.noise(t, 1.2, 'bandpass', 600, 0.04, 0.7)
      return
    }
    flares.forEach((fl, i) => this.thud(t + i * 0.16, Math.min(0.5, 0.15 + fl / 40)))
    if (absorbed > 0) this.shimmer(t + 0.08, Math.min(0.07, 0.025 + absorbed / 300))
    if (paid > 0) this.drain(t + 0.25 + flares.length * 0.08, Math.min(0.16, 0.05 + paid / 120))
  }

  /** Runes dealt into the hand: a flick each. */
  deal(n: number) {
    const ctx = this.ready()
    if (!ctx) return
    for (let i = 0; i < n; i++) this.noise(ctx.currentTime + 0.05 + i * 0.05, 0.03, 'highpass', 2500 + i * 150, 0.05)
  }

  discard(n: number) {
    const ctx = this.ready()
    if (!ctx) return
    for (let i = 0; i < n; i++) this.noise(ctx.currentTime + i * 0.04, 0.05, 'bandpass', 1200, 0.05, 1.5)
  }

  /** The commission done: the scale rising in bells over a low swell. */
  win() {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime + 0.35
    ;[293.66, 349.23, 440, 587.33, 698.46].forEach((fq, i) => this.bell(fq, t + i * 0.11, 0.09, 2.2, 2))
    this.pluck(VOICES.earth, 73.42, t, 0.12, 2.5)
  }

  lose() {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime + 0.3
    ;[220, 174.61, 146.83, 110].forEach((fq, i) => this.pluck(VOICES.fire, fq, t + i * 0.22, 0.1, 1.2))
  }
}

export const sound = new Engine()
