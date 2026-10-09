// Small seeded generator (mulberry32). Game state carries the seed, so every
// commission replays exactly from the same seed and choices.

export interface Rng {
  float(): number
  int(min: number, max: number): number
  shuffle<T>(items: T[]): T[]
  state(): number
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  const float = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    float,
    int: (min, max) => min + Math.floor(float() * (max - min + 1)),
    shuffle: (items) => {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(float() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    state: () => s,
  }
}
