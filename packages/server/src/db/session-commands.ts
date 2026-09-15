import type {
  Actor,
  AstrolabeEvent,
  BeginSessionResponse,
  EndSessionResponse,
  ProposeSessionSummaryResponse,
  CampaignId,
  CommandId,
  EntityId,
  EventId,
  SceneId,
  SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import {
  buildSessionSummaryRequest,
  checkSessionSummary,
  sessionSummarySchema,
  buildRecapRequest,
  describeRecap,
  previousSession,
  renderFacts,
  segmentContext,
  type CheckContext,
  type SegmentContext,
} from '../ai/context/index.js';
import { generateChecked } from '../ai/checked.js';
import type { AiProvider, AiRequest } from '../ai/provider.js';
import type { TextSink } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';

import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import {
  AiRequestRefusedError,
  checkContextOf,
  checkedAccounting,
  recordEnding,
  withEnvelope,
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

// ---------------------------------------------------------------------------
// End a Session (9.4, D-149)
// ---------------------------------------------------------------------------

export const SUMMARY_PROPOSAL_COMMAND_KIND = 'session.propose_summary';
export const SESSION_END_COMMAND_KIND = 'session.end';

export interface ProposeSessionSummaryRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
}

/**
 * D-149's first step: the Guide proposes a summary and open threads from
 * the ending session's significant events. The summary goes through D-128's
 * checker, because the next recap reads it as canon; the threads get
 * D-140's name check. One command writes the accounting, any withdrawals,
 * and `session.summary_proposed` or `ai.failed`. The session stays open
 * either way: ending it waits on this, and nothing else does.
 */
export async function proposeSessionSummary(
  sql: Sql,
  ai: AiProvider,
  checker: AiProvider,
  request: ProposeSessionSummaryRequest,
  status?: AiStatus,
): Promise<ProposeSessionSummaryResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return summaryResultFrom(already);
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const settings = settingsOf(state);
  requireOpenSession(state);

  const facts = describeRecap(events, state, state.session!.id);
  const characters = segmentContext(facts, state, settings.narrationLatitude).characters;
  const aiRequest = buildSessionSummaryRequest(state, facts, settings);
  const checked = await generateChecked(
    ai,
    aiRequest,
    sessionSummarySchema(),
    (proposal) => proposal.summary,
    {
      provider: checker,
      context: checkContextOf(state, settings.narrationLatitude, facts.lines.join('\n')),
    },
    { role: 'summary', check: (value) => checkSessionSummary(value, characters) },
  );
  recordEnding(status, checked);
  const outcome = checked.ending;

  const envelope = envelopeOf(request.campaignId, state);
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: SUMMARY_PROPOSAL_COMMAND_KIND,
    actor: request.actor,
    events: [
      ...checkedAccounting(
        ai,
        aiRequest.purpose,
        checker,
        checked,
        { role: 'summary', latitude: settings.narrationLatitude },
        envelope,
      ),
      ...(outcome.ok
        ? [
            withEnvelope(
              {
                type: 'session.summary_proposed',
                payload: {
                  summary: outcome.value.summary.trim(),
                  openThreads: outcome.value.openThreads
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0),
                },
              } as NewEvent<'session.summary_proposed'>,
              envelope,
            ),
          ]
        : []),
    ],
  });
  return summaryResultFrom(result.events);
}

function summaryResultFrom(events: readonly AstrolabeEvent[]): ProposeSessionSummaryResponse {
  const proposed = events.find((e) => e.type === 'session.summary_proposed');
  if (proposed?.type === 'session.summary_proposed') {
    return { ok: true, eventId: proposed.id, ...proposed.payload };
  }
  const result = resultFrom(events, 'session.summary_proposed') ?? interrupted();
  return result.ok ? interrupted() : result;
}

export interface EndSessionRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly proposalEventId: EventId;
  readonly summary: string;
  readonly openThreads: readonly string[];
}

/**
 * D-149's commit: `session.ended`, naming the proposal. Authored by the AI
 * when the player kept the Guide's words exactly, and by the player when
 * they edited the summary or the threads.
 */
export async function endSession(
  sql: Sql,
  request: EndSessionRequest,
): Promise<EndSessionResponse> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  const stored = already.find((e) => e.type === 'session.ended');
  if (stored?.type === 'session.ended') {
    return { eventId: stored.id, edited: stored.actor.kind !== 'ai' };
  }

  const summary = request.summary.trim();
  const openThreads = request.openThreads.map((t) => t.trim()).filter((t) => t.length > 0);
  if (summary.length === 0) {
    throw new SessionRejectedError('no_summary', 'Write the summary first.');
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  if (state.session === null || state.session.endedAt !== undefined) {
    throw new SessionRejectedError('no_session', 'There is no open session to end.');
  }
  const voids = computeVoidState(events);
  const proposal = events.find((e) => e.id === request.proposalEventId);
  if (
    proposal?.type !== 'session.summary_proposed' ||
    proposal.sessionId !== state.session.id ||
    isSuppressed(proposal, voids)
  ) {
    throw new SessionRejectedError(
      'unknown_proposal',
      'That is not the Guide’s live proposal for this session.',
    );
  }

  const edited =
    summary !== proposal.payload.summary ||
    openThreads.length !== proposal.payload.openThreads.length ||
    openThreads.some((t, i) => t !== proposal.payload.openThreads[i]);
  const envelope = envelopeOf(request.campaignId, state);
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: SESSION_END_COMMAND_KIND,
    actor: request.actor,
    causedBy: proposal.id,
    events: [
      {
        type: 'session.ended',
        payload: { summary, openThreads, proposalEventId: proposal.id },
        sessionId: envelope.sessionId,
        sceneId: envelope.sceneId,
        ...(edited ? {} : { actor: { kind: 'ai' } as const }),
      },
    ],
  });
  const ended = result.events.find((e) => e.type === 'session.ended')!;
  return { eventId: ended.id, edited: ended.actor.kind !== 'ai' };
}
