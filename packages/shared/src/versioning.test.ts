import { afterEach, describe, expect, it } from 'vitest';

import { EVENT_TYPES, type EventType } from './events/index.js';
import { SESSION_ID, rawEvent, testEvent } from './test-fixtures.js';
import {
  UPCASTERS,
  currentVersion,
  currentVersions,
  decodeStoredEvent,
  upcastPayload,
  type Upcaster,
} from './versioning.js';

/**
 * The upcaster registry is module state, so these tests install chains and
 * tear them down rather than relying on an injectable registry — the
 * registry is deliberately a single global, because there is exactly one
 * log format per build.
 */
function withUpcasters(type: EventType, chain: Record<number, Upcaster>) {
  (UPCASTERS as Record<string, Record<number, Upcaster>>)[type] = chain;
}

afterEach(() => {
  for (const type of EVENT_TYPES) {
    delete (UPCASTERS as Record<string, unknown>)[type];
  }
});

describe('currentVersion', () => {
  it('starts every type at version 1, since nothing has migrated yet', () => {
    for (const type of EVENT_TYPES) {
      expect(currentVersion(type)).toBe(1);
    }
  });

  it('covers every type in the catalogue', () => {
    expect(Object.keys(currentVersions()).sort()).toEqual([...EVENT_TYPES].sort());
  });
});

describe('upcastPayload', () => {
  it('returns the payload untouched when it is already current', () => {
    const payload = { sessionId: SESSION_ID, number: 2 };
    expect(upcastPayload('session.began', 1, payload)).toBe(payload);
  });

  it('refuses to downgrade a payload written by a newer build', () => {
    expect(() => upcastPayload('session.began', 2, {})).toThrow(/Refusing to downgrade/);
  });

  it('rejects a version below 1', () => {
    withUpcasters('session.began', { 1: (p) => p });
    expect(() => upcastPayload('session.began', 0, {})).toThrow(/invalid version/);
  });

  it('walks a payload up one step', () => {
    withUpcasters('session.began', {
      1: (p) => ({ ...(p as object), number: 2 }),
    });
    expect(upcastPayload('session.began', 1, { sessionId: SESSION_ID })).toEqual({
      sessionId: SESSION_ID,
      number: 2,
    });
  });

  it('walks a payload up several steps, in order', () => {
    const trail: number[] = [];
    withUpcasters('session.began', {
      1: (p) => {
        trail.push(1);
        return p;
      },
      2: (p) => {
        trail.push(2);
        return p;
      },
      3: (p) => {
        trail.push(3);
        return p;
      },
    });
    upcastPayload('session.began', 1, {});
    expect(trail).toEqual([1, 2, 3]);
  });

  it('starts from the stored version, not from 1', () => {
    const trail: number[] = [];
    withUpcasters('session.began', {
      1: (p) => {
        trail.push(1);
        return p;
      },
      2: (p) => {
        trail.push(2);
        return p;
      },
    });
    upcastPayload('session.began', 2, {});
    expect(trail).toEqual([2]);
  });

  it('throws on a gap in the chain rather than skipping a migration', () => {
    // A payload that silently skips a migration silently produces wrong state.
    withUpcasters('session.began', { 1: (p) => p, 3: (p) => p });
    expect(() => upcastPayload('session.began', 1, {})).toThrow(/gap/);
  });
});

describe('decodeStoredEvent', () => {
  const stored = { ...testEvent('session.began', { sessionId: SESSION_ID, number: 2 }) };

  it('validates and returns a current-version event', () => {
    const event = decodeStoredEvent(stored);
    expect(event.type).toBe('session.began');
    expect(event.version).toBe(1);
  });

  it('throws on an unknown event type rather than skipping the row', () => {
    expect(() => decodeStoredEvent(rawEvent('move.resolved', {}) as never)).toThrow(
      /Unknown event type/,
    );
  });

  it('throws on a payload that does not match its schema', () => {
    expect(() => decodeStoredEvent(rawEvent('session.began', { number: 0 }) as never)).toThrow();
  });

  it('stamps the upcast payload with the current version', () => {
    withUpcasters('session.began', {
      1: (p) => ({ ...(p as object), number: 7 }),
    });
    const old = rawEvent('session.began', { sessionId: SESSION_ID }, {}) as never;
    const event = decodeStoredEvent(old);
    if (event.type !== 'session.began') throw new Error('expected session.began');
    expect(event.payload.number).toBe(7);
    expect(event.version).toBe(2);
  });

  it('throws when the chain cannot reach the current version', () => {
    withUpcasters('session.began', { 1: (p) => p, 2: (p) => p });
    delete (UPCASTERS['session.began'] as Record<number, Upcaster>)[1];
    expect(() => decodeStoredEvent(stored)).toThrow();
  });
});
