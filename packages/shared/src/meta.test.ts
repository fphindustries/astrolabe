import { describe, expect, it } from 'vitest';

import { EVENT_TYPES, type EventType } from './events/index.js';
import {
  EVENT_TYPE_META,
  NARRATIVE_EVENT_TYPES,
  SIGNIFICANT_EVENT_TYPES,
  type EntityRef,
} from './meta.js';
import { CLOCK_TRACK, ROOK, SURVIVOR, VESNA, VOW_TRACK, testEventId } from './test-fixtures.js';

describe('the metadata table', () => {
  it('covers every event type in the catalogue', () => {
    for (const type of EVENT_TYPES) {
      expect(EVENT_TYPE_META[type]).toBeDefined();
    }
    expect(Object.keys(EVENT_TYPE_META).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('exempts exactly token accounting and voids from being voided (D-85)', () => {
    const exempt = EVENT_TYPES.filter((type) => !EVENT_TYPE_META[type].voidable);
    expect(exempt.sort()).toEqual(['ai.completed', 'event.voided']);
  });

  it('treats every significant type as narrative too, except session boundaries', () => {
    // A recap reads significant events; anything a recap mentions should be
    // something the player could also have read in the log.
    const significantButNotNarrative = SIGNIFICANT_EVENT_TYPES.filter(
      (type) => !EVENT_TYPE_META[type].narrative,
    );
    expect(significantButNotNarrative).toEqual(['session.began']);
  });

  it('derives the narrative and significant type lists from the table', () => {
    for (const type of NARRATIVE_EVENT_TYPES) {
      expect(EVENT_TYPE_META[type].narrative).toBe(true);
    }
    for (const type of SIGNIFICANT_EVENT_TYPES) {
      expect(EVENT_TYPE_META[type].significant).toBe(true);
    }
  });
});

describe('introduces', () => {
  it('reports the entity an entity.established brings into being (Beat 6)', () => {
    const refs = EVENT_TYPE_META['entity.established'].introduces({
      entityId: SURVIVOR,
      kind: 'npc',
      name: 'Sura Vance',
      fields: { disposition: 'wary' },
      provenance: { establishedBy: 'ai', groundedIn: [testEventId(10)] },
    });
    expect(refs).toEqual<EntityRef[]>([{ kind: 'entity', id: SURVIVOR }]);
  });

  it('reports the track a track.created brings into being (Beat 8)', () => {
    const refs = EVENT_TYPE_META['track.created'].introduces({
      kind: 'clock',
      trackId: CLOCK_TRACK,
      title: 'Station power failing',
      segments: 4,
      cause: { kind: 'ai_judgement', reason: 'emergency load-shedding' },
    });
    expect(refs).toEqual<EntityRef[]>([{ kind: 'track', id: CLOCK_TRACK }]);
  });

  it('reports nothing for an event that only refers to what already exists', () => {
    expect(
      EVENT_TYPE_META['track.advanced'].introduces({
        trackId: CLOCK_TRACK,
        ticks: 1,
        cause: { kind: 'ai_judgement', reason: 'forcing the bulkhead' },
      }),
    ).toEqual([]);
  });
});

describe('references — the mechanism D-83 containment needs', () => {
  it('finds the actor and the aided ally on a move invocation (D-62, Beat 5)', () => {
    const refs = EVENT_TYPE_META['move.invoked'].references({
      moveId: 'move:adventure/secure_an_advantage',
      actorCharacterId: ROOK,
      aidingAllyId: VESNA,
      adds: [],
    });
    expect(refs).toEqual<EntityRef[]>([
      { kind: 'character', id: ROOK },
      { kind: 'character', id: VESNA },
    ]);
  });

  it('finds the progress track a move was rolled against', () => {
    const refs = EVENT_TYPE_META['move.invoked'].references({
      moveId: 'move:quest/fulfill_your_vow',
      actorCharacterId: VESNA,
      using: { using: 'progress_track', trackId: VOW_TRACK },
      adds: [],
    });
    expect(refs).toContainEqual<EntityRef>({ kind: 'track', id: VOW_TRACK });
  });

  it('finds every character a state change touches', () => {
    const refs = EVENT_TYPE_META['state.changed'].references({
      cause: {
        kind: 'move_outcome',
        moveId: 'move:adventure/secure_an_advantage',
        tier: 'strong_hit',
      },
      changes: [
        { delta: { kind: 'momentum', characterId: VESNA, delta: 2 } },
        { delta: { kind: 'bonus_next_move', characterId: VESNA, amount: 1 } },
      ],
    });
    expect(refs).toEqual<EntityRef[]>([
      { kind: 'character', id: VESNA },
      { kind: 'character', id: VESNA },
    ]);
  });

  it('finds the location a scene refers to, and nothing when it has none', () => {
    expect(
      EVENT_TYPE_META['scene.started'].references({
        sceneId: '33333333-3333-4333-8333-333333333333' as never,
        title: 'The relay station',
        locationId: SURVIVOR,
      }),
    ).toEqual<EntityRef[]>([{ kind: 'entity', id: SURVIVOR }]);

    expect(
      EVENT_TYPE_META['scene.started'].references({
        sceneId: '33333333-3333-4333-8333-333333333333' as never,
        title: 'The relay station',
      }),
    ).toEqual([]);
  });

  it('distinguishes a track override from a character override', () => {
    expect(
      EVENT_TYPE_META['state.overridden'].references({
        target: { kind: 'track', trackId: CLOCK_TRACK },
        from: 1,
        to: 2,
      }),
    ).toEqual<EntityRef[]>([{ kind: 'track', id: CLOCK_TRACK }]);

    expect(
      EVENT_TYPE_META['state.overridden'].references({
        target: { kind: 'momentum', characterId: ROOK },
        from: 3,
        to: 4,
      }),
    ).toEqual<EntityRef[]>([{ kind: 'character', id: ROOK }]);
  });

  it('never reports the same thing as both introduced and referenced', () => {
    // If an event both created and referred to something, a containment
    // check would see a self-reference and refuse a void it should allow.
    const clockCreated = {
      kind: 'clock',
      trackId: CLOCK_TRACK,
      title: 'Station power failing',
      segments: 4,
      cause: { kind: 'ai_judgement', reason: 'load-shedding' },
    } as const;
    const meta = EVENT_TYPE_META['track.created'];
    const introduced = meta.introduces(clockCreated).map(refKey);
    const referenced = meta.references(clockCreated).map(refKey);
    expect(introduced.filter((ref) => referenced.includes(ref))).toEqual([]);
  });
});

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

describe('narrative composition', () => {
  it('renders the beats of play, not the bookkeeping', () => {
    const narrative = new Set<EventType>(NARRATIVE_EVENT_TYPES);
    // What the player reads.
    expect(narrative.has('narration.written')).toBe(true);
    expect(narrative.has('dice.rolled')).toBe(true);
    expect(narrative.has('event.voided')).toBe(true); // D-27: the voided roll stays visible
    // What they do not.
    expect(narrative.has('ai.completed')).toBe(false);
    expect(narrative.has('state.changed')).toBe(false);
    expect(narrative.has('narration.revised')).toBe(false); // folded into the passage it revises
  });
});
