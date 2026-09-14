import { MOVE_AUTOMATION_SPECS, type CharacterId, type MoveId } from '@astrolabe/rules';
import type {
  Actor,
  AiErrorKind,
  AstrolabeEvent,
  CampaignId,
  CampaignState,
  CommandId,
  EventId,
  SceneId,
  SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import {
  buildBeatRequest,
  buildHarmProposalRequest,
  buildRevisionRequest,
  describeBeat,
  harmProposalSchema,
  resolveBeatScope,
} from '../ai/context/index.js';
import type { AiProvider, AiRequest } from '../ai/provider.js';
import {
  accountingEvents,
  generateValidated,
  streamValidatedText,
  type Outcome,
  type TextSink,
} from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { livePassages } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';

import { requestNarrationCorrection, reviseNarration } from './amend-commands.js';
import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import { uuidv7 } from './uuid.js';

/**
 * The commands that call the AI (group 7): beat narration (7.8), the
 * narration rewrite (7.9), and the proposed suffer amount (D-118).
 *
 * Each one is split in two where it streams. `prepare*` does everything a
 * refusal can come from — reading the log, resolving what is being asked
 * for, writing the player's own half — so the route can answer 422 before a
 * stream opens (D-111). `run*` calls the provider and commits the result,
 * however the call went.
 *
 * Nothing mechanical waits on any of this: every move these narrate is
 * already committed, and a failure writes `ai.failed` and nothing else
 * (D-116). Every attempt's tokens are written, success or not (D-113).
 */

const AI: Actor = { kind: 'ai' };

export class AiRequestRefusedError extends Error {
  constructor(
    readonly reason: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'AiRequestRefusedError';
  }
}

export type AiCommandResult =
  | { readonly ok: true; readonly eventId: EventId }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

/** Either a stored answer to replay, or a call still to make. */
export type Prepared<T> =
  { readonly kind: 'replay'; readonly result: AiCommandResult } | ({ readonly kind: 'run' } & T);

export interface Envelope {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId | null;
  readonly sceneId: SceneId | null;
}

export function envelopeOf(campaignId: CampaignId, state: CampaignState): Envelope {
  return {
    campaignId,
    sessionId: state.session?.id ?? null,
    sceneId: state.scene?.id ?? null,
  };
}

function settingsOf(state: CampaignState) {
  if (state.campaign === null) {
    throw new AiRequestRefusedError('no_campaign', 'That campaign has not been created.');
  }
  return state.campaign.settings;
}

export function withEnvelope<T extends NewEvent>(event: T, envelope: Envelope): T {
  return {
    ...event,
    actor: AI,
    sessionId: envelope.sessionId,
    sceneId: envelope.sceneId,
  };
}

export function accounting(
  ai: AiProvider,
  purpose: string,
  outcome: Outcome<unknown>,
  envelope: Envelope,
) {
  return accountingEvents(ai, purpose, outcome).map((event) =>
    withEnvelope(
      { type: event.type, payload: event.payload } as NewEvent<'ai.completed' | 'ai.failed'>,
      envelope,
    ),
  );
}

export function recordStatus(status: AiStatus | undefined, outcome: Outcome<unknown>): void {
  if (outcome.ok) {
    status?.recordSuccess();
  } else {
    status?.recordFailure(outcome.errorKind, outcome.message);
  }
}

/** What an AI command already wrote, read back as its result. */
function resultFrom(
  events: readonly AstrolabeEvent[],
  contentType: AstrolabeEvent['type'],
): AiCommandResult | undefined {
  const content = events.find((event) => event.type === contentType);
  if (content !== undefined) {
    return { ok: true, eventId: content.id };
  }
  const failed = events.find((event) => event.type === 'ai.failed');
  if (failed?.type === 'ai.failed') {
    return { ok: false, errorKind: failed.payload.errorKind, message: failed.payload.message };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Beat narration (task 7.8, D-110)
// ---------------------------------------------------------------------------

export interface NarrateBeatRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  /** Who asked. The passage itself is authored by the AI. */
  readonly actor: Actor;
  /** The move-flow step just finished; its whole chain is narrated. */
  readonly afterCommandId: CommandId;
}

export interface PreparedBeat {
  readonly request: NarrateBeatRequest;
  readonly aiRequest: AiRequest;
  readonly causedBy: EventId;
  readonly envelope: Envelope;
}

export async function prepareBeatNarration(
  sql: Sql,
  request: NarrateBeatRequest,
): Promise<Prepared<PreparedBeat>> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return { kind: 'replay', result: resultFrom(already, 'narration.written') ?? interrupted() };
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const settings = settingsOf(state);

  const scope = resolveBeatScope(events, request.afterCommandId);
  if (!scope.ok) {
    throw new AiRequestRefusedError(scope.reason, scope.detail);
  }

  return {
    kind: 'run',
    request,
    aiRequest: buildBeatRequest(state, events, describeBeat(scope.events, state), settings),
    causedBy: scope.causedBy,
    envelope: envelopeOf(request.campaignId, state),
  };
}

export async function runBeatNarration(
  sql: Sql,
  ai: AiProvider,
  prepared: PreparedBeat,
  sink: TextSink,
  status?: AiStatus,
): Promise<AiCommandResult> {
  const outcome = await streamValidatedText(ai, prepared.aiRequest, sink);
  recordStatus(status, outcome);

  const result = await appendCommand(sql, {
    campaignId: prepared.request.campaignId,
    commandId: prepared.request.commandId,
    kind: 'narration.beat',
    actor: prepared.request.actor,
    causedBy: prepared.causedBy,
    events: [
      ...accounting(ai, prepared.aiRequest.purpose, outcome, prepared.envelope),
      ...(outcome.ok
        ? [
            withEnvelope(
              {
                type: 'narration.written',
                payload: { role: 'beat', text: outcome.value, groundedIn: [] },
              } as NewEvent<'narration.written'>,
              prepared.envelope,
            ),
          ]
        : []),
    ],
  });

  return resultFrom(result.events, 'narration.written') ?? interrupted();
}

// ---------------------------------------------------------------------------
// Narration correction (task 7.9, A15, D-73)
// ---------------------------------------------------------------------------

export interface CorrectNarrationRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly targetEventId: EventId;
  readonly note: string;
}

export interface PreparedCorrection {
  readonly request: CorrectNarrationRequest;
  readonly aiRequest: AiRequest;
  /** The player's `narration.correction_requested`, which the rewrite is caused by. */
  readonly requestEventId: EventId;
}

/**
 * Writes the player's half — the flag and the note — before any AI call,
 * so the correction request stands even if the rewrite never arrives.
 * Refuses a target that is not a live passage (`AmendRefusedError`).
 */
export async function prepareCorrection(
  sql: Sql,
  request: CorrectNarrationRequest,
): Promise<Prepared<PreparedCorrection>> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  let requestEventId: EventId;

  if (already.length > 0) {
    const flagged = already.find((event) => event.type === 'narration.correction_requested');
    if (flagged === undefined) {
      throw new AiRequestRefusedError(
        'command_reused',
        'That command id was used for something else.',
      );
    }
    requestEventId = flagged.id;
    const events = await readEvents(sql, request.campaignId);
    const followUp = events.filter((event) => event.causedBy === requestEventId);
    const stored = resultFrom(followUp, 'narration.revised');
    if (stored !== undefined) {
      return { kind: 'replay', result: stored };
    }
  } else {
    const written = await requestNarrationCorrection(sql, request);
    const flagged = written.events[0];
    if (flagged === undefined) {
      throw new Error('A correction request wrote no event.');
    }
    requestEventId = flagged.id;
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const passage = livePassages(events).find((p) => p.eventId === request.targetEventId);
  const target = events.find((event) => event.id === request.targetEventId);
  if (passage === undefined || target === undefined) {
    throw new AiRequestRefusedError('not_narration', 'That passage is no longer in the log.');
  }

  const parent =
    target.causedBy === null ? undefined : events.find((e) => e.id === target.causedBy);
  const scope =
    parent === undefined
      ? undefined
      : resolveBeatScope(events, parent.commandId, { allowNarrated: true });
  const facts = scope?.ok === true ? describeBeat(scope.events, state) : undefined;

  return {
    kind: 'run',
    request,
    requestEventId,
    aiRequest: buildRevisionRequest(
      state,
      { text: passage.text, note: request.note },
      facts,
      settingsOf(state),
    ),
  };
}

export async function runCorrection(
  sql: Sql,
  ai: AiProvider,
  prepared: PreparedCorrection,
  sink: TextSink,
  status?: AiStatus,
): Promise<AiCommandResult> {
  const outcome = await streamValidatedText(ai, prepared.aiRequest, sink);
  recordStatus(status, outcome);

  const events = await readEvents(sql, prepared.request.campaignId);
  const envelope = envelopeOf(prepared.request.campaignId, project(events));
  const spent = accounting(ai, prepared.aiRequest.purpose, outcome, envelope);
  // Server-minted: this is the Guide's follow-up to the player's command,
  // not a request any client made.
  const commandId = uuidv7() as CommandId;

  if (outcome.ok) {
    const revised = await reviseNarration(sql, {
      campaignId: prepared.request.campaignId,
      commandId,
      actor: AI,
      targetEventId: prepared.request.targetEventId,
      text: outcome.value,
      causedBy: prepared.requestEventId,
      accounting: spent,
    });
    return resultFrom(revised.events, 'narration.revised') ?? interrupted();
  }

  await appendCommand(sql, {
    campaignId: prepared.request.campaignId,
    commandId,
    kind: 'narration.revise',
    actor: AI,
    causedBy: prepared.requestEventId,
    events: spent,
  });
  return { ok: false, errorKind: outcome.errorKind, message: outcome.message };
}

// ---------------------------------------------------------------------------
// Proposed suffer amount (D-118, A13, Beat 7)
// ---------------------------------------------------------------------------

export interface ProposeAmountRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly moveId: MoveId;
  readonly actorCharacterId: CharacterId;
  readonly chainedFromCommandId?: CommandId;
}

export type ProposedAmountResult =
  | {
      readonly ok: true;
      readonly eventId: EventId;
      readonly amount: number;
      readonly reason: string;
    }
  | { readonly ok: false; readonly errorKind: AiErrorKind; readonly message: string };

export async function proposeAmount(
  sql: Sql,
  ai: AiProvider,
  request: ProposeAmountRequest,
  status?: AiStatus,
): Promise<ProposedAmountResult> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return proposalResultFrom(already);
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const settings = settingsOf(state);

  const intake = MOVE_AUTOMATION_SPECS.get(request.moveId)?.preRoll?.effects.find(
    (traced) => traced.effect.kind === 'proposed_amount',
  )?.effect;
  if (intake?.kind !== 'proposed_amount') {
    throw new AiRequestRefusedError(
      'no_proposed_amount',
      'That move has no amount for the Guide to propose.',
    );
  }

  const character = state.characters[request.actorCharacterId];
  if (character === undefined) {
    throw new AiRequestRefusedError(
      'unknown_character',
      `No character ${request.actorCharacterId}.`,
    );
  }

  let causedBy: EventId | null = null;
  let lines: readonly string[] = [];
  if (request.chainedFromCommandId !== undefined) {
    const scope = resolveBeatScope(events, request.chainedFromCommandId, { allowNarrated: true });
    if (!scope.ok) {
      throw new AiRequestRefusedError(scope.reason, scope.detail);
    }
    causedBy = scope.causedBy;
    lines = describeBeat(scope.events, state).lines;
  }

  const facts = { lines, miss: false, match: false, burned: false, chainedToSuffer: false };
  const aiRequest = buildHarmProposalRequest(
    state,
    facts,
    { callsign: character.callsign, meter: intake.meter, range: intake.range },
    settings,
  );
  const outcome = await generateValidated(ai, aiRequest, harmProposalSchema(intake.range));
  recordStatus(status, outcome);

  const envelope = envelopeOf(request.campaignId, state);
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'amount.propose',
    actor: request.actor,
    causedBy,
    events: [
      ...accounting(ai, aiRequest.purpose, outcome, envelope),
      ...(outcome.ok
        ? [
            {
              ...withEnvelope(
                {
                  type: 'amount.proposed',
                  payload: {
                    moveId: request.moveId,
                    characterId: request.actorCharacterId,
                    meter: intake.meter,
                    amount: outcome.value.amount,
                    reason: outcome.value.reason,
                  },
                } as NewEvent<'amount.proposed'>,
                envelope,
              ),
              subjectCharacterId: request.actorCharacterId,
            },
          ]
        : []),
    ],
  });

  return proposalResultFrom(result.events);
}

function proposalResultFrom(events: readonly AstrolabeEvent[]): ProposedAmountResult {
  const proposed = events.find((event) => event.type === 'amount.proposed');
  if (proposed?.type === 'amount.proposed') {
    return {
      ok: true,
      eventId: proposed.id,
      amount: proposed.payload.amount,
      reason: proposed.payload.reason,
    };
  }
  const stored = resultFrom(events, 'amount.proposed');
  return stored !== undefined && !stored.ok ? stored : interrupted();
}

/** A command that exists but recorded neither content nor failure — a crash mid-write cannot produce this, so it is a bug. */
function interrupted(): { ok: false; errorKind: AiErrorKind; message: string } {
  return {
    ok: false,
    errorKind: 'unavailable',
    message: 'The Guide’s answer was not recorded. Try again.',
  };
}
