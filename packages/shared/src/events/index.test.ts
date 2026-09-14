import { describe, expect, it } from 'vitest';

import {
  CLOCK_TRACK,
  PLAYER_ACTOR,
  ROOK,
  SESSION_ID,
  STATION,
  SURVIVOR,
  VESNA,
  rawEvent,
  testEvent,
  testEventId,
} from '../test-fixtures.js';

import { EVENT_TYPES, PAYLOAD_SCHEMAS, isEventType, parseEvent, safeParseEvent } from './index.js';

const sessionBegan = testEvent('session.began', { sessionId: SESSION_ID, number: 2 });

describe('the catalogue', () => {
  it('holds the eighteen spine types section 2 builds, plus one per later feature that has landed', () => {
    // truth.set and sector.route_added (§4) were the first two of the rest;
    // move.choice_made, move.method_chosen, move.chained, oracle.rolled and
    // amount.committed (§6, the move flow) are the next five, landing with
    // the features that write them, as events/index.ts's own comment plans.
    // amount.proposed and ai.failed (§7, the AI provider) make two more, and
    // character.proposed (3.3, D-124) one more.
    expect(EVENT_TYPES).toHaveLength(28);
  });

  it('exposes every type through isEventType, and rejects anything else', () => {
    for (const type of EVENT_TYPES) {
      expect(isEventType(type)).toBe(true);
    }
    expect(isEventType('move.resolved')).toBe(false);
    expect(isEventType('')).toBe(false);
  });

  it('gives every type a payload schema', () => {
    for (const type of EVENT_TYPES) {
      expect(PAYLOAD_SCHEMAS[type]).toBeDefined();
    }
  });

  it('does not answer to a prototype key', () => {
    // Object.hasOwn, not `in` — otherwise "constructor" would be an event type.
    expect(isEventType('constructor')).toBe(false);
    expect(isEventType('toString')).toBe(false);
  });
});

describe('envelope validation', () => {
  it('accepts a well-formed event', () => {
    expect(() => parseEvent(sessionBegan)).not.toThrow();
  });

  it('rejects an unknown type rather than passing it through', () => {
    expect(safeParseEvent(rawEvent('move.resolved', {})).success).toBe(false);
  });

  it('rejects a non-uuid campaign id', () => {
    expect(safeParseEvent({ ...sessionBegan, campaignId: 'campaign-1' }).success).toBe(false);
  });

  it('rejects a seq of zero: sequences are 1-based and gapless', () => {
    expect(safeParseEvent({ ...sessionBegan, seq: 0 }).success).toBe(false);
  });

  it('requires causedBy to be present even when null', () => {
    const { causedBy: _causedBy, ...withoutCausedBy } = sessionBegan;
    expect(safeParseEvent(withoutCausedBy).success).toBe(false);
  });

  it('accepts a null sessionId, for campaign setup before session 1', () => {
    expect(safeParseEvent({ ...sessionBegan, sessionId: null }).success).toBe(true);
  });

  it('rejects a visibility other than table in Milestone 1', () => {
    expect(safeParseEvent({ ...sessionBegan, visibility: 'private' }).success).toBe(false);
  });

  it('rejects an occurredAt that is not ISO 8601', () => {
    expect(safeParseEvent({ ...sessionBegan, occurredAt: '12 September 2026' }).success).toBe(
      false,
    );
  });

  it('narrows the payload when the type is narrowed', () => {
    const event = parseEvent(sessionBegan);
    if (event.type !== 'session.began') {
      throw new Error('expected session.began');
    }
    // As much a compile-time assertion as a runtime one: `number` exists
    // only on this member of the union.
    expect(event.payload.number).toBe(2);
  });
});

describe('actor', () => {
  it('requires a playerId on a player event', () => {
    expect(safeParseEvent({ ...sessionBegan, actor: { kind: 'player' } }).success).toBe(false);
    expect(safeParseEvent({ ...sessionBegan, actor: PLAYER_ACTOR }).success).toBe(true);
  });

  it('takes ai and system without further fields', () => {
    expect(safeParseEvent({ ...sessionBegan, actor: { kind: 'ai' } }).success).toBe(true);
    expect(safeParseEvent({ ...sessionBegan, actor: { kind: 'system' } }).success).toBe(true);
  });

  it('rejects an actor kind the authority model does not define', () => {
    expect(safeParseEvent({ ...sessionBegan, actor: { kind: 'gm' } }).success).toBe(false);
  });
});

describe('dice.rolled', () => {
  const roll = {
    kind: 'action',
    actionDie: 3,
    adds: [{ amount: 2, label: 'iron' }],
    actionScore: 5,
    challengeDice: [8, 4],
    tier: 'miss',
    isMatch: false,
    rng: { source: 'crypto' },
  } as const;

  it('stores the resolved tier alongside the dice', () => {
    // The redundancy is the point: a later fix to resolveTier must never
    // retroactively rewrite an old campaign's outcomes.
    const event = parseEvent(testEvent('dice.rolled', roll));
    if (event.type !== 'dice.rolled' || event.payload.kind !== 'action') {
      throw new Error('expected an action roll');
    }
    expect(event.payload.tier).toBe('miss');
    expect(event.payload.challengeDice).toEqual([8, 4]);
  });

  it('rejects an action die outside 1-6', () => {
    expect(safeParseEvent(rawEvent('dice.rolled', { ...roll, actionDie: 7 })).success).toBe(false);
  });

  it('rejects a challenge die outside 1-10', () => {
    expect(
      safeParseEvent(rawEvent('dice.rolled', { ...roll, challengeDice: [11, 4] })).success,
    ).toBe(false);
  });

  it('rejects a single challenge die: there are always two', () => {
    expect(safeParseEvent(rawEvent('dice.rolled', { ...roll, challengeDice: [8] })).success).toBe(
      false,
    );
  });

  it('carries a burn offer when one was made (A8, Beat 5)', () => {
    const withOffer = {
      ...roll,
      tier: 'weak_hit',
      burnOffer: { wouldBecome: 'strong_hit', momentum: 7, resetsTo: 2 },
    } as const;
    expect(safeParseEvent(testEvent('dice.rolled', withOffer)).success).toBe(true);
  });
});

describe('state.changed', () => {
  it('carries the clause each delta implements', () => {
    const event = parseEvent(
      testEvent('state.changed', {
        cause: {
          kind: 'move_outcome',
          moveId: 'move:adventure/gather_information',
          tier: 'weak_hit',
        },
        changes: [
          { delta: { kind: 'momentum', characterId: VESNA, delta: 1 }, clause: 'take +1 momentum' },
        ],
      }),
    );
    if (event.type !== 'state.changed') throw new Error('expected state.changed');
    expect(event.payload.changes[0]?.clause).toBe('take +1 momentum');
  });

  it('rejects an empty change list: an event that changes nothing is a bug', () => {
    expect(
      safeParseEvent(rawEvent('state.changed', { cause: { kind: 'momentum_burn' }, changes: [] }))
        .success,
    ).toBe(false);
  });

  it('rejects a move id without its prefix', () => {
    expect(
      safeParseEvent(
        rawEvent('state.changed', {
          cause: { kind: 'move_outcome', moveId: 'gather_information', tier: 'weak_hit' },
          changes: [{ delta: { kind: 'momentum', characterId: VESNA, delta: 1 } }],
        }),
      ).success,
    ).toBe(false);
  });

  it('requires a stated reason on an AI judgement (section 3)', () => {
    expect(
      safeParseEvent(
        rawEvent('state.changed', {
          cause: { kind: 'ai_judgement' },
          changes: [{ delta: { kind: 'momentum', characterId: VESNA, delta: -1 } }],
        }),
      ).success,
    ).toBe(false);
  });

  it('has no progress delta: track movement goes through track.advanced', () => {
    expect(
      safeParseEvent(
        rawEvent('state.changed', {
          cause: { kind: 'momentum_burn' },
          changes: [{ delta: { kind: 'progress', trackId: CLOCK_TRACK, ticks: 2 } }],
        }),
      ).success,
    ).toBe(false);
  });
});

describe('state.overridden', () => {
  it('accepts Beat 9: a momentum override from +3 to +4', () => {
    const event = testEvent(
      'state.overridden',
      {
        target: { kind: 'momentum', characterId: ROOK },
        from: 3,
        to: 4,
        reason: 'ruling from last session',
      },
      { actor: PLAYER_ACTOR },
    );
    expect(safeParseEvent(event).success).toBe(true);
  });

  it('cannot target an impact: D-26 scopes overrides to meters, tracks and clocks', () => {
    expect(
      safeParseEvent(
        rawEvent('state.overridden', {
          target: { kind: 'impact', characterId: ROOK, impact: 'impact:wounded' },
          from: 0,
          to: 1,
        }),
      ).success,
    ).toBe(false);
  });
});

describe('event.voided', () => {
  it('requires a reason and a non-empty cascade', () => {
    const ok = testEvent(
      'event.voided',
      {
        targetEventId: testEventId(4),
        kind: 'player_void',
        reason: 'Rook is forcing the bulkhead, not slipping past it',
        cascaded: [testEventId(3), testEventId(4)],
      },
      { actor: PLAYER_ACTOR },
    );
    expect(safeParseEvent(ok).success).toBe(true);

    expect(
      safeParseEvent(
        rawEvent('event.voided', {
          targetEventId: testEventId(4),
          kind: 'player_void',
          reason: 'mistake',
          cascaded: [],
        }),
      ).success,
    ).toBe(false);
  });

  it('takes reroll as a kind, so D-18 reuses the mechanism', () => {
    const reroll = testEvent(
      'event.voided',
      {
        targetEventId: testEventId(9),
        kind: 'reroll',
        reason: 'contradicts the evacuation logs',
        cascaded: [testEventId(9)],
      },
      { actor: { kind: 'ai' } },
    );
    expect(safeParseEvent(reroll).success).toBe(true);
  });
});

describe('track.created', () => {
  it('accepts Beat 8: a four-segment tension clock with its reason', () => {
    const clock = testEvent(
      'track.created',
      {
        kind: 'clock',
        trackId: CLOCK_TRACK,
        title: 'Station power failing',
        segments: 4,
        cause: {
          kind: 'ai_judgement',
          reason: 'forcing the bulkhead tripped emergency load-shedding',
        },
      },
      { actor: { kind: 'ai' } },
    );
    expect(safeParseEvent(clock).success).toBe(true);
  });

  it('rejects a clock with a segment count the game does not use', () => {
    expect(
      safeParseEvent(
        rawEvent('track.created', {
          kind: 'clock',
          trackId: CLOCK_TRACK,
          title: 'Station power failing',
          segments: 5,
          cause: { kind: 'ai_judgement', reason: 'why' },
        }),
      ).success,
    ).toBe(false);
  });
});

describe('truth.set', () => {
  it('accepts a rolled answer with its die result (task 4.2)', () => {
    expect(
      safeParseEvent(
        testEvent('truth.set', {
          oracleId: 'oracle:cataclysm',
          source: 'rolled',
          text: 'The Sun Plague extinguished the stars in our home galaxy.',
          roll: 12,
        }),
      ).success,
    ).toBe(true);
  });

  it('accepts a written answer with no roll at all', () => {
    expect(
      safeParseEvent(
        testEvent('truth.set', {
          oracleId: 'oracle:cataclysm',
          source: 'written',
          text: 'A slow climate collapse, not a single cataclysm.',
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects an oracle id without its prefix', () => {
    expect(
      safeParseEvent(rawEvent('truth.set', { oracleId: 'cataclysm', source: 'written', text: 'x' }))
        .success,
    ).toBe(false);
  });

  it('rejects a roll outside 1-100', () => {
    expect(
      safeParseEvent(
        rawEvent('truth.set', {
          oracleId: 'oracle:cataclysm',
          source: 'rolled',
          text: 'x',
          roll: 101,
        }),
      ).success,
    ).toBe(false);
  });
});

describe('sector.route_added', () => {
  it('accepts a route between two established locations (task 4.3)', () => {
    expect(
      safeParseEvent(
        testEvent('sector.route_added', { fromLocationId: STATION, toLocationId: SURVIVOR }),
      ).success,
    ).toBe(true);
  });

  it('rejects a non-uuid location id', () => {
    expect(
      safeParseEvent(
        rawEvent('sector.route_added', { fromLocationId: 'not-a-uuid', toLocationId: SURVIVOR }),
      ).success,
    ).toBe(false);
  });
});
