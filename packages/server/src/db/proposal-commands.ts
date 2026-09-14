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
} from '@astrolabe/shared';
import type { Sql } from 'postgres';
import type * as z from 'zod';

import {
  CHARACTER_PROPOSAL_ROLLS,
  buildCharacterProposalRequest,
  characterProposalSchema,
  checkCharacterProposal,
  type CharacterProposalOutput,
  type RolledForProposal,
} from '../ai/context/index.js';
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
  build(
    state: CampaignState,
    rolled: readonly RolledForProposal[],
  ): {
    readonly request: AiRequest;
    readonly schema: z.ZodType<T>;
    readonly check?: (value: T) => string | undefined;
  };
  /** The proposal event, with each roll key already resolved to its event id. */
  toPayload(value: T, eventIdOf: (key: string) => EventId): PayloadFor<E>;
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
  const rolled = spec.rolls.map((roll) => {
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

  const rollEvents: NewEvent<'oracle.rolled'>[] = rolled.map((r) => ({
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
                payload: spec.toPayload(outcome.value, eventIdOf),
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
  spec: Pick<ProposalSpec<unknown, E>, 'contentType' | 'rolls'>,
): ProposalOutcome<E> {
  const rolls: ProposalRoll[] = events
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
  const keys = CHARACTER_PROPOSAL_ROLLS.map((roll) => roll.key);

  const outcome = await runProposal<CharacterProposalOutput, 'character.proposed'>(
    sql,
    ai,
    request,
    {
      kind: PROPOSAL_COMMAND_KINDS[0],
      contentType: 'character.proposed',
      rolls: CHARACTER_PROPOSAL_ROLLS,
      build: (state, rolled) => ({
        request: buildCharacterProposalRequest(state, concept, rolled),
        schema: characterProposalSchema(keys),
        check: (value) => checkCharacterProposal(value, keys, concept),
      }),
      toPayload: (value, eventIdOf) => ({
        concept,
        name: { ...value.name, groundedIn: value.name.groundedIn.map(eventIdOf) },
        callsign: { ...value.callsign, groundedIn: value.callsign.groundedIn.map(eventIdOf) },
        stats: value.stats,
        assets: value.assets,
        backgroundVow: value.backgroundVow,
        hooks: value.hooks.map((hook) => ({ ...hook, groundedIn: hook.groundedIn.map(eventIdOf) })),
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
