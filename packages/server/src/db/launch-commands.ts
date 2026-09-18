import {
  materializeLaunchRecipe,
  rollOracle,
  rollRecipe,
  REGION_BASELINES,
  sharedStarshipBaseline,
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
  CampaignState,
  CreationProposal,
  CreationTargetKind,
  EventType,
  LaunchAmendment,
  LaunchAmendmentSubject,
  LaunchClosedReason,
  LaunchRouteEndpoint,
  CampaignSettings,
  CommandId,
  EntityId,
  EventId,
  PayloadFor,
  SceneId,
  SessionId,
  SharedStarshipDetails,
} from '@astrolabe/shared';
import { STARSHIP_PROPOSAL_TARGET } from '@astrolabe/shared';
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
  requireLaunchOpen(state, 'Troubles change by amendment after launch.');
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

/** An undirected, structural identity for a passage. */
function routeKey(route: { readonly from: EntityId; readonly to: LaunchRouteEndpoint }): string {
  const to = typeof route.to === 'string' ? route.to : `off:${route.to.label}`;
  return [route.from, to].sort().join('|');
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
  requireLaunchOpen(state, 'Locations change by amendment after launch.');
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

/** Establish the region and its immutable rules-derived baseline. */
export async function configureLaunchSector(
  sql: Sql,
  request: ConfigureLaunchSectorRequest,
): Promise<AppendResult> {
  const state = project(await readEvents(sql, request.campaignId));
  requireLaunchOpen(state, 'The sector changes by amendment after launch.');
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
