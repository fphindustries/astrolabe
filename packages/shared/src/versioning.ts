import { EVENT_TYPES, parseEvent, type AstrolabeEvent, type EventType } from './events/index.js';

/**
 * Payload schema versioning.
 *
 * Stored events are **never rewritten**. There are no "migrate the log"
 * scripts; a campaign played today must still project correctly in a year,
 * against whatever the schemas have become. So a payload change is
 * expressed as an upcaster, and the projector only ever sees latest-version
 * payloads.
 *
 * The everyday rule:
 *
 * - Adding an optional field is non-breaking. Do not bump.
 * - Removing, renaming, or changing the meaning of a field bumps the
 *   version and adds an upcaster.
 * - A genuinely different fact is a new event type, not a new version.
 *
 * **Upcasting must be total.** If a change loses information and cannot be
 * upcast, the old projection branch has to stay — which is the signal that
 * the change was designed wrong, and that the right move was a new type
 * rather than a reshaped one.
 */

/** Migrates one payload from version `n` to version `n + 1`. Pure. */
export type Upcaster = (payload: unknown) => unknown;

/**
 * Upcasters by event type, keyed by the version they migrate **from**. A
 * chain must be dense from 1 upward: `{ 1: v1ToV2, 2: v2ToV3 }`.
 *
 * Empty at Milestone 1 — every type is still at version 1, which is what
 * `CURRENT_VERSION` derives below. The scaffolding exists now because the
 * first payload change should be a five-line addition rather than a design
 * session.
 */
export const UPCASTERS: Partial<Record<EventType, Readonly<Record<number, Upcaster>>>> = {};

/**
 * The version a type is written at today.
 *
 * Derived from `UPCASTERS` rather than declared, so the two cannot drift: a
 * type with no upcasters is at version 1, and each upcaster step adds one.
 * Adding a migration bumps the version by construction — there is no second
 * place to forget.
 *
 * Derived per call rather than once at module load, which keeps the
 * registry and the version it implies from depending on import order.
 */
export function currentVersion(type: EventType): number {
  const chain = UPCASTERS[type];
  if (chain === undefined) {
    return 1;
  }
  const steps = Object.keys(chain)
    .map(Number)
    .sort((a, b) => a - b);
  // A dense chain from 1 means step i migrates version i to i + 1.
  steps.forEach((from, index) => {
    if (from !== index + 1) {
      throw new Error(
        `Upcaster chain for "${type}" has a gap: expected a step from version ${index + 1}, found ${from}`,
      );
    }
  });
  return steps.length + 1;
}

/** Every type's current version. For diagnostics and for the store's write path. */
export function currentVersions(): Readonly<Record<EventType, number>> {
  const versions = {} as Record<EventType, number>;
  for (const type of EVENT_TYPES) {
    versions[type] = currentVersion(type);
  }
  return versions;
}

/**
 * Walk a stored payload up to the current version for its type.
 *
 * Fails closed. A version this build has no path from — a payload written
 * by a newer build, or one whose upcaster was never added — throws rather
 * than being passed through, because a payload that silently skips a
 * migration silently produces wrong state.
 */
export function upcastPayload(type: EventType, version: number, payload: unknown): unknown {
  const target = currentVersion(type);
  if (version === target) {
    return payload;
  }
  if (version > target) {
    throw new Error(
      `Event "${type}" is stored at version ${version}, but this build only knows version ${target}. Refusing to downgrade.`,
    );
  }
  if (version < 1) {
    throw new Error(`Event "${type}" has an invalid version ${version}.`);
  }

  let current = payload;
  for (let from = version; from < target; from += 1) {
    const step = UPCASTERS[type]?.[from];
    if (step === undefined) {
      throw new Error(
        `No upcaster for "${type}" from version ${from} to ${from + 1}; cannot replay this event.`,
      );
    }
    current = step(current);
  }
  return current;
}

/** One row as it comes back from the events table, before validation. */
export interface StoredEvent {
  readonly type: string;
  readonly version: number;
  readonly payload: unknown;
  readonly [field: string]: unknown;
}

/**
 * Turn a stored row into a validated, current-version event: upcast the
 * payload, then parse the whole envelope.
 *
 * This is the only way events should enter the projector. It throws on an
 * unknown type, an unreachable version, or a payload that does not match
 * its schema — all three of which are bugs that must surface loudly rather
 * than become quietly wrong state.
 */
export function decodeStoredEvent(row: StoredEvent): AstrolabeEvent {
  if (!EVENT_TYPES.includes(row.type as EventType)) {
    throw new Error(`Unknown event type "${row.type}"; this build cannot project it.`);
  }
  const type = row.type as EventType;
  const payload = upcastPayload(type, row.version, row.payload);
  return parseEvent({ ...row, type, version: currentVersion(type), payload });
}
