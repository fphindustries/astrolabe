import {
  CampaignIdSchema,
  CharacterIdSchema,
  EntityIdSchema,
  EventIdSchema,
} from '@astrolabe/shared';
import type { FastifyReply } from 'fastify';
import type { Sql } from 'postgres';

import { readEvents } from '../db/index.js';

/** Route-param helpers shared by `app.ts` and `ai-routes.ts`. */

/** Validates a route param and sets a 400 reply if it isn't a campaign ID, returning `undefined` either way to signal the caller to stop. */
export function parseCampaignId(raw: string, reply: FastifyReply) {
  const parsed = CampaignIdSchema.safeParse(raw);
  if (!parsed.success) {
    reply.code(400);
    return undefined;
  }
  return parsed.data;
}

/** Same shape as `parseCampaignId`, for an `:entityId` (8.5). */
export function parseEntityId(raw: string, reply: FastifyReply) {
  const parsed = EntityIdSchema.safeParse(raw);
  if (!parsed.success) {
    reply.code(400);
    return undefined;
  }
  return parsed.data;
}

/** Same shape as `parseCampaignId`, for the `:eventId` void routes. */
export function parseEventId(raw: string, reply: FastifyReply) {
  const parsed = EventIdSchema.safeParse(raw);
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
export async function requireCampaignExists(
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

/** Same shape as `parseCampaignId`, for the `:characterId` crew routes (6.0d). */
export function parseCharacterId(raw: string, reply: FastifyReply) {
  const parsed = CharacterIdSchema.safeParse(raw);
  if (!parsed.success) {
    reply.code(400);
    return undefined;
  }
  return parsed.data;
}
