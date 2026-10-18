// The simulated players' moves in a fight, shared by the run simulator and the
// balance simulator: every legal move, and greedy's pick among them.

import { RECIPES, canAfford, craft, playCard, poolTotal, wait, type Recipe, type Run } from '../src/circuits/engine'

export type Move = { kind: 'card'; id: number; discard?: number } | { kind: 'brew'; key: Recipe['key'] } | { kind: 'wait' }

export function moves(r: Run): Move[] {
  const out: Move[] = []
  for (const c of r.fight.hand) {
    const others = r.fight.hand.filter((x) => x.id !== c.id)
    // A card that discards: one move for each card it could throw away.
    if (c.channels.some((ch) => ch.element === 'discard') && others.length) for (const o of others) out.push({ kind: 'card', id: c.id, discard: o.id })
    else out.push({ kind: 'card', id: c.id })
  }
  for (const rec of RECIPES) if (canAfford(r.fight, rec)) out.push({ kind: 'brew', key: rec.key })
  out.push({ kind: 'wait' })
  return out
}

export const apply = (r: Run, m: Move): Run => (m.kind === 'card' ? playCard(r, m.id, m.discard) : m.kind === 'brew' ? craft(r, m.key) : wait(r))
/** What greedy makes of the statuses and spare time it would have: rough worth in purification. */
export function statusValue(r: Run): number {
  const f = r.fight
  const s = f.status
  const pool = poolTotal(f.pool)
  return (
    (s.settle * (s.settle + 1)) / 2 +
    1.5 * s.expose +
    2 * s.thorns +
    1.5 * s.starve +
    3 * (s.stall + f.pending) +
    (s.volatile ? 4 - 0.6 * pool : 0) +
    s.condense +
    s.mend * (s.mend + 1) +
    1.5 * s.retain +
    1.6 * s.foresight +
    2 * f.spare
  )
}

export function greedyValue(r: Run, start: Run): number {
  if (r.stage === 'lost') return -1e6
  if (r.stage !== 'fight') return 1e6 + r.quintessence
  const f = r.fight
  return f.purified - 3 * (start.quintessence - r.quintessence) - 0.6 * poolTotal(f.pool) + 10 * f.homunculi + 0.5 * f.ward + 0.8 * f.hand.length + 4 * (f.catalyst - 1) + statusValue(r)
}

export function greedyMove(r: Run): Move {
  let best: Move = { kind: 'wait' }
  let bestValue = -Infinity
  for (const m of moves(r)) {
    const v = greedyValue(apply(r, m), r)
    if (v > bestValue) {
      best = m
      bestValue = v
    }
  }
  return best
}

/** Play greedy until this fight ends. */
export function rollout(r: Run): Run {
  let x = r
  for (let guard = 0; guard < 400 && x.stage === 'fight' && x.fightIndex === r.fightIndex; guard++) x = apply(x, greedyMove(x))
  return x
}

