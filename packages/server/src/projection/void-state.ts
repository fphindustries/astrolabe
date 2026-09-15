import { EVENT_TYPE_META, type AstrolabeEvent, type EventId } from '@astrolabe/shared';

/**
 * Which events a log's voids suppress.
 *
 * This has to be a **separate pass before the fold**, because a void
 * appears later in the log than the events it suppresses. A single forward
 * pass could not know, on reaching event 3, that event 9 will void it.
 * That is also exactly why a void invalidates any snapshot at or after the
 * voided seq, and why incremental application has to rebuild when a void
 * arrives (see `project.ts`).
 *
 * An event's void state is a **set of active void ids**, not a boolean.
 * Milestone 1 writes no reinstatement (D-86), so the set is never emptied
 * and a boolean would answer the same today. It is a set anyway because
 * that is the whole cost of keeping D-86 reversible — reinstating becomes
 * "remove this void's id from the targets in its list", with no change to
 * the projector. A boolean would force a rewrite, since last-writer-wins is
 * wrong when two voids overlap: if void A covers {5, 6} and void B covers
 * {6, 7}, reinstating A must leave 6 voided by B.
 */
export type VoidState = ReadonlyMap<EventId, ReadonlySet<EventId>>;

export function computeVoidState(events: readonly AstrolabeEvent[]): VoidState {
  const active = new Map<EventId, Set<EventId>>();

  for (const event of events) {
    if (event.type !== 'event.voided') {
      continue;
    }
    for (const targetId of event.payload.cascaded) {
      let voids = active.get(targetId);
      if (voids === undefined) {
        voids = new Set();
        active.set(targetId, voids);
      }
      voids.add(event.id);
    }
  }

  return active;
}

/**
 * Whether the fold should skip this event.
 *
 * Being in a cascade is not sufficient: D-85 exempts token accounting from
 * void, because the tokens were spent whatever the fiction now says. The
 * exemption is declared per type as `voidable`, so this asks the catalogue
 * rather than hard-coding the two types that carry it.
 */
export function isSuppressed(event: AstrolabeEvent, voids: VoidState): boolean {
  if (!EVENT_TYPE_META[event.type].voidable) {
    return false;
  }
  const active = voids.get(event.id);
  return active !== undefined && active.size > 0;
}

/** The void events currently suppressing an event, for the log's strike-through affordance. */
export function activeVoidsFor(eventId: EventId, voids: VoidState): readonly EventId[] {
  return [...(voids.get(eventId) ?? [])];
}
