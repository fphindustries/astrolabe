import { isMoveRelevant, type Move } from '@astrolabe/rules';

/**
 * The relevant-moves panel (task 6.1). Milestone 1's relevance is
 * category-only (D-66): the rule table is empty, so `isMoveRelevant` falls
 * straight back to `ALWAYS_RELEVANT_CATEGORIES` for every move. This module
 * exists anyway, separate from `moves.ts`'s full browser, so the panel's
 * filtering logic has one place to grow into once Milestone 2 gives
 * `RelevanceRule` its first real entry — nothing here should have to change
 * at the call site when that happens.
 */

export interface RelevantMoveItem {
  readonly id: Move['id'];
  readonly name: string;
}

export function relevantMoveItems(moves: readonly Move[]): readonly RelevantMoveItem[] {
  return moves
    .filter((move) => isMoveRelevant(move, new Set(), undefined))
    .map((move) => ({ id: move.id, name: move.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
