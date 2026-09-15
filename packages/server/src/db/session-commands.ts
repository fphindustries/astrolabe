import type {
  Actor,
  AstrolabeEvent,
  BeginSessionResponse,
  CampaignId,
  CommandId,
  EntityId,
  EventId,
  SceneId,
  SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import {
  buildRecapRequest,
  describeRecap,
  previousSession,
  renderFacts,
  segmentContext,
  type CheckContext,
  type SegmentContext,
} from '../ai/context/index.js';
import type { AiProvider, AiRequest } from '../ai/provider.js';
import type { TextSink } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { project } from '../projection/project.js';

import { appendCommand, readEvents, readEventsByCommand } from './event-store.js';
import {
  AiRequestRefusedError,
  checkContextOf,
  commitSegmentedPassage,
  envelopeOf,
  interrupted,
  requireOpenSession,
  resultFrom,
  settingsOf,
  type AiCommandResult,
  type Envelope,
  type Prepared,
} from './narration-commands.js';
import { uuidv7 } from './uuid.js';

/**
 * The session lifecycle (group 9, D-146): commands, not moves. Begin a
 * Session and End a Session have no outcome automation, and what Beats 1
 * and 10 test — the recap and the summary — isn't a rules effect.
 */

export const SESSION_BEGIN_COMMAND_KIND = 'session.begin';
export const RECAP_COMMAND_KIND = 'narration.recap';

export class SessionRejectedError extends Error {
  constructor(
    readonly reason: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'SessionRejectedError';
  }
}

// ---------------------------------------------------------------------------
// Begin a Session (9.1)
// ---------------------------------------------------------------------------

export interface BeginSessionRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  /** Only for a campaign's first session, which has no scene to carry forward. */
  readonly scene?: { readonly title: string; readonly locationId?: EntityId };
  /** Fixtures derive stable ids (D-122); the app mints them. */
  readonly ids?: { readonly sessionId: SessionId; readonly sceneId: SceneId };
}

/**
 * D-146: one command writes `session.began` and `scene.started`, and commits
 * at once. The recap is a separate request that follows it (D-147), so
 * nothing here waits on the AI.
 *
 * The scene carries forward: the new session opens a new, unframed scene
 * with the title and location of the last scene, so D-141's frame applies
 * to it. Only a campaign's first session names its scene.
 */
export async function beginSession(
  sql: Sql,
  request: BeginSessionRequest,
): Promise<BeginSessionResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return responseFrom(already);
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  if (state.campaign === null) {
    throw new SessionRejectedError('no_campaign', 'That campaign has not been created.');
  }
  if (state.session !== null && state.session.endedAt === undefined) {
    throw new SessionRejectedError(
      'session_open',
      `Session ${state.session.number} is still open. End it before beginning another.`,
    );
  }

  const first = state.session === null;
  let scene: { readonly title: string; readonly locationId?: EntityId };
  if (first) {
    if (request.scene === undefined) {
      throw new SessionRejectedError(
        'scene_required',
        'The first session has no scene to carry forward: give it a title.',
      );
    }
    const locationId = request.scene.locationId;
    if (locationId !== undefined && state.entities[locationId]?.kind !== 'location') {
      throw new SessionRejectedError('unknown_location', `"${locationId}" is not a location.`);
    }
    scene = {
      title: request.scene.title.trim(),
      ...(locationId !== undefined ? { locationId } : {}),
    };
  } else {
    if (request.scene !== undefined) {
      throw new SessionRejectedError(
        'scene_carried',
        'A later session carries its scene forward from the last one.',
      );
    }
    if (state.scene === null) {
      throw new SessionRejectedError(
        'no_scene',
        'The last session left no scene to carry forward.',
      );
    }
    scene = {
      title: state.scene.title,
      ...(state.scene.locationId !== undefined ? { locationId: state.scene.locationId } : {}),
    };
  }

  const sessionId = request.ids?.sessionId ?? (uuidv7() as SessionId);
  const sceneId = request.ids?.sceneId ?? (uuidv7() as SceneId);
  const number = (state.session?.number ?? 0) + 1;
  const response: BeginSessionResponse = { sessionId, sceneId, number, recap: !first };

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: SESSION_BEGIN_COMMAND_KIND,
    actor: request.actor,
    events: [
      { type: 'session.began', payload: { sessionId, number }, sessionId },
      { type: 'scene.started', payload: { sceneId, ...scene }, sessionId, sceneId },
    ],
    response: { ...response },
  });
  return result.replayed ? (result.response as BeginSessionResponse) : response;
}

function responseFrom(events: readonly AstrolabeEvent[]): BeginSessionResponse {
  const began = events.find((e) => e.type === 'session.began');
  const scene = events.find((e) => e.type === 'scene.started');
  if (began?.type !== 'session.began' || scene?.type !== 'scene.started') {
    throw new SessionRejectedError('not_a_session', 'That command did not begin a session.');
  }
  return {
    sessionId: began.payload.sessionId,
    sceneId: scene.payload.sceneId,
    number: began.payload.number,
    recap: began.payload.number > 1,
  };
}

// ---------------------------------------------------------------------------
// The recap (9.1, D-147)
// ---------------------------------------------------------------------------

export interface RecapRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
}

export interface PreparedRecap {
  readonly request: RecapRequest;
  readonly aiRequest: AiRequest;
  readonly segments: SegmentContext;
  readonly check: CheckContext;
  readonly causedBy: EventId;
  readonly envelope: Envelope;
}

export async function prepareRecap(
  sql: Sql,
  request: RecapRequest,
): Promise<Prepared<PreparedRecap>> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return { kind: 'replay', result: resultFrom(already, 'narration.written') ?? interrupted() };
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const settings = settingsOf(state);
  requireOpenSession(state);
  const sessionId = state.session!.id;

  const began = events.find((e) => e.type === 'session.began' && e.payload.sessionId === sessionId);
  if (began === undefined) {
    throw new AiRequestRefusedError('no_session', 'Begin a session first.');
  }
  if (
    events.some(
      (e) =>
        e.type === 'narration.written' && e.payload.role === 'recap' && e.sessionId === sessionId,
    )
  ) {
    throw new AiRequestRefusedError('already_recapped', 'This session has already been recapped.');
  }
  const previous = previousSession(events, sessionId);
  if (previous === undefined) {
    throw new AiRequestRefusedError('no_recap', 'There is no earlier session to recap.');
  }

  const facts = describeRecap(events, state, previous.sessionId);
  const segments = segmentContext(facts, state, settings.narrationLatitude);
  return {
    kind: 'run',
    request,
    aiRequest: buildRecapRequest(state, facts, settings),
    segments,
    check: checkContextOf(state, settings.narrationLatitude, renderFacts(segments)),
    causedBy: began.id,
    envelope: envelopeOf(request.campaignId, state),
  };
}

export async function runRecap(
  sql: Sql,
  ai: AiProvider,
  checker: AiProvider,
  prepared: PreparedRecap,
  sink: TextSink,
  status?: AiStatus,
): Promise<AiCommandResult> {
  return commitSegmentedPassage(
    sql,
    ai,
    checker,
    { ...prepared, kind: RECAP_COMMAND_KIND, role: 'recap' },
    sink,
    status,
  );
}
