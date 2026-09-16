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
    details: z.record(z.string(), z.string()),
  }),
  z.object({
    kind: z.literal('star'),
    id: EntityIdSchema,
    name: z.string().min(1),
    details: z.record(z.string(), z.string()),
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
    snapshot: z.object({ decisions: z.array(z.string()) }),
  }),
  z.object({ section: z.literal('crew'), snapshot: z.object({ characters: z.array(z.string()) }) }),
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
export const CreationProposedSchema = z.object({
  targetKind: z.enum([
    'truth',
    'character',
    'starship',
    'settlement',
    'sector',
    'connection',
    'trouble',
    'incident',
  ]),
  targetId: z.string().min(1),
  proposal: z.string().min(1),
  rationale: z.string().min(1),
  groundedIn: z.array(EventIdSchema),
});
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
  text: z.string().min(1).optional(),
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
export const LaunchFactAmendedSchema = z.object({
  subject: z.enum([
    'foundation',
    'truth',
    'character',
    'starship',
    'sector',
    'location',
    'route',
    'trouble',
    'connection',
    'incident',
  ]),
  replacement: z.string().min(1),
  reason: z.string().min(1),
  supersedesEventId: EventIdSchema,
});
