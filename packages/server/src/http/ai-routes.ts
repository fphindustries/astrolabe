import { PassThrough } from 'node:stream';

import {
  CorrectNarrationRequestBodySchema,
  LOCAL_PLAYER_ID,
  NarrateBeatRequestBodySchema,
  OverrideRequestBodySchema,
  ProposeAmountRequestBodySchema,
  ProposeCharacterRequestBodySchema,
  ProposeIncidentsRequestBodySchema,
  ProposeSectorRequestBodySchema,
  ProposeSettlementRequestBodySchema,
  ProposeStarshipRequestBodySchema,
  ProposeTroubleRequestBodySchema,
  ProposeTruthRequestBodySchema,
  SuggestMoveRequestBodySchema,
  SuggestActionsRequestBodySchema,
  type SuggestActionsResponse,
  CheckTriggerRequestBodySchema,
  WorldPassRequestBodySchema,
  OfferComplicationsRequestBodySchema,
  SetComplicationRequestBodySchema,
  type OfferComplicationsResponse,
  type SetComplicationResponse,
  SceneFrameRequestBodySchema,
  RecapRequestBodySchema,
  ProposeSessionSummaryRequestBodySchema,
  type ProposeSessionSummaryResponse,
  type AiStatusResponse,
  type NarrationFrame,
  type NarrationRefusalResponse,
  type OverrideResponse,
  type ProposeAmountResponse,
  type ProposeCharacterResponse,
  type ProposeIncidentsResponse,
  type ProposeSectorResponse,
  type ProposeSettlementResponse,
  type ProposeStarshipResponse,
  type ProposeTroubleResponse,
  type ProposeTruthResponse,
  type SuggestMoveResponse,
  type CheckTriggerResponse,
} from '@astrolabe/shared';
import type { RandomSource } from '@astrolabe/rules';
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
  proposeSector,
  proposeSettlement,
  proposeStarship,
  proposeTrouble,
  proposeTruth,
  suggestMove,
  suggestActions,
  checkTrigger,
  runBeatNarration,
  runCorrection,
  prepareWorldPass,
  runWorldPass,
  offerComplications,
  setComplication,
  prepareSceneFrame,
  runSceneFrame,
  prepareRecap,
  proposeSessionSummary,
  runRecap,
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
    planner,
    status,
    dice = {},
  }: {
    readonly sql: Sql;
    readonly ai: AiProvider;
    /** Judges everything `ai` writes before it commits (D-128). */
    readonly checker: AiProvider;
    /** Plans the scene frame's rolls ahead of any text (D-141, amended). */
    readonly planner: AiProvider;
    readonly status: AiStatus;
    /** Loaded dice for the golden-session test (D-152); empty in production. */
    readonly dice?: { readonly rng?: RandomSource };
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

  // D-138 (amended): after a beat's passage commits, the world pass follows
  // it. Streamed so 8.2's follow-up passage arrives on the same request.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/world-passes',
    async (request, reply) => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = WorldPassRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const prepared = await prepareWorldPass(sql, {
          ...dice,
          campaignId: id,
          commandId: parsedBody.data.commandId,
          actor: PLAYER,
          passageEventId: parsedBody.data.passageEventId,
        });
        return streamFrames(reply, async (sink) =>
          prepared.kind === 'replay'
            ? prepared.result
            : runWorldPass(sql, ai, checker, prepared, sink, status),
        );
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  // D-143 (8.7): complication options on request, and the complication the player sets.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/complication-options',
    async (
      request,
      reply,
    ): Promise<OfferComplicationsResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = OfferComplicationsRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await offerComplications(
          sql,
          ai,
          {
            ...dice,
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            moveCommandId: parsedBody.data.moveCommandId,
          },
          status,
        );
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/complications',
    async (
      request,
      reply,
    ): Promise<SetComplicationResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = SetComplicationRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const { commandId, moveCommandId, text, offeredEventId, optionIndex } = parsedBody.data;
        const result = await setComplication(sql, {
          campaignId: id,
          commandId,
          actor: PLAYER,
          moveCommandId,
          text,
          ...(offeredEventId !== undefined ? { offeredEventId } : {}),
          ...(optionIndex !== undefined ? { optionIndex } : {}),
        });
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  // D-141: frame the open scene, once. Streamed like narration.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/scene-frames',
    async (request, reply) => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = SceneFrameRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const prepared = await prepareSceneFrame(sql, {
          ...dice,
          campaignId: id,
          commandId: parsedBody.data.commandId,
          actor: PLAYER,
        });
        return streamFrames(reply, async (sink) =>
          prepared.kind === 'replay'
            ? prepared.result
            : runSceneFrame(sql, ai, checker, prepared, sink, status, planner),
        );
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  // D-149: End a Session's proposal, checked before it is shown.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/session-summaries',
    async (
      request,
      reply,
    ): Promise<ProposeSessionSummaryResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeSessionSummaryRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await proposeSessionSummary(
          sql,
          ai,
          checker,
          { campaignId: id, commandId: parsedBody.data.commandId, actor: PLAYER },
          status,
        );
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  // D-147: the recap that opens a session, once. Streamed like narration.
  app.post<{ Params: CampaignParams }>('/api/campaigns/:id/recaps', async (request, reply) => {
    const id = parseCampaignId(request.params.id, reply);
    if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
      return undefined;
    }
    const parsedBody = RecapRequestBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400);
      return undefined;
    }

    try {
      const prepared = await prepareRecap(sql, {
        campaignId: id,
        commandId: parsedBody.data.commandId,
        actor: PLAYER,
      });
      return streamFrames(reply, async (sink) =>
        prepared.kind === 'replay'
          ? prepared.result
          : runRecap(sql, ai, checker, prepared, sink, status),
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
            ...dice,
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            concept: parsedBody.data.concept,
            targetId: parsedBody.data.targetId,
            groundedIn: parsedBody.data.groundedIn,
            ...(parsedBody.data.fields === undefined ? {} : { fields: parsedBody.data.fields }),
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
          { ...dice, campaignId: id, commandId: parsedBody.data.commandId, actor: PLAYER },
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
    '/api/campaigns/:id/truth-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeTruthResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeTruthRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await proposeTruth(
          sql,
          ai,
          {
            ...dice,
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            truthId: parsedBody.data.truthId,
          },
          status,
        );
        // The same contract as every other proposal (D-116): a provider
        // failure is an outcome the screen renders, not an exception.
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/starship-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeStarshipResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeStarshipRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await proposeStarship(
          sql,
          ai,
          {
            ...dice,
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            groundedIn: parsedBody.data.groundedIn,
            ...(parsedBody.data.fields === undefined ? {} : { fields: parsedBody.data.fields }),
          },
          status,
        );
        // The same contract as every other proposal (D-116).
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/settlement-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeSettlementResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeSettlementRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await proposeSettlement(
          sql,
          ai,
          {
            ...dice,
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            targetId: parsedBody.data.targetId,
            groundedIn: parsedBody.data.groundedIn,
            ...(parsedBody.data.fields === undefined ? {} : { fields: parsedBody.data.fields }),
          },
          status,
        );
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/sector-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeSectorResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeSectorRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await proposeSector(
          sql,
          ai,
          { ...dice, campaignId: id, commandId: parsedBody.data.commandId, actor: PLAYER },
          status,
        );
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/trouble-proposals',
    async (
      request,
      reply,
    ): Promise<ProposeTroubleResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = ProposeTroubleRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const body = parsedBody.data;
        const base = {
          ...dice,
          campaignId: id,
          commandId: body.commandId,
          actor: PLAYER,
          groundedIn: body.groundedIn,
        };
        const result = await proposeTrouble(
          sql,
          ai,
          body.kind === 'sector'
            ? { ...base, kind: 'sector' }
            : { ...base, kind: 'settlement', ownerId: body.ownerId },
          status,
        );
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

  // D-148: "What now?" — three suggested actions, on request.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/action-suggestions',
    async (
      request,
      reply,
    ): Promise<SuggestActionsResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = SuggestActionsRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await suggestActions(
          sql,
          ai,
          { campaignId: id, commandId: parsedBody.data.commandId, actor: PLAYER },
          status,
        );
        // An outage is a recorded outcome, as for every suggestion (D-116).
        reply.code(201);
        return result;
      } catch (error) {
        return refusal(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/trigger-checks',
    async (
      request,
      reply,
    ): Promise<CheckTriggerResponse | NarrationRefusalResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = CheckTriggerRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }

      try {
        const result = await checkTrigger(
          sql,
          ai,
          {
            campaignId: id,
            commandId: parsedBody.data.commandId,
            actor: PLAYER,
            moveCommandId: parsedBody.data.moveCommandId,
          },
          status,
        );
        // D-136: a fit, a note or an outage, each a recorded outcome (D-116).
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
    world: () => send({ type: 'world' }),
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
