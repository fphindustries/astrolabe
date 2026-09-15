import * as z from 'zod';

import { EventIdSchema, SessionIdSchema } from '../ids.js';

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
  /** D-149: the Guide's proposal the player committed, edited or not. */
  proposalEventId: EventIdSchema.optional(),
});

/**
 * D-149: End a Session's first step. The Guide proposes a summary and open
 * threads from the session's significant events; the player reviews them,
 * may edit either, and commits `session.ended`. It changes nothing itself.
 */
export const SessionSummaryProposedSchema = z.object({
  summary: z.string().min(1),
  openThreads: z.array(z.string().min(1)).min(2).max(5),
});
