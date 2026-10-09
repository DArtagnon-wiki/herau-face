import { makeRune, reforge, type Forge, type RuneSpec } from './deck'
import type { GameState } from './game'
import type { Rune } from './types'

// Sandbox edits to a commission in progress. Each returns a new state; the
// pools, table and quintessence are left alone.

const everywhere = (state: GameState, fn: (r: Rune) => Rune | null): GameState => {
  const map = (rs: Rune[]) => rs.map(fn).filter((r): r is Rune => r !== null)
  return { ...state, hand: map(state.hand), draw: map(state.draw), discard: map(state.discard) }
}

/** Change body or mote numbers; every rune in the deck takes them at once. */
export function setForge(state: GameState, forge: Forge): GameState {
  return { ...everywhere(state, (r) => reforge(r, forge)), forge }
}

const nextId = (state: GameState) => Math.max(0, ...[...state.hand, ...state.draw, ...state.discard].map((r) => r.id)) + 1

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
  return [...state.hand, ...state.draw, ...state.discard]
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ body: r.body, motes: r.motes.slice() }))
}

export const findRune = (state: GameState, id: number): { rune: Rune; at: 'hand' | 'draw' | 'discard' } | undefined => {
  for (const at of ['hand', 'draw', 'discard'] as const) {
    const rune = state[at].find((r) => r.id === id)
    if (rune) return { rune, at }
  }
  return undefined
}
