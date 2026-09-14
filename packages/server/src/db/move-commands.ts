import {
  evaluateCondition,
  MOVE_AUTOMATION_SPECS,
  resolveActionMove,
  resolveEffectTarget,
  resolveMethodOption,
  resolvePayThePriceChain,
  STARFORGED,
  type CharacterId,
  type Choice,
  type ConditionFacts,
  type Effect,
  type MoveId,
  type MoveInvocation,
  type OutcomeTier,
  type RandomSource,
  type RollAdjustment,
  type TrackId,
} from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CampaignState,
  CharacterState,
  CommandId,
  Delta,
  EventId,
  TracedDelta,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';
import { cryptoRandomSource } from '../random-source.js';

import { appendCommand, readEvents, type AppendResult, type NewEvent } from './event-store.js';

/**
 * Resolving a move (task 6.x): the write API D-94 left for group 6 to add,
 * since it had no task number of its own in the list.
 *
 * One command per player decision, following design-event-log.md §1's own
 * worked example almost verbatim: `move.invoked`, `dice.rolled` and
 * `state.changed` (the tier's unconditional effects, when there are any)
 * are written together in one transaction from one `POST
 * /campaigns/:id/moves`. A tier that offers a `Choice` leaves its
 * choice-dependent effects for a follow-up `applyMoveChoice` command — the
 * player has not decided yet, so there is nothing to write for them.
 *
 * `causedBy` links a command to the roll or chain that produced it,
 * exactly as `golden-beats.ts`'s hand-written momentum-burn command already
 * does; it is always set here, never accepted from the client (section 2's
 * rule) — see `resolveChainedFrom` below for how a chained invocation's
 * `causedBy` is derived and checked instead of trusted outright.
 */

export class MoveRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoveRejectedError';
  }
}

function requireCharacter(state: CampaignState, id: CharacterId, label: string): CharacterState {
  const character = state.characters[id];
  if (character === undefined) {
    throw new MoveRejectedError(`${label} "${id}" is not a character in this campaign.`);
  }
  return character;
}

/** Converts one resolved `Effect` into the concrete `Delta` it applies — D-62's redirect happens here, once. */
function effectToDelta(effect: Effect, invocation: MoveInvocation, tier: OutcomeTier): Delta {
  switch (effect.kind) {
    case 'momentum':
      return {
        kind: 'momentum',
        characterId: resolveEffectTarget(effect.target, invocation, tier),
        delta: effect.delta,
      };
    case 'momentum_reset':
      return {
        kind: 'momentum_reset',
        characterId: resolveEffectTarget(effect.target, invocation, tier),
      };
    case 'meter':
      return {
        kind: 'meter',
        characterId: resolveEffectTarget(effect.target, invocation, tier),
        meter: effect.meter,
        delta: effect.delta,
      };
    case 'bonus_next_move':
      return {
        kind: 'bonus_next_move',
        characterId: resolveEffectTarget(effect.target, invocation, tier),
        amount: effect.amount,
        ...(effect.excludes !== undefined ? { excludes: effect.excludes } : {}),
      };
    case 'impact':
      return {
        kind: 'impact',
        characterId: resolveEffectTarget(effect.target, invocation, tier),
        impact: effect.impact,
        set: effect.set,
      };
    case 'progress':
    case 'oracle_roll':
    case 'proposed_amount':
      // None of D-59's Automated outcomes use these kinds in their
      // unconditional or choice effects (verified in traceability.test.ts's
      // spec set) — `oracle_roll` and `proposed_amount` are handled by their
      // own callers (resolvePayThePriceMethod, the preRoll branch below),
      // and no spec uses `progress` at all (delta.ts's own comment: track
      // movement goes through `track.advanced` instead).
      throw new Error(
        `Effect kind "${effect.kind}" has no direct Delta and must be handled by its own caller.`,
      );
  }
}

function tracedDeltas(
  effects: readonly { readonly effect: Effect; readonly clause: string }[],
  invocation: MoveInvocation,
  tier: OutcomeTier,
): TracedDelta[] {
  return effects.map((e) => ({
    delta: effectToDelta(e.effect, invocation, tier),
    clause: e.clause,
  }));
}

/** The add the server computes itself from `using` — never trusted from the client (setTruth's trust boundary). */
function baseAdd(
  character: CharacterState,
  using: NonNullable<InvokeMoveRequest['using']>,
): RollAdjustment {
  switch (using.using) {
    case 'stat':
      return { amount: character.stats[using.stat], label: using.stat };
    case 'condition_meter':
      return { amount: character.meters[using.meter].value, label: using.meter };
    case 'progress_track':
      // No Milestone 1 Automated action move rolls against a progress
      // track (Reach a Milestone's own automation is unmodeled) — a
      // progress-track roll is a different dice function entirely
      // (resolveProgressRoll), out of this endpoint's scope.
      throw new MoveRejectedError('Rolling against a progress track is not supported yet.');
  }
}

/** Beat 5's +1: applied automatically once, never something the client asserts. */
function bonusAdd(character: CharacterState, using: InvokeMoveRequest['using']): RollAdjustment[] {
  const bonus = character.bonusNextMove;
  if (bonus === undefined) {
    return [];
  }
  if (bonus.excludes === 'progress_moves' && using?.using === 'progress_track') {
    return [];
  }
  return [{ amount: bonus.amount, label: 'bonus from an earlier move' }];
}

/**
 * Validates a chain-follow invocation against the log rather than trusting
 * the client's `chainedFromCommandId` outright: it must name a real
 * `move.chained` event — written in that earlier command — whose `toMoveId`
 * matches the move now being invoked. The matched event's own (already
 * persisted) id becomes `causedBy` — a client cannot forge causality by
 * naming an arbitrary command, only follow a chain the server itself
 * offered (section 2's rule for `causedBy`, applied to the one place group
 * 6 lets a client point at a prior command at all).
 */
function resolveChainedFrom(
  events: readonly AstrolabeEvent[],
  chainedFromCommandId: CommandId,
  moveId: MoveId,
): EventId {
  const chained = events.find(
    (e) =>
      e.type === 'move.chained' &&
      e.commandId === chainedFromCommandId &&
      e.payload.toMoveId === moveId,
  );
  if (chained === undefined) {
    throw new MoveRejectedError(
      `No chain to "${moveId}" was offered from command "${chainedFromCommandId}".`,
    );
  }
  return chained.id;
}

/**
 * D-130: a `proposalEventId` must name a live `amount.proposed` for this
 * very commitment: the same move, character and meter, not voided. Any
 * other reference is refused rather than ignored, because the proposal's
 * injury becomes the fiction the passage narrates.
 */
function requireLiveProposal(
  events: readonly AstrolabeEvent[],
  request: Pick<InvokeMoveRequest, 'proposalEventId' | 'moveId' | 'actorCharacterId'>,
  meter: 'health' | 'spirit' | 'supply' | undefined,
): void {
  if (meter === undefined) {
    throw new MoveRejectedError(`"${request.moveId}" has no amount for a proposal to belong to.`);
  }
  const proposal = events.find((e) => e.id === request.proposalEventId);
  if (proposal?.type !== 'amount.proposed') {
    throw new MoveRejectedError('That is not one of the Guide’s proposals in this campaign.');
  }
  if (
    proposal.payload.moveId !== request.moveId ||
    proposal.payload.characterId !== request.actorCharacterId ||
    proposal.payload.meter !== meter
  ) {
    throw new MoveRejectedError('That proposal was for a different move, character or meter.');
  }
  if (isSuppressed(proposal, computeVoidState(events))) {
    throw new MoveRejectedError('That proposal has been voided.');
  }
}

/**
 * D-135: a `suggestionEventId` must name a live `move.suggested` for this
 * same move and actor. What the player then rolled with and wrote is
 * theirs; only the move and who acts must match what was suggested.
 */
function requireLiveSuggestion(
  events: readonly AstrolabeEvent[],
  request: Pick<InvokeMoveRequest, 'suggestionEventId' | 'moveId' | 'actorCharacterId'>,
): void {
  const suggestion = events.find((e) => e.id === request.suggestionEventId);
  if (suggestion?.type !== 'move.suggested') {
    throw new MoveRejectedError(
      'That is not one of the Guide’s move suggestions in this campaign.',
    );
  }
  if (
    suggestion.payload.moveId !== request.moveId ||
    suggestion.payload.actorCharacterId !== request.actorCharacterId
  ) {
    throw new MoveRejectedError('That suggestion was for a different move or character.');
  }
  if (isSuppressed(suggestion, computeVoidState(events))) {
    throw new MoveRejectedError('That suggestion has been voided.');
  }
}

export interface InvokeMoveRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly moveId: MoveId;
  readonly actorCharacterId: CharacterId;
  readonly aidingAllyId?: CharacterId;
  readonly using?:
    | { readonly using: 'stat'; readonly stat: 'edge' | 'heart' | 'iron' | 'shadow' | 'wits' }
    | { readonly using: 'condition_meter'; readonly meter: 'health' | 'spirit' | 'supply' }
    | { readonly using: 'progress_track'; readonly trackId: TrackId };
  readonly adds: readonly RollAdjustment[];
  readonly actionText?: string;
  readonly preRollAmount?: number;
  /** D-130: the Guide's live proposal this amount was committed against. */
  readonly proposalEventId?: EventId;
  /** D-135: the Guide's live suggestion this invocation was filled from. */
  readonly suggestionEventId?: EventId;
  readonly chainedFromCommandId?: CommandId;
  /** Test-only override of the real RNG; defaults to `cryptoRandomSource()`. */
  readonly rng?: RandomSource;
}

export interface PendingChoiceView {
  readonly moveId: MoveId;
  readonly tier: OutcomeTier;
  readonly choiceId: string;
  readonly prompt: string;
  readonly pick: { readonly min: number; readonly max: number };
  readonly optional: boolean;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
  }[];
  readonly rollEventId: EventId;
}

export interface ChainView {
  readonly toMoveId: MoveId;
  readonly mode: 'auto' | 'offer';
  readonly reason: string;
}

export interface InvokedMoveRoll {
  readonly actionDie: number;
  readonly adds: readonly RollAdjustment[];
  readonly actionScore: number;
  readonly challengeDice: readonly [number, number];
  readonly tier: OutcomeTier;
  readonly isMatch: boolean;
  readonly burnOffer?: {
    readonly wouldBecome: OutcomeTier;
    readonly momentum: number;
    readonly resetsTo: number;
  };
}

export interface InvokedMove {
  readonly invocationEventId: EventId;
  readonly rollEventId: EventId;
  readonly roll: InvokedMoveRoll;
  readonly result: AppendResult;
  readonly pendingChoice?: PendingChoiceView;
  readonly chain?: ChainView;
}

export async function invokeMove(sql: Sql, request: InvokeMoveRequest): Promise<InvokedMove> {
  const automation = MOVE_AUTOMATION_SPECS.get(request.moveId);
  if (automation === undefined) {
    throw new MoveRejectedError(`"${request.moveId}" has no Milestone 1 automation.`);
  }
  if (automation.method !== undefined) {
    throw new MoveRejectedError(
      `"${request.moveId}" is a no_roll move — resolve its method instead.`,
    );
  }
  if (Object.keys(automation.outcomes).length === 0) {
    throw new MoveRejectedError(`"${request.moveId}" has no Milestone 1 outcome automation.`);
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const actorCharacter = requireCharacter(state, request.actorCharacterId, 'actorCharacterId');
  if (request.aidingAllyId !== undefined) {
    requireCharacter(state, request.aidingAllyId, 'aidingAllyId');
  }

  let causedBy: EventId | undefined;
  if (request.chainedFromCommandId !== undefined) {
    causedBy = resolveChainedFrom(events, request.chainedFromCommandId, request.moveId);
  }

  let preRollMeter: 'health' | 'spirit' | 'supply' | undefined;
  if (automation.preRoll !== undefined) {
    if (request.preRollAmount === undefined) {
      throw new MoveRejectedError(`"${request.moveId}" needs a committed amount before it rolls.`);
    }
    const proposedEffect = automation.preRoll.effects.find(
      (e) => e.effect.kind === 'proposed_amount',
    )?.effect;
    if (proposedEffect === undefined || proposedEffect.kind !== 'proposed_amount') {
      throw new Error(`"${request.moveId}" declares a preRoll with no proposed_amount effect.`);
    }
    const [min, max] = proposedEffect.range;
    if (request.preRollAmount < min || request.preRollAmount > max) {
      throw new MoveRejectedError(
        `The committed amount must be between ${min} and ${max} for "${request.moveId}".`,
      );
    }
    preRollMeter = proposedEffect.meter;
  } else if (request.preRollAmount !== undefined) {
    throw new MoveRejectedError(`"${request.moveId}" has no preRoll amount to commit.`);
  }
  if (request.proposalEventId !== undefined) {
    requireLiveProposal(events, request, preRollMeter);
  }
  if (request.suggestionEventId !== undefined) {
    requireLiveSuggestion(events, request);
  }

  const invocation: MoveInvocation = {
    moveId: request.moveId,
    actorId: request.actorCharacterId,
    ...(request.aidingAllyId !== undefined ? { aidingAllyId: request.aidingAllyId } : {}),
  };

  // A preRoll effect is suffered *before* the roll it precedes (Endure
  // Harm: take the harm, then roll +iron or +health — whichever is higher
  // — against what is left). The base add must read that post-harm value,
  // not the pre-command snapshot, when the roll uses the same meter the
  // preRoll just changed.
  const rollingCharacter =
    request.preRollAmount !== undefined &&
    preRollMeter !== undefined &&
    request.using?.using === 'condition_meter' &&
    request.using.meter === preRollMeter
      ? {
          ...actorCharacter,
          meters: {
            ...actorCharacter.meters,
            [preRollMeter]: {
              ...actorCharacter.meters[preRollMeter],
              value: Math.max(
                actorCharacter.meters[preRollMeter].min,
                Math.min(
                  actorCharacter.meters[preRollMeter].max,
                  actorCharacter.meters[preRollMeter].value + request.preRollAmount,
                ),
              ),
            },
          },
        }
      : actorCharacter;

  const adds: RollAdjustment[] = [
    ...(request.using !== undefined ? [baseAdd(rollingCharacter, request.using)] : []),
    ...bonusAdd(actorCharacter, request.using),
    ...request.adds,
  ];

  const resolved = resolveActionMove(
    automation,
    request.rng ?? cryptoRandomSource(),
    adds,
    actorCharacter.momentum.value,
    actorCharacter.markedImpacts,
  );

  const sessionId = state.session?.id ?? null;
  const newEvents: NewEvent[] = [
    {
      type: 'move.invoked',
      payload: {
        moveId: request.moveId,
        actorCharacterId: request.actorCharacterId,
        ...(request.aidingAllyId !== undefined ? { aidingAllyId: request.aidingAllyId } : {}),
        ...(request.using !== undefined ? { using: request.using } : {}),
        adds,
        ...(request.actionText !== undefined ? { actionText: request.actionText } : {}),
        ...(request.suggestionEventId !== undefined
          ? { suggestionEventId: request.suggestionEventId }
          : {}),
      },
      sessionId,
      subjectCharacterId: request.actorCharacterId,
    },
  ];

  if (request.preRollAmount !== undefined && preRollMeter !== undefined) {
    // Always the actor's own sheet: a preRoll effect precedes any tier, so
    // there is no hit/miss to redirect Aid Your Ally's benefits on yet
    // (resolveEffectTarget's redirect only ever applies to a resolved tier).
    newEvents.push(
      {
        type: 'amount.committed',
        payload: {
          moveId: request.moveId,
          characterId: request.actorCharacterId,
          meter: preRollMeter,
          amount: request.preRollAmount,
          ...(request.proposalEventId !== undefined
            ? { proposalEventId: request.proposalEventId }
            : {}),
        },
        sessionId,
      },
      {
        type: 'state.changed',
        payload: {
          cause: { kind: 'preroll_effect', moveId: request.moveId },
          changes: [
            {
              delta: {
                kind: 'meter',
                characterId: request.actorCharacterId,
                meter: preRollMeter,
                delta: request.preRollAmount,
              },
            },
          ],
        },
        sessionId,
        actor: { kind: 'system' },
      },
    );
  }

  newEvents.push({
    type: 'dice.rolled',
    payload: {
      kind: 'action',
      actionDie: resolved.roll.actionDie,
      adds: resolved.roll.adds,
      actionScore: resolved.roll.actionScore,
      challengeDice: resolved.roll.challengeDice,
      tier: resolved.roll.tier,
      isMatch: resolved.roll.isMatch,
      ...(resolved.roll.burnOffer !== undefined ? { burnOffer: resolved.roll.burnOffer } : {}),
      rng: { source: 'crypto' },
    },
    sessionId,
    actor: { kind: 'system' },
  });

  if (resolved.chain !== undefined && 'to' in resolved.chain) {
    newEvents.push({
      type: 'move.chained',
      payload: {
        fromMoveId: request.moveId,
        toMoveId: resolved.chain.to,
        mode: resolved.chain.mode,
        reason: resolved.chain.reason,
      },
      sessionId,
      actor: { kind: 'system' },
    });
  }

  // A pending choice's own effects are not written here — the player has
  // not decided yet, and `applyMoveChoice` is where those land.
  const pendingChoice = resolved.choices[0];
  if (pendingChoice === undefined && resolved.effects.length > 0) {
    newEvents.push({
      type: 'state.changed',
      payload: {
        cause: { kind: 'move_outcome', moveId: request.moveId, tier: resolved.roll.tier },
        changes: tracedDeltas(resolved.effects, invocation, resolved.roll.tier),
      },
      sessionId,
      actor: { kind: 'system' },
    });
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'move.invoke',
    actor: request.actor,
    events: newEvents,
    ...(causedBy !== undefined ? { causedBy } : {}),
  });

  const invocationEventId = result.events.find((e) => e.type === 'move.invoked')?.id;
  const rollEventId = result.events.find((e) => e.type === 'dice.rolled')?.id;
  if (invocationEventId === undefined || rollEventId === undefined) {
    throw new Error('appendCommand did not return the events it was asked to write.');
  }

  const chainInfo: ChainView | undefined =
    resolved.chain !== undefined && 'to' in resolved.chain
      ? { toMoveId: resolved.chain.to, mode: resolved.chain.mode, reason: resolved.chain.reason }
      : undefined;

  return {
    invocationEventId,
    rollEventId,
    roll: {
      actionDie: resolved.roll.actionDie,
      adds: resolved.roll.adds,
      actionScore: resolved.roll.actionScore,
      challengeDice: resolved.roll.challengeDice,
      tier: resolved.roll.tier,
      isMatch: resolved.roll.isMatch,
      ...(resolved.roll.burnOffer !== undefined ? { burnOffer: resolved.roll.burnOffer } : {}),
    },
    result,
    ...(pendingChoice !== undefined
      ? {
          pendingChoice: choiceView(
            pendingChoice,
            request.moveId,
            resolved.roll.tier,
            rollEventId,
            targetCharacterFacts(state, invocation, resolved.roll.tier),
          ),
        }
      : {}),
    ...(chainInfo !== undefined ? { chain: chainInfo } : {}),
  };
}

/** The character an outcome's `available` conditions and effects resolve against — the actor, or an aided ally on a hit. */
function targetCharacterFacts(
  state: CampaignState,
  invocation: MoveInvocation,
  tier: OutcomeTier,
): ConditionFacts {
  const targetId = resolveEffectTarget('actor', invocation, tier);
  const character = requireCharacter(state, targetId, 'effect target');
  return {
    hasImpact: (impact) => character.impacts[impact] === true,
    meterValue: (meter) => character.meters[meter].value,
  };
}

function choiceView(
  choice: Choice,
  moveId: MoveId,
  tier: OutcomeTier,
  rollEventId: EventId,
  facts: ConditionFacts,
): PendingChoiceView {
  return {
    moveId,
    tier,
    choiceId: choice.id,
    prompt: choice.prompt,
    pick: choice.pick,
    optional: choice.optional ?? false,
    rollEventId,
    options: choice.options.map((option) => ({
      id: option.id,
      label: option.label,
      available: option.available === undefined || evaluateCondition(option.available, facts),
    })),
  };
}

/**
 * The player's pick from a pending `Choice` (task 6.6). Everything about
 * *which* move, tier and choice this resolves is derived from the stored
 * `dice.rolled` event and its sibling `move.invoked` — the client sends
 * only `rollEventId` plus the pick, never the move or tier back (there is
 * nothing to gain from trusting a client's echo of state the server itself
 * just wrote).
 */
export interface ApplyMoveChoiceRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly rollEventId: EventId;
  readonly choiceId: string;
  readonly optionIds: readonly string[];
}

export async function applyMoveChoice(
  sql: Sql,
  request: ApplyMoveChoiceRequest,
): Promise<{ readonly result: AppendResult }> {
  const events = await readEvents(sql, request.campaignId);
  const rollEvent = events.find((e) => e.id === request.rollEventId);
  if (rollEvent === undefined || rollEvent.type !== 'dice.rolled') {
    throw new MoveRejectedError(`"${request.rollEventId}" is not a roll.`);
  }
  const invocationEvent = events.find(
    (e) => e.commandId === rollEvent.commandId && e.type === 'move.invoked',
  );
  if (invocationEvent === undefined || invocationEvent.type !== 'move.invoked') {
    throw new Error(
      'A dice.rolled event with no sibling move.invoked — the store is inconsistent.',
    );
  }

  const tier = rollEvent.payload.tier;
  const automation = MOVE_AUTOMATION_SPECS.get(invocationEvent.payload.moveId);
  const choice = automation?.outcomes[tier]?.choices?.find((c) => c.id === request.choiceId);
  if (automation === undefined || choice === undefined) {
    throw new MoveRejectedError(`"${request.choiceId}" is not a choice on this roll's outcome.`);
  }
  if (request.optionIds.length < choice.pick.min || request.optionIds.length > choice.pick.max) {
    throw new MoveRejectedError(
      `"${request.choiceId}" needs between ${choice.pick.min} and ${choice.pick.max} picks.`,
    );
  }

  const invocation: MoveInvocation = {
    moveId: invocationEvent.payload.moveId,
    actorId: invocationEvent.payload.actorCharacterId,
    ...(invocationEvent.payload.aidingAllyId !== undefined
      ? { aidingAllyId: invocationEvent.payload.aidingAllyId }
      : {}),
  };

  const state = project(events);
  const facts = targetCharacterFacts(state, invocation, tier);

  const effects = request.optionIds.flatMap((optionId) => {
    const option = choice.options.find((o) => o.id === optionId);
    if (option === undefined) {
      throw new MoveRejectedError(`"${optionId}" is not an option of "${request.choiceId}".`);
    }
    if (option.available !== undefined && !evaluateCondition(option.available, facts)) {
      throw new MoveRejectedError(`"${optionId}" is not available right now.`);
    }
    return option.effects;
  });

  const sessionId = state.session?.id ?? null;
  const newEvents: NewEvent[] = [
    {
      type: 'move.choice_made',
      payload: {
        moveId: invocation.moveId,
        tier,
        choiceId: request.choiceId,
        optionIds: request.optionIds,
        rollEventId: request.rollEventId,
      },
      sessionId,
    },
  ];
  if (effects.length > 0) {
    newEvents.push({
      type: 'state.changed',
      payload: {
        cause: { kind: 'move_outcome', moveId: invocation.moveId, tier },
        changes: tracedDeltas(effects, invocation, tier),
      },
      sessionId,
      actor: { kind: 'system' },
    });
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'move.choice',
    actor: request.actor,
    events: newEvents,
    causedBy: request.rollEventId,
  });

  return { result };
}

/**
 * Accepting a momentum-burn offer (task 6.7, A8, Beat 5). Mirrors
 * `golden-beats.ts`'s hand-written momentum-burn command exactly:
 * `momentum.burned` records the fact, `state.changed`'s `momentum_reset`
 * delta does the actual mutation, derived at projection time rather than
 * stored (it depends on marked impacts, which can change under a void).
 */
export interface BurnMomentumRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly rollEventId: EventId;
}

export interface BurnedMomentum {
  readonly tierAfter: OutcomeTier;
  readonly result: AppendResult;
}

export async function burnMomentum(
  sql: Sql,
  request: BurnMomentumRequest,
): Promise<BurnedMomentum> {
  const events = await readEvents(sql, request.campaignId);
  const rollEvent = events.find((e) => e.id === request.rollEventId);
  if (
    rollEvent === undefined ||
    rollEvent.type !== 'dice.rolled' ||
    rollEvent.payload.kind !== 'action'
  ) {
    throw new MoveRejectedError(`"${request.rollEventId}" is not an action roll.`);
  }
  const burnOffer = rollEvent.payload.burnOffer;
  if (burnOffer === undefined) {
    throw new MoveRejectedError(`"${request.rollEventId}" has no momentum-burn offer to take.`);
  }
  const invocationEvent = events.find(
    (e) => e.commandId === rollEvent.commandId && e.type === 'move.invoked',
  );
  if (invocationEvent === undefined || invocationEvent.type !== 'move.invoked') {
    throw new Error(
      'A dice.rolled event with no sibling move.invoked — the store is inconsistent.',
    );
  }

  const characterId = invocationEvent.payload.actorCharacterId;
  const tierBefore = rollEvent.payload.tier;
  const tierAfter = burnOffer.wouldBecome;
  const sessionId = project(events).session?.id ?? null;

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'move.burn',
    actor: request.actor,
    causedBy: request.rollEventId,
    events: [
      {
        type: 'momentum.burned',
        payload: { characterId, rollEventId: request.rollEventId, tierBefore, tierAfter },
        sessionId,
      },
      {
        type: 'state.changed',
        payload: {
          cause: { kind: 'momentum_burn' },
          changes: [{ delta: { kind: 'momentum_reset', characterId } }],
        },
        sessionId,
        actor: { kind: 'system' },
      },
    ],
  });

  return { tierAfter, result };
}

const PAY_THE_PRICE_ID = 'move:fate/pay-the-price' as MoveId;

/**
 * Resolving Pay the Price's method pick (task 6.8, D-08). `no_roll`, so
 * there is no dice step — `move.method_chosen` plays `dice.rolled`'s role
 * of "how this move resolved." Choosing `table` also rolls the
 * consequence table right away (D-08's highlighted default) and, when the
 * result maps to an Automated suffer move, offers the chain onward exactly
 * like a rolled move's miss does.
 */
export interface ResolvePayThePriceRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly actorCharacterId: CharacterId;
  readonly optionId: string;
  readonly chainedFromCommandId?: CommandId;
  /** Test-only override of the real RNG; defaults to `cryptoRandomSource()`. */
  readonly rng?: RandomSource;
}

export interface ResolvedPayThePrice {
  readonly invocationEventId: EventId;
  readonly oracle?: { readonly roll: number; readonly rowText: string };
  readonly chain?: ChainView;
  readonly result: AppendResult;
}

export async function resolvePayThePriceMethod(
  sql: Sql,
  request: ResolvePayThePriceRequest,
): Promise<ResolvedPayThePrice> {
  const automation = MOVE_AUTOMATION_SPECS.get(PAY_THE_PRICE_ID);
  if (automation?.method === undefined) {
    throw new Error('Pay the Price has no Milestone 1 method automation.');
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  requireCharacter(state, request.actorCharacterId, 'actorCharacterId');

  let causedBy: EventId | undefined;
  if (request.chainedFromCommandId !== undefined) {
    causedBy = resolveChainedFrom(events, request.chainedFromCommandId, PAY_THE_PRICE_ID);
  }

  const resolved = resolveMethodOption(automation, request.optionId);
  const sessionId = state.session?.id ?? null;

  const newEvents: NewEvent[] = [
    {
      type: 'move.invoked',
      payload: { moveId: PAY_THE_PRICE_ID, actorCharacterId: request.actorCharacterId, adds: [] },
      sessionId,
      subjectCharacterId: request.actorCharacterId,
    },
    {
      type: 'move.method_chosen',
      payload: { moveId: PAY_THE_PRICE_ID, optionId: request.optionId },
      sessionId,
    },
  ];

  let oracle: { readonly roll: number; readonly rowText: string } | undefined;
  let chain: ChainView | undefined;

  const oracleChain = resolved.chain;
  if (oracleChain !== undefined && 'fromOracle' in oracleChain) {
    const table = STARFORGED.oracles.find((o) => o.id === oracleChain.fromOracle);
    if (table === undefined) {
      throw new Error(`Oracle "${oracleChain.fromOracle}" is not in the imported set.`);
    }
    // D-68: "Roll twice" can produce a second step. Milestone 1's golden
    // session never lands on it — only the single 75-81 row chains to an
    // Automated move — so only the first step is surfaced here; a second
    // visible chip for the recursive case is group 8's job.
    const [step] = resolvePayThePriceChain(
      request.rng ?? cryptoRandomSource(),
      table,
      oracleChain.rows,
    );
    if (step !== undefined) {
      newEvents.push({
        type: 'oracle.rolled',
        payload: { oracleId: oracleChain.fromOracle, roll: step.roll, rowText: step.rowText },
        sessionId,
      });
      oracle = { roll: step.roll, rowText: step.rowText };
      if (step.to !== undefined) {
        newEvents.push({
          type: 'move.chained',
          payload: {
            fromMoveId: PAY_THE_PRICE_ID,
            toMoveId: step.to,
            mode: oracleChain.mode,
            reason: oracleChain.reason,
          },
          sessionId,
          actor: { kind: 'system' },
        });
        chain = { toMoveId: step.to, mode: oracleChain.mode, reason: oracleChain.reason };
      }
    }
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'move.pay_the_price',
    actor: request.actor,
    events: newEvents,
    ...(causedBy !== undefined ? { causedBy } : {}),
  });

  const invocationEventId = result.events.find((e) => e.type === 'move.invoked')?.id;
  if (invocationEventId === undefined) {
    throw new Error('appendCommand did not return the events it was asked to write.');
  }

  return {
    invocationEventId,
    result,
    ...(oracle !== undefined ? { oracle } : {}),
    ...(chain !== undefined ? { chain } : {}),
  };
}
