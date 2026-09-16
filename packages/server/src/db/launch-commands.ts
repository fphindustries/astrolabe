import {
  materializeLaunchRecipe,
  rollOracle,
  rollRecipe,
  REGION_BASELINES,
  STARFORGED,
  validateSharedStarship,
  type CharacterId,
  type LaunchRecipeSelector,
  type OracleId,
  type RandomSource,
  type TrackId,
} from '@astrolabe/rules';
import type {
  Actor,
  CampaignId,
  CreationProposal,
  EventType,
  LaunchAmendment,
  LaunchAmendmentSubject,
  CampaignSettings,
  CommandId,
  EntityId,
  EventId,
  PayloadFor,
  SceneId,
  SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';
import { cryptoRandomSource } from '../random-source.js';
import { buildLaunchWorkspace } from '../launch/workspace.js';

import { appendCommand, readEvents, type AppendResult } from './event-store.js';
import { uuidv7 } from './uuid.js';

/**
 * A plain `Omit` over a discriminated union collapses it into one object and
 * loses the discriminant, which is how a settlement trouble's required
 * `ownerId` went missing from the command's own request type.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class LaunchRejectedError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'LaunchRejectedError';
  }
}

export interface SaveLaunchDraftRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly draft: PayloadFor<'launch.draft_saved'>;
}

export async function saveLaunchDraft(
  sql: Sql,
  request: SaveLaunchDraftRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active') {
    throw new LaunchRejectedError(
      'campaign_active',
      'Launch drafts cannot change after activation.',
    );
  }
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: `launch.draft.save.${request.draft.section}`,
    actor: request.actor,
    events: [{ type: 'launch.draft_saved', payload: request.draft }],
    response: { section: request.draft.section },
  });
}

export interface SetLaunchFoundationRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly premise: string;
  readonly settings: CampaignSettings;
}

/** Set or revise the canonical campaign premise and settings before launch. */
export async function setLaunchFoundation(
  sql: Sql,
  request: SetLaunchFoundationRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active') {
    throw new LaunchRejectedError(
      'campaign_active',
      'Campaign foundation changes by amendment after activation.',
    );
  }
  const premise = request.premise.trim();
  if (premise === '')
    throw new LaunchRejectedError('premise_required', 'A campaign premise is required.');
  const previous = state.launch.foundation;
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.foundation.set',
    actor: request.actor,
    events: [
      {
        type: 'campaign.foundation_set',
        payload: {
          premise,
          settings: request.settings,
          provenance: 'player_written',
          groundedIn: [],
          ...(previous?.eventId === undefined ? {} : { supersedesEventId: previous.eventId }),
        },
      },
    ],
    response: { premise },
  });
}

export interface DecideTruthRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly truthId: OracleId;
  readonly resolution: 'selected' | 'rolled' | 'custom' | 'leave_open';
  readonly optionIndex?: number;
  readonly subchoiceId?: string;
  readonly subchoiceOptionIndex?: number;
  readonly text?: string;
  readonly rng?: RandomSource;
}

export interface SaveSharedStarshipRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly starship: Omit<PayloadFor<'starship.established'>, 'provenance' | 'groundedIn'>;
}

export interface RollLaunchOracleRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly oracleId: OracleId;
  readonly rng?: RandomSource;
}

export interface ProposeLaunchCreationRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly proposal: CreationProposal;
  readonly targetId: string;
  readonly rationale: string;
  readonly groundedIn: readonly EventId[];
}

/** Store a Guide or player-authored proposal without making it canonical. */
export async function proposeLaunchCreation(
  sql: Sql,
  request: ProposeLaunchCreationRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError('campaign_active', 'Launch proposals close after activation.');
  const rollIds = new Set(
    events.filter((event) => event.type === 'oracle.rolled').map((event) => event.id),
  );
  if (request.groundedIn.some((id) => !rollIds.has(id))) {
    throw new LaunchRejectedError(
      'invalid_proposal_grounding',
      'Proposals may cite only recorded oracle rolls.',
    );
  }
  const rationale = request.rationale.trim();
  if (rationale === '')
    throw new LaunchRejectedError('proposal_fields_required', 'A proposal needs a rationale.');
  if (Object.values(request.proposal.proposal).every((value) => value === undefined))
    throw new LaunchRejectedError('proposal_fields_required', 'A proposal needs content.');
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: `launch.propose.${request.proposal.targetKind}`,
    actor: request.actor,
    events: [
      {
        type: 'creation.proposed',
        payload: {
          ...request.proposal,
          targetId: request.targetId,
          rationale,
          groundedIn: request.groundedIn,
        },
      },
    ],
    response: { targetKind: request.proposal.targetKind, targetId: request.targetId },
  });
}

export interface RollLaunchRecipeRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly selector: LaunchRecipeSelector;
  readonly rng?: RandomSource;
}

/**
 * Roll a *declared* recipe, server-side, before the Guide interprets it
 * (D-65, D-166).
 *
 * The caller names the recipe by its parameters, never by an oracle id, so it
 * cannot reach a table the rules did not put in a recipe. Every slot result
 * becomes its own `oracle.rolled`, which is what a proposal then cites as its
 * grounding (A41) and what the chips under an accepted fact are drawn from.
 */
export async function rollLaunchRecipe(
  sql: Sql,
  request: RollLaunchRecipeRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'Launch oracle rolls are closed after activation.',
    );
  const recipe = materializeLaunchRecipe(request.selector);
  const rolled = rollRecipe(request.rng ?? cryptoRandomSource(), recipe, (oracle) =>
    STARFORGED.oracles.find((candidate) => candidate.id === oracle),
  );
  // One event per result, not per slot: a "roll twice" row yields two, and
  // each is a chip the player can see and the Guide can cite.
  const results = rolled.flatMap(({ slot, results: slotResults }) =>
    slotResults.map((result) => ({
      eventId: uuidv7() as EventId,
      slot: slot.slot,
      oracleId: result.oracleId,
      roll: result.roll,
      text: result.rowText,
    })),
  );
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: `launch.recipe.roll.${request.selector.kind}`,
    actor: request.actor,
    events: results.map((result) => ({
      id: result.eventId,
      type: 'oracle.rolled' as const,
      actor: { kind: 'system' as const },
      payload: { oracleId: result.oracleId, roll: result.roll, rowText: result.text },
    })),
    response: { recipeId: recipe.id, results },
  });
}

/** Roll a launch field from the frozen rules data and persist the exact row. */
export async function rollLaunchOracle(
  sql: Sql,
  request: RollLaunchOracleRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'Launch oracle rolls are closed after activation.',
    );
  const oracle = STARFORGED.oracles.find((candidate) => candidate.id === request.oracleId);
  if (oracle === undefined)
    throw new LaunchRejectedError('unknown_oracle', 'That oracle is not in the frozen rules data.');
  const rolled = rollOracle(request.rng ?? cryptoRandomSource(), oracle);
  const rollId = uuidv7() as EventId;
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.oracle.roll',
    actor: request.actor,
    events: [
      {
        id: rollId,
        type: 'oracle.rolled',
        actor: { kind: 'system' },
        payload: { oracleId: oracle.id, roll: rolled.roll, rowText: rolled.row.text },
      },
    ],
    response: { eventId: rollId, oracleId: oracle.id, roll: rolled.roll, text: rolled.row.text },
  });
}

export interface ConfigureLaunchSectorRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly sector: Omit<PayloadFor<'sector.configured'>, 'provenance' | 'groundedIn'>;
}

export interface EstablishLaunchConnectionRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly npcName: string;
  readonly role: string;
  readonly rank: PayloadFor<'connection.established'>['rank'];
  readonly participants: readonly CharacterId[];
}

export interface AcceptLaunchIncidentRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly incident: Omit<PayloadFor<'incident.accepted'>, 'provenance' | 'groundedIn'>;
}

export interface AmendLaunchFactRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  /** The typed replacement and the subject it claims; the subject is checked
   * against the superseded event rather than trusted. */
  readonly amendment: LaunchAmendment;
  readonly reason: string;
  readonly supersedesEventId: EventId;
}

export interface SaveLaunchLocationRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly location: LaunchLocationInput;
}

export interface SaveLaunchRouteRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly route: Omit<PayloadFor<'route.added'>, 'provenance' | 'groundedIn'>;
}

export interface SetStartingSettlementRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly settlementId: EntityId;
}

export interface SaveLaunchTroubleRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly trouble: DistributiveOmit<
    PayloadFor<'trouble.established'>,
    'provenance' | 'groundedIn'
  >;
}

export async function saveLaunchTrouble(
  sql: Sql,
  request: SaveLaunchTroubleRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError('campaign_active', 'Troubles change by amendment after launch.');
  // The schema now carries the shape rule — a settlement trouble has an owner
  // and a sector trouble cannot — so only the owner's *existence* is checked
  // here, which is campaign state and not something a schema can know.
  if (
    request.trouble.kind === 'settlement' &&
    (state.launch.locations[request.trouble.ownerId] as { readonly kind?: string } | undefined)
      ?.kind !== 'settlement'
  ) {
    throw new LaunchRejectedError(
      'invalid_trouble_owner',
      'A settlement trouble needs an accepted settlement.',
    );
  }
  const previous = state.launch.troubles[request.trouble.troubleId] as
    { readonly eventId?: EventId } | undefined;
  const acceptance = {
    provenance: 'player_written' as const,
    groundedIn: [] as EventId[],
    ...(previous?.eventId === undefined ? {} : { supersedesEventId: previous.eventId }),
  };
  // Rebuilt per branch rather than spread, so the discriminant stays narrow.
  const payload =
    request.trouble.kind === 'settlement'
      ? { ...request.trouble, ...acceptance }
      : { ...request.trouble, ...acceptance };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.trouble.establish' : 'launch.trouble.revise',
    actor: request.actor,
    events: [
      previous?.eventId === undefined
        ? { type: 'trouble.established', payload }
        : { type: 'trouble.revised', payload },
    ],
    response: { troubleId: request.trouble.troubleId },
  });
}

export async function setStartingSettlement(
  sql: Sql,
  request: SetStartingSettlementRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'The starting settlement changes by amendment after launch.',
    );
  const settlement = state.launch.locations[request.settlementId] as
    { readonly kind?: string } | undefined;
  if (settlement?.kind !== 'settlement')
    throw new LaunchRejectedError('invalid_starting_settlement', 'Choose an accepted settlement.');
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.sector.select_starting_settlement',
    actor: request.actor,
    events: [
      {
        type: 'starting_settlement.selected',
        payload: { settlementId: request.settlementId },
      },
    ],
    response: { settlementId: request.settlementId },
  });
}

export interface SetSectorLayoutRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly coordinates: PayloadFor<'sector.layout_changed'>['coordinates'];
}

export async function setSectorLayout(
  sql: Sql,
  request: SetSectorLayoutRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'Map layout changes by amendment after launch.',
    );
  const placed = Object.keys(request.coordinates) as EntityId[];
  if (placed.some((id) => state.launch.locations[id] === undefined)) {
    throw new LaunchRejectedError(
      'unknown_layout_location',
      'Map layout may only position accepted locations.',
    );
  }
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.sector.set_layout',
    actor: request.actor,
    events: [{ type: 'sector.layout_changed', payload: { coordinates: request.coordinates } }],
    response: { locations: Object.keys(request.coordinates).length },
  });
}

export async function saveLaunchRoute(
  sql: Sql,
  request: SaveLaunchRouteRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError('campaign_active', 'Routes change by amendment after launch.');
  if (state.launch.locations[request.route.from] === undefined) {
    throw new LaunchRejectedError(
      'unknown_route_origin',
      'A route must start at an accepted location.',
    );
  }
  if (
    typeof request.route.to === 'string' &&
    state.launch.locations[request.route.to] === undefined
  ) {
    throw new LaunchRejectedError(
      'unknown_route_destination',
      'A route must end at an accepted location or exit.',
    );
  }
  const current = state.launch.routes as readonly {
    readonly eventId?: EventId;
    readonly from: EntityId;
    readonly to: PayloadFor<'route.added'>['to'];
  }[];
  const previous = current.find(
    (route) =>
      route.eventId !== undefined &&
      route.from === request.route.from &&
      route.to === request.route.to,
  );
  const payload = {
    ...request.route,
    provenance: 'player_written' as const,
    groundedIn: [] as EventId[],
    ...(previous?.eventId === undefined ? {} : { supersedesEventId: previous.eventId }),
  };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.route.add' : 'launch.route.revise',
    actor: request.actor,
    events: [
      previous?.eventId === undefined
        ? { type: 'route.added', payload }
        : { type: 'route.revised', payload },
    ],
    response: { from: request.route.from },
  });
}

type LaunchLocationInput =
  | Omit<
      Extract<PayloadFor<'location.added'>, { readonly kind: 'settlement' }>,
      'provenance' | 'groundedIn'
    >
  | Omit<
      Extract<PayloadFor<'location.added'>, { readonly kind: 'planet' }>,
      'provenance' | 'groundedIn'
    >
  | Omit<
      Extract<PayloadFor<'location.added'>, { readonly kind: 'star' }>,
      'provenance' | 'groundedIn'
    >
  | Omit<
      Extract<PayloadFor<'location.added'>, { readonly kind: 'other' }>,
      'provenance' | 'groundedIn'
    >;

/** Add or revise a canonical sector node, preserving the accepted predecessor. */
export async function saveLaunchLocation(
  sql: Sql,
  request: SaveLaunchLocationRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError('campaign_active', 'Locations change by amendment after launch.');
  if (state.launch.sector === undefined)
    throw new LaunchRejectedError(
      'sector_required',
      'Configure the sector before adding locations.',
    );
  if (
    request.location.kind === 'settlement' &&
    request.location.planetId !== undefined &&
    (state.launch.locations[request.location.planetId] as { readonly kind?: string } | undefined)
      ?.kind !== 'planet'
  ) {
    throw new LaunchRejectedError(
      'unknown_planet',
      'A planetside settlement must reference an accepted planet.',
    );
  }
  const previous = state.launch.locations[request.location.id] as
    { readonly eventId?: EventId } | undefined;
  const payload: PayloadFor<'location.added'> = {
    ...request.location,
    provenance: 'player_written' as const,
    groundedIn: [],
    ...(previous?.eventId === undefined ? {} : { supersedesEventId: previous.eventId }),
  };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.location.add' : 'launch.location.revise',
    actor: request.actor,
    events: [
      previous?.eventId === undefined
        ? { type: 'location.added', payload }
        : { type: 'location.revised', payload },
    ],
    response: { locationId: request.location.id },
  });
}

/** Post-launch canon changes are explicit amendments, never draft rewrites. */
export async function amendLaunchFact(
  sql: Sql,
  request: AmendLaunchFactRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  if (state.launch.phase !== 'active')
    throw new LaunchRejectedError(
      'campaign_not_active',
      'Launch facts can be amended only after activation.',
    );
  const target = events.find((event) => event.id === request.supersedesEventId);
  const subject = target === undefined ? undefined : AMENDABLE_SUBJECTS[target.type];
  if (subject === undefined) {
    throw new LaunchRejectedError(
      'invalid_amendment_target',
      'Choose an accepted launch fact to amend.',
    );
  }
  if (subject !== request.amendment.subject) {
    throw new LaunchRejectedError(
      'amendment_subject_mismatch',
      `That event states a ${subject}, not a ${request.amendment.subject}.`,
    );
  }
  const reason = request.reason.trim();
  if (reason === '')
    throw new LaunchRejectedError('amendment_reason_required', 'An amendment needs a reason.');
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: `launch.fact.amend.${subject}`,
    actor: request.actor,
    events: [
      {
        type: 'launch.fact_amended',
        payload: { ...request.amendment, reason, supersedesEventId: target!.id },
      },
    ],
    response: { subject, supersedesEventId: target!.id },
  });
}

/**
 * Which launch fact an event states, and therefore what an amendment to it
 * replaces. The amendment's `subject` is read from here rather than accepted
 * from the caller: `supersedesEventId` already names the fact, so a
 * separately-supplied label could only ever contradict it.
 */
const AMENDABLE_SUBJECTS: Partial<Record<EventType, LaunchAmendmentSubject>> = {
  'campaign.foundation_set': 'foundation',
  'truth.decided': 'truth',
  'character.created': 'character',
  'character.revised': 'character',
  'starship.established': 'starship',
  'starship.revised': 'starship',
  'sector.configured': 'sector',
  'location.added': 'location',
  'location.revised': 'location',
  'route.added': 'route',
  'route.revised': 'route',
  'trouble.established': 'trouble',
  'trouble.revised': 'trouble',
  'connection.established': 'connection',
  'connection.revised': 'connection',
  'incident.accepted': 'incident',
  'incident.revised': 'incident',
};

/** Accept or revise the incident only after checking the cited accepted facts. */
export async function acceptLaunchIncident(
  sql: Sql,
  request: AcceptLaunchIncidentRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'The incident changes by amendment after launch.',
    );
  const crew = state.characters;
  if (
    crew[request.incident.rollerId] === undefined ||
    request.incident.participants.length === 0 ||
    request.incident.participants.some((id) => crew[id] === undefined)
  ) {
    throw new LaunchRejectedError('invalid_incident_crew', 'The incident must name launch crew.');
  }
  const acceptedIds = new Set(
    events
      .filter(
        (event) =>
          event.type !== 'launch.draft_saved' &&
          event.type !== 'creation.proposed' &&
          event.type !== 'incident.proposed',
      )
      .map((event) => event.id),
  );
  if (request.incident.citedFactEventIds.some((id) => !acceptedIds.has(id))) {
    throw new LaunchRejectedError(
      'invalid_incident_citation',
      'Incident citations must be accepted launch facts.',
    );
  }
  const previous = state.launch.incident;
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.incident.accept' : 'launch.incident.revise',
    actor: request.actor,
    events:
      previous?.eventId === undefined
        ? [
            {
              type: 'incident.accepted',
              payload: { ...request.incident, provenance: 'player_written', groundedIn: [] },
            },
          ]
        : [
            {
              type: 'incident.revised',
              payload: {
                ...request.incident,
                provenance: 'player_written',
                groundedIn: [],
                supersedesEventId: previous.eventId,
              },
            },
          ],
    response: { incidentId: request.incident.incidentId },
  });
}

/** The one launch connection is an automatic strong hit, never a fabricated roll. */
export async function establishLaunchConnection(
  sql: Sql,
  request: EstablishLaunchConnectionRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'The connection changes by amendment after launch.',
    );
  if (state.launch.connection !== undefined)
    throw new LaunchRejectedError(
      'connection_exists',
      'Revise the existing starting connection instead.',
    );
  if (
    request.participants.length === 0 ||
    request.participants.some((id) => state.characters[id] === undefined)
  ) {
    throw new LaunchRejectedError(
      'invalid_participants',
      'Choose one or more launch crew members.',
    );
  }
  const npcName = request.npcName.trim();
  const role = request.role.trim();
  if (npcName === '' || role === '')
    throw new LaunchRejectedError(
      'connection_fields_required',
      'The connection needs an NPC name and role.',
    );
  const connectionId = uuidv7() as EntityId;
  const npcId = uuidv7() as EntityId;
  const trackId = uuidv7() as TrackId;
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.connection.establish',
    actor: request.actor,
    events: [
      {
        type: 'entity.established',
        payload: {
          entityId: npcId,
          kind: 'npc',
          name: npcName,
          fields: { role },
          provenance: { establishedBy: 'player', groundedIn: [] },
        },
      },
      {
        type: 'track.created',
        payload: {
          kind: 'vow',
          trackId,
          title: `Connection: ${npcName}`,
          rank: request.rank,
          participantCharacterIds: request.participants,
        },
      },
      {
        type: 'connection.established',
        payload: {
          connectionId,
          npcId,
          npcName,
          role,
          rank: request.rank,
          trackId,
          participants: request.participants,
          automaticStrongHit: true,
          provenance: 'player_written',
          groundedIn: [],
        },
      },
    ],
    response: { connectionId, npcId, trackId },
  });
}

/** Establish the region and its immutable rules-derived baseline. */
export async function configureLaunchSector(
  sql: Sql,
  request: ConfigureLaunchSectorRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'The sector changes by amendment after launch.',
    );
  const expected = REGION_BASELINES[request.sector.region];
  if (
    request.sector.baseline.settlements !== expected.settlements ||
    request.sector.baseline.passages !== expected.passages
  ) {
    throw new LaunchRejectedError(
      'invalid_sector_baseline',
      'The sector baseline must match the selected region.',
    );
  }
  const previous = state.launch.sector;
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.sector.configure' : 'launch.sector.revise',
    actor: request.actor,
    events: [
      {
        type: 'sector.configured',
        payload: {
          ...request.sector,
          provenance: 'player_written',
          groundedIn: [],
          ...(previous?.eventId === undefined ? {} : { supersedesEventId: previous.eventId }),
        },
      },
    ],
    response: { sectorId: request.sector.sectorId },
  });
}

/** Accept or revise the single campaign-owned starship. */
export async function saveSharedStarship(
  sql: Sql,
  request: SaveSharedStarshipRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError(
      'campaign_active',
      'The starship changes by amendment after launch.',
    );
  const problems = validateSharedStarship(
    {
      name: request.starship.name,
      appearance: request.starship.appearance,
      history: request.starship.history,
      quirks: request.starship.quirks,
      integrity: request.starship.integrity.value,
      assetId: request.starship.assetId,
      modules: request.starship.modules,
    },
    STARFORGED,
    Object.keys(state.characters),
  );
  if (problems.length > 0)
    throw new LaunchRejectedError(
      'invalid_starship',
      problems.map((problem) => problem.message).join(' '),
    );
  const current = state.launch.starship;
  const accepted = {
    ...request.starship,
    provenance: 'player_written' as const,
    groundedIn: [] as readonly EventId[],
  };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: current === undefined ? 'launch.starship.establish' : 'launch.starship.revise',
    actor: request.actor,
    events:
      current?.eventId === undefined
        ? [{ type: 'starship.established', payload: accepted }]
        : [
            {
              type: 'starship.revised',
              payload: {
                starship: request.starship,
                provenance: 'player_written',
                groundedIn: [],
                supersedesEventId: current.eventId,
              },
            },
          ],
    response: { starshipId: request.starship.starshipId },
  });
}

export interface ActivateLaunchRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
}

/**
 * The irreversible launch hand-off. Mechanics are committed together; the
 * actual Swear an Iron Vow move remains deliberately pending for the player
 * to invoke as Session 1's first beat.
 */
export async function activateLaunch(
  sql: Sql,
  request: ActivateLaunchRequest,
): Promise<AppendResult> {
  const eventsSoFar = await readEvents(sql, request.campaignId);
  const { state, readiness } = buildLaunchWorkspace(eventsSoFar);
  if (state.launch.phase === 'active')
    throw new LaunchRejectedError('campaign_active', 'This campaign has already launched.');
  if (!readiness.ready) {
    throw new LaunchRejectedError(
      'not_ready',
      'Complete every launch requirement before activating.',
    );
  }
  const incident = state.launch.incident;
  if (incident === undefined)
    throw new LaunchRejectedError('incident_missing', 'Choose an incident first.');
  const sessionId = uuidv7() as SessionId;
  const sceneId = uuidv7() as SceneId;
  const activationId = uuidv7() as EventId;
  const launchFactEventIds = eventsSoFar
    .filter((event) => event.type !== 'launch.draft_saved' && event.type !== 'creation.proposed')
    .map((event) => event.id);
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.activate',
    actor: request.actor,
    // Re-read and revalidate under the campaign row lock, so a launch command
    // that lands between the fold above and this append cannot slip past
    // readiness or produce a second activation (D-168, A40).
    precondition: async (tx) => {
      const current = buildLaunchWorkspace(await readEvents(tx, request.campaignId));
      if (current.state.launch.phase === 'active')
        throw new LaunchRejectedError('campaign_active', 'This campaign has already launched.');
      if (!current.readiness.ready)
        throw new LaunchRejectedError(
          'not_ready',
          'Complete every launch requirement before activating.',
        );
    },
    events: [
      {
        id: activationId,
        type: 'campaign.activated',
        payload: {
          launchFactEventIds,
          sessionId,
          sceneId,
          pendingVow: {
            incidentId: incident.incidentId,
            rank: incident.rank,
            rollerId: incident.rollerId,
            participants: incident.participants,
          },
          readinessVersion: 1,
        },
      },
      {
        type: 'session.began',
        payload: { sessionId, number: 1 },
        sessionId,
        causedBy: activationId,
      },
      {
        type: 'scene.started',
        payload: {
          sceneId,
          title: incident.openingScene.title,
          ...(incident.openingScene.locationId === undefined
            ? {}
            : { locationId: incident.openingScene.locationId }),
        },
        sessionId,
        sceneId,
        causedBy: activationId,
      },
    ],
    response: { sessionId, sceneId, pendingVow: incident.incidentId },
  });
}

export async function decideTruth(sql: Sql, request: DecideTruthRequest): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  if (state.launch.phase === 'active') {
    throw new LaunchRejectedError(
      'campaign_active',
      'Truths change by amendment after activation.',
    );
  }
  const truth = STARFORGED.truths.find((candidate) => candidate.id === request.truthId);
  if (truth === undefined)
    throw new LaunchRejectedError('unknown_truth', 'That is not a setting truth.');

  let optionIndex = request.optionIndex;
  let text: string | undefined;
  let groundedIn: EventId[] = [];
  const events: Parameters<typeof appendCommand>[1]['events'][number][] = [];
  if (request.resolution === 'selected' || request.resolution === 'rolled') {
    if (request.resolution === 'rolled') {
      const rolled = rollOracle(request.rng ?? cryptoRandomSource(), truth);
      optionIndex = truth.rows.findIndex(
        (option) => rolled.roll >= option.min && rolled.roll <= option.max,
      );
      const rollId = uuidv7() as EventId;
      groundedIn = [rollId];
      events.push({
        id: rollId,
        type: 'oracle.rolled',
        payload: { oracleId: truth.id, roll: rolled.roll, rowText: rolled.row.text },
        actor: { kind: 'system' },
      });
    }
    const option = truth.rows[optionIndex ?? -1];
    if (option === undefined)
      throw new LaunchRejectedError('invalid_option', 'Choose a valid truth option.');
    if (option.subchoice !== undefined) {
      if (request.resolution === 'rolled') {
        const nested = rollOracle(request.rng ?? cryptoRandomSource(), option.subchoice);
        const nestedIndex = option.subchoice.rows.findIndex(
          (row) => nested.roll >= row.min && nested.roll <= row.max,
        );
        const nestedRollId = uuidv7() as EventId;
        groundedIn = [...groundedIn, nestedRollId];
        events.push({
          id: nestedRollId,
          type: 'oracle.rolled',
          payload: {
            oracleId: option.subchoice.id,
            roll: nested.roll,
            rowText: nested.row.text,
          },
          actor: { kind: 'system' },
        });
        request = {
          ...request,
          subchoiceId: option.subchoice.id,
          subchoiceOptionIndex: nestedIndex,
        };
      }
      if (
        request.subchoiceId !== option.subchoice.id ||
        request.subchoiceOptionIndex === undefined ||
        option.subchoice.rows[request.subchoiceOptionIndex] === undefined
      ) {
        throw new LaunchRejectedError(
          'subchoice_required',
          'This truth option needs a valid nested choice.',
        );
      }
    }
    text = option.text;
  } else if (request.resolution === 'custom') {
    text = request.text?.trim();
    if (text === undefined || text === '')
      throw new LaunchRejectedError('custom_text_required', 'A custom truth needs text.');
  }
  const previous = state.launch.truthDecisions[request.truthId] as
    { eventId?: EventId } | undefined;
  events.push({
    type: 'truth.decided',
    payload: {
      truthId: request.truthId,
      resolution: request.resolution,
      ...(optionIndex !== undefined ? { optionIndex } : {}),
      ...(request.subchoiceId !== undefined ? { subchoiceId: request.subchoiceId } : {}),
      ...(request.subchoiceOptionIndex !== undefined
        ? { subchoiceOptionIndex: request.subchoiceOptionIndex }
        : {}),
      ...(text !== undefined ? { text } : {}),
      provenance:
        request.resolution === 'rolled'
          ? 'oracle_roll'
          : request.resolution === 'selected'
            ? 'official_choice'
            : 'player_written',
      groundedIn,
      ...(previous?.eventId !== undefined ? { supersedesEventId: previous.eventId } : {}),
    },
  });
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'launch.truth.decide',
    actor: request.actor,
    events,
    response: { truthId: request.truthId },
  });
}
