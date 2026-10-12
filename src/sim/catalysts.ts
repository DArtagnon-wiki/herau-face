import { totalKg } from './alchemy'
import { runesOf } from './sigil'
import type { Catalyst, Pool, Rune, Sigil } from './types'

// Catalysts are the game's jokers and relics: passive modifiers held for the
// run. The prototype has one for each of three archetypes (see DESIGN.md,
// Archetypes).

export interface CatalystSpec {
  name: string
  archetype: string
  effect: string
}

/** Ward each time a rune returns to hand. */
export const PELICAN_WARD = 2
/** Aqua vitae: the share of the amalgam that must be medium or purer, and the power it gives every rune. */
export const AQUA_VITAE = { share: 0.8, power: 3 }
/** Power every rune gains for each rune burned this commission. */
export const CAPUT_POWER = 1

export const CATALYSTS: Record<Catalyst, CatalystSpec> = {
  pelican: { name: 'Pelican', archetype: 'Combo', effect: `+${PELICAN_WARD} Ward each time a rune returns to hand` },
  'aqua-vitae': {
    name: 'Aqua vitae',
    archetype: 'Purity maxing',
    effect: `While ${AQUA_VITAE.share * 100}% of the amalgam is medium or purer, every rune has +${AQUA_VITAE.power} power`,
  },
  'caput-mortuum': {
    name: 'Salt of the caput mortuum',
    archetype: 'Deck thinning',
    effect: `Every rune has +${CAPUT_POWER} power for each rune burned this commission`,
  },
}

export const CATALYST_LIST = Object.keys(CATALYSTS) as Catalyst[]

/** The share of the amalgam's kilos that are medium or purer. */
export function refinedShare(pools: Pool[]): number {
  const total = totalKg(pools)
  return total > 0 ? pools.filter((p) => p.grade >= 1).reduce((s, p) => s + p.kg, 0) / total : 0
}

/** Power every rune gains from the catalysts as things stand. */
export function catalystPower(catalysts: Catalyst[], pools: Pool[], burned: number): number {
  let bonus = 0
  if (catalysts.includes('aqua-vitae') && refinedShare(pools) >= AQUA_VITAE.share) bonus += AQUA_VITAE.power
  if (catalysts.includes('caput-mortuum')) bonus += CAPUT_POWER * burned
  return bonus
}

/**
 * Each rune's power in this sigil: its own, plus the catalysts' bonus, plus
 * resonance for every other rune of its element, plus press for the Ward held.
 */
export function effectiveSigil(sigil: Sigil, bonus: number, held = 0): Sigil {
  const runes = runesOf(sigil)
  if (bonus === 0 && !runes.some((r) => r.resonance > 0 || r.press > 0)) return sigil
  const lift = (r: Rune): Rune => {
    const kin = r.affinity === 'none' ? 0 : runes.filter((o) => o !== r && o.affinity === r.affinity).length
    const power = r.power + bonus + r.resonance * kin + Math.round(r.press * held * 10) / 10
    return power === r.power ? r : { ...r, power }
  }
  return { anchor: lift(sigil.anchor), joins: sigil.joins.map((j) => ({ ...j, rune: lift(j.rune) })) }
}
