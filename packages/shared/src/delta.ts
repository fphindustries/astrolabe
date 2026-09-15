import * as z from 'zod';

import { CharacterIdSchema, ImpactIdSchema } from './ids.js';
import type { DeepReadonly } from './readonly.js';

/**
 * A `Delta` is one **resolved** change to one character's sheet: the rules
 * package's `Effect` after the server has decided who and how much.
 *
 * The two differ in exactly the ways that matter to the log:
 *
 * - An `Effect` targets `'actor' | 'aided_ally'`; a `Delta` names a
 *   concrete `CharacterId`. D-62's Aid Your Ally redirect is applied once,
 *   at write time, by `resolveEffectTarget` — not re-derived by every
 *   reader.
 * - An `Effect` may carry a range (`proposed_amount`); a `Delta` carries the
 *   number the player committed.
 * - `Effect` has kinds that are instructions rather than state changes —
 *   `oracle_roll` asks the server to roll, `proposed_amount` asks the AI for
 *   a number. Those produce their own events. They are not `Delta`s, and
 *   their absence here is the abstract/resolved split doing its job.
 * - **`Effect` has a `progress` kind and `Delta` does not.** Track movement
 *   goes through `track.advanced` instead, so that every tick on a vow,
 *   clock or expedition is one event type however it was caused. A track is
 *   its own aggregate with its own provenance display — Beat 8 wants
 *   hovering a clock to show who ticked it and why — and funnelling ticks
 *   through one type is what lets the tracker panel read one type. An
 *   outcome that both moves a meter and marks progress therefore writes two
 *   events in its command, which is the granularity rule working as
 *   intended.
 *
 * Deltas are relative, never absolute, so that voiding an upstream event
 * reprojects cleanly (design-event-log.md section 6). The one exception is
 * `state.overridden`, which is absolute because the player chose the number
 * outright — and that is a different event type, not a `Delta`.
 */

const MeterIdSchema = z.enum(['health', 'spirit', 'supply']);

export const DeltaSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('momentum'),
    characterId: CharacterIdSchema,
    delta: z.int(),
  }),
  /**
   * The bare fact of a reset. The value reset to is
   * `momentumResetValue(markedImpacts)` — projected state, so storing it
   * would go stale the moment an impact event upstream was voided.
   */
  z.object({
    kind: z.literal('momentum_reset'),
    characterId: CharacterIdSchema,
  }),
  z.object({
    kind: z.literal('meter'),
    characterId: CharacterIdSchema,
    meter: MeterIdSchema,
    delta: z.int(),
  }),
  z.object({
    kind: z.literal('bonus_next_move'),
    characterId: CharacterIdSchema,
    amount: z.int(),
    excludes: z.literal('progress_moves').optional(),
  }),
  z.object({
    kind: z.literal('impact'),
    characterId: CharacterIdSchema,
    impact: ImpactIdSchema,
    set: z.boolean(),
  }),
]);

export type Delta = DeepReadonly<z.infer<typeof DeltaSchema>>;
export type DeltaKind = Delta['kind'];
