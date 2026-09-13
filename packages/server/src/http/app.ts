import {
  AddSectorLocationRequestBodySchema,
  AddSectorRouteRequestBodySchema,
  CampaignIdSchema,
  CreateCampaignRequestBodySchema,
  CreateCharacterRequestBodySchema,
  LOCAL_PLAYER_ID,
  SetTruthRequestBodySchema,
  SwearIncitingVowRequestBodySchema,
  type AddSectorLocationResponse,
  type CampaignListResponse,
  type CampaignStateResponse,
  type CreateCampaignResponse,
  type CreateCharacterResponse,
  type NarrativeLogResponse,
  type SetTruthResponse,
  type SwearIncitingVowResponse,
} from '@astrolabe/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import * as z from 'zod';

import type { CharacterProblem } from '@astrolabe/rules';

import { buildNarrativeLog } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import {
  addSectorLocation,
  addSectorRoute,
  CharacterRejectedError,
  createCampaign,
  createCharacter,
  IncitingVowRejectedError,
  listCampaigns,
  readEvents,
  readNarrativeEvents,
  SectorRouteRejectedError,
  setTruth,
  swearIncitingVow,
  TruthRejectedError,
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
}

interface CampaignParams {
  readonly id: string;
}

interface LogQuery {
  readonly before?: string;
  readonly limit?: string;
}

const LogQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export function buildApp({ sql }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

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
    ): Promise<CreateCharacterResponse | { problems: readonly CharacterProblem[] } | undefined> => {
      const id = parseCampaignId(request.params.id, reply);
      if (id === undefined || !(await requireCampaignExists(sql, id, reply))) {
        return undefined;
      }

      const parsedBody = CreateCharacterRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        reply.code(400);
        return undefined;
      }
      const { commandId, draft, backgroundVow, grantCommandVehicle } = parsedBody.data;

      try {
        const created = await createCharacter(sql, {
          campaignId: id,
          commandId,
          actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
          draft,
          ...(backgroundVow !== undefined ? { backgroundVow } : {}),
          ...(grantCommandVehicle !== undefined ? { grantCommandVehicle } : {}),
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

  return app;
}

/** Validates a route param and sets a 400 reply if it isn't a campaign ID, returning `undefined` either way to signal the caller to stop. */
function parseCampaignId(raw: string, reply: FastifyReply) {
  const parsed = CampaignIdSchema.safeParse(raw);
  if (!parsed.success) {
    reply.code(400);
    return undefined;
  }
  return parsed.data;
}

/**
 * Existence follows the same rule every read route uses: a campaign that
 * exists has at least one event, because creating one and writing its
 * first event happen in the same command. Sets a 404 reply and returns
 * `false` when it doesn't, so a command route can 404 the way the
 * characters route already did before this helper existed.
 */
async function requireCampaignExists(
  sql: Sql,
  id: ReturnType<typeof CampaignIdSchema.parse>,
  reply: FastifyReply,
): Promise<boolean> {
  const existing = await readEvents(sql, id);
  if (existing.length === 0) {
    reply.code(404);
    return false;
  }
  return true;
}
