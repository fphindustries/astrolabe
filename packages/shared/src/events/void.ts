import * as z from 'zod';

import { EventIdSchema } from '../ids.js';

/**
 * A11 / D-27 / D-83. Voiding is itself an event: nothing in the log is ever
 * updated, and this way the log keeps who voided, when, and why.
 *
 * **`cascaded` is computed at write time and stored**, not recomputed
 * during projection. That keeps the fold pure, makes a void auditable
 * ("this removed these six events"), and means a later change to the
 * causality model cannot silently alter what an old void did.
 *
 * Two kinds share the mechanism:
 *
 * - `player_void` is A11's void-and-redo. Beat 7: the +edge roll is voided
 *   and redone with +iron. Its cascade covers the whole causal subtree —
 *   the invocation, the effects, any narration — and the void is refused
 *   outright if a non-voided event outside that subtree references an
 *   entity or track introduced inside it (D-83).
 * - `reroll` is D-18 and D-70's visible AI reroll. Beat 6: an oracle result
 *   contradicts the fiction, so the AI rerolls and the discarded chip stays
 *   struck through with its stated reason. Its cascade is empty by
 *   construction — nothing has consumed the result yet.
 *
 * Milestone 1 writes no reinstatement (D-86), so a void is never lifted.
 * The projector still folds void state as a *set* of active void ids rather
 * than a boolean, because that is the entire cost of keeping D-86
 * reversible: reinstating becomes "remove this void's id from the targets
 * in its list", with no change to the projector. A boolean would force a
 * rewrite, since last-writer-wins is wrong when two voids overlap.
 */
export const EventVoidedSchema = z.object({
  targetEventId: EventIdSchema,
  kind: z.enum(['player_void', 'reroll']),
  reason: z.string().min(1),
  /**
   * Every event this void suppresses, including the target itself. Note
   * that `ai.completed` events are never included: token accounting is
   * exempt from void, because the tokens were spent whatever the fiction
   * now says (D-85).
   */
  cascaded: z.array(EventIdSchema).min(1),
});
