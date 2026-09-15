import * as z from 'zod';

import { EventIdSchema } from '../ids.js';

/**
 * D-15, D-143 (8.7): a weak hit whose outcome calls for a complication with
 * no menu. Both events are caused by the `move.invoked`, so voiding the
 * move takes them along (D-83).
 */

/**
 * The Guide's options, on request. Each is grounded in its own Action +
 * Theme roll pair, written in the same command. Asking again writes another
 * set; every set stays in the log (D-143, amended).
 */
export const ComplicationOfferedSchema = z.object({
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        groundedIn: z.array(EventIdSchema).min(1),
      }),
    )
    .min(1),
});

/**
 * The complication the player set: written by them, or picked from an
 * offer. `source` is `offered` only when the words are the offer's
 * unchanged; an edited pick is `written`, still naming the offer and option
 * it started from (D-143, amended).
 */
export const ComplicationSetSchema = z.object({
  text: z.string().min(1),
  source: z.enum(['written', 'offered']),
  offeredEventId: EventIdSchema.optional(),
  optionIndex: z.int().nonnegative().optional(),
});
