import type { MoveCategoryId, MoveId } from '../schema/ids.js';
import type { Move } from '../schema/moves.js';
import type { RelevanceRule, SituationFlag } from '../schema/relevance.js';

/**
 * D-66: verified directly against every move in these six categories —
 * each has a broadly applicable trigger ("when you attempt something
 * risky", "when you assess a situation"...) with no fictional-positioning
 * requirement, so Milestone 1 treats the whole category as relevant
 * rather than situation-gating it. Combat, Exploration, Connection,
 * Legacy, Recover and Scene Challenge are not here — their moves need a
 * specific fictional positioning (a fight, a journey, a connection
 * present), which is exactly what the (currently empty) RelevanceRule
 * mechanism is for once Milestone 2 needs it.
 */
export const ALWAYS_RELEVANT_CATEGORIES: ReadonlySet<MoveCategoryId> = new Set([
  'session',
  'adventure',
  'quest',
  'fate',
  'suffer',
  'threshold',
]);

/**
 * A move without a rule falls back to its category's default. A move with
 * a rule that requires flags is relevant only when every required flag is
 * active — deliberately unreachable in Milestone 1's empty rule table, but
 * exercised in relevance.test.ts against a synthetic rule so the mechanism
 * itself is proven before anything depends on it.
 */
export function isMoveRelevant(
  move: Move,
  activeFlags: ReadonlySet<SituationFlag>,
  rule: RelevanceRule | undefined,
): boolean {
  if (rule !== undefined && rule.requires.length > 0) {
    return rule.requires.every((flag) => activeFlags.has(flag));
  }
  return ALWAYS_RELEVANT_CATEGORIES.has(move.category);
}

/** Applies a resolved move's flag effects: clears first, then sets, so a flag in both ends up set. */
export function applyRelevanceEffects(
  activeFlags: ReadonlySet<SituationFlag>,
  rule: RelevanceRule,
): ReadonlySet<SituationFlag> {
  const next = new Set(activeFlags);
  for (const flag of rule.clears) {
    next.delete(flag);
  }
  for (const flag of rule.sets) {
    next.add(flag);
  }
  return next;
}

/** Filters a move list down to the ones the panel should highlight right now. */
export function relevantMoves(
  moves: readonly Move[],
  activeFlags: ReadonlySet<SituationFlag>,
  rules: ReadonlyMap<MoveId, RelevanceRule>,
): readonly Move[] {
  return moves.filter((move) => isMoveRelevant(move, activeFlags, rules.get(move.id)));
}
