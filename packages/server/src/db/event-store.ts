import type { CharacterId } from '@astrolabe/rules';
import {
  NARRATIVE_EVENT_TYPES,
  currentVersion,
  decodeStoredEvent,
  parseEvent,
  type Actor,
  type AstrolabeEvent,
  type CampaignId,
  type CommandId,
  type EventId,
  type EventType,
  type PayloadFor,
  type SceneId,
  type SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { toTimestamp } from './client.js';
import { uuidv7 } from './uuid.js';

/**
 * The append-only event writer (task 2.3), and the read path the projector
 * is fed from.
 *
 * Three things happen in one transaction, and they are one transaction for
 * a reason: the per-campaign sequence is bumped, the events are inserted,
 * and the command that wrote them is recorded. A failure at any point
 * leaves the log exactly as it was, sequence included.
 */

/** One event to write. The envelope's assigned fields are the store's job, not the caller's. */
export interface NewEvent<T extends EventType = EventType> {
  /**
   * Minted by the command, only when another event in the same command must
   * cite this one — a proposal citing the rolls that ground it (D-124).
   * Still server-minted; never taken from a client. Defaults to a fresh v7.
   */
  readonly id?: EventId;
  readonly type: T;
  readonly payload: PayloadFor<T>;
  /** Defaults to the command's actor — most events are authored by whoever issued the command. */
  readonly actor?: Actor;
  readonly sessionId?: SessionId | null;
  readonly sceneId?: SceneId | null;
  readonly subjectCharacterId?: CharacterId | null;
}

export interface AppendRequest {
  readonly campaignId: CampaignId;
  /**
   * The client's request id, and the idempotency key. A retry with the same
   * id writes nothing and returns the stored response.
   */
  readonly commandId: CommandId;
  readonly kind: string;
  readonly actor: Actor;
  readonly events: readonly NewEvent[];
  /**
   * The event that caused this command, if any.
   *
   * **Set by the server's command handler, never accepted from a client.**
   * A client able to supply it could forge causality and steer what a void
   * cascades over. It is per-command rather than per-event because the
   * command is already the minimum unit a void operates on — events within
   * one share a `commandId`, and the cascade follows `causedBy` only when
   * crossing from one command to another.
   */
  readonly causedBy?: EventId | null;
  /** What a replay of this command should return. */
  readonly response?: JsonValue;
  /** Present only on a campaign's first command, which creates its bookkeeping row. */
  readonly createCampaign?: { readonly name: string };
}

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface AppendResult {
  readonly events: readonly AstrolabeEvent[];
  /** True when this command had already been applied and nothing was written. */
  readonly replayed: boolean;
  readonly response: unknown;
}

const UNIQUE_VIOLATION = '23505';

interface PostgresError {
  readonly code?: string;
  readonly constraint_name?: string;
}

function isCommandReplay(error: unknown): boolean {
  const pg = error as PostgresError;
  return pg?.code === UNIQUE_VIOLATION && pg?.constraint_name === 'commands_pkey';
}

/**
 * Append a command's events atomically.
 *
 * Idempotency is enforced by the database rather than by a check-then-write,
 * which would race: the command row goes in last, and a duplicate id fails
 * its primary key and rolls the whole transaction back — sequence bump
 * included, so the sequence stays gapless. The retry then reads the stored
 * response. Two identical requests arriving together therefore produce one
 * write and two identical answers.
 */
export async function appendCommand(sql: Sql, request: AppendRequest): Promise<AppendResult> {
  if (request.events.length === 0) {
    throw new Error('A command must write at least one event.');
  }

  const occurredAt = new Date().toISOString();

  try {
    return await sql.begin(async (tx) => {
      if (request.createCampaign !== undefined) {
        await tx`
          insert into campaigns (id, name)
          values (${request.campaignId}, ${request.createCampaign.name})
        `;
      }

      // Bumping the counter takes a row lock on the campaign, which is what
      // serialises writers per campaign. A Postgres sequence would be
      // wrong here: it gaps on rollback, and the log's seq must be gapless.
      const bumped = await tx<{ next_seq: string }[]>`
        update campaigns
           set next_seq = next_seq + ${request.events.length}
         where id = ${request.campaignId}
        returning next_seq
      `;
      const after = bumped[0];
      if (after === undefined) {
        throw new Error(`Campaign ${request.campaignId} does not exist.`);
      }
      const firstSeq = Number(after.next_seq) - request.events.length;

      const events = request.events.map((event, index) =>
        buildEvent(request, event, firstSeq + index, occurredAt),
      );

      for (const event of events) {
        await tx`
          insert into events (
            campaign_id, seq, id, command_id, caused_by, session_id, scene_id,
            actor, subject_character_id, type, version, visibility, payload, occurred_at
          ) values (
            ${event.campaignId}, ${event.seq}, ${event.id}, ${event.commandId},
            ${event.causedBy}, ${event.sessionId}, ${event.sceneId},
            ${tx.json(event.actor)}, ${event.subjectCharacterId}, ${event.type},
            ${event.version}, ${event.visibility}, ${tx.json(event.payload)}, ${event.occurredAt}
          )
        `;
      }

      // Last, so a duplicate command id rolls everything above back.
      //
      // The coalesce is not decoration. `sql.json(null)` sends an SQL NULL
      // rather than the JSON document `null`, which would trip
      // `commands.response`'s not-null constraint. That constraint is right —
      // every command records what a replay should return, and "nothing" is
      // a JSON null, not an absent row value — so the write is what needed
      // fixing. Pre-stringifying is not the fix: the driver JSON-encodes for
      // a jsonb target, so a stringified value arrives double-encoded.
      await tx`
        insert into commands (campaign_id, id, kind, actor, first_seq, last_seq, response)
        values (
          ${request.campaignId}, ${request.commandId}, ${request.kind}, ${tx.json(request.actor)},
          ${firstSeq}, ${firstSeq + events.length - 1},
          coalesce(${tx.json((request.response ?? null) as never)}, 'null'::jsonb)
        )
      `;

      return { events, replayed: false, response: request.response ?? null };
    });
  } catch (error) {
    if (!isCommandReplay(error)) {
      throw error;
    }
    return replayCommand(sql, request.campaignId, request.commandId);
  }
}

/** Read back what a previously applied command wrote. */
async function replayCommand(
  sql: Sql,
  campaignId: CampaignId,
  commandId: CommandId,
): Promise<AppendResult> {
  const rows = await sql<{ response: unknown }[]>`
    select response from commands where campaign_id = ${campaignId} and id = ${commandId}
  `;
  const command = rows[0];
  if (command === undefined) {
    throw new Error(`Command ${commandId} reported as duplicate but could not be read back.`);
  }
  const events = await readEventsByCommand(sql, campaignId, commandId);
  return { events, replayed: true, response: command.response };
}

function buildEvent(
  request: AppendRequest,
  event: NewEvent,
  seq: number,
  occurredAt: string,
): AstrolabeEvent {
  // Validated on the way in, always: a payload that does not match its
  // schema is a bug that must not reach storage.
  return parseEvent({
    campaignId: request.campaignId,
    seq,
    id: event.id ?? uuidv7(),
    commandId: request.commandId,
    causedBy: request.causedBy ?? null,
    sessionId: event.sessionId ?? null,
    sceneId: event.sceneId ?? null,
    actor: event.actor ?? request.actor,
    subjectCharacterId: event.subjectCharacterId ?? null,
    type: event.type,
    version: currentVersion(event.type),
    visibility: 'table',
    payload: event.payload,
    occurredAt,
  });
}

interface EventRow {
  readonly campaign_id: string;
  readonly seq: string;
  readonly id: string;
  readonly command_id: string;
  readonly caused_by: string | null;
  readonly session_id: string | null;
  readonly scene_id: string | null;
  readonly actor: unknown;
  readonly subject_character_id: string | null;
  readonly type: string;
  readonly version: number;
  readonly visibility: string;
  readonly payload: unknown;
  readonly occurred_at: Date | string;
}

/**
 * Columns are mapped by hand rather than with the driver's camel-case
 * transform. The transform would rewrite keys inside `payload` too, which
 * is opaque jsonb the schemas own — a payload field named `action_text`
 * would silently arrive as `actionText` and fail validation for a reason
 * nobody could see.
 */
function toEvent(row: EventRow): AstrolabeEvent {
  return decodeStoredEvent({
    campaignId: row.campaign_id,
    seq: Number(row.seq),
    id: row.id,
    commandId: row.command_id,
    causedBy: row.caused_by,
    sessionId: row.session_id,
    sceneId: row.scene_id,
    actor: row.actor,
    subjectCharacterId: row.subject_character_id,
    type: row.type,
    version: row.version,
    visibility: row.visibility,
    payload: row.payload,
    occurredAt: toTimestamp(row.occurred_at),
  });
}

const EVENT_COLUMNS = `
  campaign_id, seq, id, command_id, caused_by, session_id, scene_id,
  actor, subject_character_id, type, version, visibility, payload, occurred_at
`;

/**
 * The whole log for a campaign, in sequence order. The projector's only
 * input, and the one full scan in the design — everything else is a range
 * scan or served from the in-memory projection.
 */
export async function readEvents(sql: Sql, campaignId: CampaignId): Promise<AstrolabeEvent[]> {
  const rows = await sql<EventRow[]>`
    select ${sql.unsafe(EVENT_COLUMNS)} from events
     where campaign_id = ${campaignId}
     order by seq
  `;
  return rows.map(toEvent);
}

/** The events one command wrote, in sequence order. */
export async function readEventsByCommand(
  sql: Sql,
  campaignId: CampaignId,
  commandId: CommandId,
): Promise<AstrolabeEvent[]> {
  const rows = await sql<EventRow[]>`
    select ${sql.unsafe(EVENT_COLUMNS)} from events
     where campaign_id = ${campaignId} and command_id = ${commandId}
     order by seq
  `;
  return rows.map(toEvent);
}

/**
 * The campaign's latest session, open or ended: the one the narrative log
 * shows (D-146). Undefined before the first session begins.
 */
export async function latestSessionId(
  sql: Sql,
  campaignId: CampaignId,
): Promise<SessionId | undefined> {
  const rows = await sql<{ session_id: string }[]>`
    select payload->>'sessionId' as session_id from events
     where campaign_id = ${campaignId} and type = 'session.began'
     order by seq desc
     limit 1
  `;
  return rows[0]?.session_id as SessionId | undefined;
}

/**
 * The events the narrative log needs for one session's page.
 *
 * Two queries rather than one, and the split is the design's:
 *
 * - The renderable events, bounded by session and by the cursor, newest
 *   first so the limit takes the *most recent* page, then reversed into
 *   reading order.
 * - Every amendment in the campaign — voids, correction requests and
 *   revisions. These are few, and a voided or corrected event can be paged
 *   far away from the amendment that changed it, so bounding them to the
 *   page would silently drop strike-throughs and corrections.
 *
 * The over-fetch is deliberate: `limit` counts events here, but the log
 * pages by *beat*, and a beat can hold several events. Asking for more than
 * the caller wants means the builder can drop a partial oldest beat rather
 * than showing a roll with no invocation above it.
 */
export async function readNarrativeEvents(
  sql: Sql,
  campaignId: CampaignId,
  options: { sessionId?: SessionId; before?: number; limit?: number } = {},
): Promise<AstrolabeEvent[]> {
  const limit = options.limit ?? 50;
  const rows = await sql<EventRow[]>`
    select ${sql.unsafe(EVENT_COLUMNS)} from events
     where campaign_id = ${campaignId}
       and type = any(${[...NARRATIVE_EVENT_TYPES]})
       and command_id not in (
         select id from commands
          where campaign_id = ${campaignId} and kind = any(${[...PROPOSAL_COMMAND_KINDS]})
       )
       ${options.sessionId === undefined ? sql`` : sql`and session_id = ${options.sessionId}`}
       ${options.before === undefined ? sql`` : sql`and seq < ${options.before}`}
     order by seq desc
     limit ${limit * EVENTS_PER_BEAT_ALLOWANCE}
  `;

  const amendments = await sql<EventRow[]>`
    select ${sql.unsafe(EVENT_COLUMNS)} from events
     where campaign_id = ${campaignId}
       and type = any(${[...AMENDMENT_TYPES]})
     order by seq
  `;

  const bySeq = new Map<number, AstrolabeEvent>();
  for (const row of [...rows, ...amendments]) {
    const event = toEvent(row);
    bySeq.set(event.seq, event);
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * How many events a beat might hold. A move resolution writes an invocation,
 * a roll and its effects; nothing in Milestone 1 writes more than a handful.
 * Over-fetching by this factor keeps the paged builder from trimming a page
 * down to nothing.
 */
const EVENTS_PER_BEAT_ALLOWANCE = 4;

/**
 * D-124: commands that write a proposal the player has not accepted. Their
 * oracle rolls are real and stay in the log, but they are not beats of the
 * story, so the narrative log leaves them out. Accepting writes an ordinary
 * command that the log does show.
 */
export const PROPOSAL_COMMAND_KINDS = ['character.propose', 'campaign.propose_incidents'] as const;

const AMENDMENT_TYPES = [
  'event.voided',
  'narration.revised',
  'narration.correction_requested',
] as const;
