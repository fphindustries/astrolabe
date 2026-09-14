import * as z from 'zod';

import { AssetIdSchema, CharacterIdSchema, EventIdSchema } from '../ids.js';

import { ChallengeRankSchema } from './track.js';

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
  /** D-124: backstory hooks, from a concept-first proposal or written by hand. Optional, so no version bump. */
  hooks: z.array(z.string().min(1)).max(3).optional(),
  /** D-131: the player's words ("she/her"). Absent means not recorded, never a default. Optional, so no version bump. */
  pronouns: z.string().min(1).max(40).optional(),
});

/**
 * D-124: a concept-first proposal (task 3.3). Nothing here is canon — the
 * player reviews it, edits any field, and accepts through the ordinary
 * `character.created` path, which names this event as its cause.
 *
 * Every field carries a one-line reason (design record §6). The fields the
 * AI would otherwise invent — name, callsign, hooks — cite the
 * server-rolled `oracle.rolled` events in the same command that ground them
 * (D-123); the proposal command checks that each citation is one of its own
 * rolls.
 */
const ReasonSchema = z.string().min(1);
const GroundedInSchema = z.array(EventIdSchema);

export const CharacterProposedSchema = z.object({
  concept: z.string().min(1),
  name: z.object({ value: z.string().min(1), reason: ReasonSchema, groundedIn: GroundedInSchema }),
  callsign: z.object({
    value: z.string().min(1),
    reason: ReasonSchema,
    groundedIn: GroundedInSchema,
  }),
  stats: z.object({ value: CharacterStatsSchema, reason: ReasonSchema }),
  assets: z.array(z.object({ assetId: AssetIdSchema, reason: ReasonSchema })),
  backgroundVow: z.object({
    title: z.string().min(1),
    rank: ChallengeRankSchema,
    reason: ReasonSchema,
  }),
  hooks: z
    .array(
      z.object({ text: z.string().min(1), reason: ReasonSchema, groundedIn: GroundedInSchema }),
    )
    .min(1)
    .max(3),
  /** D-131: present only when the concept states pronouns; the AI never chooses them. */
  pronouns: z.object({ value: z.string().min(1).max(40), reason: ReasonSchema }).optional(),
});
