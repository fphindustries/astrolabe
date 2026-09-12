import * as z from 'zod';

import { DeltaSchema } from './delta.js';
import { MoveIdSchema } from './ids.js';
import type { DeepReadonly } from './readonly.js';

/**
 * Why a state change happened. Carried by every event that moves a number,
 * so the UI can always answer "why did this change?" in the same beat that
 * caused it (design record section 12).
 *
 * More kinds arrive with the features that produce them — a move's inline
 * choice, a committed harm amount. Adding one fails the compile at every
 * exhaustive switch over this union, which is the point.
 */
export const ChangeCauseSchema = z.discriminatedUnion('kind', [
  /** The rules engine applying an Automated move's outcome spec. */
  z.object({
    kind: z.literal('move_outcome'),
    moveId: MoveIdSchema,
    tier: z.enum(['strong_hit', 'weak_hit', 'miss']),
  }),
  /** A8 / Beat 5: the player accepted the burn offer. */
  z.object({ kind: z.literal('momentum_burn') }),
  /**
   * A14 / Beat 8: the AI acting under its own authority — creating or
   * ticking a clock, for instance. The reason is required, because section
   * 3 grants the AI clocks only "always visible with a stated reason".
   */
  z.object({ kind: z.literal('ai_judgement'), reason: z.string().min(1) }),
]);

export type ChangeCause = DeepReadonly<z.infer<typeof ChangeCauseSchema>>;

/**
 * One delta plus the exact clause of rule text it implements — the log's
 * half of the traceability non-negotiable.
 *
 * `rules` enforces the other half at build time: every `TracedEffect.clause`
 * in a `MoveAutomation` spec is checked to be a verbatim substring of the
 * imported move text (`isVerbatimClause`). Carrying that clause forward into
 * the event means "every automated rule behaviour is traceable to the rule
 * entry that triggered it" holds in the log too, and a player asking why
 * they lost a point of momentum gets the sentence that says so.
 *
 * Optional because a change under `ai_judgement` implements no rule clause;
 * it has a stated reason on the cause instead.
 */
export const TracedDeltaSchema = z.object({
  delta: DeltaSchema,
  clause: z.string().min(1).optional(),
});

export type TracedDelta = DeepReadonly<z.infer<typeof TracedDeltaSchema>>;
