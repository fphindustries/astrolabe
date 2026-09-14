import * as z from 'zod';

import { CharacterIdSchema, EventIdSchema, MoveIdSchema } from '../ids.js';

/**
 * A13 / D-16 / Beat 7: a `proposed_amount` effect (Endure Harm's harm
 * intake) committed by the player. This is the fact of the commitment, not
 * the mechanical change — the accompanying `state.changed` carries the
 * meter delta itself, under a `preroll_effect` cause, because a `preRoll`
 * effect precedes any tier and so has no outcome tier to cite (cause.ts).
 *
 * No `invocationEventId`: a preRoll amount is committed in the same command
 * as the `move.invoked` it belongs to — the roll cannot happen until it is
 * — so the shared envelope `commandId` already links them (move.ts's
 * `MoveMethodChosenSchema` comment has the fuller version of this reasoning).
 *
 * The AI's proposal is its own event, `amount.proposed` below (D-118): the
 * proposal and the commitment are two authorities' decisions, and the
 * player may commit a number without ever waiting for a proposal.
 */
export const AmountCommittedSchema = z.object({
  moveId: MoveIdSchema,
  characterId: CharacterIdSchema,
  meter: z.enum(['health', 'spirit', 'supply']),
  amount: z.int(),
  /**
   * D-130: the Guide's proposal this amount was committed against, checked
   * on write (same move, character and meter; not voided). Its injury is
   * the fiction the passage narrates, at this amount's severity. A payload
   * reference, not `causedBy`: a standalone suffer move's proposal is
   * written before the move, and D-110's walk to the root move would climb
   * into it. Absent when the player committed before a proposal arrived.
   */
  proposalEventId: EventIdSchema.optional(),
});

/**
 * A13 / D-16 / D-118 / Beat 7, the AI's half: "−2, a ruptured conduit
 * sprays sparks across Rook's arm". The amount is within the
 * `proposed_amount` effect's declared range, checked on write.
 *
 * D-130 splits the fiction in two. `injury` is what physically happens and
 * where, with no words for severity; it is established once, here, and the
 * passage narrates it whatever amount the player commits. `reason` is why
 * the Guide judged this severity, and is never passed to narration, so the
 * prose can't follow a number the player overrode. `injury` is optional
 * only because proposals written before D-130 have none.
 *
 * Written as its own command, caused by whatever opened the harm intake
 * (the Pay the Price chain), so voiding that chain removes the proposal
 * with it.
 */
export const AmountProposedSchema = z.object({
  moveId: MoveIdSchema,
  characterId: CharacterIdSchema,
  meter: z.enum(['health', 'spirit', 'supply']),
  amount: z.int(),
  injury: z.string().min(1).optional(),
  reason: z.string().min(1),
});
