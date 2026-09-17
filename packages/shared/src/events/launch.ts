import * as z from 'zod';

import {
  AssetIdSchema,
  CharacterIdSchema,
  EntityIdSchema,
  EventIdSchema,
  OracleIdSchema,
  SceneIdSchema,
  SessionIdSchema,
  TrackIdSchema,
} from '../ids.js';
import { CampaignSettingsSchema } from './campaign.js';
import { CharacterCreatedSchema } from './character.js';
import { ChallengeRankSchema } from './track.js';

export const LaunchSectionSchema = z.enum([
  'foundation',
  'truths',
  'crew',
  'starship',
  'sector',
  'connection_troubles',
  'incident_launch',
]);
export type LaunchSection = z.infer<typeof LaunchSectionSchema>;
export const LaunchProvenanceSchema = z.enum([
  'player_written',
  'official_choice',
  'oracle_roll',
  'guide_proposal',
  'guide_proposal_edited',
]);
export const AcceptanceSchema = z.object({
  provenance: LaunchProvenanceSchema,
  groundedIn: z.array(EventIdSchema),
  supersedesEventId: EventIdSchema.optional(),
});

const TextListSchema = z.array(z.string().min(1));
const BackstorySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('written'), text: z.string().min(1) }),
  z.object({ kind: z.literal('discover_in_play') }),
]);
export const LaunchCharacterSchema = CharacterCreatedSchema.extend({
  appearance: z.string().min(1),
  backstory: BackstorySchema,
  backgroundVow: z.object({ title: z.string().min(1), rank: ChallengeRankSchema }),
  signatureGear: z.string().min(1).optional(),
});
export const SharedStarshipSchema = z.object({
  starshipId: EntityIdSchema,
  name: z.string().min(1),
  appearance: z.string().min(1),
  history: z.string().min(1),
  quirks: TextListSchema.min(1).max(2),
  integrity: z.object({ value: z.int(), min: z.int(), max: z.int() }),
  assetId: AssetIdSchema,
  modules: z.array(z.object({ assetId: AssetIdSchema, ownerCharacterId: CharacterIdSchema })),
});
const RegionSchema = z.enum(['terminus', 'outlands', 'expanse']);
export const LaunchLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('settlement'),
    id: EntityIdSchema,
    name: z.string().min(1),
    location: z.enum(['planetside', 'orbital', 'deep_space']),
    population: z.string().min(1),
    authority: z.string().min(1),
    projects: TextListSchema.min(1).max(2),
    planetId: EntityIdSchema.optional(),
    firstLooks: TextListSchema.min(1).max(2).optional(),
  }),
  z.object({
    kind: z.literal('planet'),
    id: EntityIdSchema,
    name: z.string().min(1),
    planetClass: z.string().min(1),
    /**
     * The three fields Chapter 2's starting-planet depth calls for (A33,
     * D-174). Named rather than an open string map, because readiness reads
     * exactly these keys: while `details` was a `Record<string, string>`, a
     * starting planet passed or failed on whether the client happened to
     * spell them the way the validator did.
     *
     * All optional: a shallow planet has none of them, and gains them only if
     * it becomes the starting settlement's planet.
     */
    details: z.object({
      atmosphere: z.string().min(1).optional(),
      observedFromSpace: z.string().min(1).optional(),
      feature: z.string().min(1).optional(),
    }),
  }),
  z.object({
    kind: z.literal('star'),
    id: EntityIdSchema,
    name: z.string().min(1),
    /** A star's detail is a single rolled description; stars are optional (A33). */
    details: z.object({ description: z.string().min(1).optional() }),
  }),
  z.object({
    kind: z.literal('other'),
    id: EntityIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
  }),
]);
export const LaunchRouteEndpointSchema = z.union([
  EntityIdSchema,
  z.object({ kind: z.literal('off_map'), label: z.string().min(1) }),
]);
export type LaunchRouteEndpoint = z.infer<typeof LaunchRouteEndpointSchema>;
export const LaunchRouteSchema = z.object({ from: EntityIdSchema, to: LaunchRouteEndpointSchema });
// A settlement trouble belongs to a settlement and a sector trouble belongs to
// no one; leaving `ownerId` optional on both let an unattributable trouble into
// the log, which the read layer then could not map back to its settlement.
const SettlementTroubleSchema = z.object({
  kind: z.literal('settlement'),
  troubleId: EntityIdSchema,
  ownerId: EntityIdSchema,
  text: z.string().min(1),
  fields: z.record(z.string(), z.string()).optional(),
});
const SectorTroubleSchema = z.object({
  kind: z.literal('sector'),
  troubleId: EntityIdSchema,
  text: z.string().min(1),
  fields: z.record(z.string(), z.string()).optional(),
});
export const LaunchTroubleSchema = z.discriminatedUnion('kind', [
  SettlementTroubleSchema,
  SectorTroubleSchema,
]);
const ConnectionSchema = z.object({
  connectionId: EntityIdSchema,
  npcId: EntityIdSchema,
  npcName: z.string().min(1),
  role: z.string().min(1),
  rank: ChallengeRankSchema,
  trackId: TrackIdSchema,
  participants: z.array(CharacterIdSchema).min(1),
  automaticStrongHit: z.literal(true),
});
const IncidentSchema = z.object({
  incidentId: EntityIdSchema,
  text: z.string().min(1),
  citedFactEventIds: z.array(EventIdSchema),
  rank: ChallengeRankSchema,
  rollerId: CharacterIdSchema,
  participants: z.array(CharacterIdSchema).min(1),
  openingScene: z.object({ title: z.string().min(1), locationId: EntityIdSchema.optional() }),
});

const TruthProposalSchema = z.object({
  truthId: OracleIdSchema.optional(),
  /**
   * Which path the Guide recommends, and — for an official option — which one.
   * Without these a proposal could not say what it meant: two options can be
   * summarised the same way, and a review screen has to preselect the right
   * one after a reload (A41, D-166).
   */
  resolution: z.enum(['selected', 'custom']).optional(),
  optionIndex: z.int().nonnegative().optional(),
  text: z.string().optional(),
  questStarter: z.string().optional(),
});
/** A settlement is one member of the location union, so it gets its own shape. */
const SettlementProposalSchema = z.object({
  id: EntityIdSchema.optional(),
  name: z.string().optional(),
  location: z.enum(['planetside', 'orbital', 'deep_space']).optional(),
  population: z.string().optional(),
  authority: z.string().optional(),
  projects: z.array(z.string()).max(2).optional(),
  firstLooks: z.array(z.string()).max(2).optional(),
});
const SectorProposalSchema = z.object({
  name: z.string().optional(),
  region: RegionSchema.optional(),
  settlements: z.array(SettlementProposalSchema).optional(),
});
const TroubleProposalSchema = z.object({
  kind: z.enum(['settlement', 'sector']).optional(),
  ownerId: EntityIdSchema.optional(),
  text: z.string().optional(),
});

const DraftSnapshotSchema = z.discriminatedUnion('section', [
  z.object({
    section: z.literal('foundation'),
    snapshot: z.object({
      premise: z.string().optional(),
      settings: CampaignSettingsSchema.partial().optional(),
    }),
  }),
  z.object({
    section: z.literal('truths'),
    // A23 restores what the player had in front of them, so a draft decision
    // carries the same shape the accepted one will. `string[]` restored nothing.
    snapshot: z.object({
      decisions: z.array(
        z.object({
          truthId: OracleIdSchema,
          resolution: z.enum(['selected', 'rolled', 'custom', 'leave_open']).optional(),
          optionIndex: z.int().nonnegative().optional(),
          subchoiceId: z.string().optional(),
          subchoiceOptionIndex: z.int().nonnegative().optional(),
          text: z.string().optional(),
        }),
      ),
    }),
  }),
  z.object({
    section: z.literal('crew'),
    snapshot: z.object({ characters: z.array(LaunchCharacterSchema.partial()) }),
  }),
  z.object({
    section: z.literal('starship'),
    snapshot: z.object({ starship: SharedStarshipSchema.partial().optional() }),
  }),
  z.object({
    section: z.literal('sector'),
    snapshot: z.object({ name: z.string().optional(), region: RegionSchema.optional() }),
  }),
  z.object({
    section: z.literal('connection_troubles'),
    snapshot: z.object({
      connection: ConnectionSchema.partial().optional(),
      // A draft trouble is incomplete by nature (D-161), so it keeps the loose
      // shape; the accepted event is where the discriminator's rule binds.
      troubles: z.array(
        z.object({
          kind: z.enum(['settlement', 'sector']).optional(),
          troubleId: EntityIdSchema.optional(),
          ownerId: EntityIdSchema.optional(),
          text: z.string().optional(),
        }),
      ),
    }),
  }),
  z.object({
    section: z.literal('incident_launch'),
    snapshot: z.object({ incident: IncidentSchema.partial().optional() }),
  }),
]);
export const LaunchDraftSavedSchema = DraftSnapshotSchema;
/**
 * A Guide or player proposal, not yet canon (D-161, D-166).
 *
 * `proposal` is the object under review, typed to the fact it would become,
 * because D-166 requires every field to stay editable before acceptance — a
 * single string is not something a review screen can edit field by field, and
 * acceptance would have to re-parse it to write the canonical event.
 *
 * Fields are individually optional: a proposal may be partial, and the
 * accepted event is where completeness binds.
 */
export const CreationProposalSchema = z.discriminatedUnion('targetKind', [
  z.object({ targetKind: z.literal('truth'), proposal: TruthProposalSchema }),
  z.object({ targetKind: z.literal('character'), proposal: LaunchCharacterSchema.partial() }),
  z.object({ targetKind: z.literal('starship'), proposal: SharedStarshipSchema.partial() }),
  z.object({ targetKind: z.literal('settlement'), proposal: SettlementProposalSchema }),
  z.object({ targetKind: z.literal('sector'), proposal: SectorProposalSchema }),
  z.object({ targetKind: z.literal('connection'), proposal: ConnectionSchema.partial() }),
  z.object({ targetKind: z.literal('trouble'), proposal: TroubleProposalSchema }),
  z.object({ targetKind: z.literal('incident'), proposal: IncidentSchema.partial() }),
]);

export type CreationProposal = z.infer<typeof CreationProposalSchema>;
export type CreationTargetKind = CreationProposal['targetKind'];

export const CreationProposedSchema = z.intersection(
  CreationProposalSchema,
  z.object({
    targetId: z.string().min(1),
    rationale: z.string().min(1),
    /** The `oracle.rolled` events this proposal was built from (A41). */
    groundedIn: z.array(EventIdSchema),
  }),
);
export const CampaignFoundationSetSchema = z.object({
  premise: z.string().min(1),
  settings: CampaignSettingsSchema,
  ...AcceptanceSchema.shape,
});
export const TruthDecidedSchema = z.object({
  truthId: OracleIdSchema,
  resolution: z.enum(['selected', 'rolled', 'custom', 'leave_open']),
  optionIndex: z.int().nonnegative().optional(),
  subchoiceId: z.string().min(1).optional(),
  subchoiceOptionIndex: z.int().nonnegative().optional(),
  /**
   * The resolved answer: a chosen option's description, or the player's own
   * words. Unchanged in meaning by D-183 — `decideTruth` writes
   * `option.description` where it wrote `option.text`, and those were the same
   * string until the adapter stopped making `row.text` do two jobs.
   */
  text: z.string().min(1).optional(),
  /** The chosen option's short form, for an overview line and a chip (D-183). */
  summary: z.string().min(1).optional(),
  questStarter: z.string().min(1).optional(),
  ...AcceptanceSchema.shape,
});
export const CharacterRevisedSchema = z.object({
  characterId: CharacterIdSchema,
  character: LaunchCharacterSchema,
  ...AcceptanceSchema.shape,
});
export const CharacterRemovedSchema = z.object({
  characterId: CharacterIdSchema,
  supersedesEventId: EventIdSchema,
  reason: z.string().min(1),
});
export const StarshipEstablishedSchema = SharedStarshipSchema.extend(AcceptanceSchema.shape);
export const StarshipRevisedSchema = z.object({
  starship: SharedStarshipSchema,
  ...AcceptanceSchema.shape,
});
export const SectorConfiguredSchema = z.object({
  sectorId: EntityIdSchema,
  name: z.string().min(1),
  region: RegionSchema,
  baseline: z.object({ settlements: z.int().positive(), passages: z.int().positive() }),
  starId: EntityIdSchema.optional(),
  ...AcceptanceSchema.shape,
});
export const LocationAddedSchema = LaunchLocationSchema.and(z.object(AcceptanceSchema.shape));
export const LocationRevisedSchema = LaunchLocationSchema.and(z.object(AcceptanceSchema.shape));
export const LocationRemovedSchema = z.object({
  locationId: EntityIdSchema,
  supersedesEventId: EventIdSchema,
  reason: z.string().min(1),
});
export const RouteAddedSchema = LaunchRouteSchema.extend(AcceptanceSchema.shape);
export const RouteRevisedSchema = LaunchRouteSchema.extend(AcceptanceSchema.shape);
export const RouteRemovedSchema = z.object({
  supersedesEventId: EventIdSchema,
  reason: z.string().min(1),
});
export const SectorLayoutChangedSchema = z.object({
  coordinates: z.record(EntityIdSchema, z.object({ x: z.number(), y: z.number() })),
});
export const StartingSettlementSelectedSchema = z.object({
  settlementId: EntityIdSchema,
  supersedesEventId: EventIdSchema.optional(),
});
const AcceptedTroubleSchema = z.discriminatedUnion('kind', [
  SettlementTroubleSchema.extend(AcceptanceSchema.shape),
  SectorTroubleSchema.extend(AcceptanceSchema.shape),
]);
export const TroubleEstablishedSchema = AcceptedTroubleSchema;
export const TroubleRevisedSchema = AcceptedTroubleSchema;
export const ConnectionEstablishedSchema = ConnectionSchema.extend(AcceptanceSchema.shape);
export const ConnectionRevisedSchema = ConnectionSchema.extend(AcceptanceSchema.shape);
export const IncidentAcceptedSchema = IncidentSchema.extend(AcceptanceSchema.shape);
export const IncidentRevisedSchema = IncidentSchema.extend(AcceptanceSchema.shape);
export const CampaignActivatedSchema = z.object({
  launchFactEventIds: z.array(EventIdSchema).min(1),
  sessionId: SessionIdSchema,
  sceneId: SceneIdSchema,
  pendingVow: z.object({
    incidentId: EntityIdSchema,
    rank: ChallengeRankSchema,
    rollerId: CharacterIdSchema,
    participants: z.array(CharacterIdSchema).min(1),
  }),
  readinessVersion: z.int().positive(),
});
/**
 * What an amendment replaces a launch fact with (D-161, A40).
 *
 * The replacement is the same shape as the fact it supersedes, so an amended
 * location is still a location and an amended trouble still satisfies the
 * settlement/sector rule. A free-text `replacement` could not do that, and
 * the `subject` enum beside it could disagree with the event actually being
 * amended.
 *
 * `subject` is **derived by the server** from the superseded event's type,
 * never taken from the caller: `supersedesEventId` already identifies the
 * fact, so a second, independently-supplied label could only ever contradict
 * it.
 */
export const LaunchAmendmentSchema = z.discriminatedUnion('subject', [
  z.object({
    subject: z.literal('foundation'),
    replacement: z.object({ premise: z.string().min(1), settings: CampaignSettingsSchema }),
  }),
  z.object({
    subject: z.literal('truth'),
    replacement: z.object({ truthId: OracleIdSchema, text: z.string().min(1) }),
  }),
  z.object({ subject: z.literal('character'), replacement: LaunchCharacterSchema }),
  z.object({ subject: z.literal('starship'), replacement: SharedStarshipSchema }),
  z.object({
    subject: z.literal('sector'),
    replacement: z.object({ sectorId: EntityIdSchema, name: z.string().min(1) }),
  }),
  z.object({ subject: z.literal('location'), replacement: LaunchLocationSchema }),
  z.object({ subject: z.literal('route'), replacement: LaunchRouteSchema }),
  z.object({ subject: z.literal('trouble'), replacement: LaunchTroubleSchema }),
  z.object({ subject: z.literal('connection'), replacement: ConnectionSchema }),
  z.object({ subject: z.literal('incident'), replacement: IncidentSchema }),
]);

export type LaunchAmendment = z.infer<typeof LaunchAmendmentSchema>;
export type LaunchAmendmentSubject = LaunchAmendment['subject'];

export const LaunchFactAmendedSchema = z.intersection(
  LaunchAmendmentSchema,
  z.object({ reason: z.string().min(1), supersedesEventId: EventIdSchema }),
);
