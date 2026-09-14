import type { CharacterId } from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CommandId,
  SuggestMoveResponse,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import {
  buildMoveSuggestionRequest,
  checkMoveSuggestion,
  moveSuggestionSchema,
  rollUsing,
} from '../ai/context/index.js';
import type { AiProvider } from '../ai/provider.js';
import { generateValidated } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { project } from '../projection/project.js';

import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import {
  AiRequestRefusedError,
  accounting,
  envelopeOf,
  recordStatus,
  withEnvelope,
} from './narration-commands.js';

/**
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
