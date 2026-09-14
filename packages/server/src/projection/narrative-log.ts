import {
  EVENT_TYPE_META,
  type AstrolabeEvent,
  type CommandId,
  type EventId,
  type NarrativeBeat,
  type NarrativeEntry,
  type NarrativeLog,
  type NarrativeLogOptions,
  type OracleChip,
  type ResolvedNarration,
  type VoidMark,
} from '@astrolabe/shared';

import { computeVoidState, type VoidState } from './void-state.js';

/**
 * The narrative log fold: `buildNarrativeLog(events) → NarrativeLog`.
 *
 * The shapes it produces (`NarrativeLog`, `NarrativeBeat`, `NarrativeEntry`,
 * `VoidMark`, `ResolvedNarration`) moved to
 * `shared/src/read-models/narrative-log.ts` under D-95, so `web` can bind
 * to them without depending on this package. This file keeps the fold
 * itself, which — like `project` — must never touch I/O, the clock, or an
 * RNG.
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

  const rolls = new Map(
    events.flatMap((event) => (event.type === 'oracle.rolled' ? [[event.id, event]] : [])),
  );
  const chipsOf = (ids: readonly EventId[]): readonly OracleChip[] =>
    ids.flatMap((id) => {
      const roll = rolls.get(id);
      return roll === undefined
        ? []
        : [
            {
              eventId: roll.id,
              oracleId: roll.payload.oracleId,
              ...(roll.payload.slot !== undefined ? { slot: roll.payload.slot } : {}),
              roll: roll.payload.roll,
              rowText: roll.payload.rowText,
              voided: (voids.get(roll.id)?.size ?? 0) > 0,
            },
          ];
    });

  const beats = groupIntoBeats(renderable, (event) =>
    toEntry(event, voids, voidMarks, revisions, burnedRolls, chipsOf),
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
  chipsOf: (ids: readonly EventId[]) => readonly OracleChip[],
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
    // D-17: the rolls the passage was grounded in sit under it as chips.
    const chips = chipsOf(event.payload.groundedIn);
    return {
      ...entry,
      narration: resolveNarration(event, revisions),
      ...(chips.length > 0 ? { chips } : {}),
    };
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

/**
 * Every live passage's current text, in log order: a corrected passage
 * reads as its latest revision (D-73), and a voided one is gone. This is
 * the narration AI context assembly carries forward (task 7.4) — the same
 * resolution the log renders, so the AI never reads a line the player
 * already corrected.
 */
export function livePassages(
  events: readonly AstrolabeEvent[],
): readonly { readonly eventId: EventId; readonly text: string }[] {
  const voids = computeVoidState(events);
  const revisions = collectRevisions(events);
  return events
    .filter(
      (event): event is Extract<AstrolabeEvent, { type: 'narration.written' }> =>
        event.type === 'narration.written' && (voids.get(event.id)?.size ?? 0) === 0,
    )
    .map((event) => ({
      eventId: event.id,
      text: revisions.get(event.id)?.text ?? event.payload.text,
    }));
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
