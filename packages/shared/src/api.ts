import * as z from 'zod';

import type {
  BurnOffer,
  CharacterId,
  MoveId,
  OracleId,
  OutcomeTier,
  TrackId,
} from '@astrolabe/rules';
import type { LaunchReadiness } from '@astrolabe/rules';

import type { AiErrorKind } from './events/ai.js';
import { CampaignSettingsSchema } from './events/campaign.js';
import { PLANET_CLASSES } from '@astrolabe/rules';

import { CharacterStatsSchema } from './events/character.js';
import { RollAdjustmentSchema, RollUsingSchema } from './events/move.js';
import { ChallengeRankSchema } from './events/track.js';
import {
  CreationProposalSchema,
  IncidentAcceptedSchema,
  LaunchAmendmentSchema,
  LaunchDraftSavedSchema,
  LaunchLocationDetailsSchema,
  LaunchRouteSchema,
  LaunchPlanetDetailsSchema,
  LaunchTroubleDetailsSchema,
  SharedStarshipSchema,
  type CreationTargetKind,
  type LaunchAmendmentSubject,
} from './events/launch.js';
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
  type SceneId,
  type SessionId,
} from './ids.js';
import type { PayloadFor } from './events/index.js';
import type { EntityRef } from './meta.js';
import type { CampaignState, NarrativeLog, OracleChip } from './read-models/index.js';

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
  /** D-150: the open session's move chains that no passage covers yet. */
  readonly owedPassages: readonly OwedPassage[];
}

/**
 * Why Campaign Launch is closed for a campaign. The same union types the 422
 * `reason` a launch command refuses with, so the field a client routes on and
 * the refusal it would otherwise earn share one vocabulary.
 */
export type LaunchClosedReason = 'campaign_active' | 'campaign_in_play';

/** The resumable Campaign Launch workspace; readiness is server-derived. */
export interface LaunchWorkspaceResponse {
  readonly headSeq: number;
  readonly state: CampaignState;
  readonly readiness: LaunchReadiness;
  /**
   * D-178: a campaign that has begun a session is in play whatever its phase
   * says, which is every Milestone 1 campaign. A43 routes on this rather than
   * on `phase`, and it is derived server-side so the client does not keep a
   * second copy of the rule (D-176's lesson).
   */
  readonly launchOpen: boolean;
  readonly closedReason?: LaunchClosedReason;
  /**
   * A41: the oracle rolls the launch's accepted facts cite, resolved by event
   * id. `groundedIn` carries ids; a chip needs the table and the result, and a
   * truth is not an entity, so the entity grounding endpoint cannot answer for
   * one. Beside the state, like `readiness`.
   */
  readonly chips: Readonly<Record<EventId, OracleChip>>;
}

/** D-150: a move chain committed without its passage, as the log offers to narrate it. */
export interface OwedPassage {
  readonly rootCommandId: CommandId;
  readonly moveId: MoveId;
  readonly actorCharacterId: CharacterId;
  readonly actionText?: string;
  /** D-143: set this first; narration refuses without it. */
  readonly complication?: { readonly moveCommandId: CommandId; readonly clause: string };
}

export type NarrativeLogResponse = NarrativeLog;

/**
 * `GET /campaigns/:id/entities/:entityId/grounding` (8.5): the oracle rolls
 * an entity was built from, as chips, with any a reroll discarded (D-70).
 * A read of its own rather than part of `CampaignState`, which stays
 * bounded.
 */
export interface EntityGroundingResponse {
  readonly chips: readonly OracleChip[];
}

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
  /** D-124: backstory hooks, proposed or written by hand. */
  hooks: z.array(z.string().trim().min(1)).max(3).optional(),
  /** D-131: free text; blank means not recorded. */
  pronouns: z.string().trim().max(40).optional(),
  /**
   * D-124: the proposal command this character was accepted from. The
   * server resolves it to the `character.proposed` event and records that as
   * the cause; the client never names an event id.
   */
  proposalCommandId: CommandIdSchema.optional(),
});

export type CreateCharacterRequestBody = z.infer<typeof CreateCharacterRequestBodySchema>;

export interface CreateCharacterResponse {
  readonly characterId: CharacterId;
  readonly vowTrackId?: TrackId;
}

export const CreateLaunchCharacterRequestBodySchema = CreateCharacterRequestBodySchema.extend({
  backgroundVow: z.object({ title: z.string().trim().min(1), rank: ChallengeRankSchema }),
  /**
   * The `oracle.rolled` events this character was built on (A41).
   *
   * Event ids, not oracle ids: the client cites rolls the server already made
   * and can never name a table of its own. A roll that turns out to be
   * something else resolves to no chip, so over-citing is harmless.
   */
  groundedIn: z.array(EventIdSchema).optional(),
  launch: z.object({
    appearance: z.string().trim().min(1),
    backstory: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('written'), text: z.string().trim().min(1) }),
      z.object({ kind: z.literal('discover_in_play') }),
    ]),
    signatureGear: z.string().trim().min(1).optional(),
  }),
});
export type CreateLaunchCharacterRequestBody = z.infer<
  typeof CreateLaunchCharacterRequestBodySchema
>;

/**
 * The body of `PUT /campaigns/:id/launch/crew/:characterId` (6.0d).
 *
 * The same shape acceptance takes, minus the fields the server decides for
 * itself. `characterId` comes from the route, and `supersedesEventId` is never
 * in the body: the server reads it from the projected character, because a
 * client that could name what it supersedes could rewrite a different
 * revision's place in the chain.
 */
export const ReviseLaunchCharacterRequestBodySchema = CreateLaunchCharacterRequestBodySchema;
export type ReviseLaunchCharacterRequestBody = z.infer<
  typeof ReviseLaunchCharacterRequestBodySchema
>;

/**
 * The body of `DELETE /campaigns/:id/launch/crew/:characterId` (6.0d).
 *
 * A reason is required by `character.removed`'s own schema, and this is why:
 * removal is append-only like everything else before launch (A40), so the log
 * has to say why a crew member is gone rather than merely that they are.
 */
export const RemoveLaunchCharacterRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  reason: z.string().trim().min(1),
});
export type RemoveLaunchCharacterRequestBody = z.infer<
  typeof RemoveLaunchCharacterRequestBodySchema
>;

export interface ReviseCharacterResponse {
  readonly characterId: CharacterId;
  /** Present when the revision created the character's first background vow. */
  readonly vowTrackId?: TrackId;
}

export interface RemoveCharacterResponse {
  readonly characterId: CharacterId;
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

/** Campaign Launch save-and-resume is one typed snapshot per section. */
export const SaveLaunchDraftRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  draft: LaunchDraftSavedSchema,
});
export type SaveLaunchDraftRequestBody = z.infer<typeof SaveLaunchDraftRequestBodySchema>;
export interface SaveLaunchDraftResponse {
  readonly section: SaveLaunchDraftRequestBody['draft']['section'];
}

export const SetLaunchFoundationRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  premise: z.string().trim().min(1),
  settings: CampaignSettingsSchema,
});
export type SetLaunchFoundationRequestBody = z.infer<typeof SetLaunchFoundationRequestBodySchema>;
export interface SetLaunchFoundationResponse {
  readonly premise: string;
}

export const DecideLaunchTruthRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  truthId: OracleIdSchema,
  resolution: z.enum(['selected', 'rolled', 'custom', 'leave_open']),
  optionIndex: z.int().nonnegative().optional(),
  subchoiceId: z.string().min(1).optional(),
  subchoiceOptionIndex: z.int().nonnegative().optional(),
  text: z.string().trim().min(1).optional(),
  /**
   * The Guide recommendation this decision accepts (D-161).
   *
   * The design record requires an accepted value that came from a proposal to
   * be server-caused by its `creation.proposed` event, and its provenance to
   * say `guide_proposal` or `guide_proposal_edited`. The client names the
   * proposal; the server decides which of the two it was by comparing what was
   * proposed to what was accepted, because "did the player edit it" is not a
   * claim the client gets to make about itself.
   *
   * By event id, because that is the reference the client actually has: a held
   * proposal reaches the screen through projected state, which carries the
   * event id and not the command that wrote it. A command id would work only
   * until the page was reloaded.
   */
  proposalEventId: EventIdSchema.optional(),
});
export type DecideLaunchTruthRequestBody = z.infer<typeof DecideLaunchTruthRequestBodySchema>;
export interface DecideLaunchTruthResponse {
  readonly truthId: OracleId;
}

export const ActivateLaunchRequestBodySchema = z.object({ commandId: CommandIdSchema });
export type ActivateLaunchRequestBody = z.infer<typeof ActivateLaunchRequestBodySchema>;
export interface ActivateLaunchResponse {
  readonly sessionId: string;
  readonly sceneId: string;
  readonly pendingVow: string;
}

/**
 * What the player states about the ship. Installed modules are not here: they
 * are derived from the crew (D-191). Its id, asset and integrity are the
 * server's (7.0a): one campaign has one ship, so the id is minted on
 * establishment and reused on revision, and the asset and bounds come from the
 * rules rather than from a request that could name different ones.
 */
export const SharedStarshipDetailsSchema = SharedStarshipSchema.pick({
  name: true,
  appearance: true,
  history: true,
  quirks: true,
});
export type SharedStarshipDetails = z.infer<typeof SharedStarshipDetailsSchema>;

export const SaveSharedStarshipRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  starship: SharedStarshipDetailsSchema,
  /** The ship proposal being accepted; the server decides whether it was edited (7.0c). */
  proposalEventId: EventIdSchema.optional(),
  /** Field-level rolls the player kept (A41). */
  groundedIn: z.array(EventIdSchema).optional(),
});
export type SaveSharedStarshipRequestBody = z.infer<typeof SaveSharedStarshipRequestBodySchema>;
export interface SaveSharedStarshipResponse {
  readonly starshipId: EntityId;
}

/**
 * What the player states about the sector (8.0a). Its id and baseline are the
 * server's: one campaign has one starting sector, so the id is minted on
 * configure and reused on revise, and the baseline is the region's rule
 * (D-180), which a request should not be able to restate.
 */
export const LaunchSectorDetailsSchema = z.object({
  name: z.string().trim().min(1),
  region: z.enum(['terminus', 'outlands', 'expanse']),
  starId: EntityIdSchema.optional(),
});
export type LaunchSectorDetails = z.infer<typeof LaunchSectorDetailsSchema>;

/**
 * What accepting a proposal names, and the field rolls a player kept (8.0f).
 *
 * The proposal is named by event id and resolved against the fold, and the
 * server decides whether it was edited (7.0c). `groundedIn` is the rolls
 * behind fields the player rolled one at a time and kept (A41).
 */
const AcceptanceRequestFields = {
  proposalEventId: EventIdSchema.optional(),
  groundedIn: z.array(EventIdSchema).optional(),
};

export const ConfigureLaunchSectorRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  sector: LaunchSectorDetailsSchema,
  ...AcceptanceRequestFields,
});
export type ConfigureLaunchSectorRequestBody = z.infer<
  typeof ConfigureLaunchSectorRequestBodySchema
>;
export interface ConfigureLaunchSectorResponse {
  readonly sectorId: EntityId;
}

export const EstablishLaunchConnectionRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  npcName: z.string().trim().min(1),
  role: z.string().trim().min(1),
  rank: ChallengeRankSchema,
  participants: z.array(CharacterIdSchema).min(1),
});
export type EstablishLaunchConnectionRequestBody = z.infer<
  typeof EstablishLaunchConnectionRequestBodySchema
>;
export interface EstablishLaunchConnectionResponse {
  readonly connectionId: EntityId;
  readonly npcId: EntityId;
  readonly trackId: TrackId;
}

export const AcceptLaunchIncidentRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  incident: IncidentAcceptedSchema.omit({ provenance: true, groundedIn: true }),
});
export type AcceptLaunchIncidentRequestBody = z.infer<typeof AcceptLaunchIncidentRequestBodySchema>;
export interface AcceptLaunchIncidentResponse {
  readonly incidentId: EntityId;
}

export const AmendLaunchFactRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The typed replacement and the subject it claims. The server checks that
   * claim against the superseded event rather than trusting it. */
  amendment: LaunchAmendmentSchema,
  reason: z.string().trim().min(1),
  supersedesEventId: EventIdSchema,
});
export type AmendLaunchFactRequestBody = z.infer<typeof AmendLaunchFactRequestBodySchema>;
export interface AmendLaunchFactResponse {
  readonly subject: LaunchAmendmentSubject;
  readonly supersedesEventId: EventId;
}

export const SaveLaunchLocationRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The accepted node being revised. Absent to add one; the server mints its id (8.0a). */
  locationId: EntityIdSchema.optional(),
  location: LaunchLocationDetailsSchema,
  /**
   * A settlement's planet, accepted in the same command (8.0f): one decision,
   * one command (D-105). `locationId` names the planet being revised.
   */
  planet: z
    .object({
      locationId: EntityIdSchema.optional(),
      details: LaunchPlanetDetailsSchema,
      groundedIn: z.array(EventIdSchema).optional(),
    })
    .optional(),
  /** The key the proposal was made under: a `draftId`, or the `locationId` (D-196). */
  proposalTargetId: z.string().min(1).optional(),
  ...AcceptanceRequestFields,
});
export type SaveLaunchLocationRequestBody = z.infer<typeof SaveLaunchLocationRequestBodySchema>;

/** `DELETE /campaigns/:id/launch/locations/:locationId` (8.0g). */
export const RemoveLaunchLocationRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  reason: z.string().trim().min(1),
});
export type RemoveLaunchLocationRequestBody = z.infer<typeof RemoveLaunchLocationRequestBodySchema>;

/** `DELETE /campaigns/:id/launch/routes` (8.0g): the passage is named by its endpoints. */
export const RemoveLaunchRouteRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  route: LaunchRouteSchema,
  reason: z.string().trim().min(1),
});
export type RemoveLaunchRouteRequestBody = z.infer<typeof RemoveLaunchRouteRequestBodySchema>;
export interface SaveLaunchLocationResponse {
  readonly locationId: EntityId;
  /** The planet accepted with its settlement, when there was one (8.0f). */
  readonly planetId?: EntityId;
}

export const SaveLaunchRouteRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  route: LaunchRouteSchema,
});
export type SaveLaunchRouteRequestBody = z.infer<typeof SaveLaunchRouteRequestBodySchema>;
export interface SaveLaunchRouteResponse {
  readonly from: EntityId;
}

export const SetStartingSettlementRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  settlementId: EntityIdSchema,
});
export type SetStartingSettlementRequestBody = z.infer<
  typeof SetStartingSettlementRequestBodySchema
>;

export const SetSectorLayoutRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  coordinates: z.record(EntityIdSchema, z.object({ x: z.number(), y: z.number() })),
});
export type SetSectorLayoutRequestBody = z.infer<typeof SetSectorLayoutRequestBodySchema>;

export const SaveLaunchTroubleRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** No id: there is one sector trouble and one per settlement, so the owner says which (8.0f). */
  trouble: LaunchTroubleDetailsSchema,
  ...AcceptanceRequestFields,
});
export type SaveLaunchTroubleRequestBody = z.infer<typeof SaveLaunchTroubleRequestBodySchema>;
export interface SaveLaunchTroubleResponse {
  readonly troubleId: EntityId;
}

export const RollLaunchOracleRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  oracleId: OracleIdSchema,
});
export type RollLaunchOracleRequestBody = z.infer<typeof RollLaunchOracleRequestBodySchema>;
export interface RollLaunchOracleResponse {
  readonly eventId: EventId;
  readonly oracleId: OracleId;
  readonly roll: number;
  readonly text: string;
}

/**
 * A recipe is named by its parameters, never by an oracle id (D-65, D-173):
 * the caller cannot reach a table the rules did not declare in a recipe.
 */
export const LaunchRecipeSelectorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('starship'), quirkCount: z.union([z.literal(1), z.literal(2)]) }),
  z.object({
    kind: z.literal('settlement'),
    region: z.enum(['terminus', 'outlands', 'expanse']),
    projectCount: z.union([z.literal(1), z.literal(2)]),
  }),
  z.object({
    kind: z.literal('planet'),
    planetClass: z.enum(PLANET_CLASSES),
    depth: z.enum(['shallow', 'starting_detail']),
  }),
  z.object({ kind: z.literal('character') }),
  z.object({ kind: z.literal('starting_connection') }),
  z.object({ kind: z.literal('sector_trouble') }),
  z.object({ kind: z.literal('inciting_incident') }),
  z.object({ kind: z.literal('sector_name') }),
  z.object({
    kind: z.literal('starting_settlement'),
    firstLookCount: z.union([z.literal(1), z.literal(2)]),
  }),
  z.object({ kind: z.literal('planet_class') }),
  z.object({ kind: z.literal('star') }),
]);
export const RollLaunchRecipeRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  selector: LaunchRecipeSelectorSchema,
});
export type RollLaunchRecipeRequestBody = z.infer<typeof RollLaunchRecipeRequestBodySchema>;
export interface RollLaunchRecipeResponse {
  readonly recipeId: string;
  /** One entry per rolled result — a "roll twice" row yields two. */
  readonly results: readonly {
    readonly eventId: EventId;
    readonly slot: string;
    readonly oracleId: OracleId;
    readonly roll: number;
    readonly text: string;
  }[];
}

/** The body of `POST /campaigns/:id/truth-proposals` (5.3). */
export const ProposeTruthRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  truthId: OracleIdSchema,
});
export type ProposeTruthRequestBody = z.infer<typeof ProposeTruthRequestBodySchema>;

/**
 * The Guide's recommendation for one truth. Not canon: the player accepts it
 * through `decideTruth`, the same command the manual paths use (D-161, D-166).
 */
export type ProposeTruthResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly truthId: OracleId;
      readonly proposal: Extract<PayloadFor<'creation.proposed'>, { targetKind: 'truth' }>;
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

export const ProposeLaunchCreationRequestBodySchema = z.intersection(
  CreationProposalSchema,
  z.object({
    commandId: CommandIdSchema,
    targetId: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    groundedIn: z.array(EventIdSchema),
  }),
);
export type ProposeLaunchCreationRequestBody = z.infer<
  typeof ProposeLaunchCreationRequestBodySchema
>;

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
  /** D-132: the incident proposal the player started from, edited or not. */
  proposalCommandId: CommandIdSchema.optional(),
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
   * roll it precedes. The Guide proposes an amount (D-118); the player
   * commits whatever they choose.
   */
  preRollAmount: z.int().optional(),
  /**
   * D-130: the Guide's `amount.proposed` event the amount was committed
   * against, whatever number the player settled on, so its injury carries
   * into narration. The server checks it names a live proposal for this
   * move, character and meter. Omitted when no proposal had arrived.
   */
  proposalEventId: EventIdSchema.optional(),
  /** D-135: the Guide's suggestion this invocation was filled from, if any. */
  suggestionEventId: EventIdSchema.optional(),
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

/**
 * Beat narration (task 7.8, D-110, D-111). The client names the commandId of
 * the move-flow step it just finished; the server finds the chain it
 * belongs to and narrates the whole of it.
 */
export const NarrateBeatRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  afterCommandId: CommandIdSchema,
});

export type NarrateBeatRequestBody = z.infer<typeof NarrateBeatRequestBodySchema>;

/**
 * D-138 (amended): once a beat's passage has committed, the client asks for
 * the world pass that follows it — the Guide deciding whether the world
 * needs anything the dice should ground. Streamed like narration, and
 * answered with the same frames.
 */
export const WorldPassRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The committed `narration.written` the world pass follows. */
  passageEventId: EventIdSchema,
});

export type WorldPassRequestBody = z.infer<typeof WorldPassRequestBodySchema>;

/** D-141: frame the open scene. The server knows which scene; the client only asks. */
export const SceneFrameRequestBodySchema = z.object({
  commandId: CommandIdSchema,
});

export type SceneFrameRequestBody = z.infer<typeof SceneFrameRequestBodySchema>;

/**
 * D-146: Begin a Session. The scene carries forward from the previous
 * session, so `scene` is given only for a campaign's first session, which
 * has nothing to carry.
 */
export const BeginSessionRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  scene: z
    .object({
      title: z.string().trim().min(1),
      locationId: EntityIdSchema.optional(),
    })
    .optional(),
});

export type BeginSessionRequestBody = z.infer<typeof BeginSessionRequestBodySchema>;

export interface BeginSessionResponse {
  readonly sessionId: SessionId;
  readonly sceneId: SceneId;
  readonly number: number;
  /** D-147: whether there is a previous session for the recap to retell. */
  readonly recap: boolean;
}

/** D-149: End a Session's proposal. The server knows which session. */
export const ProposeSessionSummaryRequestBodySchema = z.object({
  commandId: CommandIdSchema,
});

export type ProposeSessionSummaryRequestBody = z.infer<
  typeof ProposeSessionSummaryRequestBodySchema
>;

export type ProposeSessionSummaryResponse =
  | ({ readonly ok: true; readonly eventId: EventId } & PayloadFor<'session.summary_proposed'>)
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/** D-149: the commit, edited or not, naming the proposal it started from. */
export const EndSessionRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  proposalEventId: EventIdSchema,
  summary: z.string().trim().min(1).max(4000),
  openThreads: z.array(z.string().trim().min(1).max(300)).max(10),
});

export type EndSessionRequestBody = z.infer<typeof EndSessionRequestBodySchema>;

export interface EndSessionResponse {
  readonly eventId: EventId;
  /** Whether the player changed the Guide's words, so the record is theirs. */
  readonly edited: boolean;
}

/** D-147: the recap of the previous session. The server knows which session; the client only asks. */
export const RecapRequestBodySchema = z.object({
  commandId: CommandIdSchema,
});

export type RecapRequestBody = z.infer<typeof RecapRequestBodySchema>;

/**
 * Narration correction (task 7.9, A15). One action: the note is written and
 * the rewrite streams back in the same request.
 */
export const CorrectNarrationRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  note: z.string().trim().min(1),
});

export type CorrectNarrationRequestBody = z.infer<typeof CorrectNarrationRequestBodySchema>;

/**
 * One line of a streamed narration response (D-111), sent as NDJSON.
 *
 * - `delta`: more text for the passage.
 * - `world`: a world pass has committed its rolls and entities (8.2);
 *   what it established is in state now, ahead of the passage about it.
 * - `reset`: discard everything streamed so far — a rejected attempt is
 *   being re-asked (task 7.5).
 * - `checking`: the passage has finished arriving and is being checked
 *   (D-128); what was shown so far is still provisional.
 * - `withdrawn`: the passage failed a check and is struck, with its reason
 *   in words and the rejected text; a re-ask may follow (D-128).
 * - `committed`: the passage is in the log as `eventId`; refetch.
 * - `failed`: the call produced nothing usable and play pauses (D-116).
 */
export type NarrationFrame =
  | { readonly type: 'delta'; readonly text: string }
  /** D-138: a world pass committed what it established; refetch before its passage arrives. */
  | { readonly type: 'world' }
  | { readonly type: 'reset'; readonly reason: string }
  | { readonly type: 'checking' }
  | { readonly type: 'withdrawn'; readonly reason: string; readonly rejectedText: string }
  | { readonly type: 'committed'; readonly eventId: EventId }
  | {
      readonly type: 'failed';
      readonly errorKind: AiErrorKind;
      readonly message: string;
    };

/** A 422 refusal from a narration route, returned before any stream opens. */
export interface NarrationRefusalResponse {
  readonly problem: string;
  readonly reason: string;
}

/**
 * D-118: ask the Guide to propose a suffer amount for a move whose pre-roll
 * intake declares one. `chainedFromCommandId` names the chain that led here,
 * so the proposal is judged from that fiction.
 */
export const ProposeAmountRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  moveId: MoveIdSchema,
  actorCharacterId: CharacterIdSchema,
  chainedFromCommandId: CommandIdSchema.optional(),
});

export type ProposeAmountRequestBody = z.infer<typeof ProposeAmountRequestBodySchema>;

export type ProposeAmountResponse =
  | {
      readonly ok: true;
      readonly eventId: EventId;
      readonly amount: number;
      /** D-130: absent only on a proposal written before injuries were split out. */
      readonly injury?: string;
      readonly reason: string;
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/** A16 / D-117: set a meter, momentum, or a track's ticks by hand. */
export const OverrideRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('momentum'), characterId: CharacterIdSchema }),
    z.object({
      kind: z.literal('meter'),
      characterId: CharacterIdSchema,
      meter: z.enum(['health', 'spirit', 'supply']),
    }),
    z.object({ kind: z.literal('track'), trackId: z.string().min(1) }),
  ]),
  to: z.int(),
  reason: z.string().trim().min(1).optional(),
});

export type OverrideRequestBody = z.infer<typeof OverrideRequestBodySchema>;

export interface OverrideResponse {
  readonly from: number;
  readonly to: number;
}

/**
 * Task 7.11 / D-116: whether the Guide can be reached. `available` is false
 * when no credential is configured, or when the most recent call failed —
 * until a later call succeeds.
 */
export interface AiStatusResponse {
  readonly provider: string;
  readonly model: string;
  readonly configured: boolean;
  readonly available: boolean;
  readonly lastFailure?: { readonly errorKind: AiErrorKind; readonly message: string };
}

/** Task 3.3 / D-124: ask the Guide to propose a character from a concept. */
export const ProposeCharacterRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  concept: z.string().trim().min(1).max(2000),
  /** D-185: the crew member's draft id while building, character id when revising. */
  targetId: z.string().min(1),
  /** The `oracle.rolled` events from this campaign's character recipe roll (D-186). */
  groundedIn: z.array(EventIdSchema).min(1),
  /** Beat 5: the fields the player wants help with. Steering only, never stored. */
  fields: z.array(z.string().min(1)).optional(),
});

export type ProposeCharacterRequestBody = z.infer<typeof ProposeCharacterRequestBodySchema>;

/** 7.0e: ask the Guide for the crew's ship, grounded in a starship recipe roll. */
export const ProposeStarshipRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The `oracle.rolled` events from this campaign's starship recipe roll. */
  groundedIn: z.array(EventIdSchema).min(1),
  /** The fields the player wants help with. Steering only, never stored. */
  fields: z.array(z.string().min(1)).optional(),
});
export type ProposeStarshipRequestBody = z.infer<typeof ProposeStarshipRequestBodySchema>;

/** `POST /campaigns/:id/settlement-proposals` (8.0e, D-196). */
export const ProposeSettlementRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The settlement's `draftId` before acceptance, or its `locationId` after. */
  targetId: z.string().trim().min(1),
  /** The `oracle.rolled` events from this campaign's settlement recipe rolls. */
  groundedIn: z.array(EventIdSchema).min(1),
  /** The fields the player wants help with. Steering only, never stored. */
  fields: z.array(z.string().min(1)).optional(),
});
export type ProposeSettlementRequestBody = z.infer<typeof ProposeSettlementRequestBodySchema>;

/** `POST /campaigns/:id/connection-proposals` (9.0c, D-167). */
export const ProposeConnectionRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The `oracle.rolled` events from this campaign's NPC recipe roll. */
  groundedIn: z.array(EventIdSchema).min(1),
  /** The fields the player wants help with. Steering only, never stored. */
  fields: z.array(z.string().min(1)).optional(),
});
export type ProposeConnectionRequestBody = z.infer<typeof ProposeConnectionRequestBodySchema>;

/** `POST /campaigns/:id/sector-proposals` (8.6, D-196): the whole sector, one proposal per object. */
export const ProposeSectorRequestBodySchema = z.object({ commandId: CommandIdSchema });
export type ProposeSectorRequestBody = z.infer<typeof ProposeSectorRequestBodySchema>;

/** `POST /campaigns/:id/trouble-proposals` (8.0e, D-194). */
export const ProposeTroubleRequestBodySchema = z.intersection(
  z.object({
    commandId: CommandIdSchema,
    /** The `oracle.rolled` event of the trouble roll. */
    groundedIn: z.array(EventIdSchema).min(1),
  }),
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('sector') }),
    z.object({ kind: z.literal('settlement'), ownerId: EntityIdSchema }),
  ]),
);
export type ProposeTroubleRequestBody = z.infer<typeof ProposeTroubleRequestBodySchema>;

/** One server-rolled oracle result a proposal was grounded in (D-123). */
export interface ProposalRoll {
  readonly eventId: EventId;
  readonly oracleId: OracleId;
  /** What the roll was for, e.g. Callsign. */
  readonly label: string;
  readonly roll: number;
  readonly rowText: string;
}

/** Task 7.12 / D-135: ask the Guide which move fits an action the player described. */
export const SuggestMoveRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  actorCharacterId: CharacterIdSchema,
  actionText: z.string().trim().min(1).max(2000),
});

export type SuggestMoveRequestBody = z.infer<typeof SuggestMoveRequestBodySchema>;

export type SuggestMoveResponse =
  | {
      readonly ok: true;
      readonly eventId: EventId;
      readonly suggestion: PayloadFor<'move.suggested'>;
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/** Task 9.3 / D-148: "What now?" — three suggested actions, on request. */
export const SuggestActionsRequestBodySchema = z.object({
  commandId: CommandIdSchema,
});

export type SuggestActionsRequestBody = z.infer<typeof SuggestActionsRequestBodySchema>;

export type SuggestActionsResponse =
  | {
      readonly ok: true;
      readonly eventId: EventId;
      readonly suggestions: PayloadFor<'actions.suggested'>['suggestions'];
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/** Task 7.13 / D-136: after the roll, ask whether the move's trigger fits the described action. */
export const CheckTriggerRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The command that invoked the move. */
  moveCommandId: CommandIdSchema,
});

export type CheckTriggerRequestBody = z.infer<typeof CheckTriggerRequestBodySchema>;

export type CheckTriggerResponse =
  | { readonly ok: true; readonly fits: true }
  | {
      readonly ok: true;
      readonly fits: false;
      readonly eventId: EventId;
      readonly note: PayloadFor<'move.trigger_noted'>;
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/** 8.7 / D-143: ask the Guide for complication options for a move that calls for one. */
export const OfferComplicationsRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  /** The command that invoked the move. */
  moveCommandId: CommandIdSchema,
});

export type OfferComplicationsRequestBody = z.infer<typeof OfferComplicationsRequestBodySchema>;

export type OfferComplicationsResponse =
  | {
      readonly ok: true;
      readonly eventId: EventId;
      /** Each option with the Action + Theme rolls it is grounded in, as chips. */
      readonly options: readonly { readonly text: string; readonly chips: readonly OracleChip[] }[];
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/**
 * 8.7 / D-143 (amended): the player sets the complication, written or
 * picked. A pick names its offer and option, and may have been edited.
 */
export const SetComplicationRequestBodySchema = z.object({
  commandId: CommandIdSchema,
  moveCommandId: CommandIdSchema,
  text: z.string().trim().min(1).max(600),
  offeredEventId: EventIdSchema.optional(),
  optionIndex: z.int().nonnegative().optional(),
});

export type SetComplicationRequestBody = z.infer<typeof SetComplicationRequestBodySchema>;

export interface SetComplicationResponse {
  readonly eventId: EventId;
  readonly source: 'written' | 'offered';
}

/** Task 4.6 / D-132: ask the Guide to propose inciting incidents. */
export const ProposeIncidentsRequestBodySchema = z.object({
  commandId: CommandIdSchema,
});

export type ProposeIncidentsRequestBody = z.infer<typeof ProposeIncidentsRequestBodySchema>;

export type ProposeIncidentsResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly proposal: PayloadFor<'incident.proposed'>;
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

type ProposalFor<K extends CreationTargetKind> = Extract<
  PayloadFor<'creation.proposed'>,
  { readonly targetKind: K }
>['proposal'];

/** The Guide's local connection. Not canon: accepted through the connection commands (9.0d). */
export type ProposeConnectionResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly proposal: ProposalFor<'connection'>;
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

/** The Guide's sector name. Not canon: accepted through `configureLaunchSector` (8.0f). */
export type ProposeSectorNameResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly proposal: ProposalFor<'sector'>;
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

/**
 * A whole-sector proposal (8.6, D-196): the name and each settlement, each its
 * own held proposal. A settlement's `targetId` is the draft key the client
 * adopts for it.
 */
export interface ProposeSectorResponse {
  readonly name: ProposeSectorNameResponse;
  readonly settlements: readonly ProposeSettlementResponse[];
}

/** The Guide's settlement. Not canon: accepted through `saveLaunchLocation` (8.0f). */
export type ProposeSettlementResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly targetId: string;
      readonly proposal: ProposalFor<'settlement'>;
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

/** The Guide's reading of a rolled trouble. Not canon: accepted through `saveLaunchTrouble`. */
export type ProposeTroubleResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly targetId: string;
      readonly proposal: ProposalFor<'trouble'>;
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

/** The Guide's ship. Not canon: accepted through `saveSharedStarship` (7.0c). */
export type ProposeStarshipResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly proposal: Extract<
        PayloadFor<'creation.proposed'>,
        { readonly targetKind: 'starship' }
      >['proposal'];
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

export type ProposeCharacterResponse =
  | {
      readonly ok: true;
      readonly proposalEventId: EventId;
      readonly proposal: Extract<
        PayloadFor<'creation.proposed'>,
        { readonly targetKind: 'character' }
      >['proposal'];
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };
