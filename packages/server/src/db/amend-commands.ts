import { MOMENTUM_MIN, momentumMax } from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CampaignState,
  CommandId,
  EventId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';

import { appendCommand, readEvents, type AppendResult, type NewEvent } from './event-store.js';

/**
 * Amendments: the two ways to change something that already happened
 * without removing it (A15, A16).
 *
 * Void is "this shouldn't have happened"; amendment is "this happened, and
 * it was wrong". Nothing here removes an event — a manual override is a new
 * event that sets a value, and a narration correction is a new passage that
 * supersedes the old one in the rendered log while both are retained
 * (D-73).
 *
 * The store itself cannot check any of this: it writes whatever validates
 * against a schema. Whether a character exists, whether a value is in
 * range, and whether the passage being corrected is a passage at all are
 * questions about *state*, so they are asked here, against a projection.
 */

export type AmendRefusalReason =
  'not_player' | 'unknown_target' | 'out_of_range' | 'not_narration' | 'target_voided';

export class AmendRefusedError extends Error {
  constructor(
    readonly reason: AmendRefusalReason,
    detail: string,
  ) {
    super(detail);
    this.name = 'AmendRefusedError';
  }
}

export type OverrideTarget =
  | { readonly kind: 'momentum'; readonly characterId: string }
  | {
      readonly kind: 'meter';
      readonly characterId: string;
      readonly meter: 'health' | 'spirit' | 'supply';
    }
  | { readonly kind: 'track'; readonly trackId: string };

export interface OverrideRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly target: OverrideTarget;
  readonly to: number;
  readonly reason?: string;
}

/**
 * A16 / Beat 9: the player editing state directly.
 *
 * `from` is read from the current projection rather than taken from the
 * caller. It is a display value — "+3 → +4" — and the server is the one
 * that knows what the value actually is; asking the client would let a
 * stale screen write a misleading record.
 */
export async function overrideState(sql: Sql, request: OverrideRequest): Promise<AppendResult> {
  if (request.actor.kind !== 'player') {
    // Manual override is player authority (design record section 3). An
    // automated change is a `state.changed`, and that difference is what
    // A16 renders differently.
    throw new AmendRefusedError('not_player', 'Only a player can override state manually.');
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const { from, min, max, label } = resolveOverride(state, request.target);

  if (request.to < min || request.to > max) {
    throw new AmendRefusedError(
      'out_of_range',
      `${label} must be between ${min} and ${max}; got ${request.to}.`,
    );
  }

  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'state.override',
    actor: request.actor,
    events: [
      {
        type: 'state.overridden',
        payload: {
          target: request.target as never,
          from,
          to: request.to,
          ...(request.reason !== undefined ? { reason: request.reason } : {}),
        },
        sessionId: state.session?.id ?? null,
        ...(request.target.kind !== 'track'
          ? { subjectCharacterId: request.target.characterId as never }
          : {}),
      },
    ],
    response: { from, to: request.to },
  });
}

interface ResolvedOverride {
  readonly from: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
}

function resolveOverride(state: CampaignState, target: OverrideTarget): ResolvedOverride {
  if (target.kind === 'track') {
    const track = state.tracks[target.trackId as never];
    if (track === undefined) {
      throw new AmendRefusedError('unknown_target', `No track ${target.trackId}.`);
    }
    return { from: track.ticks, min: 0, max: track.maxTicks, label: `"${track.title}"` };
  }

  const character = state.characters[target.characterId as never];
  if (character === undefined) {
    throw new AmendRefusedError('unknown_target', `No character ${target.characterId}.`);
  }

  if (target.kind === 'momentum') {
    // The floor is fixed at -6; only the ceiling moves with impacts
    // (D-74, D-78, D-79).
    return {
      from: character.momentum.value,
      min: MOMENTUM_MIN,
      max: momentumMax(character.markedImpacts),
      label: `${character.name}'s momentum`,
    };
  }

  const meter = character.meters[target.meter];
  return {
    from: meter.value,
    // Against the bounds snapshotted on the character, not the rules data.
    min: meter.min,
    max: meter.max,
    label: `${character.name}'s ${target.meter}`,
  };
}

export interface CorrectionRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  /** The `narration.written` event being corrected. */
  readonly targetEventId: EventId;
  readonly note: string;
}

/**
 * A15 / Beat 9, the player's half: flagging a passage with what is wrong
 * with it.
 *
 * Two events rather than one, because the note is player-authored and the
 * rewrite is AI-authored — the same authority seam as everywhere else.
 * A15's "one action" is a property of the UI: one click writes this and
 * triggers the rewrite.
 */
export async function requestNarrationCorrection(
  sql: Sql,
  request: CorrectionRequest,
): Promise<AppendResult> {
  if (request.actor.kind !== 'player') {
    throw new AmendRefusedError('not_player', 'Only a player can flag a passage.');
  }

  const events = await readEvents(sql, request.campaignId);
  const target = requireLivePassage(events, request.targetEventId);

  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'narration.correct',
    actor: request.actor,
    events: [
      {
        type: 'narration.correction_requested',
        payload: { targetEventId: request.targetEventId, note: request.note },
        sessionId: target.sessionId,
      },
    ],
  });
}

export interface RevisionRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly targetEventId: EventId;
  readonly text: string;
  /**
   * The correction request that prompted this. Passing it means voiding the
   * request cascades to the rewrite, which is what should happen: a rewrite
   * nobody asked for should not outlive the asking.
   */
  readonly causedBy?: EventId;
  /**
   * The AI calls that produced this rewrite (D-75, D-113), and any rewrite
   * withdrawn on the way (D-128), written in the same command so the tokens,
   * the withdrawals and the text they bought land together.
   */
  readonly accounting?: readonly NewEvent<'ai.completed' | 'ai.failed' | 'narration.withdrawn'>[];
}

/** A15 / D-73, the AI's half: the rewrite that supersedes the passage in the log. */
export async function reviseNarration(sql: Sql, request: RevisionRequest): Promise<AppendResult> {
  const events = await readEvents(sql, request.campaignId);
  const target = requireLivePassage(events, request.targetEventId);

  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'narration.revise',
    actor: request.actor,
    causedBy: request.causedBy ?? null,
    events: [
      ...(request.accounting ?? []).map((event) => ({ ...event, sessionId: target.sessionId })),
      {
        type: 'narration.revised',
        payload: { targetEventId: request.targetEventId, text: request.text },
        sessionId: target.sessionId,
      },
    ],
  });
}

/**
 * The target must be a passage, and must still stand. Correcting a voided
 * passage would produce a revision of something the log already shows as
 * struck through.
 */
function requireLivePassage(
  events: readonly AstrolabeEvent[],
  targetEventId: EventId,
): AstrolabeEvent {
  const target = events.find((event) => event.id === targetEventId);
  if (target === undefined || target.type !== 'narration.written') {
    throw new AmendRefusedError(
      'not_narration',
      `Event ${targetEventId} is not a narration passage.`,
    );
  }
  if (isSuppressed(target, computeVoidState(events))) {
    throw new AmendRefusedError('target_voided', 'That passage has been voided.');
  }
  return target;
}
