import {
  AddSectorLocationRequestBodySchema,
  AddSectorRouteRequestBodySchema,
  BeginSessionRequestBodySchema,
  EndSessionRequestBodySchema,
  ApplyMoveChoiceRequestBodySchema,
  BurnMomentumRequestBodySchema,
  CreateCampaignRequestBodySchema,
  CreateCharacterRequestBodySchema,
  InvokeMoveRequestBodySchema,
  LOCAL_PLAYER_ID,
  ResolvePayThePriceRequestBodySchema,
  SaveLaunchDraftRequestBodySchema,
  SetLaunchFoundationRequestBodySchema,
  DecideLaunchTruthRequestBodySchema,
  ActivateLaunchRequestBodySchema,
  SaveSharedStarshipRequestBodySchema,
  ConfigureLaunchSectorRequestBodySchema,
  CreateLaunchCharacterRequestBodySchema,
  RemoveLaunchCharacterRequestBodySchema,
  ReviseLaunchCharacterRequestBodySchema,
  EstablishLaunchConnectionRequestBodySchema,
  AcceptLaunchIncidentRequestBodySchema,
  AmendLaunchFactRequestBodySchema,
  EntityIdSchema,
  RemoveLaunchLocationRequestBodySchema,
  RemoveLaunchRouteRequestBodySchema,
  SaveLaunchLocationRequestBodySchema,
  SaveLaunchRouteRequestBodySchema,
  SetStartingSettlementRequestBodySchema,
  SetSectorLayoutRequestBodySchema,
  SaveLaunchTroubleRequestBodySchema,
  RollLaunchOracleRequestBodySchema,
  RollLaunchRecipeRequestBodySchema,
  ProposeLaunchCreationRequestBodySchema,
  SwearIncitingVowRequestBodySchema,
  VoidEventRequestBodySchema,
  type AddSectorLocationResponse,
  type BeginSessionResponse,
  type EndSessionResponse,
  type BurnMomentumResponse,
  type CampaignListResponse,
  type CampaignStateResponse,
  type CreateCampaignResponse,
  type CreateCharacterResponse,
  type RemoveCharacterResponse,
  type ReviseCharacterResponse,
  type InvokeMoveResponse,
  type LaunchWorkspaceResponse,
  type EntityGroundingResponse,
  type NarrativeLogResponse,
  type ResolvePayThePriceResponse,
  type SaveLaunchDraftResponse,
  type SetLaunchFoundationResponse,
  type DecideLaunchTruthResponse,
  type ActivateLaunchResponse,
  type SaveSharedStarshipResponse,
  type ConfigureLaunchSectorResponse,
  type EstablishLaunchConnectionResponse,
  type AcceptLaunchIncidentResponse,
  type AmendLaunchFactResponse,
  type SaveLaunchLocationResponse,
  type SaveLaunchRouteResponse,
  type SaveLaunchTroubleResponse,
  type RollLaunchOracleResponse,
  type RollLaunchRecipeResponse,
  type SwearIncitingVowResponse,
  type VoidEventResponse,
  type VoidPreviewResult,
} from '@astrolabe/shared';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import * as z from 'zod';

import type { CharacterProblem, RandomSource } from '@astrolabe/rules';

import type { AiProvider } from '../ai/provider.js';
import { AiStatus } from '../ai/status.js';
import { owedPassages } from '../ai/context/index.js';
import { buildNarrativeLog, oracleChips } from '../projection/narrative-log.js';
import { registerAiRoutes } from './ai-routes.js';
import {
  parseCampaignId,
  parseCharacterId,
  parseEntityId,
  parseEventId,
  requireCampaignExists,
} from './params.js';
import { project } from '../projection/project.js';
import { buildLaunchWorkspace } from '../launch/workspace.js';
import {
  addSectorLocation,
  addSectorRoute,
  applyMoveChoice,
  beginSession,
  endSession,
  SessionRejectedError,
  burnMomentum,
  CharacterRejectedError,
  LaunchCharacterRejectedError,
  UnknownCharacterError,
  UnknownProposalError,
  createCampaign,
  createCharacter,
  removeCharacter,
  reviseCharacter,
  IncitingVowRejectedError,
  invokeMove,
  latestSessionId,
  listCampaigns,
  MoveRejectedError,
  previewVoid,
  readEvents,
  readNarrativeEvents,
  resolvePayThePriceMethod,
  SectorRouteRejectedError,
  saveLaunchDraft,
  setLaunchFoundation,
  decideTruth,
  activateLaunch,
  saveSharedStarship,
  configureLaunchSector,
  establishLaunchConnection,
  reviseLaunchConnection,
  acceptLaunchIncident,
  amendLaunchFact,
  removeLaunchLocation,
  removeLaunchRoute,
  saveLaunchLocation,
  saveLaunchRoute,
  setStartingSettlement,
  setSectorLayout,
  saveLaunchTrouble,
  rollLaunchOracle,
  rollLaunchRecipe,
  proposeLaunchCreation,
  LaunchRejectedError,
  swearIncitingVow,
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
  /** The scene frame's planner (D-141, amended). Defaults to `ai`. */
  readonly planner?: AiProvider;
  /**
   * The AI provider (group 7), injected so every route that calls it runs
   * against the stub in tests (D-60) and against Claude in `serve.ts`.
   */
  readonly ai: AiProvider;
  /**
   * The authority checker (D-128): a second, faster model that judges what
   * `ai` writes before it commits. A stub in tests, Claude in `serve.ts`.
   */
  readonly checker: AiProvider;
  /**
   * The dice every route rolls with. Omitted in production, where each
   * command uses `cryptoRandomSource()`; the golden-session test loads them
   * (D-152).
   */
  readonly rng?: RandomSource;
  /**
   * The built web client (`packages/web/dist`), served from the same
   * address as the API so its `/api` paths work unchanged (D-154). Omitted
   * in development, where Vite serves the client and proxies `/api`.
   */
  readonly webRoot?: string;
}

interface CampaignParams {
  readonly id: string;
}

interface LocationParams extends CampaignParams {
  locationId: string;
}

interface CrewParams extends CampaignParams {
  readonly characterId: string;
}

/**
 * The refusals both crew routes share (6.0d).
 *
 * 404 for a character the campaign does not have, so a stale link reads as
 * "not here" rather than as a bad request; 422 for a launch that is closed
 * (D-178) or a draft the rules reject, which is the shape every other launch
 * route already uses.
 */
function crewFailure(error: unknown, reply: FastifyReply): { problem: string; reason?: string } {
  if (error instanceof UnknownCharacterError) {
    reply.code(404);
    return { problem: error.message };
  }
  if (error instanceof LaunchRejectedError) {
    reply.code(422);
    return { problem: error.message, reason: error.reason };
  }
  if (error instanceof LaunchCharacterRejectedError) {
    reply.code(422);
    return { problem: error.message };
  }
  throw error;
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

export function buildApp({
  sql,
  ai,
  checker,
  planner = ai,
  rng,
  webRoot,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  if (webRoot !== undefined) {
    serveWebClient(app, webRoot);
  }
  const dice = rng !== undefined ? { rng } : {};
  registerAiRoutes(app, { sql, ai, checker, planner, status: new AiStatus(ai), dice });

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

      const state = project(events);
      return {
        headSeq: lastEvent.seq,
        state,
        owedPassages:
          state.session === null || state.session.endedAt !== undefined
            ? []
            : owedPassages(events, state.session.id),
      };
    },
  );

  app.get<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch',
    async (request, reply): Promise<LaunchWorkspaceResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined) return undefined;
      const events = await readEvents(sql, id);
      const lastEvent = events[events.length - 1];
      if (lastEvent === undefined) {
        reply.code(404);
        return undefined;
      }
      const workspace = buildLaunchWorkspace(events);
      return { headSeq: lastEvent.seq, ...workspace };
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
      // D-146: the log is per session — the open one, or the latest that ended.
      const sessionId = await latestSessionId(sql, id);
      const events = await readNarrativeEvents(sql, id, {
        ...options,
        ...(sessionId !== undefined ? { sessionId } : {}),
      });
      return buildNarrativeLog(events, options);
    },
  );

  // 8.5: an entity's grounding, as chips (D-17, D-70). 404 for an entity the
  // campaign never established.
  app.get<{ Params: { readonly id: string; readonly entityId: string } }>(
    '/api/campaigns/:id/entities/:entityId/grounding',
    async (request, reply): Promise<EntityGroundingResponse | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      const entityId = parseEntityId(request.params.entityId, reply);
      if (id === undefined || entityId === undefined) {
        return undefined;
      }
      const events = await readEvents(sql, id);
      const established = events.find(
        (event) => event.type === 'entity.established' && event.payload.entityId === entityId,
      );
      if (established?.type !== 'entity.established') {
        reply.code(404);
        return undefined;
      }
      return { chips: oracleChips(events)(established.payload.provenance.groundedIn) };
    },
  );

  // D-146: Begin a Session. Commits at once; the recap is its own request.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/sessions',
    async (
      request,
      reply,
    ): Promise<BeginSessionResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = BeginSessionRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, scene } = parsedBody.data;

      try {
        const result = await beginSession(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          ...(scene !== undefined
            ? {
                scene: {
                  title: scene.title,
                  ...(scene.locationId !== undefined ? { locationId: scene.locationId } : {}),
                },
              }
            : {}),
        });
        reply.code(201);
        return result;
      } catch (error) {
        if (error instanceof SessionRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  // D-149: End a Session, from the Guide's proposal.
  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/session-ends',
    async (
      request,
      reply,
    ): Promise<EndSessionResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }
      const parsedBody = EndSessionRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await endSession(sql, {
          campaignId: id,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          ...parsedBody.data,
        });
        reply.code(201);
        return result;
      } catch (error) {
        if (error instanceof SessionRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.put<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/drafts',
    async (
      request,
      reply,
    ): Promise<SaveLaunchDraftResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SaveLaunchDraftRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        await saveLaunchDraft(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          draft: parsed.data.draft,
        });
        reply.code(201);
        return { section: parsed.data.draft.section };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/proposals',
    async (
      request,
      reply,
    ): Promise<
      { targetKind: string; targetId: string } | { problem: string; reason: string } | undefined
    > => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = ProposeLaunchCreationRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const { commandId, targetId, rationale, groundedIn, ...proposal } = parsed.data;
        const result = await proposeLaunchCreation(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          // The discriminated pair travels together, so the union stays narrow.
          proposal,
          targetId,
          rationale,
          groundedIn,
        });
        reply.code(201);
        return result.response as { targetKind: string; targetId: string };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/recipe-rolls',
    async (
      request,
      reply,
    ): Promise<RollLaunchRecipeResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = RollLaunchRecipeRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await rollLaunchRecipe(sql, {
          ...dice,
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          selector: parsed.data.selector,
        });
        reply.code(201);
        return result.response as RollLaunchRecipeResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/oracle-rolls',
    async (
      request,
      reply,
    ): Promise<RollLaunchOracleResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = RollLaunchOracleRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await rollLaunchOracle(sql, {
          ...dice,
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          oracleId: parsed.data.oracleId,
        });
        reply.code(201);
        return result.response as RollLaunchOracleResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/troubles',
    async (
      request,
      reply,
    ): Promise<SaveLaunchTroubleResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SaveLaunchTroubleRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await saveLaunchTrouble(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          trouble: parsed.data.trouble,
          ...(parsed.data.proposalEventId === undefined
            ? {}
            : { proposalEventId: parsed.data.proposalEventId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        return result.response as SaveLaunchTroubleResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/starting-settlement',
    async (
      request,
      reply,
    ): Promise<{ settlementId: string } | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SetStartingSettlementRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        await setStartingSettlement(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          settlementId: parsed.data.settlementId,
        });
        reply.code(201);
        return { settlementId: parsed.data.settlementId };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.put<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/sector-layout',
    async (
      request,
      reply,
    ): Promise<{ locations: number } | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SetSectorLayoutRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await setSectorLayout(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          coordinates: parsed.data.coordinates,
        });
        reply.code(201);
        return result.response as { locations: number };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/routes',
    async (
      request,
      reply,
    ): Promise<SaveLaunchRouteResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SaveLaunchRouteRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        await saveLaunchRoute(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          route: parsed.data.route,
        });
        reply.code(201);
        return { from: parsed.data.route.from };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  // 8.0g: remove a node or a passage before launch. Append-only (A40): the
  // reason is required, and the removal is an event rather than a deletion.
  app.delete<{ Params: LocationParams }>(
    '/api/campaigns/:id/launch/locations/:locationId',
    async (
      request,
      reply,
    ): Promise<{ locationId: string } | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const locationId = EntityIdSchema.safeParse(request.params.locationId);
      const parsed = RemoveLaunchLocationRequestBodySchema.safeParse(request.body);
      if (!locationId.success || !parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await removeLaunchLocation(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          locationId: locationId.data,
          reason: parsed.data.reason,
        });
        return result.response as { locationId: string };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/routes',
    async (
      request,
      reply,
    ): Promise<{ from: string } | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = RemoveLaunchRouteRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await removeLaunchRoute(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          route: parsed.data.route,
          reason: parsed.data.reason,
        });
        return result.response as { from: string };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/locations',
    async (
      request,
      reply,
    ): Promise<SaveLaunchLocationResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SaveLaunchLocationRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await saveLaunchLocation(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          ...(parsed.data.locationId === undefined ? {} : { locationId: parsed.data.locationId }),
          location: parsed.data.location,
          ...(parsed.data.planet === undefined ? {} : { planet: parsed.data.planet }),
          ...(parsed.data.proposalTargetId === undefined
            ? {}
            : { proposalTargetId: parsed.data.proposalTargetId }),
          ...(parsed.data.proposalEventId === undefined
            ? {}
            : { proposalEventId: parsed.data.proposalEventId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        return result.response as SaveLaunchLocationResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/amendments',
    async (
      request,
      reply,
    ): Promise<AmendLaunchFactResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = AmendLaunchFactRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await amendLaunchFact(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          amendment: parsed.data.amendment,
          reason: parsed.data.reason,
          supersedesEventId: parsed.data.supersedesEventId,
        });
        reply.code(201);
        return result.response as AmendLaunchFactResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/incident',
    async (
      request,
      reply,
    ): Promise<AcceptLaunchIncidentResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = AcceptLaunchIncidentRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await acceptLaunchIncident(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          incident: parsed.data.incident,
          ...(parsed.data.proposal === undefined ? {} : { proposal: parsed.data.proposal }),
        });
        reply.code(201);
        return result.response as AcceptLaunchIncidentResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/connection',
    async (
      request,
      reply,
    ): Promise<
      EstablishLaunchConnectionResponse | { problem: string; reason: string } | undefined
    > => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = EstablishLaunchConnectionRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await establishLaunchConnection(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          npcName: parsed.data.npcName,
          role: parsed.data.role,
          rank: parsed.data.rank,
          participants: parsed.data.participants,
          ...(parsed.data.details === undefined ? {} : { details: parsed.data.details }),
          ...(parsed.data.proposalEventId === undefined
            ? {}
            : { proposalEventId: parsed.data.proposalEventId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        return result.response as EstablishLaunchConnectionResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  // 9.0a: revise the starting connection before launch, in place (D-202, D-203).
  app.put<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/connection',
    async (
      request,
      reply,
    ): Promise<
      EstablishLaunchConnectionResponse | { problem: string; reason: string } | undefined
    > => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = EstablishLaunchConnectionRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await reviseLaunchConnection(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          npcName: parsed.data.npcName,
          role: parsed.data.role,
          rank: parsed.data.rank,
          participants: parsed.data.participants,
          ...(parsed.data.details === undefined ? {} : { details: parsed.data.details }),
          ...(parsed.data.proposalEventId === undefined
            ? {}
            : { proposalEventId: parsed.data.proposalEventId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        return result.response as EstablishLaunchConnectionResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/crew',
    async (request, reply): Promise<CreateCharacterResponse | { problem: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = CreateLaunchCharacterRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await createCharacter(sql, {
          campaignId: id,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          commandId: parsed.data.commandId,
          draft: parsed.data.draft,
          backgroundVow: parsed.data.backgroundVow,
          launch: {
            appearance: parsed.data.launch.appearance,
            backstory: parsed.data.launch.backstory,
            ...(parsed.data.launch.signatureGear === undefined
              ? {}
              : { signatureGear: parsed.data.launch.signatureGear }),
          },
          ...(parsed.data.hooks === undefined ? {} : { hooks: parsed.data.hooks }),
          ...(parsed.data.pronouns === undefined ? {} : { pronouns: parsed.data.pronouns }),
          ...(parsed.data.proposalCommandId === undefined
            ? {}
            : { proposalCommandId: parsed.data.proposalCommandId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        return {
          characterId: result.characterId,
          ...(result.vowTrackId === undefined ? {} : { vowTrackId: result.vowTrackId }),
        };
      } catch (error) {
        if (error instanceof LaunchCharacterRejectedError) {
          reply.code(422);
          return { problem: error.message };
        }
        throw error;
      }
    },
  );

  // 6.0d: revise an accepted crew member before launch. PUT, because the
  // revision replaces the character rather than adding to it — the same shape
  // `PUT /launch/drafts` uses for the same reason.
  app.put<{ Params: CrewParams }>(
    '/api/campaigns/:id/launch/crew/:characterId',
    async (
      request,
      reply,
    ): Promise<ReviseCharacterResponse | { problem: string; reason?: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      const characterId = parseCharacterId(request.params.characterId, reply);
      if (id === undefined || characterId === undefined) return undefined;
      if (!(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = ReviseLaunchCharacterRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await reviseCharacter(sql, {
          campaignId: id,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          commandId: parsed.data.commandId,
          characterId,
          draft: parsed.data.draft,
          backgroundVow: parsed.data.backgroundVow,
          launch: {
            appearance: parsed.data.launch.appearance,
            backstory: parsed.data.launch.backstory,
            ...(parsed.data.launch.signatureGear === undefined
              ? {}
              : { signatureGear: parsed.data.launch.signatureGear }),
          },
          ...(parsed.data.hooks === undefined ? {} : { hooks: parsed.data.hooks }),
          ...(parsed.data.pronouns === undefined ? {} : { pronouns: parsed.data.pronouns }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        return {
          characterId: result.characterId,
          ...(result.vowTrackId === undefined ? {} : { vowTrackId: result.vowTrackId }),
        };
      } catch (error: unknown) {
        return crewFailure(error, reply);
      }
    },
  );

  // 6.0d: remove a crew member before launch. Append-only like everything else
  // before activation (A40) — the reason is required, and the removal is an
  // event rather than a deletion.
  app.delete<{ Params: CrewParams }>(
    '/api/campaigns/:id/launch/crew/:characterId',
    async (
      request,
      reply,
    ): Promise<RemoveCharacterResponse | { problem: string; reason?: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      const characterId = parseCharacterId(request.params.characterId, reply);
      if (id === undefined || characterId === undefined) return undefined;
      if (!(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = RemoveLaunchCharacterRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await removeCharacter(sql, {
          campaignId: id,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          commandId: parsed.data.commandId,
          characterId,
          reason: parsed.data.reason,
        });
        return { characterId: result.characterId };
      } catch (error: unknown) {
        return crewFailure(error, reply);
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/sector',
    async (
      request,
      reply,
    ): Promise<ConfigureLaunchSectorResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = ConfigureLaunchSectorRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await configureLaunchSector(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          sector: parsed.data.sector,
          ...(parsed.data.proposalEventId === undefined
            ? {}
            : { proposalEventId: parsed.data.proposalEventId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        return result.response as ConfigureLaunchSectorResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/starship',
    async (
      request,
      reply,
    ): Promise<SaveSharedStarshipResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SaveSharedStarshipRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await saveSharedStarship(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          starship: parsed.data.starship,
          ...(parsed.data.proposalEventId === undefined
            ? {}
            : { proposalEventId: parsed.data.proposalEventId }),
          ...(parsed.data.groundedIn === undefined ? {} : { groundedIn: parsed.data.groundedIn }),
        });
        reply.code(201);
        // The server minted or reused the id (7.0a); the body never carries one.
        return result.response as SaveSharedStarshipResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/activate',
    async (
      request,
      reply,
    ): Promise<ActivateLaunchResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = ActivateLaunchRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const result = await activateLaunch(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
        });
        reply.code(201);
        return result.response as ActivateLaunchResponse;
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/foundation',
    async (
      request,
      reply,
    ): Promise<SetLaunchFoundationResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = SetLaunchFoundationRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        await setLaunchFoundation(sql, {
          campaignId: id,
          commandId: parsed.data.commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          premise: parsed.data.premise,
          settings: parsed.data.settings,
        });
        reply.code(201);
        return { premise: parsed.data.premise };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
    },
  );

  app.post<{ Params: CampaignParams }>(
    '/api/campaigns/:id/launch/truths',
    async (
      request,
      reply,
    ): Promise<DecideLaunchTruthResponse | { problem: string; reason: string } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) return undefined;
      const parsed = DecideLaunchTruthRequestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return undefined;
      }
      try {
        const {
          commandId,
          truthId,
          resolution,
          optionIndex,
          subchoiceId,
          subchoiceOptionIndex,
          text,
          proposalEventId,
        } = parsed.data;
        await decideTruth(sql, {
          ...dice,
          campaignId: id,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          commandId,
          truthId,
          resolution,
          ...(optionIndex !== undefined ? { optionIndex } : {}),
          ...(subchoiceId !== undefined ? { subchoiceId } : {}),
          ...(subchoiceOptionIndex !== undefined ? { subchoiceOptionIndex } : {}),
          ...(text !== undefined ? { text } : {}),
          ...(proposalEventId !== undefined ? { proposalEventId } : {}),
        });
        reply.code(201);
        return { truthId: parsed.data.truthId };
      } catch (error) {
        if (error instanceof LaunchRejectedError) {
          reply.code(422);
          return { problem: error.message, reason: error.reason };
        }
        throw error;
      }
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
      const { commandId, draft, backgroundVow, hooks, pronouns, proposalCommandId } =
        parsedBody.data;

      try {
        const created = await createCharacter(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          draft,
          ...(backgroundVow !== undefined ? { backgroundVow } : {}),
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
      const { commandId, title, rank, proposalCommandId } = parsedBody.data;

      try {
        const sworn = await swearIncitingVow(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          title,
          rank,
          ...(proposalCommandId !== undefined ? { proposalCommandId } : {}),
        });
        reply.code(201);
        return { vowTrackId: sworn.vowTrackId };
      } catch (error) {
        if (error instanceof IncitingVowRejectedError || error instanceof UnknownProposalError) {
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
        suggestionEventId,
        chainedFromCommandId,
      } = parsedBody.data;

      try {
        const invoked = await invokeMove(sql, {
          ...dice,
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
          ...(suggestionEventId !== undefined ? { suggestionEventId } : {}),
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
          ...dice,
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

/**
 * D-154: the web client's files, and `index.html` for any other GET outside
 * `/api`, so a reload on a client route (`/campaigns/:id`) still opens
 * the app. An unknown `/api` path stays an ordinary 404.
 */
function serveWebClient(app: FastifyInstance, root: string): void {
  void app.register(fastifyStatic, {
    root,
    wildcard: false,
    // Vite fingerprints everything under assets/, so those never change;
    // index.html names them, so it is always revalidated.
    cacheControl: false,
    setHeaders: (response, path) => {
      response.setHeader(
        'cache-control',
        /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
      message: `Route ${request.method}:${request.url} not found`,
      error: 'Not Found',
      statusCode: 404,
    });
  });
}
