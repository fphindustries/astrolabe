import * as z from 'zod';

/**
 * D-75: each AI call appends an event carrying its input and output token
 * counts, so the session token counter (D-51, A18's sibling requirement) is
 * a projection over those events and survives reload and resumption.
 *
 * Separate from the content it produced, because plenty of calls produce no
 * narration at all — "What now?" suggestions, complication options, the
 * harm proposal — and per-call accounting needs one uniform type to sum
 * over.
 *
 * **Exempt from void** (D-85). An `ai.completed` inside a voided cascade
 * still counts toward the session total: the tokens were spent whatever the
 * fiction now says, and a counter that un-spends them would lie about cost.
 */
export const AiCompletedSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  /** What the call was for — "recap", "scene_frame", "complication_options". */
  purpose: z.string().min(1),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  latencyMs: z.int().nonnegative().optional(),
});
