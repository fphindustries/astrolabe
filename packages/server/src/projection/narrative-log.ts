import {
  EVENT_TYPE_META,
  type ActorKind,
  type AstrolabeEvent,
  type CommandId,
  type EventId,
  type Timestamp,
} from '@astrolabe/shared';

import { computeVoidState, type VoidState } from './void-state.js';

/**
 * The narrative log: the second read model over the same log.
 *
 * Deliberately not part of `CampaignState`. State is bounded — one campaign
 * has a fixed number of characters, tracks and entities — while the log
 * grows without limit, so one is rebuilt whole and the other is paged.
 *
 * Three things happen here that the projector does not do:
 *
 * - **Grouping into beats.** Events are grouped by `commandId`, so a move
 *   resolution reads as one beat rather than five rows. That grouping is
 *   free: the command id is already the idempotency key and the minimum
 *   unit a void operates on.
 * - **Void marking, not removal.** A voided event stays visible and struck
 *   through with its stated reason (D-27, A9, A11). The projector skips
 *   these events; the log keeps them.
 * - **Correction folding.** D-73: a corrected passage reads as its latest
 *   revision, with the original and the player's note retained behind an
 *   affordance.
 *
 * This is also where the roll's burn offer lives. A8's "burn momentum to
 * upgrade?" is a property of the beat being read, not of campaign state —
 * which is why `dice.rolled` does not mutate the projection.
 */

export interface VoidMark {
  readonly eventId: EventId;
  readonly kind: 'player_void' | 'reroll';
  readonly reason: string;
}

/** D-73: the passage as it now reads, with what it replaced kept alongside. */
export interface ResolvedNarration {
  readonly text: string;
  readonly corrected: boolean;
  readonly original?: string;
  /** The player's note — why the original was wrong. */
  readonly note?: string;
}

export interface NarrativeEntry {
  readonly event: AstrolabeEvent;
  readonly voided: boolean;
  readonly voidedBy: readonly VoidMark[];
  /** Present on `narration.written` only. */
  readonly narration?: ResolvedNarration;
  /**
   * Present on a `dice.rolled` that carried a burn offer: whether the player
   * went on to take it. A8's offer is only still live while this is false.
   */
  readonly burnTaken?: boolean;
}

/** One beat: everything one command wrote. */
export interface NarrativeBeat {
  readonly commandId: CommandId;
  /** The first seq in the beat — what the log is ordered and paged by. */
  readonly seq: number;
  readonly occurredAt: Timestamp;
  readonly actorKind: ActorKind;
  readonly entries: readonly NarrativeEntry[];
  /** True when every entry in the beat is voided, so the whole beat strikes through. */
  readonly voided: boolean;
}

export interface NarrativeLog {
  /** Oldest first, which is reading order. */
  readonly beats: readonly NarrativeBeat[];
  /**
   * Pass as `before` to fetch the previous page. Absent when the log reaches
   * its beginning.
   */
  readonly nextCursor?: number;
}

export interface NarrativeLogOptions {
  /** Return beats beginning before this seq. Omit for the most recent page. */
  readonly before?: number;
  /** Beats, not events. Default 50. */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 50;

/**
 * Build the log from a slice of events.
 *
 * `events` must contain everything needed to fold the amendments —
 * the `event.voided`, `narration.revised` and `narration.correction_requested`
 * events for the campaign — alongside the narrative events being rendered.
 * Those amendment types are few, which is why the query fetches all of them
 * rather than trying to bound them to a page.
 */
export function buildNarrativeLog(
  events: readonly AstrolabeEvent[],
  options: NarrativeLogOptions = {},
): NarrativeLog {
  const voids = computeVoidState(events);
  const voidMarks = collectVoidMarks(events);
  const revisions = collectRevisions(events);
  const burnedRolls = collectBurnedRolls(events);

  const renderable = events.filter(
    (event) =>
      EVENT_TYPE_META[event.type].narrative &&
      (options.before === undefined || event.seq < options.before),
  );

  const beats = groupIntoBeats(renderable, (event) =>
    toEntry(event, voids, voidMarks, revisions, burnedRolls),
  );

  const limit = options.limit ?? DEFAULT_LIMIT;
  return paginate(beats, limit);
}

function toEntry(
  event: AstrolabeEvent,
  voids: VoidState,
  voidMarks: ReadonlyMap<EventId, VoidMark>,
  revisions: ReadonlyMap<EventId, Revision>,
  burnedRolls: ReadonlySet<EventId>,
): NarrativeEntry {
  const activeVoids = [...(voids.get(event.id) ?? [])];
  const voidedBy = activeVoids
    .map((voidId) => voidMarks.get(voidId))
    .filter((mark): mark is VoidMark => mark !== undefined);

  const entry: NarrativeEntry = {
    event,
    // `voidable` is what decides whether a cascade actually suppresses this
    // event — token accounting is exempt (D-85) — and the log agrees with
    // the projector rather than inventing its own answer.
    voided: EVENT_TYPE_META[event.type].voidable && voidedBy.length > 0,
    voidedBy,
  };

  if (event.type === 'narration.written') {
    return { ...entry, narration: resolveNarration(event, revisions) };
  }
  // Only an action roll can carry a burn offer: momentum stands in for the
  // action score, which a progress roll does not have.
  if (
    event.type === 'dice.rolled' &&
    event.payload.kind === 'action' &&
    event.payload.burnOffer !== undefined
  ) {
    return { ...entry, burnTaken: burnedRolls.has(event.id) };
  }
  return entry;
}

function resolveNarration(
  event: Extract<AstrolabeEvent, { type: 'narration.written' }>,
  revisions: ReadonlyMap<EventId, Revision>,
): ResolvedNarration {
  const revision = revisions.get(event.id);
  if (revision === undefined) {
    return { text: event.payload.text, corrected: false };
  }
  return {
    text: revision.text,
    corrected: true,
    // D-73 requires both retained, behind an affordance that opens them.
    original: event.payload.text,
    ...(revision.note !== undefined ? { note: revision.note } : {}),
  };
}

interface Revision {
  readonly text: string;
  readonly note?: string;
}

/**
 * The latest non-voided revision of each passage, with the note from the
 * correction request that prompted it.
 *
 * Later revisions overwrite earlier ones, so a passage corrected twice reads
 * as the last one while every original stays in the log.
 */
function collectRevisions(events: readonly AstrolabeEvent[]): ReadonlyMap<EventId, Revision> {
  const voids = computeVoidState(events);
  const notes = new Map<EventId, string>();
  const revisions = new Map<EventId, Revision>();

  for (const event of events) {
    if ((voids.get(event.id)?.size ?? 0) > 0) {
      continue;
    }
    if (event.type === 'narration.correction_requested') {
      notes.set(event.payload.targetEventId, event.payload.note);
    } else if (event.type === 'narration.revised') {
      const note = notes.get(event.payload.targetEventId);
      revisions.set(event.payload.targetEventId, {
        text: event.payload.text,
        ...(note !== undefined ? { note } : {}),
      });
    }
  }
  return revisions;
}

function collectVoidMarks(events: readonly AstrolabeEvent[]): ReadonlyMap<EventId, VoidMark> {
  const marks = new Map<EventId, VoidMark>();
  for (const event of events) {
    if (event.type === 'event.voided') {
      marks.set(event.id, {
        eventId: event.id,
        kind: event.payload.kind,
        reason: event.payload.reason,
      });
    }
  }
  return marks;
}

function collectBurnedRolls(events: readonly AstrolabeEvent[]): ReadonlySet<EventId> {
  const burned = new Set<EventId>();
  for (const event of events) {
    if (event.type === 'momentum.burned') {
      burned.add(event.payload.rollEventId);
    }
  }
  return burned;
}

function groupIntoBeats(
  events: readonly AstrolabeEvent[],
  toEntryFn: (event: AstrolabeEvent) => NarrativeEntry,
): readonly NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];
  let current: { commandId: CommandId; entries: NarrativeEntry[]; first: AstrolabeEvent } | null =
    null;

  const flush = () => {
    if (current === null) {
      return;
    }
    beats.push({
      commandId: current.commandId,
      seq: current.first.seq,
      occurredAt: current.first.occurredAt,
      actorKind: current.first.actor.kind,
      entries: current.entries,
      voided: current.entries.every((entry) => entry.voided),
    });
    current = null;
  };

  for (const event of events) {
    if (current === null || current.commandId !== event.commandId) {
      flush();
      current = { commandId: event.commandId, entries: [], first: event };
    }
    current.entries.push(toEntryFn(event));
  }
  flush();

  return beats;
}

/**
 * Take the most recent `limit` beats.
 *
 * Paging is by beat rather than by event so a move resolution is never split
 * across a page boundary — the reader would otherwise see a roll with no
 * invocation above it.
 */
function paginate(beats: readonly NarrativeBeat[], limit: number): NarrativeLog {
  if (beats.length <= limit) {
    return { beats };
  }
  const page = beats.slice(beats.length - limit);
  const firstSeq = page[0]?.seq;
  return {
    beats: page,
    ...(firstSeq !== undefined ? { nextCursor: firstSeq } : {}),
  };
}
