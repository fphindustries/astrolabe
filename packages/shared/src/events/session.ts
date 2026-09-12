import * as z from 'zod';

import { SessionIdSchema } from '../ids.js';

export const SessionBeganSchema = z.object({
  sessionId: SessionIdSchema,
  /** 1-based. The golden session is session 2 of its campaign. */
  number: z.int().positive(),
});

/**
 * A17: ending a session produces a summary and open threads that feed the
 * next session's recap. Both are AI-authored prose, and both are read back
 * by the recap query at the start of the following session (A1, D-72) —
 * which is why they are stored as structured fields rather than left inside
 * a narration passage.
 */
export const SessionEndedSchema = z.object({
  summary: z.string().min(1),
  openThreads: z.array(z.string().min(1)),
});
