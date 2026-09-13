import * as z from 'zod';

import type { BurnOffer, CharacterId, MoveId, OutcomeTier, TrackId } from '@astrolabe/rules';

import { CampaignSettingsSchema } from './events/campaign.js';
import { CharacterStatsSchema } from './events/character.js';
import { RollAdjustmentSchema, RollUsingSchema } from './events/move.js';
import { ChallengeRankSchema } from './events/track.js';
import {
  AssetIdSchema,
  CampaignIdSchema,
  CharacterIdSchema,
  CommandIdSchema,
  EntityIdSchema,
  EventIdSchema,
  MoveIdSchema,
  OracleIdSchema,
  type CampaignId,
  type CommandId,
  type EntityId,
  type EventId,
} from './ids.js';
import type { EntityRef } from './meta.js';
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

/**
 * The move flow (task 6.x). The write API D-94 left for later: it did not
 * get its own task number in the list, and lands with 6.2, the first UI
 * that needs it.
 *
 * The trust boundary throughout mirrors `setTruth`'s: the client names
 * *which* stat/meter it is rolling with (`using`), never its numeric value
 * — the server reads that off the projection. `adds` carries only the
 * amounts a player is asserting from the fiction (an asset ability's text,
 * D-59's Guided level) or that the server cannot derive from state alone;
 * the base stat/meter add and any pending `bonusNextMove` are computed and
 * prepended server-side.
 */

/** The body of `POST /campaigns/:id/moves` (task 6.2). */
export const InvokeMoveRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  moveId: MoveIdSchema,
  actorCharacterId: CharacterIdSchema,
  /** D-62: Aid Your Ally is a flag on the invocation, not its own move. */
  aidingAllyId: CharacterIdSchema.optional(),
  using: RollUsingSchema.optional(),
  adds: z.array(RollAdjustmentSchema),
  actionText: z.string().optional(),
  /**
   * Endure Harm's harm intake (A13, D-16): required when the move's
   * automation declares a `preRoll`, committed in the same command as the
   * roll it precedes. The composer shows a deterministic placeholder (the
   * effect's declared range's midpoint) for the player to adjust — there is
   * no AI yet (group 7) to propose a real one.
   */
  preRollAmount: z.int().optional(),
  /**
   * Following an `offer` or `auto` chain from an earlier move (Face
   * Danger's miss offering Pay the Price; Pay the Price's table result
   * auto-chaining to Endure Harm): the `commandId` of the call that
   * produced the `move.chained` naming this move as its target — the same
   * id the client minted for that earlier call, not a new server-issued
   * reference. Checked against the log — a `chainedFromCommandId` that does
   * not match a real `move.chained` naming this `moveId` is rejected —
   * rather than accepted as `causedBy` outright (move.ts's own comment on
   * `MoveChainedSchema` has the full reasoning).
   */
  chainedFromCommandId: CommandIdSchema.optional(),
});

export type InvokeMoveRequestBody = z.infer<typeof InvokeMoveRequestBodySchema>;

export interface MoveChoiceOptionView {
  readonly id: string;
  readonly label: string;
  /** Evaluated server-side against the acting character's current state. */
  readonly available: boolean;
}

export interface MoveChoiceView {
  readonly moveId: MoveId;
  readonly tier: OutcomeTier;
  readonly choiceId: string;
  readonly prompt: string;
  readonly pick: { readonly min: number; readonly max: number };
  readonly optional: boolean;
  readonly options: readonly MoveChoiceOptionView[];
  /** The `dice.rolled` event this choice belongs to. */
  readonly rollEventId: EventId;
}

/**
 * No id to echo back: the client already knows the `commandId` it minted
 * for the call that produced this chain, and that is exactly what
 * `chainedFromCommandId` expects on the follow-up invocation.
 */
export interface MoveChainView {
  readonly toMoveId: MoveId;
  readonly mode: 'auto' | 'offer';
  readonly reason: string;
}

export interface ActionRollView {
  readonly kind: 'action';
  readonly actionDie: number;
  readonly adds: readonly { readonly amount: number; readonly label: string }[];
  readonly actionScore: number;
  readonly challengeDice: readonly [number, number];
  readonly tier: OutcomeTier;
  readonly isMatch: boolean;
  readonly burnOffer?: BurnOffer;
}

export interface InvokeMoveResponse {
  readonly invocationEventId: EventId;
  readonly rollEventId: EventId;
  readonly roll: ActionRollView;
  readonly pendingChoice?: MoveChoiceView;
  readonly chain?: MoveChainView;
}

/** The body of `POST /campaigns/:id/moves/choice` (task 6.6). */
export const ApplyMoveChoiceRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  rollEventId: EventIdSchema,
  choiceId: z.string().min(1),
  optionIds: z.array(z.string().min(1)),
});

export type ApplyMoveChoiceRequestBody = z.infer<typeof ApplyMoveChoiceRequestBodySchema>;

/** The body of `POST /campaigns/:id/moves/burn` (task 6.7, A8). */
export const BurnMomentumRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  rollEventId: EventIdSchema,
});

export type BurnMomentumRequestBody = z.infer<typeof BurnMomentumRequestBodySchema>;

export interface BurnMomentumResponse {
  readonly tierAfter: OutcomeTier;
}

/**
 * The body of `POST /campaigns/:id/pay-the-price` (task 6.8, D-08). No roll
 * inputs: Pay the Price is `no_roll` — the player picks a method, not a
 * stat.
 */
export const ResolvePayThePriceRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  actorCharacterId: CharacterIdSchema,
  optionId: z.enum(['obvious', 'oracle', 'table']),
  /** Following Face Danger/Gather Information/Secure an Advantage's miss offer. */
  chainedFromCommandId: CommandIdSchema.optional(),
});

export type ResolvePayThePriceRequestBody = z.infer<typeof ResolvePayThePriceRequestBodySchema>;

export interface ResolvePayThePriceResponse {
  readonly invocationEventId: EventId;
  readonly oracle?: { readonly roll: number; readonly rowText: string };
  readonly chain?: MoveChainView;
}

/**
 * Void-and-redo (task 6.10, A11, D-27, D-83, D-84). Two routes over the
 * same pure `planVoid`, mirroring `previewVoid`/`voidEvent`'s split in
 * `server/src/db/void-command.ts`: the player sees what a void would remove
 * before confirming it. These DTOs restate `VoidPreview`/`VoidRefusal`'s
 * shape rather than importing them — those live in `server`'s projection
 * layer, which `shared` must not depend on.
 *
 * The route always writes `kind: 'player_void'` — `'reroll'` is D-18/D-70's
 * AI-only mechanism, triggered server-side by the provider's own code
 * (group 8), never by a player-facing request.
 */
export interface VoidPreviewResponse {
  readonly ok: true;
  readonly targetEventId: EventId;
  readonly cascaded: readonly EventId[];
  readonly commands: readonly CommandId[];
  readonly summary: readonly string[];
}

export interface VoidRefusalResponse {
  readonly ok: false;
  readonly reason:
    | 'not_found'
    | 'not_voidable'
    | 'already_voided'
    | 'outside_current_session'
    | 'referenced_outside_cascade';
  readonly detail: string;
  readonly blockedBy?: readonly { readonly eventId: EventId; readonly ref: EntityRef }[];
}

export type VoidPreviewResult = VoidPreviewResponse | VoidRefusalResponse;

/** The body of `POST /campaigns/:id/events/:eventId/void` (task 6.10). */
export const VoidEventRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  reason: z.string().min(1),
});

export type VoidEventRequestBody = z.infer<typeof VoidEventRequestBodySchema>;

export interface VoidEventResponse {
  readonly cascaded: number;
}
