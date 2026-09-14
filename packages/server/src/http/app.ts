import {
  AddSectorLocationRequestBodySchema,
  AddSectorRouteRequestBodySchema,
  ApplyMoveChoiceRequestBodySchema,
  BurnMomentumRequestBodySchema,
  CreateCampaignRequestBodySchema,
  CreateCharacterRequestBodySchema,
  InvokeMoveRequestBodySchema,
  LOCAL_PLAYER_ID,
  ResolvePayThePriceRequestBodySchema,
  SetTruthRequestBodySchema,
  SwearIncitingVowRequestBodySchema,
  VoidEventRequestBodySchema,
  type AddSectorLocationResponse,
  type BurnMomentumResponse,
  type CampaignListResponse,
  type CampaignStateResponse,
  type CreateCampaignResponse,
  type CreateCharacterResponse,
  type InvokeMoveResponse,
  type NarrativeLogResponse,
  type ResolvePayThePriceResponse,
  type SetTruthResponse,
  type SwearIncitingVowResponse,
  type VoidEventResponse,
  type VoidPreviewResult,
} from '@astrolabe/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import * as z from 'zod';

import type { CharacterProblem } from '@astrolabe/rules';

import type { AiProvider } from '../ai/provider.js';
import { AiStatus } from '../ai/status.js';
import { buildNarrativeLog } from '../projection/narrative-log.js';
import { registerAiRoutes } from './ai-routes.js';
import { parseCampaignId, parseEventId, requireCampaignExists } from './params.js';
import { project } from '../projection/project.js';
import {
  addSectorLocation,
  addSectorRoute,
  applyMoveChoice,
  burnMomentum,
  CharacterRejectedError,
  UnknownProposalError,
  createCampaign,
  createCharacter,
  IncitingVowRejectedError,
  invokeMove,
  listCampaigns,
  MoveRejectedError,
  previewVoid,
  readEvents,
  readNarrativeEvents,
  resolvePayThePriceMethod,
  SectorRouteRejectedError,
  setTruth,
  swearIncitingVow,
  TruthRejectedError,
  voidEvent,
  VoidRefusedError,
} from '../db/index.js';

/**
 * The HTTP read API (task 5.0, D-94).
 *
 * Three routes are read-only: list campaigns, one campaign's projected
 * state, and a page of its narrative log. Every route reads through the
 * same functions the harness and the tests already use (`project`,
 * `buildNarrativeLog`) — this layer adds routing and request validation,
 * nothing else.
 *
 * `POST /campaigns/:id/characters` (task 3.2) was the first command
 * endpoint; `POST /campaigns` (task 4.1) is the same shape one level up —
 * it creates the campaign a character route would otherwise 404 against.
 * Both write through a `db/*-commands.ts` function that is already
 * authoritative — this route layer's job is only to parse the wire body and
 * decide who the actor is. Milestone 1 has no auth (D-52), so the actor is
 * always the constant local player; a client cannot supply it, the same
 * reasoning section 2 gives for never accepting `causedBy` from a client.
 *
 * Params are validated by hand with zod rather than a fastify schema
 * plugin, since `shared` already depends on zod and this is four small
 * routes, not a schema-driven API surface.
 */

export interface BuildAppOptions {
  readonly sql: Sql;
  /**
   * The AI provider (group 7), injected so every route that calls it runs
   * against the stub in tests (D-60) and against Claude in `serve.ts`.
   */
  readonly ai: AiProvider;
}

interface CampaignParams {
  readonly id: string;
}

interface EventParams {
  readonly id: string;
  readonly eventId: string;
}

interface LogQuery {
  readonly before?: string;
  readonly limit?: string;
}

const LogQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export function buildApp({ sql, ai }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  registerAiRoutes(app, { sql, ai, status: new AiStatus(ai) });

  app.get('/api/campaigns', async (): Promise<CampaignListResponse> => {
    return listCampaigns(sql);
  });

  app.post(
    '/api/campaigns',
    async (request, reply): Promise<CreateCampaignResponse | undefined> => {
      const parsedBody = CreateCampaignRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { campaignId, commandId, name, settings } = parsedBody.data;

      const created = await createCampaign(sql, {
        campaignId,
        commandId,
        actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
        name,
        ...(settings !== undefined ? { settings } : {}),
      });
      reply.code(201);
      return { campaignId: created.campaignId };
    },
  );

  app.get<{ Params: CampaignParams }>(
    '/api/campaigns/:id/state',
    async (request, reply): Promise<CampaignStateResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined) {
        return undefined;
      }

      const events = await readEvents(sql, id);
      const lastEvent = events[events.length - 1];
      if (lastEvent === undefined) {
        reply.code(404);
        return undefined;
      }

      return { headSeq: lastEvent.seq, state: project(events) };
    },
  );

  app.get<{ Params: CampaignParams; Querystring: LogQuery }>(
    '/api/campaigns/:id/log',
    async (request, reply): Promise<NarrativeLogResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined) {
        return undefined;
      }

      const parsedQuery = LogQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        reply.code(400);
        return undefined;
      }

      const { before, limit } = parsedQuery.data;
      const options = {
        ...(before !== undefined ? { before } : {}),
        ...(limit !== undefined ? { limit } : {}),
      };
      const events = await readNarrativeEvents(sql, id, options);
      return buildNarrativeLog(events, options);
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/characters',
    async (
      request,
      reply,
    ): Promise<
      | CreateCharacterResponse
      | { problems: readonly CharacterProblem[]; problem?: string }
      | undefined
    > => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = CreateCharacterRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const {
        commandId,
        draft,
        backgroundVow,
        grantCommandVehicle,
        hooks,
        pronouns,
        proposalCommandId,
      } = parsedBody.data;

      try {
        const created = await createCharacter(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          draft,
          ...(backgroundVow !== undefined ? { backgroundVow } : {}),
          ...(grantCommandVehicle !== undefined ? { grantCommandVehicle } : {}),
          ...(hooks !== undefined ? { hooks } : {}),
          ...(pronouns !== undefined ? { pronouns } : {}),
          ...(proposalCommandId !== undefined ? { proposalCommandId } : {}),
        });
        reply.code(201);
        return {
          characterId: created.characterId,
          ...(created.vowTrackId !== undefined ? { vowTrackId: created.vowTrackId } : {}),
        };
      } catch (error) {
        if (error instanceof CharacterRejectedError) {
          reply.code(422);
          return { problems: error.problems };
        }
        if (error instanceof UnknownProposalError) {
          reply.code(422);
          return { problems: [], problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/truths',
    async (request, reply): Promise<SetTruthResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = SetTruthRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, oracleId, source, rowIndex, text } = parsedBody.data;

      try {
        const answered = await setTruth(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          oracleId,
          source,
          ...(rowIndex !== undefined ? { rowIndex } : {}),
          ...(text !== undefined ? { text } : {}),
        });
        reply.code(201);
        return { text: answered.text };
      } catch (error) {
        if (error instanceof TruthRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/sector/locations',
    async (
      request,
      reply,
    ): Promise<AddSectorLocationResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = AddSectorLocationRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, name, description } = parsedBody.data;

      const added = await addSectorLocation(sql, {
        campaignId: id,
        commandId,
        actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
        name,
        description,
      });
      reply.code(201);
      return { locationId: added.locationId };
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/sector/routes',
    async (request, reply): Promise<Record<string, never> | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = AddSectorRouteRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, fromLocationId, toLocationId } = parsedBody.data;

      try {
        await addSectorRoute(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          fromLocationId,
          toLocationId,
        });
        reply.code(201);
        return {};
      } catch (error) {
        if (error instanceof SectorRouteRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/inciting-vow',
    async (request, reply): Promise<SwearIncitingVowResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = SwearIncitingVowRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, title, rank } = parsedBody.data;

      try {
        const sworn = await swearIncitingVow(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          title,
          rank,
        });
        reply.code(201);
        return { vowTrackId: sworn.vowTrackId };
      } catch (error) {
        if (error instanceof IncitingVowRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/moves',
    async (request, reply): Promise<InvokeMoveResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = InvokeMoveRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const {
        commandId,
        moveId,
        actorCharacterId,
        aidingAllyId,
        using,
        adds,
        actionText,
        preRollAmount,
        proposalEventId,
        chainedFromCommandId,
      } = parsedBody.data;

      try {
        const invoked = await invokeMove(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          moveId,
          actorCharacterId,
          adds,
          ...(aidingAllyId !== undefined ? { aidingAllyId } : {}),
          ...(using !== undefined ? { using } : {}),
          ...(actionText !== undefined ? { actionText } : {}),
          ...(preRollAmount !== undefined ? { preRollAmount } : {}),
          ...(proposalEventId !== undefined ? { proposalEventId } : {}),
          ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
        });
        reply.code(201);
        return {
          invocationEventId: invoked.invocationEventId,
          rollEventId: invoked.rollEventId,
          roll: { kind: 'action', ...invoked.roll },
          ...(invoked.pendingChoice !== undefined ? { pendingChoice: invoked.pendingChoice } : {}),
          ...(invoked.chain !== undefined ? { chain: invoked.chain } : {}),
        };
      } catch (error) {
        if (error instanceof MoveRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/moves/choice',
    async (request, reply): Promise<Record<string, never> | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = ApplyMoveChoiceRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, rollEventId, choiceId, optionIds } = parsedBody.data;

      try {
        await applyMoveChoice(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          rollEventId,
          choiceId,
          optionIds,
        });
        reply.code(201);
        return {};
      } catch (error) {
        if (error instanceof MoveRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/moves/burn',
    async (request, reply): Promise<BurnMomentumResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = BurnMomentumRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, rollEventId } = parsedBody.data;

      try {
        const burned = await burnMomentum(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          rollEventId,
        });
        reply.code(201);
        return { tierAfter: burned.tierAfter };
      } catch (error) {
        if (error instanceof MoveRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/pay-the-price',
    async (
      request,
      reply,
    ): Promise<ResolvePayThePriceResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = ResolvePayThePriceRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, actorCharacterId, optionId, chainedFromCommandId } = parsedBody.data;

      try {
        const resolved = await resolvePayThePriceMethod(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          actorCharacterId,
          optionId,
          ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
        });
        reply.code(201);
        return {
          invocationEventId: resolved.invocationEventId,
          ...(resolved.oracle !== undefined ? { oracle: resolved.oracle } : {}),
          ...(resolved.chain !== undefined ? { chain: resolved.chain } : {}),
        };
      } catch (error) {
        if (error instanceof MoveRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  app.get<{ Params: EventParams }>(
    '/api/campaigns/:id/events/:eventId/void-preview',
    async (request, reply): Promise<VoidPreviewResult | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      const eventId = parseEventId(request.params.eventId, reply);
      if (id === undefined || eventId === undefined) {
        return undefined;
      }

      const plan = await previewVoid(sql, id, eventId);
      return plan;
    },
  );

  app.post<{ Params: EventParams }>(
    '/api/campaigns/:id/events/:eventId/void',
    async (request, reply): Promise<VoidEventResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      const eventId = parseEventId(request.params.eventId, reply);
      if (id === undefined || eventId === undefined) {
        return undefined;
      }

      const parsedBody = VoidEventRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, reason } = parsedBody.data;

      try {
        const result = await voidEvent(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          targetEventId: eventId,
          reason,
          kind: 'player_void',
        });
        reply.code(201);
        return result.response as VoidEventResponse;
      } catch (error) {
        if (error instanceof VoidRefusedError) {
          reply.code(422);
          return { problem: error.plan.detail };
        }
        throw error;
      }
    },
  );

  return app;
}
