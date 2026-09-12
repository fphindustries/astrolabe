import {
  CampaignIdSchema,
  CreateCharacterRequestBodySchema,
  LOCAL_PLAYER_ID,
  type CampaignListResponse,
  type CampaignStateResponse,
  type CreateCharacterResponse,
  type NarrativeLogResponse,
} from '@astrolabe/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import * as z from 'zod';

import type { CharacterProblem } from '@astrolabe/rules';

import { buildNarrativeLog } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import {
  CharacterRejectedError,
  createCharacter,
  listCampaigns,
  readEvents,
  readNarrativeEvents,
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
 * `POST /campaigns/:id/characters` (task 3.2) is the first command
 * endpoint. It writes through `createCharacter` (task 3.5), which already
 * revalidates the draft against the rules — this route's job is only to
 * parse the wire body and decide who the actor is. Milestone 1 has no auth
 * (D-52), so the actor is always the constant local player; a client
 * cannot supply it, the same reasoning section 2 gives for never accepting
 * `causedBy` from a client.
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
      if (id === undefined) {
        return undefined;
      }

      // Existence follows the same rule the read routes use: a campaign
      // that exists has at least one event, because creating one and
      // writing its first event happen in the same command.
      const existing = await readEvents(sql, id);
      if (existing.length === 0) {
        reply.code(404);
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
