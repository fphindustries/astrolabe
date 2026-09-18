import {
  materializeLaunchRecipe,
  rollOracle,
  rollRecipe,
  REGION_BASELINES,
  sharedStarshipBaseline,
  STARFORGED,
  validateSharedStarship,
  validateStarshipDetails,
  type CharacterId,
  type LaunchRecipeSelector,
  type OracleId,
  type RandomSource,
  type TrackId,
} from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CampaignState,
  CreationProposal,
  CreationTargetKind,
  EventType,
  LaunchAmendment,
  LaunchAmendmentSubject,
  LaunchClosedReason,
  LaunchLocationDetails,
  LaunchPlanetDetails,
  LaunchTroubleDetails,
  LaunchSectorDetails,
  LaunchRouteEndpoint,
  CampaignSettings,
  CommandId,
  DeepReadonly,
  EntityId,
  EventId,
  PayloadFor,
  SceneId,
  SessionId,
  SharedStarshipDetails,
} from '@astrolabe/shared';
import {
  SECTOR_PROPOSAL_TARGET,
  STARSHIP_PROPOSAL_TARGET,
  troubleProposalTarget,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';
import { cryptoRandomSource } from '../random-source.js';
import { buildLaunchWorkspace } from '../launch/workspace.js';

import { appendCommand, readEvents, type AppendResult } from './event-store.js';
import { uuidv7 } from './uuid.js';

/**
 * A launch command is closed two ways.
 *
 * `campaign.activated` is the obvious one. The other is D-178: a campaign that
 * has begun a session is in play, whatever its phase says. Every Milestone 1
 * campaign is in exactly that position — it has sessions and no
 * `campaign.activated`, so a phase-only guard left the built-in fixtures open
 * to launch writes.
 */
export function launchClosedReason(state: CampaignState): LaunchClosedReason | undefined {
  if (state.launch.phase === 'active') return 'campaign_active';
  if (state.session !== null) return 'campaign_in_play';
  return undefined;
}

/**
 * The refusal, over the predicate above. The launch workspace read layer asks
 * the same function, so the client's routing decision and this refusal cannot
 * drift into disagreeing about whether a campaign is still in launch.
 */
export function requireLaunchOpen(state: CampaignState, whenActive: string): void {
  const reason = launchClosedReason(state);
  if (reason === 'campaign_active') throw new LaunchRejectedError(reason, whenActive);
  if (reason === 'campaign_in_play')
    throw new LaunchRejectedError(
      reason,
      'This campaign is already in play; Campaign Launch is closed for it.',
    );
}

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
  requireLaunchOpen(state, 'Launch drafts cannot change after activation.');
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
  requireLaunchOpen(state, 'Campaign foundation changes by amendment after activation.');
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
  /** The `creation.proposed` event this decision accepts, if any (D-161). */
  readonly proposalEventId?: EventId;
  readonly rng?: RandomSource;
}

/**
 * The Guide recommendation this decision accepts, if it names one.
 *
 * Two obligations from the design record meet here. An accepted value that
 * came from a proposal is **server-caused** by its `creation.proposed` event,
 * and its provenance says `guide_proposal` or `guide_proposal_edited`. Without
 * this, accepting a recommendation recorded `official_choice` —
 * indistinguishable from a player who picked the same option unaided, which is
 * the one thing A41's provenance exists to distinguish.
 *
 * Which of the two it was is decided here, by comparing what was proposed to
 * what is being accepted, rather than taken from the client: whether the player
 * edited the Guide's words is a fact about the player, and a screen has every
 * incentive to get it wrong by accident.
 *
 * The proposal is named by event id and checked against the held proposal in
 * the fold, so no second query is needed and a reloaded screen can still name
 * it — the projected proposal is the only reference the client ever sees.
 *
 * Only a chosen or written answer can accept a recommendation. A rolled
 * answer's source is the roll — the Guide recommends, it never rolls (section
 * 4) — and `leave_open` is a decision about the campaign that the Guide cannot
 * make, so both are refused rather than quietly relabelled.
 */
function acceptedProposal(
  state: CampaignState,
  request: DecideTruthRequest,
  decided: { readonly optionIndex: number | undefined; readonly text: string | undefined },
): { eventId: EventId; provenance: 'guide_proposal' | 'guide_proposal_edited' } | undefined {
  if (request.proposalEventId === undefined) return undefined;
  if (request.resolution !== 'selected' && request.resolution !== 'custom') {
    throw new LaunchRejectedError(
      'invalid_proposal_acceptance',
      'Only a chosen or written answer can accept a recommendation.',
    );
  }
  const held = heldProposal(
    state,
    request.truthId,
    'truth',
    request.proposalEventId,
    'That recommendation does not exist for this truth.',
  );
  const proposal = held.proposal;
  const unchanged =
    proposal.resolution === request.resolution &&
    (request.resolution === 'selected'
      ? proposal.optionIndex === decided.optionIndex
      : proposal.text?.trim() === decided.text);
  return {
    eventId: held.eventId,
    provenance: unchanged ? 'guide_proposal' : 'guide_proposal_edited',
  };
}

type HeldProposal<K extends CreationTargetKind> = Extract<
  CampaignState['launch']['proposals'][string],
  { readonly targetKind: K }
>;

/**
 * The held proposal a player says they are accepting, checked against the
 * fold (7.0c). Shared by every section that accepts a proposal by event id,
 * so "does this proposal exist for this target" has one answer. D-185 said
 * acceptance would generalize; until 7.0c it was typed to truths alone.
 */
function heldProposal<K extends CreationTargetKind>(
  state: CampaignState,
  targetId: string,
  targetKind: K,
  proposalEventId: EventId,
  unknown: string,
): HeldProposal<K> {
  const held = state.launch.proposals[targetId];
  if (held === undefined || held.eventId !== proposalEventId || held.targetKind !== targetKind)
    throw new LaunchRejectedError('unknown_proposal', unknown);
  return held as HeldProposal<K>;
}

/**
 * What accepting a starship proposal records (7.0c, D-166).
 *
 * Whether the player edited it is decided here by comparing the accepted
 * details to the proposed ones, never taken from the client (D-185). The
 * grounding is the rolls behind each field the player **kept**: a quirk they
 * replaced with their own words was not built from the roll that suggested it.
 */
function acceptedStarshipProposal(
  state: CampaignState,
  proposalEventId: EventId,
  details: SharedStarshipDetails,
): {
  eventId: EventId;
  provenance: 'guide_proposal' | 'guide_proposal_edited';
  groundedIn: EventId[];
} {
  const { proposal } = heldProposal(
    state,
    STARSHIP_PROPOSAL_TARGET,
    'starship',
    proposalEventId,
    'That ship proposal does not exist for this campaign.',
  );
  const same = (proposed: string, accepted: string) => proposed.trim() === accepted.trim();
  const keptName = same(proposal.name.value, details.name);
  const keptHistory = same(proposal.history.value, details.history);
  const keptQuirks = proposal.quirks.filter((quirk) =>
    details.quirks.some((accepted) => same(quirk.value, accepted)),
  );
  const unchanged =
    keptName &&
    keptHistory &&
    same(proposal.appearance.value, details.appearance) &&
    keptQuirks.length === proposal.quirks.length &&
    details.quirks.length === proposal.quirks.length;
  return {
    eventId: proposalEventId,
    provenance: unchanged ? 'guide_proposal' : 'guide_proposal_edited',
    groundedIn: [
      ...(keptName ? proposal.name.groundedIn : []),
      ...(keptHistory ? proposal.history.groundedIn : []),
      ...keptQuirks.flatMap((quirk) => quirk.groundedIn),
    ],
  };
}

export interface SaveSharedStarshipRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly starship: SharedStarshipDetails;
  /** The ship proposal being accepted, if any; resolved against the fold (7.0c). */
  readonly proposalEventId?: EventId;
  /** Field-level rolls the player kept (A41). Each must be a recorded oracle roll. */
  readonly groundedIn?: readonly EventId[];
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
  requireLaunchOpen(state, 'Launch proposals close after activation.');
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
  if (request.proposal.targetKind === 'starship' && request.targetId !== STARSHIP_PROPOSAL_TARGET)
    throw new LaunchRejectedError(
      'invalid_proposal_target',
      `A starship proposal targets "${STARSHIP_PROPOSAL_TARGET}": a campaign has one ship.`,
    );
  if (request.proposal.targetKind === 'sector' && request.targetId !== SECTOR_PROPOSAL_TARGET)
    throw new LaunchRejectedError(
      'invalid_proposal_target',
      `A sector proposal targets "${SECTOR_PROPOSAL_TARGET}": a campaign has one starting sector.`,
    );
  if (request.proposal.targetKind === 'trouble') {
    const target = troubleProposalTarget(request.proposal.proposal);
    if (request.targetId !== target)
      throw new LaunchRejectedError(
        'invalid_proposal_target',
        `That trouble proposal targets "${target}".`,
      );
  }
  if (
    request.proposal.targetKind === 'settlement' &&
    request.proposal.proposal.planet !== undefined &&
    request.proposal.proposal.location.value === 'deep_space'
  )
    throw new LaunchRejectedError(
      'deep_space_planet',
      'A deep-space settlement has no planet; only planetside and orbital ones do.',
    );
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
  requireLaunchOpen(state, 'Launch oracle rolls are closed after activation.');
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
  requireLaunchOpen(state, 'Launch oracle rolls are closed after activation.');
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
  /** What the player states; the id and baseline are the server's (8.0a). */
  readonly sector: DeepReadonly<LaunchSectorDetails>;
  /** The sector-name proposal being accepted, if any; resolved against the fold (8.0f). */
  readonly proposalEventId?: EventId;
  /** Field rolls the player kept, such as a rolled name (A41). */
  readonly groundedIn?: readonly EventId[];
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
  /** The accepted node being revised; absent to add one, whose id the server mints (8.0a). */
  readonly locationId?: EntityId;
  readonly location: DeepReadonly<LaunchLocationDetails>;
  /** A settlement's planet, accepted in the same command (8.0f, D-105). */
  readonly planet?: {
    readonly locationId?: EntityId | undefined;
    readonly details: DeepReadonly<LaunchPlanetDetails>;
    readonly groundedIn?: readonly EventId[] | undefined;
  };
  /** The settlement proposal being accepted, if any; resolved against the fold (8.0f). */
  readonly proposalEventId?: EventId;
  /** The key that proposal was made under: a `draftId`, or the `locationId` (D-196). */
  readonly proposalTargetId?: string;
  /** Field rolls the player kept (A41). Each must be a recorded oracle roll. */
  readonly groundedIn?: readonly EventId[];
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
  /** No id: the owner says which trouble this is, and the server keeps its id (8.0f). */
  readonly trouble: DeepReadonly<LaunchTroubleDetails>;
  /** The trouble proposal being accepted, if any; resolved against the fold (8.0f). */
  readonly proposalEventId?: EventId;
  /** The trouble roll, when the player kept a rolled result without the Guide (A41). */
  readonly groundedIn?: readonly EventId[];
}

/**
 * Accept or revise a trouble (8.0f).
 *
 * There is one sector trouble and one trouble per settlement, so the owner
 * names the trouble and the server keeps its id: a revision cannot become a
 * second trouble for the same place, which readiness would silently map over.
 * Accepting a proposal names it, and whether the player edited the Guide's
 * words is decided here (7.0c).
 */
export async function saveLaunchTrouble(
  sql: Sql,
  request: SaveLaunchTroubleRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  requireLaunchOpen(state, 'Troubles change by amendment after launch.');
  // The schema carries the shape rule — a settlement trouble has an owner and
  // a sector trouble cannot — so only the owner's *existence* is checked here,
  // which is campaign state and not something a schema can know.
  if (
    request.trouble.kind === 'settlement' &&
    state.launch.locations[request.trouble.ownerId]?.kind !== 'settlement'
  ) {
    throw new LaunchRejectedError(
      'invalid_trouble_owner',
      'A settlement trouble needs an accepted settlement.',
    );
  }
  const trouble = request.trouble;
  const previous = Object.values(state.launch.troubles).find((candidate) =>
    candidate.kind === 'sector'
      ? trouble.kind === 'sector'
      : trouble.kind === 'settlement' && candidate.ownerId === trouble.ownerId,
  );
  const troubleId = previous?.troubleId ?? (uuidv7() as EntityId);
  const kept = recordedRolls(events, request.groundedIn, 'A trouble');
  const accepted =
    request.proposalEventId === undefined
      ? undefined
      : acceptedTroubleProposal(state, trouble, request.proposalEventId);
  const acceptance = {
    provenance: accepted?.provenance ?? ('player_written' as const),
    groundedIn: [...new Set([...(accepted?.groundedIn ?? []), ...kept])],
    ...(previous === undefined ? {} : { supersedesEventId: previous.eventId }),
  };
  // Rebuilt per branch rather than spread, so the discriminant stays narrow.
  const payload =
    trouble.kind === 'settlement'
      ? {
          kind: trouble.kind,
          ownerId: trouble.ownerId,
          text: trouble.text,
          troubleId,
          ...acceptance,
        }
      : { kind: trouble.kind, text: trouble.text, troubleId, ...acceptance };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.trouble.establish' : 'launch.trouble.revise',
    actor: request.actor,
    ...(accepted === undefined ? {} : { causedBy: accepted.eventId }),
    events: [
      previous === undefined
        ? { type: 'trouble.established', payload }
        : { type: 'trouble.revised', payload },
    ],
    response: { troubleId },
  });
}

/** The rolls a request cites, each checked as a recorded oracle roll (A41). */
function recordedRolls(
  events: readonly AstrolabeEvent[],
  groundedIn: readonly EventId[] | undefined,
  what: string,
): readonly EventId[] {
  const rolls = new Set(
    events.filter((event) => event.type === 'oracle.rolled').map((event) => event.id),
  );
  if ((groundedIn ?? []).some((id) => !rolls.has(id)))
    throw new LaunchRejectedError(
      'invalid_grounding',
      `${what} may cite only recorded oracle rolls.`,
    );
  return groundedIn ?? [];
}

type Acceptance = {
  readonly eventId: EventId;
  readonly provenance: 'guide_proposal' | 'guide_proposal_edited';
  readonly groundedIn: readonly EventId[];
};

const sameWords = (proposed: string, accepted: string) => proposed.trim() === accepted.trim();

/** What accepting a trouble proposal records (8.0f); `acceptedStarshipProposal`'s shape. */
function acceptedTroubleProposal(
  state: CampaignState,
  trouble: DeepReadonly<LaunchTroubleDetails>,
  proposalEventId: EventId,
): Acceptance {
  const { proposal } = heldProposal(
    state,
    troubleProposalTarget(trouble),
    'trouble',
    proposalEventId,
    'That trouble proposal does not exist for this trouble.',
  );
  const kept = sameWords(proposal.text.value, trouble.text);
  return {
    eventId: proposalEventId,
    provenance: kept ? 'guide_proposal' : 'guide_proposal_edited',
    groundedIn: kept ? proposal.text.groundedIn : [],
  };
}

export async function setStartingSettlement(
  sql: Sql,
  request: SetStartingSettlementRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  requireLaunchOpen(state, 'The starting settlement changes by amendment after launch.');
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
  requireLaunchOpen(state, 'Map layout changes by amendment after launch.');
  const placed = Object.keys(request.coordinates) as EntityId[];
  if (placed.some((id) => state.launch.locations[id] === undefined)) {
    throw new LaunchRejectedError(
      'unknown_layout_location',
      'Map layout may only position accepted locations.',
    );
  }
  if (placed.some((id) => !isMapNode(state, id)))
    throw new LaunchRejectedError(
      'not_a_map_node',
      'Planets and stars appear in location details, not on the map (D-165).',
    );
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
  requireLaunchOpen(state, 'Routes change by amendment after launch.');
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
  if (
    !isMapNode(state, request.route.from) ||
    (typeof request.route.to === 'string' && !isMapNode(state, request.route.to))
  )
    throw new LaunchRejectedError(
      'not_a_map_node',
      'Passages connect settlements and other locations; planets and stars are details (D-165).',
    );
  // D-174: a passage is undirected, and two passages are the same passage
  // whichever way round they are stated. Comparing `to` with `===` missed an
  // off-map exit entirely, because that endpoint is an object and no two are
  // ever the same reference.
  const key = routeKey(request.route);
  const previous = state.launch.routes.find((route) => routeKey(route) === key);
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

/**
 * Whether a location is a node on the sector map (D-165, 8.0b).
 *
 * Settlements and other locations are the map; a planet belongs to its
 * settlement and the star to the sector, and both are shown as details.
 * Readiness counts only these as passage endpoints, so a command that accepted
 * a passage to a planet would record a fact that readiness then blocks.
 */
function isMapNode(state: CampaignState, id: EntityId): boolean {
  const kind = state.launch.locations[id]?.kind;
  return kind === 'settlement' || kind === 'other';
}

/** An undirected, structural identity for a passage. */
function routeKey(route: { readonly from: EntityId; readonly to: LaunchRouteEndpoint }): string {
  const to = typeof route.to === 'string' ? route.to : `off:${route.to.label}`;
  return [route.from, to].sort().join('|');
}

/**
 * Add or revise a canonical sector node, preserving the accepted predecessor.
 *
 * The id is the server's (8.0a). An add mints it; a revision names a node the
 * fold already holds, so a request can neither invent an id nor split one node
 * into two by sending a fresh one. A revision keeps the node's kind: a trouble,
 * a route or a settlement's `planetId` may already rest on what it is.
 *
 * **A settlement and its planet are one decision (8.0f, D-105)**, so a request
 * may carry the planet, and one command writes both, the planet first. The
 * alternative made the player accept a planet before the settlement that is
 * the reason for it. Accepting a Guide proposal names it by event id and by the
 * key it was made under (D-196), and whether the player edited it is decided
 * here, field by field (7.0c).
 */
export async function saveLaunchLocation(
  sql: Sql,
  request: SaveLaunchLocationRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  requireLaunchOpen(state, 'Locations change by amendment after launch.');
  if (state.launch.sector === undefined)
    throw new LaunchRejectedError(
      'sector_required',
      'Configure the sector before adding locations.',
    );
  const previous = revisedLocation(state, request.locationId, request.location.kind);
  const locationId = request.locationId ?? (uuidv7() as EntityId);
  const planet = request.planet;
  if (planet !== undefined && request.location.kind !== 'settlement')
    throw new LaunchRejectedError('planet_not_settlement', 'Only a settlement has a planet.');
  if (planet !== undefined && request.location.kind === 'settlement' && request.location.planetId)
    throw new LaunchRejectedError(
      'planet_conflict',
      'Name the planet once: accept it with the settlement, or link an accepted one.',
    );
  const planetPrevious =
    planet === undefined ? undefined : revisedLocation(state, planet.locationId, 'planet');
  const planetId = planet === undefined ? undefined : (planet.locationId ?? (uuidv7() as EntityId));
  const location =
    planetId === undefined || request.location.kind !== 'settlement'
      ? request.location
      : { ...request.location, planetId };
  if (location.kind === 'settlement' && location.planetId !== undefined) {
    // A deep-space settlement has no world, so a planet link would be a fact
    // readiness never reads and the screen could never explain (8.0b).
    if (location.location === 'deep_space')
      throw new LaunchRejectedError(
        'deep_space_planet',
        'A deep-space settlement has no planet; only planetside and orbital ones do.',
      );
    if (planet === undefined && state.launch.locations[location.planetId]?.kind !== 'planet')
      throw new LaunchRejectedError(
        'unknown_planet',
        'A planetside settlement must reference an accepted planet.',
      );
  }
  const kept = recordedRolls(events, request.groundedIn, 'A location');
  const planetKept = recordedRolls(events, planet?.groundedIn, 'A planet');
  let accepted: SettlementAcceptance | undefined;
  if (request.proposalEventId !== undefined) {
    const target = request.proposalTargetId ?? request.locationId;
    if (location.kind !== 'settlement' || target === undefined)
      throw new LaunchRejectedError(
        'invalid_proposal_acceptance',
        'Name the settlement proposal and the key it was made under.',
      );
    accepted = acceptedSettlementProposal(
      state,
      target,
      request.proposalEventId,
      location,
      planet?.details,
    );
  }

  const acceptance = (
    provenance: Acceptance['provenance'] | undefined,
    groundedIn: readonly EventId[],
    superseded: { readonly eventId: EventId } | undefined,
  ) => ({
    provenance: provenance ?? ('player_written' as const),
    groundedIn: [...new Set(groundedIn)],
    ...(superseded === undefined ? {} : { supersedesEventId: superseded.eventId }),
  });
  const planetEvents =
    planet === undefined || planetId === undefined
      ? []
      : [
          {
            type: planetPrevious === undefined ? 'location.added' : 'location.revised',
            payload: {
              ...planet.details,
              id: planetId,
              ...acceptance(
                accepted?.planet?.provenance,
                [...(accepted?.planet?.groundedIn ?? []), ...planetKept],
                planetPrevious,
              ),
            },
          } as const,
        ];
  const payload: PayloadFor<'location.added'> = {
    ...location,
    id: locationId,
    ...acceptance(accepted?.provenance, [...(accepted?.groundedIn ?? []), ...kept], previous),
  };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.location.add' : 'launch.location.revise',
    actor: request.actor,
    ...(accepted === undefined ? {} : { causedBy: accepted.eventId }),
    events: [
      ...planetEvents,
      previous === undefined
        ? { type: 'location.added', payload }
        : { type: 'location.revised', payload },
    ],
    response: { locationId, ...(planetId === undefined ? {} : { planetId }) },
  });
}

/**
 * The accepted node a request revises, or `undefined` for an add (8.0a). An id
 * the fold does not hold, or a revision that changes the node's kind, is
 * refused.
 */
function revisedLocation(
  state: CampaignState,
  locationId: EntityId | undefined,
  kind: LaunchLocationDetails['kind'],
): CampaignState['launch']['locations'][EntityId] | undefined {
  if (locationId === undefined) return undefined;
  const previous = state.launch.locations[locationId];
  if (previous === undefined)
    throw new LaunchRejectedError(
      'unknown_location',
      'Only an accepted location can be revised; add a new one without an id.',
    );
  if (previous.kind !== kind)
    throw new LaunchRejectedError(
      'location_kind_changed',
      `That location is a ${previous.kind}; a revision cannot make it a ${kind}.`,
    );
  return previous;
}

type SettlementAcceptance = Acceptance & {
  /** The planet's own acceptance, when the proposal carried one and the request accepts one. */
  readonly planet?: Omit<Acceptance, 'eventId'>;
};

/**
 * What accepting a settlement proposal records (8.0f, D-196).
 *
 * Field by field, as for the ship (7.0c): the grounding is the rolls behind
 * each field the player **kept**, and any field changed, dropped or added
 * makes the whole acceptance `guide_proposal_edited`. The planet is judged on
 * its own, because it is written as its own fact: a player who kept the
 * Guide's planet but renamed the settlement accepted the planet unedited.
 */
function acceptedSettlementProposal(
  state: CampaignState,
  targetId: string,
  proposalEventId: EventId,
  settlement: Extract<DeepReadonly<LaunchLocationDetails>, { readonly kind: 'settlement' }>,
  planet: DeepReadonly<LaunchPlanetDetails> | undefined,
): SettlementAcceptance {
  const { proposal } = heldProposal(
    state,
    targetId,
    'settlement',
    proposalEventId,
    'That settlement proposal does not exist for this settlement.',
  );
  const grounded: EventId[] = [];
  let edited = false;
  const keep = (
    proposed: { readonly value: string; readonly groundedIn: readonly EventId[] },
    accepted: string,
  ) => {
    if (sameWords(proposed.value, accepted)) grounded.push(...proposed.groundedIn);
    else edited = true;
  };
  const keepList = (
    proposed: readonly { readonly value: string; readonly groundedIn: readonly EventId[] }[],
    accepted: readonly string[],
  ) => {
    for (const item of proposed) {
      if (accepted.some((words) => sameWords(item.value, words))) grounded.push(...item.groundedIn);
      else edited = true;
    }
    if (accepted.length !== proposed.length) edited = true;
  };
  keep(proposal.name, settlement.name);
  keep(proposal.location, settlement.location);
  keep(proposal.population, settlement.population);
  keep(proposal.authority, settlement.authority);
  keepList(proposal.projects, settlement.projects);
  keepList(proposal.firstLooks ?? [], settlement.firstLooks ?? []);

  let planetAcceptance: SettlementAcceptance['planet'];
  if (proposal.planet === undefined) {
    if (planet !== undefined) edited = true;
  } else if (planet === undefined) {
    edited = true;
  } else {
    const keptClass = proposal.planet.planetClass.value === planet.planetClass;
    const keptName = sameWords(proposal.planet.name.value, planet.name);
    if (!keptClass || !keptName) edited = true;
    planetAcceptance = {
      provenance: keptClass && keptName ? 'guide_proposal' : 'guide_proposal_edited',
      groundedIn: [
        ...(keptClass ? proposal.planet.planetClass.groundedIn : []),
        ...(keptName ? proposal.planet.name.groundedIn : []),
      ],
    };
  }
  return {
    eventId: proposalEventId,
    provenance: edited ? 'guide_proposal_edited' : 'guide_proposal',
    groundedIn: grounded,
    ...(planetAcceptance === undefined ? {} : { planet: planetAcceptance }),
  };
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
  const amendment = stampedAmendment(state, request.amendment);
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: `launch.fact.amend.${subject}`,
    actor: request.actor,
    events: [
      {
        type: 'launch.fact_amended',
        payload: { ...amendment, reason, supersedesEventId: target!.id },
      },
    ],
    response: { subject, supersedesEventId: target!.id },
  });
}

/**
 * The amendment as recorded (7.0j). A starship amendment corrects what the
 * player stated, so its words are checked as acceptance checks them, and the
 * id, asset and integrity come from the projected ship rather than the
 * request: the same contract 7.0a gives `saveSharedStarship`. Integrity is
 * the current value, not the starting one, because an amendment corrects the
 * words and must not undo damage play has since recorded.
 */
function stampedAmendment(state: CampaignState, amendment: LaunchAmendment): LaunchAmendment {
  if (amendment.subject !== 'starship') return amendment;
  const current = state.launch.starship;
  if (current === undefined)
    throw new LaunchRejectedError('invalid_amendment_target', 'There is no ship to amend.');
  const problems = validateStarshipDetails(amendment.replacement);
  if (problems.length > 0)
    throw new LaunchRejectedError(
      'invalid_starship',
      problems.map((problem) => problem.message).join(' '),
    );
  return {
    subject: 'starship',
    replacement: {
      starshipId: current.starshipId,
      name: amendment.replacement.name,
      appearance: amendment.replacement.appearance,
      history: amendment.replacement.history,
      quirks: amendment.replacement.quirks,
      integrity: current.integrity,
      assetId: current.assetId,
    },
  };
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
  requireLaunchOpen(state, 'The incident changes by amendment after launch.');
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
  requireLaunchOpen(state, 'The connection changes by amendment after launch.');
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

/**
 * Establish or revise the one starting sector (8.0a).
 *
 * The player states its name, region and star; the server supplies the rest.
 * The id is minted once and reused on every revision, so a revision cannot
 * split the aggregate, and the baseline is read from the region's rule
 * (D-180) rather than checked against a copy the request sends — the field
 * records the rule, and only the rules can state it.
 */
export async function configureLaunchSector(
  sql: Sql,
  request: ConfigureLaunchSectorRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  requireLaunchOpen(state, 'The sector changes by amendment after launch.');
  const kept = recordedRolls(events, request.groundedIn, 'A sector');
  let accepted: Acceptance | undefined;
  if (request.proposalEventId !== undefined) {
    const { proposal } = heldProposal(
      state,
      SECTOR_PROPOSAL_TARGET,
      'sector',
      request.proposalEventId,
      'That sector proposal does not exist for this campaign.',
    );
    const keptName = sameWords(proposal.name.value, request.sector.name);
    accepted = {
      eventId: request.proposalEventId,
      provenance: keptName ? 'guide_proposal' : 'guide_proposal_edited',
      groundedIn: keptName ? proposal.name.groundedIn : [],
    };
  }
  // D-195: the optional star belongs to the sector, and is an accepted star.
  if (
    request.sector.starId !== undefined &&
    state.launch.locations[request.sector.starId]?.kind !== 'star'
  )
    throw new LaunchRejectedError('unknown_star', "The sector's star must be an accepted star.");
  const previous = state.launch.sector;
  const sectorId = previous?.sectorId ?? (uuidv7() as EntityId);
  const { settlements, passages } = REGION_BASELINES[request.sector.region];
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: previous === undefined ? 'launch.sector.configure' : 'launch.sector.revise',
    actor: request.actor,
    ...(accepted === undefined ? {} : { causedBy: accepted.eventId }),
    events: [
      {
        type: 'sector.configured',
        payload: {
          sectorId,
          name: request.sector.name,
          region: request.sector.region,
          baseline: { settlements, passages },
          ...(request.sector.starId === undefined ? {} : { starId: request.sector.starId }),
          provenance: accepted?.provenance ?? 'player_written',
          groundedIn: [...new Set([...(accepted?.groundedIn ?? []), ...kept])],
          ...(previous === undefined ? {} : { supersedesEventId: previous.eventId }),
        },
      },
    ],
    response: { sectorId },
  });
}

/**
 * Accept or revise the single campaign-owned starship.
 *
 * The player states the details; the server supplies the rest (7.0a). The id
 * is minted once and reused on every revision, so a revision cannot split the
 * aggregate, and the asset and integrity come from the rules.
 */
export async function saveSharedStarship(
  sql: Sql,
  request: SaveSharedStarshipRequest,
): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  requireLaunchOpen(state, 'The starship changes by amendment after launch.');
  const rolls = new Set(
    events.filter((event) => event.type === 'oracle.rolled').map((event) => event.id),
  );
  if ((request.groundedIn ?? []).some((id) => !rolls.has(id)))
    throw new LaunchRejectedError(
      'invalid_grounding',
      'A starship may cite only recorded oracle rolls.',
    );
  const current = state.launch.starship;
  const baseline = sharedStarshipBaseline(STARFORGED);
  const starship = {
    starshipId: current?.starshipId ?? (uuidv7() as EntityId),
    name: request.starship.name,
    appearance: request.starship.appearance,
    history: request.starship.history,
    quirks: request.starship.quirks,
    integrity: baseline.integrity,
    assetId: baseline.assetId,
  };
  const problems = validateSharedStarship(starship, STARFORGED);
  if (problems.length > 0)
    throw new LaunchRejectedError(
      'invalid_starship',
      problems.map((problem) => problem.message).join(' '),
    );
  const accepted =
    request.proposalEventId === undefined
      ? undefined
      : acceptedStarshipProposal(state, request.proposalEventId, request.starship);
  const acceptance = {
    provenance: accepted?.provenance ?? ('player_written' as const),
    groundedIn: [...new Set([...(accepted?.groundedIn ?? []), ...(request.groundedIn ?? [])])],
  };
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: current === undefined ? 'launch.starship.establish' : 'launch.starship.revise',
    actor: request.actor,
    ...(accepted === undefined ? {} : { causedBy: accepted.eventId }),
    events:
      current === undefined
        ? [{ type: 'starship.established', payload: { ...starship, ...acceptance } }]
        : [
            {
              type: 'starship.revised',
              payload: { starship, ...acceptance, supersedesEventId: current.eventId },
            },
          ],
    response: { starshipId: starship.starshipId },
  });
}

/**
 * Which event types state an accepted launch fact, as opposed to grounding it
 * (`oracle.rolled`), proposing it (`creation.proposed`) or saving a draft of
 * it. `campaign.activated` cites these, and `AMENDABLE_SUBJECTS` names the
 * same set — an accepted fact is exactly what an amendment can supersede.
 */
const ACCEPTED_LAUNCH_FACTS: ReadonlySet<EventType> = new Set([
  ...(Object.keys(AMENDABLE_SUBJECTS) as EventType[]),
  'starting_settlement.selected',
  'sector.layout_changed',
]);

/**
 * The readiness contract `campaign.activated` was validated against.
 *
 * It is stamped on the activation so a later change to the launch rules can
 * tell which campaigns were admitted under which version, rather than being
 * re-derived from a log that no longer matches today's rules. Bump it when a
 * change to `validateLaunchReadiness` would admit or refuse a campaign the
 * previous version would not.
 */
const READINESS_VERSION = 1;

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
  requireLaunchOpen(state, 'This campaign has already launched.');
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
  // The accepted launch facts, not every event that is not a draft: an
  // `oracle.rolled` or an `ai.completed` is grounding or accounting, and the
  // design record asks for "complete accepted launch-fact event ids".
  const launchFactEventIds = eventsSoFar
    .filter((event) => ACCEPTED_LAUNCH_FACTS.has(event.type))
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
      requireLaunchOpen(current.state, 'This campaign has already launched.');
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
          readinessVersion: READINESS_VERSION,
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
  requireLaunchOpen(state, 'Truths change by amendment after activation.');
  const truth = STARFORGED.truths.find((candidate) => candidate.id === request.truthId);
  if (truth === undefined)
    throw new LaunchRejectedError('unknown_truth', 'That is not a setting truth.');

  let optionIndex = request.optionIndex;
  let text: string | undefined;
  let summary: string | undefined;
  let questStarter: string | undefined;
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
    // D-183: `text` is the resolved answer, which for a chosen option is its
    // description — the same string this line wrote before the adapter stopped
    // making `row.text` double as one. `summary` is recorded beside it so an
    // overview line and a chip have the short form without re-deriving it.
    text = option.description;
    summary = option.summary;
    // D-162: the option's quest starter is inspiration for the incident, not
    // canon by itself. Recorded on the decision so incident generation can
    // read it (A25); nothing treats it as an accepted fact.
    questStarter = option.questStarter;
  } else if (request.resolution === 'custom') {
    text = request.text?.trim();
    if (text === undefined || text === '')
      throw new LaunchRejectedError('custom_text_required', 'A custom truth needs text.');
  }
  const previous = state.launch.truthDecisions[request.truthId];
  const accepted = acceptedProposal(state, request, { optionIndex, text });
  events.push({
    ...(accepted === undefined ? {} : { causedBy: accepted.eventId }),
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
      ...(summary !== undefined ? { summary } : {}),
      ...(questStarter !== undefined ? { questStarter } : {}),
      provenance:
        accepted !== undefined
          ? accepted.provenance
          : request.resolution === 'rolled'
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
