import * as z from 'zod';

import type { CharacterId, TrackId } from '@astrolabe/rules';

import { CampaignSettingsSchema } from './events/campaign.js';
import { CharacterStatsSchema } from './events/character.js';
import { ChallengeRankSchema } from './events/track.js';
import {
  AssetIdSchema,
  CampaignIdSchema,
  CommandIdSchema,
  EntityIdSchema,
  OracleIdSchema,
  type CampaignId,
  type EntityId,
} from './ids.js';
import type { CampaignState, NarrativeLog } from './read-models/index.js';

/**
 * HTTP response envelopes for task 5.0's read API.
 *
 * These wrap the read-model shapes (`read-models/`) for the wire. They are
 * not zod schemas: the server is the trusted producer, and the client reads
 * them as plain data (design record §9 — the client renders state, sends
 * intent). Request bodies, starting with task 3.2's character-creation
 * command, are validated with zod on the server, because the server is
 * authoritative and a client is not (section 2's convention).
 */

export interface CampaignSummary {
  readonly id: CampaignId;
  readonly name: string;
}

export type CampaignListResponse = readonly CampaignSummary[];

/**
 * `headSeq` is the sequence number of the last event folded into `state`.
 * The client uses it to drop an out-of-order response — one command's
 * result arriving after a later one's.
 */
export interface CampaignStateResponse {
  readonly headSeq: number;
  readonly state: CampaignState;
}

export type NarrativeLogResponse = NarrativeLog;

/**
 * The body of `POST /campaigns/:id/characters` (task 3.2). `commandId` is
 * minted by the client for idempotency, the same key `appendCommand`
 * already expects (section 2). `campaignId` and `actor` are not part of the
 * body: the campaign comes from the route, and the server decides the actor
 * itself (Milestone 1 is single-player/no-auth — the same reasoning as
 * never accepting `causedBy` from a client).
 */
export const CreateCharacterRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  draft: z.object({
    name: z.string(),
    callsign: z.string(),
    stats: CharacterStatsSchema,
    assets: z.array(AssetIdSchema),
  }),
  backgroundVow: z.object({ title: z.string().min(1), rank: ChallengeRankSchema }).optional(),
  grantCommandVehicle: z.boolean().optional(),
});

export type CreateCharacterRequestBody = z.infer<typeof CreateCharacterRequestBodySchema>;

export interface CreateCharacterResponse {
  readonly characterId: CharacterId;
  readonly vowTrackId?: TrackId;
}

/**
 * The body of `POST /campaigns` (task 4.1). `commandId` is minted by the
 * client, same reasoning as the character-creation body. `settings` is
 * optional and partial — an omitted field falls back to
 * `DEFAULT_CAMPAIGN_SETTINGS` (task 4.5).
 *
 * `campaignId` is also minted client-side, unlike `characterId` (which the
 * server mints). This command is the one place a fresh server-minted ID
 * would be unsafe: it is also the row `campaigns.id`'s own primary key, so a
 * retry that re-minted it would insert a second, duplicate campaign rather
 * than colliding with anything. Minting it client-side, alongside
 * `commandId`, means a retry reuses both and collides on `campaigns.id`
 * instead of silently duplicating (see `campaign-commands.ts`'s note).
 */
export const CreateCampaignRequestBodySchema = z.object({
  campaignId: CampaignIdSchema,
  commandId: CommandIdSchema,
  name: z.string().min(1),
  settings: CampaignSettingsSchema.partial().optional(),
});

export type CreateCampaignRequestBody = z.infer<typeof CreateCampaignRequestBodySchema>;

export interface CreateCampaignResponse {
  readonly campaignId: CampaignId;
}

/**
 * The body of `POST /campaigns/:id/truths` (task 4.2). Which of `rowIndex`
 * or `text` matters depends on `source` — the server rejects a `'picked'`
 * request with no `rowIndex` and a `'written'` one with no `text` (see
 * `setTruth`'s note on why this isn't a discriminated union: a rolled
 * request carries neither).
 */
export const SetTruthRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  oracleId: OracleIdSchema,
  source: z.enum(['picked', 'rolled', 'written']),
  rowIndex: z.int().nonnegative().optional(),
  text: z.string().optional(),
});

export type SetTruthRequestBody = z.infer<typeof SetTruthRequestBodySchema>;

export interface SetTruthResponse {
  readonly text: string;
}

/** The body of `POST /campaigns/:id/sector/locations` (task 4.3). */
export const AddSectorLocationRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  name: z.string().min(1),
  description: z.string(),
});

export type AddSectorLocationRequestBody = z.infer<typeof AddSectorLocationRequestBodySchema>;

export interface AddSectorLocationResponse {
  readonly locationId: EntityId;
}

/** The body of `POST /campaigns/:id/sector/routes` (task 4.3, D-103). */
export const AddSectorRouteRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  fromLocationId: EntityIdSchema,
  toLocationId: EntityIdSchema,
});

export type AddSectorRouteRequestBody = z.infer<typeof AddSectorRouteRequestBodySchema>;

/**
 * The body of `POST /campaigns/:id/inciting-vow` (task 4.4, D-34, D-101).
 * No `characterId` field yet: the player-written path this task builds
 * always swears a crew-level vow, matching the golden session's own
 * inciting vow. A per-character option waits for whatever UI decision
 * accompanies the AI-proposal path this defers.
 */
export const SwearIncitingVowRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  title: z.string().min(1),
  rank: ChallengeRankSchema,
});

export type SwearIncitingVowRequestBody = z.infer<typeof SwearIncitingVowRequestBodySchema>;

export interface SwearIncitingVowResponse {
  readonly vowTrackId: TrackId;
}
