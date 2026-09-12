import * as z from 'zod';

import type { AssetId, CharacterId, MoveId, OracleId, RecipeId, TrackId } from '@astrolabe/rules';

/**
 * Identifiers the event log issues, and the zod schemas that validate them.
 *
 * Two families, deliberately distinct:
 *
 * - **Log identifiers** (below) are minted by the server at write time and
 *   are always uuids. `CharacterId` and `TrackId` are declared in `rules`
 *   (schema/ids.ts) because the rules engine takes them as arguments, but
 *   the event log is what actually issues them — see that file's closing
 *   comment.
 * - **Rule identifiers** (`MoveId`, `OracleId`, …) are minted by the
 *   Datasworn adapter and are prefixed strings, not uuids. Events reference
 *   them but never create them.
 *
 * Every ID type in both families is branded, so the compiler will not let a
 * `SessionId` stand in for a `SceneId` or a `MoveId` for an `OracleId`.
 */

export type CampaignId = string & { readonly __brand: 'CampaignId' };
export type EventId = string & { readonly __brand: 'EventId' };
export type CommandId = string & { readonly __brand: 'CommandId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type SceneId = string & { readonly __brand: 'SceneId' };
export type EntityId = string & { readonly __brand: 'EntityId' };

/** The player identifier. Milestone 1 has no auth (D-52), so it is a constant. */
export type PlayerId = string & { readonly __brand: 'PlayerId' };

/**
 * The single local player Milestone 1 attributes every player-authored event
 * to. Multiplayer (Milestone 3) replaces this with an identity from
 * Authentik; nothing but the source of the value changes, because `actor`
 * already carries a `playerId` on every event (design record section 9).
 */
export const LOCAL_PLAYER_ID = 'local' as PlayerId;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A branded uuid. `z.custom` rather than `z.uuid().transform(...)` so the
 * result is a plain `ZodType<T>` and not a pipe — pipes are awkward inside
 * `z.discriminatedUnion`, which every payload eventually sits in.
 */
function uuidId<T extends string>(label: string): z.ZodType<T> {
  return z.custom<T>((value) => typeof value === 'string' && UUID_PATTERN.test(value), {
    message: `Expected ${label} to be a uuid`,
  });
}

/** A branded rule ID: an adapter-minted, prefixed string (design record D-21). */
function prefixedId<T extends string>(prefix: string): z.ZodType<T> {
  return z.custom<T>((value) => typeof value === 'string' && value.startsWith(`${prefix}:`), {
    message: `Expected an ID beginning with "${prefix}:"`,
  });
}

export const CampaignIdSchema = uuidId<CampaignId>('a campaign ID');
export const EventIdSchema = uuidId<EventId>('an event ID');
export const CommandIdSchema = uuidId<CommandId>('a command ID');
export const SessionIdSchema = uuidId<SessionId>('a session ID');
export const SceneIdSchema = uuidId<SceneId>('a scene ID');
export const EntityIdSchema = uuidId<EntityId>('an entity ID');
export const CharacterIdSchema = uuidId<CharacterId>('a character ID');
export const TrackIdSchema = uuidId<TrackId>('a track ID');

export const PlayerIdSchema = z.custom<PlayerId>(
  (value) => typeof value === 'string' && value.length > 0,
  { message: 'Expected a player ID' },
);

export const MoveIdSchema = prefixedId<MoveId>('move');
export const OracleIdSchema = prefixedId<OracleId>('oracle');
export const AssetIdSchema = prefixedId<AssetId>('asset');
export const RecipeIdSchema = prefixedId<RecipeId>('recipe');

/**
 * Impacts are referenced by their rule ID, but unlike the others an impact
 * ID is also a projected-state key, so it is validated the same way and
 * re-exported here for symmetry with the rest.
 */
export const ImpactIdSchema = prefixedId<`impact:${string}`>('impact');
