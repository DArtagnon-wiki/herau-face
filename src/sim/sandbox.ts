import { normalize } from './alchemy'
import type { Target } from './commission'
import { makeRune, reforge, type Forge, type RuneSpec } from './deck'
import { allRunes, machinesOn, type GameState } from './game'
import type { Pool, Rune } from './types'

// Sandbox edits to a commission in progress. Each returns a new state; the
// pools, table and quintessence are left alone.

const everywhere = (state: GameState, fn: (r: Rune) => Rune | null): GameState => {
  const map = (rs: Rune[]) => rs.map(fn).filter((r): r is Rune => r !== null)
  // Table machines hold runes too: a machine whose anchor goes comes off the table, its other runes to the discard pile.
  if (!machinesOn(state)) return { ...state, hand: map(state.hand), draw: map(state.draw), discard: map(state.discard) }
  const loose: Rune[] = []
  const table = state.table.flatMap((t) => {
    const anchor = fn(t.sigil.anchor)
    const joins = t.sigil.joins.map((j) => ({ ...j, rune: fn(j.rune) })).filter((j): j is typeof j & { rune: Rune } => j.rune !== null)
    if (anchor) return [{ ...t, sigil: { anchor, joins } }]
    loose.push(...joins.map((j) => j.rune))
    return []
  })
  return { ...state, hand: map(state.hand), draw: map(state.draw), discard: [...map(state.discard), ...loose], table }
}

/** Change body or mote numbers; every rune in the deck takes them at once. */
export function setForge(state: GameState, forge: Forge): GameState {
  return { ...everywhere(state, (r) => reforge(r, forge)), forge }
}

const nextId = (state: GameState) => Math.max(0, ...allRunes(state).map((r) => r.id)) + 1

/** Make a new rune and put it in the hand. It joins the deck from then on. */
export function addRune(state: GameState, spec: RuneSpec): GameState {
  return { ...state, hand: [...state.hand, makeRune(nextId(state), spec, state.forge)] }
}

/** Change a rune's body or motes, wherever it is in the deck. */
export function editRune(state: GameState, id: number, spec: RuneSpec): GameState {
  return everywhere(state, (r) => (r.id === id ? makeRune(id, spec, state.forge) : r))
}

export function removeRune(state: GameState, id: number): GameState {
  return everywhere(state, (r) => (r.id === id ? null : r))
}

/** The whole deck as specs, for starting the next commission with the same runes. */
export function deckSpecs(state: GameState): RuneSpec[] {
  return allRunes(state)
    .filter((r) => !r.junk)
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ body: r.body, motes: r.motes.slice(), ...(r.rarity !== 'common' ? { rarity: r.rarity } : {}), ...(r.ownPower !== undefined ? { power: r.ownPower } : {}) }))
}

export const findRune = (state: GameState, id: number): { rune: Rune; at: 'hand' | 'draw' | 'discard' } | undefined => {
  for (const at of ['hand', 'draw', 'discard'] as const) {
    const rune = state[at].find((r) => r.id === id)
    if (rune) return { rune, at }
  }
  return undefined
}

/** Replace the amalgam with a new composition; it also becomes the starting composition for restarts. */
export function setComposition(state: GameState, pools: Pool[]): GameState {
  const next = normalize(pools)
  return { ...state, pools: next, start: next }
}

export function setTarget(state: GameState, target: Target): GameState {
  return { ...state, target }
}
