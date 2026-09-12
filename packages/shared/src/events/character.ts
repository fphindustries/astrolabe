import * as z from 'zod';

import { AssetIdSchema, CharacterIdSchema } from '../ids.js';

/**
 * A meter's value **and its bounds**, snapshotted onto the character.
 *
 * The bounds are the point. `ConditionMeterDef.min/max` lives in
 * `STARFORGED.gameRules`, which is versioned rules *content*, and the
 * projector is not allowed to read it (design-event-log.md section 2). So
 * creation records the bounds and projection clamps against what it finds
 * on the character. This is also the shape later assets need, when one
 * raises a character's maximum supply above the rulebook default.
 */
export const MeterSnapshotSchema = z.object({
  value: z.int(),
  min: z.int(),
  max: z.int(),
});

/** The five stats a character sheet carries. Reused by the creation-request schema (task 3.2) so the wire shape and the event payload cannot drift apart. */
export const CharacterStatsSchema = z.object({
  edge: z.int(),
  heart: z.int(),
  iron: z.int(),
  shadow: z.int(),
  wits: z.int(),
});

export const CharacterCreatedSchema = z.object({
  characterId: CharacterIdSchema,
  name: z.string().min(1),
  callsign: z.string().min(1),
  stats: CharacterStatsSchema,
  meters: z.object({
    health: MeterSnapshotSchema,
    spirit: MeterSnapshotSchema,
    supply: MeterSnapshotSchema,
  }),
  /**
   * The starting value only. Momentum's maximum and its reset value are
   * *derived* each projection from marked impacts (D-74, D-78, D-79) rather
   * than stored, because they are current-rules bounds and not historical
   * facts. Store facts, derive bounds.
   */
  momentum: z.int(),
  assets: z.array(AssetIdSchema),
});
