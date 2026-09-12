import {
  EVENT_TYPE_META,
  type AstrolabeEvent,
  type CommandId,
  type EntityRef,
  type EventId,
  type SessionId,
} from '@astrolabe/shared';

import { computeVoidState, isSuppressed } from './void-state.js';

/**
 * Computing what a void removes (D-83), and deciding whether it is allowed
 * (D-83, D-84).
 *
 * This is the write side of void. The projector only ever *reads* a stored
 * cascade — the set is computed here, once, and recorded on the
 * `event.voided` event. That keeps the fold pure, makes a void auditable
 * ("this removed these six events"), and means a later change to the
 * causality model cannot silently alter what an old void did.
 */

export interface VoidPreview {
  readonly ok: true;
  readonly targetEventId: EventId;
  /** Every event the void suppresses, including the target. Stored on the event. */
  readonly cascaded: readonly EventId[];
  /** The commands the cascade spans, for a preview that reads as beats. */
  readonly commands: readonly CommandId[];
  /** What the player is about to un-happen, in their own terms. */
  readonly summary: readonly string[];
}

export type VoidRefusalReason =
  | 'not_found'
  | 'not_voidable'
  | 'already_voided'
  | 'outside_current_session'
  | 'referenced_outside_cascade';

export interface VoidRefusal {
  readonly ok: false;
  readonly reason: VoidRefusalReason;
  readonly detail: string;
  /** For `referenced_outside_cascade`: what still depends on the subtree. */
  readonly blockedBy?: readonly { readonly eventId: EventId; readonly ref: EntityRef }[];
}

export type VoidPlan = VoidPreview | VoidRefusal;

/**
 * Decide what voiding an event would do, and whether it is allowed.
 *
 * Returns a refusal rather than throwing: the UI shows the player what a
 * void would remove *before* they confirm, and a refusal is an answer to
 * that question, not an exception.
 */
export function planVoid(events: readonly AstrolabeEvent[], targetEventId: EventId): VoidPlan {
  const target = events.find((event) => event.id === targetEventId);
  if (target === undefined) {
    return {
      ok: false,
      reason: 'not_found',
      detail: `No event ${targetEventId} in this campaign.`,
    };
  }

  if (!EVENT_TYPE_META[target.type].voidable) {
    return {
      ok: false,
      reason: 'not_voidable',
      // D-85: the tokens were spent whatever the fiction now says.
      detail: `${target.type} is exempt from void.`,
    };
  }

  const voids = computeVoidState(events);
  if (isSuppressed(target, voids)) {
    return { ok: false, reason: 'already_voided', detail: 'That event is already voided.' };
  }

  const currentSession = currentSessionId(events, voids);
  if (target.sessionId === null || target.sessionId !== currentSession) {
    return {
      ok: false,
      // D-84. Bounds the cascade, and matches how tables actually play: you
      // correct last session's mistakes, you do not un-happen them.
      reason: 'outside_current_session',
      detail: 'Void reaches only events in the current session. Use a correction instead.',
    };
  }

  const cascadedEvents = collectCascade(events, target);
  const cascaded = new Set(cascadedEvents.map((event) => event.id));

  const blockedBy = findOutsideReferences(events, cascadedEvents, cascaded, voids);
  if (blockedBy.length > 0) {
    return {
      ok: false,
      reason: 'referenced_outside_cascade',
      detail:
        'Something later in the log is built on what this would remove. ' +
        'Correct it with an override or a narration correction instead.',
      blockedBy,
    };
  }

  return {
    ok: true,
    targetEventId,
    cascaded: cascadedEvents.map((event) => event.id),
    commands: [...new Set(cascadedEvents.map((event) => event.commandId))],
    summary: cascadedEvents.map(describe),
  };
}

/**
 * The causal subtree, as whole commands.
 *
 * The minimum unit is a command, not an event: voiding a roll voids the
 * invocation and the effects it wrote, because they were one decision. The
 * cascade then follows `causedBy` from command to command, which is the
 * only place causality has to be recorded — events inside a command already
 * share a `commandId`.
 *
 * Events exempt from void are excluded (D-85), so a cascade never claims to
 * have removed token accounting.
 */
function collectCascade(
  events: readonly AstrolabeEvent[],
  target: AstrolabeEvent,
): readonly AstrolabeEvent[] {
  const byCommand = new Map<CommandId, AstrolabeEvent[]>();
  for (const event of events) {
    const group = byCommand.get(event.commandId);
    if (group === undefined) {
      byCommand.set(event.commandId, [event]);
    } else {
      group.push(event);
    }
  }

  const includedCommands = new Set<CommandId>([target.commandId]);
  const includedIds = new Set<EventId>((byCommand.get(target.commandId) ?? []).map((e) => e.id));

  // Transitive closure: any command caused by something already inside.
  let grew = true;
  while (grew) {
    grew = false;
    for (const event of events) {
      if (includedCommands.has(event.commandId) || event.causedBy === null) {
        continue;
      }
      if (includedIds.has(event.causedBy)) {
        includedCommands.add(event.commandId);
        for (const sibling of byCommand.get(event.commandId) ?? []) {
          includedIds.add(sibling.id);
        }
        grew = true;
      }
    }
  }

  return events.filter(
    (event) => includedCommands.has(event.commandId) && EVENT_TYPE_META[event.type].voidable,
  );
}

/**
 * Referential containment (D-83).
 *
 * A void is refused when a non-voided event *outside* the cascade refers to
 * an entity or track *introduced* inside it — otherwise projection would
 * produce a dangling reference, such as the Beat 8 clock hanging off a Beat
 * 6 NPC that no longer exists.
 *
 * This is checkable rather than aspirational because every event type
 * declares `introduces` and `references` in `EVENT_TYPE_META`.
 */
function findOutsideReferences(
  events: readonly AstrolabeEvent[],
  cascadedEvents: readonly AstrolabeEvent[],
  cascaded: ReadonlySet<EventId>,
  voids: ReturnType<typeof computeVoidState>,
): readonly { eventId: EventId; ref: EntityRef }[] {
  const introduced = new Set<string>();
  for (const event of cascadedEvents) {
    for (const ref of refsOf(event, 'introduces')) {
      introduced.add(refKey(ref));
    }
  }
  if (introduced.size === 0) {
    return [];
  }

  const blockers: { eventId: EventId; ref: EntityRef }[] = [];
  for (const event of events) {
    if (cascaded.has(event.id) || isSuppressed(event, voids)) {
      continue;
    }
    for (const ref of refsOf(event, 'references')) {
      if (introduced.has(refKey(ref))) {
        blockers.push({ eventId: event.id, ref });
      }
    }
  }
  return blockers;
}

function refsOf(event: AstrolabeEvent, which: 'introduces' | 'references'): readonly EntityRef[] {
  const meta = EVENT_TYPE_META[event.type] as {
    introduces: (payload: unknown) => readonly EntityRef[];
    references: (payload: unknown) => readonly EntityRef[];
  };
  return meta[which](event.payload);
}

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** The session a void may reach into: the most recent one that began (D-84). */
function currentSessionId(
  events: readonly AstrolabeEvent[],
  voids: ReturnType<typeof computeVoidState>,
): SessionId | null {
  let current: SessionId | null = null;
  for (const event of events) {
    if (event.type === 'session.began' && !isSuppressed(event, voids)) {
      current = event.payload.sessionId;
    }
  }
  return current;
}

/** A one-line description for the confirmation preview. */
function describe(event: AstrolabeEvent): string {
  switch (event.type) {
    case 'move.invoked':
      return `the move ${event.payload.moveId}`;
    case 'dice.rolled':
      return `a ${event.payload.tier.replace('_', ' ')}`;
    case 'state.changed':
      return `${event.payload.changes.length} state change(s)`;
    case 'state.overridden':
      return `a manual override to ${event.payload.to}`;
    case 'track.created':
      return `the track "${event.payload.title}"`;
    case 'track.advanced':
      return `${event.payload.ticks} tick(s) of progress`;
    case 'entity.established':
      return `${event.payload.name}`;
    case 'narration.written':
      return 'a passage of narration';
    default:
      return event.type;
  }
}
