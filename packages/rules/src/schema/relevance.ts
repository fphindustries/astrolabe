import type { MoveId } from './ids.js';

/**
 * A campaign-scoped situation flag — moves set and clear them, other
 * moves require them to be relevant (design record section 5, D-25).
 * Opaque here; a concrete flag is just a stable string a rule and the
 * events that set/clear it agree on.
 */
export type SituationFlag = string & { readonly __brand: 'SituationFlag' };

/**
 * D-66: Milestone 1 exercises none of this — every move in the six
 * always-relevant categories (relevance.ts's ALWAYS_RELEVANT_CATEGORIES)
 * has a broadly applicable trigger with no fictional-positioning
 * requirement, verified directly. The mechanism exists for Milestone 2's
 * Enter the Fray and beyond; `requires`/`sets`/`clears` are all empty in
 * every Milestone 1 rule (there are none).
 */
export interface RelevanceRule {
  readonly moveId: MoveId;
  /** Every flag here must be active for this move to be relevant. */
  readonly requires: readonly SituationFlag[];
  /** Flags this move sets when it resolves. */
  readonly sets: readonly SituationFlag[];
  /** Flags this move clears when it resolves. */
  readonly clears: readonly SituationFlag[];
}
