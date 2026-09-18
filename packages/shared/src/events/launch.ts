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
import { CharacterCreatedSchema, CharacterStatsSchema } from './character.js';
import { AcceptanceSchema } from './provenance.js';
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
/**
 * One proposed field: the Guide's value, why, and the rolls behind it (A41).
 *
 * `creation.proposed`'s other arms carry a single rationale for the whole
 * object, which is enough for a truth or a trouble. A character is not: beat 3
 * has the player keep seven proposed fields, change one, and still see "the
 * proposal's original choice and reason" for the field they changed. That is
 * per field or it is nothing.
 */
const ProposedTextSchema = z.object({
  value: z.string().min(1),
  reason: z.string().min(1),
  groundedIn: z.array(EventIdSchema),
});

/**
 * A proposed field with a reason and no grounding.
 *
 * Appearance, pronouns and signature gear are read off the player's concept
 * rather than off a table — there is no roll for them to cite, and an empty
 * `groundedIn` would suggest the Guide looked for one and found nothing.
 */
const ProposedNoteSchema = z.object({
  value: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * A whole proposed crew member (D-185, 6.3).
 *
 * Complete rather than partial: this is the whole-object path D-166 names, and
 * the player edits it in the review screen before any of it is accepted. The
 * two optional fields are optional in the fiction — D-131 lets pronouns go
 * unrecorded, and signature gear is a note, not a requirement.
 */
export const CharacterProposalSchema = z.object({
  concept: z.string().min(1),
  name: ProposedTextSchema,
  callsign: ProposedTextSchema,
  pronouns: ProposedNoteSchema.optional(),
  appearance: ProposedNoteSchema,
  backstory: z.object({
    value: BackstorySchema,
    reason: z.string().min(1),
    groundedIn: z.array(EventIdSchema),
  }),
  stats: z.object({ value: CharacterStatsSchema, reason: z.string().min(1) }),
  assets: z.array(z.object({ assetId: AssetIdSchema, reason: z.string().min(1) })),
  backgroundVow: z.object({
    title: z.string().min(1),
    rank: ChallengeRankSchema,
    reason: z.string().min(1),
  }),
  hooks: z
    .array(
      z.object({
        text: z.string().min(1),
        reason: z.string().min(1),
        groundedIn: z.array(EventIdSchema),
      }),
    )
    .min(1)
    .max(3),
  signatureGear: ProposedNoteSchema.optional(),
});

/**
 * A whole proposed ship (7.0d, D-166).
 *
 * Per field for beat 6's reason: the player keeps one proposed quirk and
 * edits the appearance, and still sees what the Guide proposed and why. Name,
 * history and quirks are read off the starship recipe's rolls, so each cites
 * them; appearance is read off the concept and the history, and has no roll.
 * Complete rather than partial, like the character arm: field-level help is
 * the same proposal with the Guide asked to focus on some fields (6.3).
 */
export const StarshipProposalSchema = z.object({
  name: ProposedTextSchema,
  appearance: ProposedNoteSchema,
  history: ProposedTextSchema,
  quirks: z.array(ProposedTextSchema).min(1).max(2),
});
export type StarshipProposal = z.infer<typeof StarshipProposalSchema>;
/**
 * The one `targetId` a starship proposal can have. A campaign has one ship, and
 * no ship id exists until it is established, so the proposal is keyed by what
 * it is rather than by an id the client would have to invent (7.0a).
 */
export const STARSHIP_PROPOSAL_TARGET = 'starship';

export const SharedStarshipSchema = z.object({
  starshipId: EntityIdSchema,
  name: z.string().min(1),
  appearance: z.string().min(1),
  history: z.string().min(1),
  quirks: TextListSchema.min(1).max(2),
  integrity: z.object({ value: z.int(), min: z.int(), max: z.int() }),
  assetId: AssetIdSchema,
  /**
   * Written by events before D-191 and ignored since: installed modules are
   * derived from the crew (`installedModules`), not stated on the ship. Kept
   * optional so those events stay readable; projection drops it.
   */
  modules: z
    .array(z.object({ assetId: AssetIdSchema, ownerCharacterId: CharacterIdSchema }))
    .optional(),
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

/**
 * One crew member as a draft holds them (6.0e, D-161, D-182, A23).
 *
 * Not `LaunchCharacterSchema.partial()`, which this was, for three reasons.
 *
 * **It had no identity.** A character being built has no `characterId` yet, so
 * nothing could tell one half-built crew member from another across saves, and
 * D-182's precedence — which it names Crew as the reason for — had nothing to
 * compare a draft member against. `draftId` is minted by the client, stays
 * stable across saves, and is also the `targetId` a Guide proposal for this
 * member is keyed by while it is being built (D-185); once accepted,
 * `characterId` names the character the draft revises.
 *
 * **It was too strict to hold work.** A draft is incomplete by nature, so a
 * field the player has started and not finished is an empty string, not a
 * validation failure. The `connection_troubles` arm already keeps its shape
 * loose deliberately, and this is the same call for the same reason: refusing
 * a half-typed name would make **Save and continue** fail exactly when it is
 * most wanted.
 *
 * **It carried what the server derives.** Meters and momentum come from the
 * rules at acceptance (D-105). They are simply not named here, so they are
 * stripped rather than refused, and nothing downstream can mistake a draft for
 * a source of a character's starting health.
 */
const CrewDraftMemberSchema = z.object({
  draftId: z.string().min(1),
  characterId: CharacterIdSchema.optional(),
  name: z.string().optional(),
  callsign: z.string().optional(),
  pronouns: z.string().max(40).optional(),
  stats: CharacterStatsSchema.optional(),
  assets: z.array(AssetIdSchema).optional(),
  hooks: z.array(z.string()).max(3).optional(),
  appearance: z.string().optional(),
  backstory: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('written'), text: z.string() }),
      z.object({ kind: z.literal('discover_in_play') }),
    ])
    .optional(),
  backgroundVow: z
    .object({ title: z.string().optional(), rank: ChallengeRankSchema.optional() })
    .optional(),
  signatureGear: z.string().optional(),
});

/**
 * The ship as the player left it (7.0g, A23). Loose, as the crew draft is
 * (6.0e): a draft is incomplete by nature, so a blank quirk the player has not
 * filled in yet is saved rather than refused. Only what the player states is
 * here: the id, asset and integrity are the server's (7.0a), and installed
 * modules come from the crew (D-191). The proposal being worked from and the
 * field rolls kept so far are carried so resuming does not lose provenance.
 * Keyed under `starship` as before, and non-strict, so a snapshot saved in the
 * earlier shape still parses.
 */
const StarshipDraftSchema = z.object({
  name: z.string().optional(),
  appearance: z.string().optional(),
  history: z.string().optional(),
  quirks: z.array(z.string()).max(2).optional(),
  proposalEventId: EventIdSchema.optional(),
  groundedIn: z.array(EventIdSchema).optional(),
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
    snapshot: z.object({ characters: z.array(CrewDraftMemberSchema) }),
  }),
  z.object({
    section: z.literal('starship'),
    snapshot: z.object({ starship: StarshipDraftSchema.optional() }),
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
  z.object({ targetKind: z.literal('character'), proposal: CharacterProposalSchema }),
  z.object({ targetKind: z.literal('starship'), proposal: StarshipProposalSchema }),
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
  // Shaped like the fact as it is now projected: no stored module list (D-191).
  // The server stamps the id, asset and integrity rather than taking them (7.0j).
  z.object({
    subject: z.literal('starship'),
    replacement: SharedStarshipSchema.omit({ modules: true }),
  }),
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
