import * as z from 'zod';

import type { CharacterId, TrackId } from '@astrolabe/rules';

import { CharacterStatsSchema } from './events/character.js';
import { ChallengeRankSchema } from './events/track.js';
import { AssetIdSchema, CommandIdSchema, type CampaignId } from './ids.js';
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
