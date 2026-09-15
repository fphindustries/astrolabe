import * as z from 'zod';

import { ChangeCauseSchema, TracedDeltaSchema } from '../cause.js';
import { CharacterIdSchema, TrackIdSchema } from '../ids.js';

/**
 * Every automated change to a character's sheet. One event per outcome, not
 * one per effect: the effects of a single outcome are atomic, share a cause,
 * and always void together.
 */
export const StateChangedSchema = z.object({
  cause: ChangeCauseSchema,
  changes: z.array(TracedDeltaSchema).min(1),
});

/**
 * What a manual override can point at. D-26 and A16 scope this to "any
 * meter, track, or clock" — momentum included, since Beat 9's override is
 * Juno's momentum. Impacts are deliberately absent: they are not on that
 * list, and a boolean does not fit the `from`/`to` shape the UI shows.
 */
const OverrideTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('momentum'), characterId: CharacterIdSchema }),
  z.object({
    kind: z.literal('meter'),
    characterId: CharacterIdSchema,
    meter: z.enum(['health', 'spirit', 'supply']),
  }),
  /** Vows, clocks and expeditions alike — a clock is a track (D-26's "or clock"). */
  z.object({ kind: z.literal('track'), trackId: TrackIdSchema }),
]);

/**
 * A16 / Beat 9: the player editing state directly. Written by `player`
 * authority, which is exactly what makes it visually distinct from an
 * automated change downstream — `actor.kind` carries through to
 * `lastChangedBy` on the projected field.
 *
 * Applied as an **absolute set**, never a delta. The player said "4", and
 * that is a pure function of their own decision rather than of prior state,
 * so it survives an upstream void unchanged — which is semantically right:
 * voiding an earlier roll should change the value *before* the override,
 * not what the player set it to.
 *
 * `from` is a write-time display value ("+3 → +4"). Projection never gates
 * on it: once a void has reprojected the log it is legitimately stale.
 */
export const StateOverriddenSchema = z.object({
  target: OverrideTargetSchema,
  from: z.int(),
  to: z.int(),
  reason: z.string().optional(),
});
