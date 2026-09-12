import * as z from 'zod';

import type { CharacterId } from '@astrolabe/rules';

import {
  CampaignIdSchema,
  CharacterIdSchema,
  CommandIdSchema,
  EventIdSchema,
  PlayerIdSchema,
  SceneIdSchema,
  SessionIdSchema,
  type CampaignId,
  type CommandId,
  type EventId,
  type SceneId,
  type SessionId,
} from './ids.js';
import type { DeepReadonly } from './readonly.js';

/**
 * The common event envelope (design record section 9, design-event-log.md
 * section 3). Every event carries it; `payload` is what varies by type.
 */

/**
 * Who authored the event. This is the single discriminator A16 needs: the
 * UI shows a `player` change (a manual override) differently from a
 * `system` one (the rules engine applying an outcome), and `ai` marks
 * everything the Guide owns under section 3 — NPCs, clocks, narration.
 */
export const ActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), playerId: PlayerIdSchema }),
  z.object({ kind: z.literal('ai') }),
  z.object({ kind: z.literal('system') }),
]);

export type Actor = DeepReadonly<z.infer<typeof ActorSchema>>;
export type ActorKind = Actor['kind'];

/**
 * Milestone 1 is single-player, so every event is visible to the whole
 * table. The field exists now so multiplayer adds values to an enum rather
 * than a column to a table with campaigns already in it.
 */
export const VisibilitySchema = z.literal('table');
export type Visibility = z.infer<typeof VisibilitySchema>;

/**
 * Timestamps travel as ISO 8601 strings, not `Date`s: they are assigned
 * once at write time and never re-read by the projector, which is banned
 * from touching `Date` at all (see the lint rule covering
 * `server/src/projection`). A string also crosses the wire unchanged.
 */
export const TimestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

/**
 * The envelope, minus `type` and `payload` — those are added per event type
 * by `events/index.ts`, which is what makes the full event schema a
 * discriminated union over `type`.
 */
export const EnvelopeFieldsSchema = z.object({
  campaignId: CampaignIdSchema,
  /**
   * Per-campaign, gapless, server-assigned. A `bigint` in Postgres, a
   * `number` here: 2^53 events in one campaign is not a reachable number,
   * and a bigint would not survive JSON.
   */
  seq: z.int().positive(),
  id: EventIdSchema,
  /** The request that wrote this event — idempotency key, beat grouping, and minimum void unit. */
  commandId: CommandIdSchema,
  /**
   * The event that caused this one, across commands. **Server-assigned
   * only.** A client able to supply it could forge causality and steer what
   * a void cascades over (design-event-log.md section 5).
   */
  causedBy: EventIdSchema.nullable(),
  /** Null for campaign setup, which happens before session 1. */
  sessionId: SessionIdSchema.nullable(),
  /** D-71: one scene per session in Milestone 1. */
  sceneId: SceneIdSchema.nullable(),
  actor: ActorSchema,
  /** Which character this event concerns, where that is a single character. */
  subjectCharacterId: CharacterIdSchema.nullable(),
  /** Payload schema version, per type. See versioning.ts. */
  version: z.int().positive(),
  visibility: VisibilitySchema,
  occurredAt: TimestampSchema,
});

export interface EnvelopeFields {
  readonly campaignId: CampaignId;
  readonly seq: number;
  readonly id: EventId;
  readonly commandId: CommandId;
  readonly causedBy: EventId | null;
  readonly sessionId: SessionId | null;
  readonly sceneId: SceneId | null;
  readonly actor: Actor;
  readonly subjectCharacterId: CharacterId | null;
  readonly version: number;
  readonly visibility: Visibility;
  readonly occurredAt: Timestamp;
}
