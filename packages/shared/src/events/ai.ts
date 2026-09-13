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
  /** Uncached input only. A cached call's reads and writes are counted separately (D-113). */
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative().optional(),
  cacheWriteTokens: z.int().nonnegative().optional(),
  latencyMs: z.int().nonnegative().optional(),
  /** Time to the first streamed text — what A18's five-second target measures. */
  firstTokenMs: z.int().nonnegative().optional(),
});

export const AiErrorKindSchema = z.enum([
  'unavailable',
  'auth',
  'rate_limited',
  'refused',
  'invalid_output',
  'not_configured',
]);

export type AiErrorKind = z.infer<typeof AiErrorKindSchema>;

/**
 * D-113 / D-116: an AI call that produced nothing usable — the provider was
 * unreachable, refused, or returned output that failed validation after its
 * re-ask. This is what pauses play (D-53); committed state is untouched,
 * because nothing mechanical ever waited on the call.
 *
 * Carries tokens when the failing attempt still spent some (a mid-stream
 * failure). Attempts that returned invalid output have already been
 * counted by their own `ai.completed`, so a validation failure records
 * `attempts` and no tokens.
 *
 * Exempt from void for the same reason `ai.completed` is (D-85).
 */
export const AiFailedSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  purpose: z.string().min(1),
  errorKind: AiErrorKindSchema,
  message: z.string().min(1),
  attempts: z.int().positive(),
  inputTokens: z.int().nonnegative().optional(),
  outputTokens: z.int().nonnegative().optional(),
});
