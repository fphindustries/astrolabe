import * as z from 'zod';

import { CharacterIdSchema, MoveIdSchema } from '../ids.js';

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
 * No `amount.proposed` yet: Milestone 1 has no AI provider (group 7) to
 * propose a number from the fiction. The composer shows a deterministic
 * placeholder (the effect's declared range's midpoint, labelled as a
 * placeholder, never as the AI's words) that the player adjusts before
 * committing — group 7 adds a real `amount.proposed` event and wires the
 * placeholder over to it additively, the same shape as D-101/D-102.
 */
export const AmountCommittedSchema = z.object({
  moveId: MoveIdSchema,
  characterId: CharacterIdSchema,
  meter: z.enum(['health', 'spirit', 'supply']),
  amount: z.int(),
});
