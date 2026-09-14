import { PassThrough } from 'node:stream';

import {
  CorrectNarrationRequestBodySchema,
  LOCAL_PLAYER_ID,
  NarrateBeatRequestBodySchema,
  OverrideRequestBodySchema,
  ProposeAmountRequestBodySchema,
  ProposeCharacterRequestBodySchema,
  ProposeIncidentsRequestBodySchema,
  SuggestMoveRequestBodySchema,
  type AiStatusResponse,
  type NarrationFrame,
  type NarrationRefusalResponse,
  type OverrideResponse,
  type ProposeAmountResponse,
  type ProposeCharacterResponse,
  type ProposeIncidentsResponse,
  type SuggestMoveResponse,
} from '@astrolabe/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Sql } from 'postgres';

import type { AiProvider } from '../ai/provider.js';
import type { TextSink } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import {
  AiRequestRefusedError,
  AmendRefusedError,
  overrideState,
  prepareBeatNarration,
  prepareCorrection,
  proposeAmount,
  proposeCharacter,
  proposeIncidents,
  suggestMove,
  runBeatNarration,
  runCorrection,
  type AiCommandResult,
} from '../db/index.js';

import { parseCampaignId, parseEventId, requireCampaignExists } from './params.js';

/**
 * Group 7's routes: beat narration and narration correction (streamed,
 * D-111), the proposed suffer amount (D-118), manual override (D-117) and
 * the Guide's availability (D-116).
 *
 * The two narration routes answer a refusal as ordinary 422 JSON *before*
 * any stream opens; once the stream is open, every outcome — success or
 * provider failure — is a frame, and the call is committed whether or not
 * the client is still listening.
 */

interface CampaignParams {
  readonly id: string;
}

interface EventParams {
  readonly id: string;
  readonly eventId: string;
}

const PLAYER = { kind: 'player', playerId: LOCAL_PLAYER_ID } as const;

export function registerAiRoutes(
  app: FastifyInstance,
  {
    sql,
    ai,
    checker,
    status,
  }: {
    readonly sql: Sql;
    readonly ai: AiProvider;
    /** Judges everything `ai` writes before it commits (D-128). */
    readonly checker: AiProvider;
    readonly status: AiStatus;
  },
): void {
  app.get('/api/ai/status', async (): Promise<AiStatusResponse> => status.snapshot());

  app.post<{ Params: CampaignParams }>('/api/campaigns/:id/narrations', async (request, reply) => {
    const id = parseCampaignId(request.params.id, reply);
    if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
      return undefined;
    }
    const parsedBody = NarrateBeatRequestBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400);
      return undefined;
    }

    try {
      const prepared = await prepareBeatNarration(sql, {
        campaignId: id,
        commandId: parsedBody.data.commandId,
        actor: PLAYER,
        afterCommandId: parsedBody.data.afterCommandId,
      });
      return streamFrames(reply, async (sink) =>
        prepared.kind === 'replay'
          ? prepared.result
          : runBeatNarration(sql, ai, checker, prepared, sink, status),
      );
    } catch (error) {
      return refusal(error, reply);
    }
  });

  app.post<{ Params: EventParams }>(
    '/api/campaigns/:id/narrations/:eventId/corrections',
    async (request, reply) => {
      const id = parseCampaignId(request.params.id, reply);
      const eventId = parseEventId(request.params.eventId, reply);
      if (
        id === undefined ||
        eventId === undefined ||
        !(await requireCampaignExists(sql, id, reply))
      ) {
        return undefined;
      }
      const parsedBody = CorrectNarrationRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const prepared = await prepareCorrection(sql, {
          campaignId: id,
          commandId: parsedBody.data.commandId,
          actor: PLAYER,
          targetEventId: eventId,
          note: parsedBody.data.note,
        });
        return streamFrames(reply, async (sink) =>
          prepared.kind === 'replay'
            ? prepared.result
            : runCorrection(sql, ai, checker, prepared, sink, status),
        );
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/amount-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeAmountResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeAmountRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, moveId, actorCharacterId, chainedFromCommandId } = parsedBody.data;

      try {
        const result = await proposeAmount(
          sql,
          ai,
          checker,
          {
            campaignId: id,
            commandId,
            actor: PLAYER,
            moveId,
            actorCharacterId,
            ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
          },
          status,
        );
        // A provider failure is a recorded outcome, not a bad request: 201
        // either way, and the body says which (D-116).
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/character-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeCharacterResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeCharacterRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await proposeCharacter(
          sql,
          ai,
          {
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            concept: parsedBody.data.concept,
          },
          status,
        );
        // As with amount proposals: an outage is a recorded outcome (D-116).
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/incident-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeIncidentsResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeIncidentsRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await proposeIncidents(
          sql,
          ai,
          { campaignId: id, commandId: parsedBody.data.commandId, actor: PLAYER },
          status,
        );
        // D-132: the same contract as a character proposal (D-116).
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/move-suggestions',
    async (request, reply): Promise<SuggestMoveResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = SuggestMoveRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await suggestMove(
          sql,
          ai,
          {
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            actorCharacterId: parsedBody.data.actorCharacterId,
            actionText: parsedBody.data.actionText,
          },
          status,
        );
        // D-135: an outage is a recorded outcome, as for every proposal (D-116).
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/overrides',
    async (request, reply): Promise<OverrideResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = OverrideRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, target, to, reason } = parsedBody.data;

      try {
        const result = await overrideState(sql, {
          campaignId: id,
          commandId,
          actor: PLAYER,
          target,
          to,
          ...(reason !== undefined ? { reason } : {}),
        });
        reply.code(201);
        return result.response as OverrideResponse;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );
}

/**
 * Open an NDJSON stream and run `work` into it. `work` resolves once the
 * result is committed; its outcome becomes the closing frame.
 *
 * The work is deliberately not tied to the socket: if the client goes away
 * mid-passage, generation finishes and commits anyway, and a reload shows
 * the passage (D-111).
 */
function streamFrames(
  reply: FastifyReply,
  work: (sink: TextSink) => Promise<AiCommandResult>,
): FastifyReply {
  const stream = new PassThrough();
  const send = (frame: NarrationFrame) => {
    if (!stream.destroyed && stream.writable) {
      stream.write(`${JSON.stringify(frame)}\n`);
    }
  };

  void work({
    delta: (text) => send({ type: 'delta', text }),
    reset: (reason) => send({ type: 'reset', reason }),
    checking: () => send({ type: 'checking' }),
    withdrawn: (reason, rejectedText) => send({ type: 'withdrawn', reason, rejectedText }),
  })
    .then((result) =>
      send(
        result.ok
          ? { type: 'committed', eventId: result.eventId }
          : { type: 'failed', errorKind: result.errorKind, message: result.message },
      ),
    )
    .catch((error: unknown) => {
      // Not a provider failure — those are outcomes. This is a bug or a
      // database error, and the client still needs a closing frame.
      console.error(error);
      send({
        type: 'failed',
        errorKind: 'unavailable',
        message: 'The server could not record the Guide’s answer.',
      });
    })
    .finally(() => stream.end());

  reply
    .code(200)
    .header('content-type', 'application/x-ndjson; charset=utf-8')
    .header('cache-control', 'no-store');
  return reply.send(stream);
}

function refusal(error: unknown, reply: FastifyReply): NarrationRefusalResponse {
  if (error instanceof AiRequestRefusedError || error instanceof AmendRefusedError) {
    reply.code(422);
    return { problem: error.message, reason: error.reason };
  }
  throw error;
}
