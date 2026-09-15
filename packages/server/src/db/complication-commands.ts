import { STARFORGED, complicationFor, rollOracle, type OutcomeTier } from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CommandId,
  EventId,
  OfferComplicationsResponse,
  SetComplicationResponse,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import {
  COMPLICATION_ROLLS,
  buildComplicationRequest,
  checkComplicationOptions,
  complicationOptionsSchema,
  describeBeat,
  resolveBeatScope,
  type RolledComplication,
} from '../ai/context/index.js';
import type { AiProvider } from '../ai/provider.js';
import { generateValidated } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { oracleChips } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';
import { cryptoRandomSource } from '../random-source.js';
import type { RandomSource } from '@astrolabe/rules';

import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import {
  AiRequestRefusedError,
  accounting,
  envelopeOf,
  recordStatus,
  withEnvelope,
} from './narration-commands.js';
import { uuidv7 } from './uuid.js';

/**
 * Weak-hit complications (task 8.7; D-15, D-143 as amended). The move's
 * outcome calls for one and offers no menu, so the player writes it or asks
 * the Guide for options and picks one, before the beat is narrated. Both
 * commands are caused by the `move.invoked`, so voiding the move takes them.
 */

export const OFFER_COMPLICATIONS_COMMAND_KIND = 'complication.offer';
export const SET_COMPLICATION_COMMAND_KIND = 'complication.set';

const SYSTEM: Actor = { kind: 'system' };

interface ComplicationMove {
  readonly invoked: Extract<AstrolabeEvent, { type: 'move.invoked' }>;
  readonly tier: OutcomeTier;
  readonly clause: string;
}

/**
 * The move a complication belongs to: live, at a final tier (after any
 * burn) whose outcome calls for a complication, and not already given one.
 */
function complicationMove(
  events: readonly AstrolabeEvent[],
  moveCommandId: CommandId,
): ComplicationMove {
  const voids = computeVoidState(events);
  const invoked = events.find(
    (event) => event.commandId === moveCommandId && event.type === 'move.invoked',
  );
  if (invoked?.type !== 'move.invoked') {
    throw new AiRequestRefusedError('not_a_move', 'That command did not invoke a move.');
  }
  if (isSuppressed(invoked, voids)) {
    throw new AiRequestRefusedError('voided', 'That move has been voided.');
  }
  const roll = events.find(
    (event) => event.commandId === moveCommandId && event.type === 'dice.rolled',
  );
  if (roll?.type !== 'dice.rolled') {
    throw new AiRequestRefusedError('no_complication', 'That move rolled no dice.');
  }
  const burned = events.find(
    (event) =>
      event.type === 'momentum.burned' &&
      event.payload.rollEventId === roll.id &&
      !isSuppressed(event, voids),
  );
  const tier = burned?.type === 'momentum.burned' ? burned.payload.tierAfter : roll.payload.tier;
  const complication = complicationFor(invoked.payload.moveId, tier);
  if (complication === undefined) {
    throw new AiRequestRefusedError(
      'no_complication',
      'That outcome does not call for a complication.',
    );
  }
  if (liveComplicationSet(events, invoked.id, voids) !== undefined) {
    throw new AiRequestRefusedError('already_set', 'That move already has its complication.');
  }
  return { invoked, tier, clause: complication.clause };
}

function liveComplicationSet(
  events: readonly AstrolabeEvent[],
  invokedId: EventId,
  voids = computeVoidState(events),
): AstrolabeEvent | undefined {
  return events.find(
    (event) =>
      event.type === 'complication.set' &&
      event.causedBy === invokedId &&
      !isSuppressed(event, voids),
  );
}

// ---------------------------------------------------------------------------
// Options on request
// ---------------------------------------------------------------------------

export interface OfferComplicationsRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly moveCommandId: CommandId;
  /** Test-only override of the real RNG; defaults to `cryptoRandomSource()`. */
  readonly rng?: RandomSource;
}

export async function offerComplications(
  sql: Sql,
  ai: AiProvider,
  request: OfferComplicationsRequest,
  status?: AiStatus,
): Promise<OfferComplicationsResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return offerResultFrom(already);
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const move = complicationMove(events, request.moveCommandId);
  const scope = resolveBeatScope(events, request.moveCommandId, { allowNarrated: true });
  if (!scope.ok) {
    throw new AiRequestRefusedError(scope.reason, scope.detail);
  }
  const facts = describeBeat(scope.events, state, events);

  const rng = request.rng ?? cryptoRandomSource();
  const rolled: RolledComplication[] = COMPLICATION_ROLLS.map((spec) => {
    const table = STARFORGED.oracles.find((t) => t.id === spec.oracleId)!;
    const result = rollOracle(rng, table);
    return { ...spec, roll: result.roll, rowText: result.row.text, eventId: uuidv7() as EventId };
  });
  const characters = Object.values(state.characters).map((c) => ({
    id: c.id,
    callsign: c.callsign,
    name: c.name,
  }));

  const aiRequest = buildComplicationRequest(state, facts, move.clause, rolled);
  const outcome = await generateValidated(
    ai,
    aiRequest,
    complicationOptionsSchema(rolled),
    (value) => checkComplicationOptions(value, rolled, characters),
  );
  recordStatus(status, outcome);

  const envelope = envelopeOf(request.campaignId, state);
  const byKey = new Map(rolled.map((r) => [r.key, r.eventId]));
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: OFFER_COMPLICATIONS_COMMAND_KIND,
    actor: request.actor,
    causedBy: move.invoked.id,
    events: [
      // Dice that were rolled stay rolled, whatever the answer.
      ...rolled.map((r): NewEvent<'oracle.rolled'> => ({
        id: r.eventId,
        type: 'oracle.rolled',
        payload: { oracleId: r.oracleId, roll: r.roll, rowText: r.rowText, slot: r.slot },
        actor: SYSTEM,
        sessionId: envelope.sessionId,
        sceneId: envelope.sceneId,
      })),
      ...accounting(ai, aiRequest.purpose, outcome, envelope),
      ...(outcome.ok
        ? [
            withEnvelope(
              {
                type: 'complication.offered',
                payload: {
                  options: outcome.value.options.map((option, i) => ({
                    text: option.text.trim(),
                    groundedIn: rolled.filter((r) => r.option === i).map((r) => byKey.get(r.key)!),
                  })),
                },
              } satisfies NewEvent<'complication.offered'>,
              envelope,
            ),
          ]
        : []),
    ],
  });

  return offerResultFrom(result.events);
}

function offerResultFrom(events: readonly AstrolabeEvent[]): OfferComplicationsResponse {
  const offered = events.find((event) => event.type === 'complication.offered');
  if (offered?.type === 'complication.offered') {
    const chipsOf = oracleChips(events);
    return {
      ok: true,
      eventId: offered.id,
      options: offered.payload.options.map((option) => ({
        text: option.text,
        chips: chipsOf(option.groundedIn),
      })),
    };
  }
  const failed = events.find((event) => event.type === 'ai.failed');
  return failed?.type === 'ai.failed'
    ? { ok: false, errorKind: failed.payload.errorKind, message: failed.payload.message }
    : { ok: false, errorKind: 'unavailable', message: 'The options were not recorded. Try again.' };
}

// ---------------------------------------------------------------------------
// Setting it
// ---------------------------------------------------------------------------

export interface SetComplicationRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly moveCommandId: CommandId;
  readonly text: string;
  readonly offeredEventId?: EventId;
  readonly optionIndex?: number;
}

export async function setComplication(
  sql: Sql,
  request: SetComplicationRequest,
): Promise<SetComplicationResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  const stored = already.find((event) => event.type === 'complication.set');
  if (stored?.type === 'complication.set') {
    return { eventId: stored.id, source: stored.payload.source };
  }

  const text = request.text.trim();
  if (text.length === 0) {
    throw new AiRequestRefusedError('no_text', 'Write the complication first.');
  }
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const move = complicationMove(events, request.moveCommandId);

  let source: 'written' | 'offered' = 'written';
  if (request.offeredEventId !== undefined || request.optionIndex !== undefined) {
    const voids = computeVoidState(events);
    const offer = events.find((event) => event.id === request.offeredEventId);
    if (
      offer?.type !== 'complication.offered' ||
      offer.causedBy !== move.invoked.id ||
      isSuppressed(offer, voids)
    ) {
      throw new AiRequestRefusedError(
        'unknown_offer',
        'That is not a live set of options for this move.',
      );
    }
    const option =
      request.optionIndex === undefined ? undefined : offer.payload.options[request.optionIndex];
    if (option === undefined) {
      throw new AiRequestRefusedError('unknown_option', 'That option is not in the offer.');
    }
    // D-143 (amended): a pick is "offered" only while its words are unchanged.
    source = option.text === text ? 'offered' : 'written';
  }

  const envelope = envelopeOf(request.campaignId, state);
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: SET_COMPLICATION_COMMAND_KIND,
    actor: request.actor,
    causedBy: move.invoked.id,
    events: [
      {
        type: 'complication.set',
        payload: {
          text,
          source,
          ...(request.offeredEventId !== undefined
            ? { offeredEventId: request.offeredEventId }
            : {}),
          ...(request.optionIndex !== undefined ? { optionIndex: request.optionIndex } : {}),
        },
        sessionId: envelope.sessionId,
        sceneId: envelope.sceneId,
        subjectCharacterId: move.invoked.payload.actorCharacterId,
      } satisfies NewEvent<'complication.set'>,
    ],
  });
  const set = result.events.find((event) => event.type === 'complication.set')!;
  return { eventId: set.id, source: set.type === 'complication.set' ? set.payload.source : source };
}
