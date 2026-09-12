import {
  CampaignIdSchema,
  type CampaignListResponse,
  type CampaignStateResponse,
  type NarrativeLogResponse,
} from '@astrolabe/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import * as z from 'zod';

import { buildNarrativeLog } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import { listCampaigns, readEvents, readNarrativeEvents } from '../db/index.js';

/**
 * The HTTP read API (task 5.0, D-94).
 *
 * Read-only for now: list campaigns, one campaign's projected state, and a
 * page of its narrative log. Every route reads through the same functions
 * the harness and the tests already use (`project`, `buildNarrativeLog`) —
 * this layer adds routing and request validation, nothing else.
 *
 * Command endpoints are not part of 5.0. Each lands with the first task
 * that writes through it: 3.2 for character creation, 6.x for move
 * resolution. Params are validated by hand with zod rather than a fastify
 * schema plugin, since `shared` already depends on zod and this is three
 * small routes, not a schema-driven API surface.
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
