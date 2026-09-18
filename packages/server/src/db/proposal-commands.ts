import { rollOracle, STARFORGED, type OracleId, type RandomSource } from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CampaignState,
  CommandId,
  EventId,
  EventType,
  PayloadFor,
  ProposalRoll,
  ProposeCharacterResponse,
  ProposeIncidentsResponse,
  ProposeStarshipResponse,
  ProposeTruthResponse,
} from '@astrolabe/shared';
import { STARSHIP_PROPOSAL_TARGET } from '@astrolabe/shared';
import type { Sql } from 'postgres';
import type * as z from 'zod';

import {
  CHARACTER_PROPOSAL_ROLLS,
  INCIDENT_PROPOSAL_ROLLS,
  buildCharacterProposalRequest,
  buildIncidentProposalRequest,
  characterProposalSchema,
  checkCharacterProposal,
  checkIncidentProposal,
  incidentContext,
  incidentProposalSchema,
  resolveDrawsOn,
  type CharacterProposalOutput,
  type IncidentProposalOutput,
  type RolledForProposal,
} from '../ai/context/index.js';
import {
  buildStarshipProposalRequest,
  checkStarshipProposal,
  starshipProposalRolls,
  starshipProposalSchema,
  type StarshipProposalOutput,
} from '../ai/context/starship.js';
import {
  buildTruthProposalRequest,
  checkTruthProposal,
  findTruth,
  truthProposalSchema,
  type TruthProposalOutput,
} from '../ai/context/truth.js';
import type { AiProvider, AiRequest } from '../ai/provider.js';
import { generateValidated } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { project } from '../projection/project.js';
import { cryptoRandomSource } from '../random-source.js';

import {
  PROPOSAL_COMMAND_KINDS,
  appendCommand,
  readEvents,
  readEventsByCommand,
  type NewEvent,
} from './event-store.js';
import {
  AiRequestRefusedError,
  accounting,
  envelopeOf,
  recordStatus,
  withEnvelope,
} from './narration-commands.js';
import { launchClosedReason } from './launch-commands.js';
import { uuidv7 } from './uuid.js';

/**
 * AI proposals the player reviews before anything becomes canon (D-124):
 * concept-first characters now (3.3), inciting incidents next (4.6).
 *
 * One shape for both. The server rolls the oracle tables the proposal is
 * grounded in (D-123), the AI answers against a schema and a rules check,
 * and one command writes the rolls, the accounting and the proposal — or
 * the rolls and `ai.failed`, because dice that were rolled stay rolled.
 * Accepting is a separate, ordinary command that names the proposal as
 * its cause.
 */

export interface ProposalRollSpec {
  readonly key: string;
  readonly label: string;
  readonly oracleId: OracleId;
}

export interface ProposalRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  /** Test-only override of the real RNG; defaults to `cryptoRandomSource()`. */
  readonly rng?: RandomSource;
}

interface ProposalSpec<T, E extends EventType> {
  readonly kind: string;
  readonly contentType: E;
  readonly rolls: readonly ProposalRollSpec[];
  /**
   * Rolls made by an earlier command, rather than by this one (D-186).
   *
   * Crew grounds its proposal in `CHARACTER_RECIPE`, and a declared recipe is
   * rolled by `rollLaunchRecipe` — its own command, with its own
   * `oracle.rolled` events. When these are supplied this command rolls nothing
   * and writes no roll events: they exist already, and re-rolling would ground
   * the Guide in dice the player never saw.
   */
  readonly provided?: readonly (ProposalRollSpec & {
    readonly eventId: EventId;
    readonly roll: number;
    readonly rowText: string;
  })[];
  build(
    state: CampaignState,
    rolled: readonly RolledForProposal[],
  ): {
    readonly request: AiRequest;
    readonly schema: z.ZodType<T>;
    readonly check?: (value: T) => string | undefined;
  };
  /**
   * The proposal event, with each roll key already resolved to its event id.
   * `state` is the state `build` was given, for resolving anything else the
   * answer names.
   */
  toPayload(value: T, eventIdOf: (key: string) => EventId, state: CampaignState): PayloadFor<E>;
}

type ProposalOutcome<E extends EventType> =
  | {
      readonly ok: true;
      readonly event: AstrolabeEvent & { readonly type: E };
      readonly rolls: readonly ProposalRoll[];
    }
  | {
      readonly ok: false;
      readonly errorKind: PayloadFor<'ai.failed'>['errorKind'];
      readonly message: string;
      readonly rolls: readonly ProposalRoll[];
    };

async function runProposal<T, E extends EventType>(
  sql: Sql,
  ai: AiProvider,
  request: ProposalRequest,
  spec: ProposalSpec<T, E>,
  status: AiStatus | undefined,
): Promise<ProposalOutcome<E>> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return outcomeFrom(already, spec);
  }

  const state = project(await readEvents(sql, request.campaignId));
  if (state.campaign === null) {
    throw new AiRequestRefusedError('no_campaign', 'That campaign has not been created.');
  }
  // A proposal is not a beat of play, even when a session happens to be
  // open, so it belongs to no session or scene, and the narrative log skips
  // its command by kind (`PROPOSAL_COMMAND_KINDS`) — its rolls would
  // otherwise read as unexplained oracle beats. Tokens still count (D-125).
  const envelope = { ...envelopeOf(request.campaignId, state), sessionId: null, sceneId: null };

  const rng = request.rng ?? cryptoRandomSource();
  const rolled =
    spec.provided ??
    spec.rolls.map((roll) => {
      const table = STARFORGED.oracles.find((t) => t.id === roll.oracleId);
      if (table === undefined) {
        throw new Error(`Proposal oracle "${roll.oracleId}" is not in the ruleset.`);
      }
      const result = rollOracle(rng, table);
      return { ...roll, eventId: uuidv7() as EventId, roll: result.roll, rowText: result.row.text };
    });
  const eventIdOf = (key: string): EventId => {
    const found = rolled.find((r) => r.key === key);
    if (found === undefined) {
      throw new Error(`A proposal cited "${key}", which was not rolled.`);
    }
    return found.eventId;
  };

  const { request: aiRequest, schema, check } = spec.build(state, rolled);
  const outcome = await generateValidated(ai, aiRequest, schema, check);
  recordStatus(status, outcome);

  // Nothing to write when the rolls were made by an earlier command.
  const rollEvents: NewEvent<'oracle.rolled'>[] = (spec.provided ? [] : rolled).map((r) => ({
    id: r.eventId,
    type: 'oracle.rolled',
    payload: { oracleId: r.oracleId, roll: r.roll, rowText: r.rowText },
    actor: { kind: 'system' },
    sessionId: envelope.sessionId,
    sceneId: envelope.sceneId,
  }));

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: spec.kind,
    actor: request.actor,
    events: [
      ...rollEvents,
      ...accounting(ai, aiRequest.purpose, outcome, envelope),
      ...(outcome.ok
        ? [
            withEnvelope(
              {
                type: spec.contentType,
                payload: spec.toPayload(outcome.value, eventIdOf, state),
              } as NewEvent,
              envelope,
            ),
          ]
        : []),
    ],
  });

  return outcomeFrom(result.events, spec);
}

/** What a proposal command wrote, read back — the same answer on a replay. */
function outcomeFrom<E extends EventType>(
  events: readonly AstrolabeEvent[],
  spec: Pick<ProposalSpec<unknown, E>, 'contentType' | 'rolls' | 'provided'>,
): ProposalOutcome<E> {
  const rolls: ProposalRoll[] = spec.provided
    ? spec.provided.map((roll) => ({
        eventId: roll.eventId,
        oracleId: roll.oracleId,
        label: roll.label,
        roll: roll.roll,
        rowText: roll.rowText,
      }))
    : events
        .filter((event) => event.type === 'oracle.rolled')
        .map((event, i) => ({
          eventId: event.id,
          oracleId: event.payload.oracleId,
          label: spec.rolls[i]?.label ?? event.payload.oracleId,
          roll: event.payload.roll,
          rowText: event.payload.rowText,
        }));
  const content = events.find((event) => event.type === spec.contentType);
  if (content !== undefined) {
    return { ok: true, event: content as AstrolabeEvent & { readonly type: E }, rolls };
  }
  const failed = events.find((event) => event.type === 'ai.failed');
  return failed?.type === 'ai.failed'
    ? { ok: false, errorKind: failed.payload.errorKind, message: failed.payload.message, rolls }
    : {
        ok: false,
        errorKind: 'unavailable',
        message: 'The Guide’s proposal was not recorded. Try again.',
        rolls,
      };
}

// ---------------------------------------------------------------------------
// Concept-first characters (task 3.3)
// ---------------------------------------------------------------------------

export interface ProposeCharacterRequest extends ProposalRequest {
  readonly concept: string;
  /**
   * What this proposal is about (D-185): the crew member's `draftId` while
   * they are being built, or their `characterId` once accepted and being
   * revised. A character loaded from server state never saw a draft id.
   */
  readonly targetId: string;
  /** The `oracle.rolled` events from this campaign's character recipe roll. */
  readonly groundedIn: readonly EventId[];
  /**
   * The fields the player asked for help with (beat 5).
   *
   * Steering only. The Guide still answers with a complete build, because a
   * half-built proposal is not something a review screen can show beside what
   * the player already has, and the screen applies only the fields that were
   * asked for. Deliberately not recorded on the event: what the player did
   * with the proposal is a fact about the acceptance, not about the proposal.
   */
  readonly fields?: readonly string[];
}

/**
 * Match the cited roll events to the recipe's slots, in the recipe's order.
 *
 * The client sends event ids and nothing else, so it cannot mislabel a roll:
 * which slot each one fills is decided here, by walking the declared slots and
 * taking the next unused event on that table. Two backstory slots share one
 * oracle, so order is what separates them — which is exactly why D-186 made
 * them two slots rather than one rolled twice.
 */
function rollsForProposal(
  events: readonly AstrolabeEvent[],
  groundedIn: readonly EventId[],
  slots: readonly ProposalRollSpec[],
): readonly (ProposalRollSpec & {
  readonly eventId: EventId;
  readonly roll: number;
  readonly rowText: string;
})[] {
  const cited = groundedIn
    .map((id) => events.find((event) => event.id === id))
    .filter((event) => event?.type === 'oracle.rolled');
  const taken = new Set<EventId>();
  return slots.flatMap((slot) => {
    const event = cited.find(
      (candidate) => candidate!.payload.oracleId === slot.oracleId && !taken.has(candidate!.id),
    );
    if (event === undefined) return [];
    taken.add(event.id);
    return [
      {
        ...slot,
        eventId: event.id,
        roll: event.payload.roll,
        rowText: event.payload.rowText,
      },
    ];
  });
}

export async function proposeCharacter(
  sql: Sql,
  ai: AiProvider,
  request: ProposeCharacterRequest,
  status?: AiStatus,
): Promise<ProposeCharacterResponse> {
  const concept = request.concept.trim();
  if (concept.length === 0) {
    throw new AiRequestRefusedError('no_concept', 'Describe the character first.');
  }
  const provided = rollsForProposal(
    await readEvents(sql, request.campaignId),
    request.groundedIn,
    CHARACTER_PROPOSAL_ROLLS,
  );
  if (provided.length === 0) {
    throw new AiRequestRefusedError(
      'no_campaign',
      'Roll the character prompts before asking the Guide.',
    );
  }
  const keys = provided.map((roll) => roll.key);

  const outcome = await runProposal<CharacterProposalOutput, 'creation.proposed'>(
    sql,
    ai,
    request,
    {
      kind: PROPOSAL_COMMAND_KINDS[0],
      contentType: 'creation.proposed',
      rolls: CHARACTER_PROPOSAL_ROLLS,
      provided,
      build: (state, rolled) => ({
        request: buildCharacterProposalRequest(state, concept, rolled, request.fields),
        schema: characterProposalSchema(keys),
        check: (value) => checkCharacterProposal(value, keys, concept),
      }),
      toPayload: (value, eventIdOf) => ({
        targetKind: 'character',
        targetId: request.targetId,
        rationale: value.stats.reason,
        groundedIn: [...request.groundedIn],
        proposal: {
          concept,
          name: { ...value.name, groundedIn: value.name.groundedIn.map(eventIdOf) },
          callsign: { ...value.callsign, groundedIn: value.callsign.groundedIn.map(eventIdOf) },
          appearance: value.appearance,
          backstory: {
            value:
              value.backstory.kind === 'written'
                ? { kind: 'written' as const, text: value.backstory.text ?? '' }
                : { kind: 'discover_in_play' as const },
            reason: value.backstory.reason,
            groundedIn: value.backstory.groundedIn.map(eventIdOf),
          },
          stats: value.stats,
          assets: value.assets,
          backgroundVow: value.backgroundVow,
          hooks: value.hooks.map((hook) => ({
            ...hook,
            groundedIn: hook.groundedIn.map(eventIdOf),
          })),
          ...(value.pronouns.value !== null
            ? { pronouns: { value: value.pronouns.value, reason: value.pronouns.reason } }
            : {}),
          ...(value.signatureGear.value !== null
            ? {
                signatureGear: {
                  value: value.signatureGear.value,
                  reason: value.signatureGear.reason,
                },
              }
            : {}),
        },
      }),
    },
    status,
  );

  if (!outcome.ok) return outcome;
  const payload = outcome.event.payload;
  if (payload.targetKind !== 'character') {
    throw new Error('A character proposal wrote a different target kind.');
  }
  return {
    ok: true,
    proposalEventId: outcome.event.id,
    proposal: payload.proposal,
    rolls: outcome.rolls,
  };
}

// ---------------------------------------------------------------------------
// Inciting incidents (task 4.6)
// ---------------------------------------------------------------------------

/**
 * D-132: three incidents, one server roll each, drawn from the campaign as
 * it stands — truths, sector, and whatever crew exists (D-133). Not sent
 * through D-128's checker: the player's pick is the gate (D-134).
 */
export async function proposeIncidents(
  sql: Sql,
  ai: AiProvider,
  request: ProposalRequest,
  status?: AiStatus,
): Promise<ProposeIncidentsResponse> {
  const keys = INCIDENT_PROPOSAL_ROLLS.map((roll) => roll.key);

  const outcome = await runProposal<IncidentProposalOutput, 'incident.proposed'>(
    sql,
    ai,
    request,
    {
      kind: PROPOSAL_COMMAND_KINDS[1],
      contentType: 'incident.proposed',
      rolls: INCIDENT_PROPOSAL_ROLLS,
      build: (state, rolled) => {
        const offered = incidentContext(state);
        return {
          request: buildIncidentProposalRequest(state, rolled),
          schema: incidentProposalSchema(keys, offered),
          check: (value) => checkIncidentProposal(value, offered),
        };
      },
      toPayload: (value, eventIdOf, state) => ({
        options: value.options.map((option) => ({
          title: option.title,
          rank: option.rank,
          situation: option.situation,
          reason: option.reason,
          groundedIn: [...new Set(option.groundedIn)].map(eventIdOf),
          drawsOn: resolveDrawsOn(option.drawsOn, incidentContext(state)),
        })),
      }),
    },
    status,
  );

  return outcome.ok
    ? {
        ok: true,
        proposalEventId: outcome.event.id,
        proposal: outcome.event.payload,
        rolls: outcome.rolls,
      }
    : outcome;
}

export interface ProposeTruthRequest extends ProposalRequest {
  readonly truthId: OracleId;
}

/**
 * Ask the Guide about one setting truth (5.3).
 *
 * `rolls` is empty and that is the point: a truth's own table is its
 * enumerated option set, so there is no recipe to roll before the Guide
 * interprets it (see `ai/context/truth.ts`). The proposal is recorded as
 * `creation.proposed` with `targetKind: 'truth'` — the same non-canonical
 * review surface every other launch object uses (D-166), keyed by the truth it
 * is about so a second ask replaces the first.
 */
export async function proposeTruth(
  sql: Sql,
  ai: AiProvider,
  request: ProposeTruthRequest,
  status?: AiStatus,
): Promise<ProposeTruthResponse> {
  const truth = findTruth(request.truthId);
  if (truth === undefined) {
    throw new AiRequestRefusedError('no_campaign', 'That is not a setting truth.');
  }

  const outcome = await runProposal<TruthProposalOutput, 'creation.proposed'>(
    sql,
    ai,
    request,
    {
      kind: PROPOSAL_COMMAND_KINDS[2],
      contentType: 'creation.proposed',
      rolls: [],
      build: (state) => ({
        request: buildTruthProposalRequest(state, truth),
        schema: truthProposalSchema(truth),
        check: (value) => checkTruthProposal(value, truth),
      }),
      toPayload: (value) => {
        const option =
          value.resolution === 'selected' ? truth.rows[value.optionIndex ?? -1] : undefined;
        return {
          targetKind: 'truth',
          targetId: request.truthId,
          rationale: value.reason,
          // No rolls to cite, for the reason above.
          groundedIn: [],
          proposal: {
            truthId: request.truthId,
            resolution: value.resolution,
            ...(value.resolution === 'selected' && value.optionIndex !== undefined
              ? { optionIndex: value.optionIndex }
              : {}),
            text: option?.description ?? value.text ?? '',
            // D-162: inspiration carried alongside, never part of the answer.
            ...(option?.questStarter === undefined ? {} : { questStarter: option.questStarter }),
          },
        };
      },
    },
    status,
  );

  if (!outcome.ok) {
    return { ok: false, errorKind: outcome.errorKind, message: outcome.message };
  }
  const payload = outcome.event.payload;
  // `creation.proposed` carries every target kind; this command writes exactly
  // one of them, so narrowing here keeps the response honest rather than
  // asserting the discriminant away.
  if (payload.targetKind !== 'truth') {
    throw new Error('A truth proposal wrote a different target kind.');
  }
  return {
    ok: true,
    proposalEventId: outcome.event.id,
    truthId: request.truthId,
    proposal: payload,
  };
}

// ---------------------------------------------------------------------------
// The shared starship (task 7.0e)
// ---------------------------------------------------------------------------

export interface ProposeStarshipRequest extends ProposalRequest {
  /** The `oracle.rolled` events from this campaign's starship recipe roll (D-186's shape). */
  readonly groundedIn: readonly EventId[];
  /** The fields the player asked for help with. Steering only, never stored (6.3). */
  readonly fields?: readonly string[];
}

/**
 * Ask the Guide for the crew's ship (7.0e, D-164, D-166).
 *
 * The client rolls `{ kind: 'starship', quirkCount }` through
 * `rollLaunchRecipe` and cites the results; which slot each fills is decided
 * here, as for crew, so the client cannot mislabel a roll. The quirk count is
 * how many quirk rolls were cited. A proposal missing any slot is refused
 * before the Guide is asked, rather than asking it to ground a field in
 * nothing.
 */
export async function proposeStarship(
  sql: Sql,
  ai: AiProvider,
  request: ProposeStarshipRequest,
  status?: AiStatus,
): Promise<ProposeStarshipResponse> {
  const events = await readEvents(sql, request.campaignId);
  const closed = launchClosedReason(project(events));
  if (closed !== undefined)
    throw new AiRequestRefusedError(closed, 'Campaign Launch is closed for this campaign.');
  const cited = request.groundedIn.flatMap((id) => {
    const event = events.find((candidate) => candidate.id === id);
    return event?.type === 'oracle.rolled' ? [event] : [];
  });
  const quirkOracle = starshipProposalRolls(1).find((slot) => slot.key === 'quirk_1')!.oracleId;
  const quirkCount =
    cited.filter((event) => event.payload.oracleId === quirkOracle).length >= 2 ? 2 : 1;
  const slots = starshipProposalRolls(quirkCount);
  const provided = rollsForProposal(events, request.groundedIn, slots);
  if (provided.length !== slots.length) {
    throw new AiRequestRefusedError(
      'no_rolls',
      'Roll the starship prompts before asking the Guide.',
    );
  }
  const keys = slots.map((slot) => slot.key);

  const outcome = await runProposal<StarshipProposalOutput, 'creation.proposed'>(
    sql,
    ai,
    request,
    {
      kind: PROPOSAL_COMMAND_KINDS[3],
      contentType: 'creation.proposed',
      rolls: slots,
      provided,
      build: (state, rolled) => ({
        request: buildStarshipProposalRequest(state, rolled, request.fields),
        schema: starshipProposalSchema(keys, quirkCount),
        check: (value) => checkStarshipProposal(value, keys),
      }),
      toPayload: (value, eventIdOf) => ({
        targetKind: 'starship',
        targetId: STARSHIP_PROPOSAL_TARGET,
        rationale: value.reason,
        groundedIn: provided.map((roll) => roll.eventId),
        proposal: {
          name: { ...value.name, groundedIn: value.name.groundedIn.map(eventIdOf) },
          appearance: value.appearance,
          history: { ...value.history, groundedIn: value.history.groundedIn.map(eventIdOf) },
          quirks: value.quirks.map((quirk) => ({
            ...quirk,
            groundedIn: quirk.groundedIn.map(eventIdOf),
          })),
        },
      }),
    },
    status,
  );

  if (!outcome.ok) return outcome;
  const payload = outcome.event.payload;
  if (payload.targetKind !== 'starship') {
    throw new Error('A starship proposal wrote a different target kind.');
  }
  return {
    ok: true,
    proposalEventId: outcome.event.id,
    proposal: payload.proposal,
    rolls: outcome.rolls,
  };
}
