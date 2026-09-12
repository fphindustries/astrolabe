import * as z from 'zod';

import { EventIdSchema } from '../ids.js';

/**
 * One narration type, not five. The recap (Beat 1), the scene frame
 * (Beat 2), beat narration and the session summary (Beat 10) differ by
 * role, not by shape, and the log renders them identically.
 *
 * `groundedIn` points at the `oracle.rolled` events that informed the
 * passage — the AI declares which rolls it used, which is what lets the
 * oracle chips sit under the narration they inspired (D-17). It is a
 * forward link written by the author rather than inferred from the command
 * grouping, because a command can contain rolls the passage did not use.
 */
export const NarrationWrittenSchema = z.object({
  role: z.enum(['recap', 'scene_frame', 'beat', 'summary']),
  text: z.string().min(1),
  groundedIn: z.array(EventIdSchema),
});

/**
 * A15 / Beat 9, the player's half: flagging a passage, with the note that
 * says what is wrong with it. "Rook is a veteran, annoyed rather than
 * rattled."
 *
 * Two events rather than one, because the note is player-authored and the
 * rewrite is AI-authored — the same authority seam as everywhere else.
 * A15's "one action" is a property of the UI: one click writes this event
 * and triggers the rewrite.
 */
export const NarrationCorrectionRequestedSchema = z.object({
  targetEventId: EventIdSchema,
  note: z.string().min(1),
});

/**
 * A15 / Beat 9, the AI's half. D-73: the corrected passage replaces the
 * original in the rendered log, marked with an affordance that opens the
 * original and the player's note — **both are retained as events**, which
 * is why this references the original rather than superseding it in place.
 *
 * Projection resolves a passage to its latest non-voided revision.
 */
export const NarrationRevisedSchema = z.object({
  targetEventId: EventIdSchema,
  text: z.string().min(1),
});
