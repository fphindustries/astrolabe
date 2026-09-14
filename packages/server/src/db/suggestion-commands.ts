import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CheckTriggerResponse,
  CommandId,
  SuggestMoveResponse,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import {
  buildMoveSuggestionRequest,
  buildTriggerCheckRequest,
  checkMoveSuggestion,
  checkTriggerCheck,
  moveSuggestionSchema,
  rollUsing,
  triggerCheckSchema,
} from '../ai/context/index.js';
import type { AiProvider } from '../ai/provider.js';
import { generateValidated } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';

import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import {
  AiRequestRefusedError,
  accounting,
  envelopeOf,
  recordStatus,
  withEnvelope,
} from './narration-commands.js';

/**
 * The Guide's judgements on which move fits an action: the suggestion
 * before a move is picked (7.12) and the trigger-mismatch note after one
 * is rolled (7.13).
 *
 * The AI move suggestion (task 7.12, D-14, D-120, D-135): the player
 * described an action without picking a move, and asked.
 *
 * One command writes the accounting and `move.suggested`, or `ai.failed`.
 * It belongs to the open session and scene, so its tokens count there
 * (D-75), but it is not narrative and changes nothing: using it only fills
 * the composer, and a move filled from it names it in `suggestionEventId`.
 * Nothing about it waits on the player or blocks a move picked by hand.
 */

export interface SuggestMoveRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly actorCharacterId: CharacterId;
  readonly actionText: string;
}

export async function suggestMove(
  sql: Sql,
  ai: AiProvider,
  request: SuggestMoveRequest,
  status?: AiStatus,
): Promise<SuggestMoveResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return resultFrom(already);
  }

  const actionText = request.actionText.trim();
  if (actionText.length === 0) {
    throw new AiRequestRefusedError('no_action', 'Describe what the character does first.');
  }
  const state = project(await readEvents(sql, request.campaignId));
  if (state.campaign === null) {
    throw new AiRequestRefusedError('no_campaign', 'That campaign has not been created.');
  }
  const character = state.characters[request.actorCharacterId];
  if (character === undefined) {
    throw new AiRequestRefusedError(
      'unknown_character',
      `No character ${request.actorCharacterId}.`,
    );
  }

  const aiRequest = buildMoveSuggestionRequest(state, character, actionText);
  const outcome = await generateValidated(
    ai,
    aiRequest,
    moveSuggestionSchema(),
    checkMoveSuggestion,
  );
  recordStatus(status, outcome);

  const envelope = envelopeOf(request.campaignId, state);
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'move.suggest',
    actor: request.actor,
    events: [
      ...accounting(ai, aiRequest.purpose, outcome, envelope),
      ...(outcome.ok
        ? [
            {
              ...withEnvelope(
                {
                  type: 'move.suggested',
                  payload: {
                    actorCharacterId: request.actorCharacterId,
                    actionText,
                    moveId: outcome.value.moveId,
                    ...(outcome.value.moveId !== null && outcome.value.rollOption !== null
                      ? { rollOption: rollUsing(outcome.value.rollOption) }
                      : {}),
                    ...(outcome.value.moveId !== null && outcome.value.triggerText !== null
                      ? { triggerText: outcome.value.triggerText.trim() }
                      : {}),
                    reason: outcome.value.reason,
                    confidence: outcome.value.confidence,
                  },
                } as NewEvent<'move.suggested'>,
                envelope,
              ),
              subjectCharacterId: request.actorCharacterId,
            },
          ]
        : []),
    ],
  });

  return resultFrom(result.events);
}

/** What a suggestion command wrote, read back — the same answer on a replay. */
function resultFrom(events: readonly AstrolabeEvent[]): SuggestMoveResponse {
  const suggested = events.find((event) => event.type === 'move.suggested');
  if (suggested?.type === 'move.suggested') {
    return { ok: true, eventId: suggested.id, suggestion: suggested.payload };
  }
  const failed = events.find((event) => event.type === 'ai.failed');
  return failed?.type === 'ai.failed'
    ? { ok: false, errorKind: failed.payload.errorKind, message: failed.payload.message }
    : {
        ok: false,
        errorKind: 'unavailable',
        message: 'The Guide’s suggestion was not recorded. Try again.',
      };
}

// ---------------------------------------------------------------------------
// Trigger-mismatch note (task 7.13, D-37, D-121, D-136)
// ---------------------------------------------------------------------------

export interface CheckTriggerRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  /** The command that invoked the move. */
  readonly moveCommandId: CommandId;
}

export const TRIGGER_CHECK_COMMAND_KIND = 'move.check_trigger';

/**
 * D-136: after the roll, ask whether the move's trigger fits the action
 * the player typed. The roll was committed before this was asked, and
 * nothing here touches it.
 *
 * A fit writes only the accounting; a mismatch adds `move.trigger_noted`.
 * Either way the command is caused by the `move.invoked`, so voiding the
 * move takes the note, and a second check of the same move is refused —
 * after a failure too: the note is optional help, not retried (D-136).
 */
export async function checkTrigger(
  sql: Sql,
  ai: AiProvider,
  request: CheckTriggerRequest,
  status?: AiStatus,
): Promise<CheckTriggerResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return triggerResultFrom(already);
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const invoked = events.find(
    (event) => event.commandId === request.moveCommandId && event.type === 'move.invoked',
  );
  if (invoked?.type !== 'move.invoked') {
    throw new AiRequestRefusedError('not_a_move', 'That command did not invoke a move.');
  }
  if (isSuppressed(invoked, computeVoidState(events))) {
    throw new AiRequestRefusedError('voided', 'That move has been voided.');
  }
  const actionText = invoked.payload.actionText?.trim() ?? '';
  if (actionText.length === 0) {
    throw new AiRequestRefusedError('no_action', 'The player described no action to check.');
  }
  if (invoked.payload.suggestionEventId !== undefined) {
    throw new AiRequestRefusedError(
      'suggested',
      'That move was filled from the Guide’s suggestion, which already judged it.',
    );
  }
  const checkedBefore = events.some(
    (event) =>
      event.causedBy === invoked.id &&
      (event.type === 'move.trigger_noted' ||
        ((event.type === 'ai.completed' || event.type === 'ai.failed') &&
          event.payload.purpose === 'trigger_check')),
  );
  if (checkedBefore) {
    throw new AiRequestRefusedError(
      'already_checked',
      'That move’s trigger has already been checked.',
    );
  }
  const move = STARFORGED.moves.find((m) => m.id === invoked.payload.moveId);
  const character = state.characters[invoked.payload.actorCharacterId];
  if (move === undefined || character === undefined) {
    throw new AiRequestRefusedError(
      'not_a_move',
      'That move or its character is not in the rules or the campaign.',
    );
  }

  const aiRequest = buildTriggerCheckRequest(state, character, move, actionText);
  const outcome = await generateValidated(ai, aiRequest, triggerCheckSchema(), (value) =>
    checkTriggerCheck(value, move),
  );
  recordStatus(status, outcome);

  const envelope = envelopeOf(request.campaignId, state);
  const note =
    outcome.ok && !outcome.value.fits && outcome.value.triggerText !== null
      ? outcome.value
      : undefined;
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: TRIGGER_CHECK_COMMAND_KIND,
    actor: request.actor,
    causedBy: invoked.id,
    events: [
      ...accounting(ai, aiRequest.purpose, outcome, envelope),
      ...(note !== undefined
        ? [
            {
              ...withEnvelope(
                {
                  type: 'move.trigger_noted',
                  payload: {
                    moveId: invoked.payload.moveId,
                    actionText,
                    triggerText: (note.triggerText ?? '').trim(),
                    reason: note.reason,
                    confidence: note.confidence,
                  },
                } as NewEvent<'move.trigger_noted'>,
                envelope,
              ),
              subjectCharacterId: invoked.payload.actorCharacterId,
            },
          ]
        : []),
    ],
  });

  return triggerResultFrom(result.events);
}

/** What a check command wrote, read back — the same answer on a replay. */
function triggerResultFrom(events: readonly AstrolabeEvent[]): CheckTriggerResponse {
  const noted = events.find((event) => event.type === 'move.trigger_noted');
  if (noted?.type === 'move.trigger_noted') {
    return { ok: true, fits: false, eventId: noted.id, note: noted.payload };
  }
  const failed = events.find((event) => event.type === 'ai.failed');
  if (failed?.type === 'ai.failed') {
    return { ok: false, errorKind: failed.payload.errorKind, message: failed.payload.message };
  }
  return { ok: true, fits: true };
}
