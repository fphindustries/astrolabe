import { describe, expect, it } from 'vitest';

import { EVENT_TYPES, LAUNCH_EVENT_TYPES, parseEvent, type EventType } from './events/index.js';
import {
  EVENT_TYPE_META,
  NARRATIVE_EVENT_TYPES,
  SIGNIFICANT_EVENT_TYPES,
  type EntityRef,
} from './meta.js';
import {
  CLOCK_TRACK,
  ROOK,
  SAMPLE_PAYLOADS,
  STATION,
  SURVIVOR,
  SCENE_ID,
  VESNA,
  VOW_TRACK,
  sampleEvents,
  testEventId,
} from './test-fixtures.js';

/**
 * `SAMPLE_PAYLOADS` is typed as a total map over `EventType`, so these
 * whole-catalogue properties genuinely cover all eighteen types rather than
 * whichever ones someone remembered to list.
 */
describe('the sample catalogue', () => {
  it('has a valid payload for every event type', () => {
    for (const event of sampleEvents()) {
      expect(() => parseEvent(event)).not.toThrow();
    }
    expect(sampleEvents()).toHaveLength(EVENT_TYPES.length);
  });
});

describe('the metadata table', () => {
  it('covers every event type in the catalogue', () => {
    expect(Object.keys(EVENT_TYPE_META).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('exempts token accounting, voids, and the launch catalogue (D-85, D-177)', () => {
    const exempt = EVENT_TYPES.filter((type) => !EVENT_TYPE_META[type].voidable);
    expect(exempt.sort()).toEqual(
      ['ai.completed', 'ai.failed', 'event.voided', ...LAUNCH_EVENT_TYPES].sort(),
    );
  });

  it('derives the launch catalogue from launch.ts, and names it so additions are visible', () => {
    // The set is derived, so a new launch event is covered automatically.
    // This assertion is the other half: it fails when the catalogue changes,
    // so the change is a decision someone makes rather than one that happens.
    expect([...LAUNCH_EVENT_TYPES].sort()).toEqual(
      [
        'campaign.activated',
        'campaign.foundation_set',
        'character.removed',
        'character.revised',
        'connection.established',
        'connection.revised',
        'creation.proposed',
        'incident.accepted',
        'incident.revised',
        'launch.draft_saved',
        'launch.fact_amended',
        'location.added',
        'location.removed',
        'location.revised',
        'route.added',
        'route.removed',
        'route.revised',
        'sector.configured',
        'sector.layout_changed',
        'starship.established',
        'starship.revised',
        'starting_settlement.selected',
        'trouble.established',
        'trouble.revised',
        'truth.decided',
      ].sort(),
    );
  });

  it('never claims voidability an event of that type could not be granted (D-84, D-177)', () => {
    // A launch event is campaign-scoped and carries no `sessionId`, and
    // `planVoid` refuses anything outside the current session. A `voidable:
    // true` here would be unreachable rather than permissive — which is what
    // the launch catalogue originally claimed.
    for (const type of LAUNCH_EVENT_TYPES) expect(EVENT_TYPE_META[type].voidable).toBe(false);
  });

  it('treats every significant type as narrative too, except session boundaries', () => {
    // A recap reads significant events; anything a recap mentions should be
    // something the player could also have read in the log.
    const significantButNotNarrative = SIGNIFICANT_EVENT_TYPES.filter(
      (type) => !EVENT_TYPE_META[type].narrative,
    );
    expect(significantButNotNarrative).toContain('session.began');
    expect(significantButNotNarrative).toContain('campaign.activated');
    expect(significantButNotNarrative).toContain('truth.decided');
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

/** `introduces` and `references` for one type, against its sample payload. */
function refsFor(type: EventType): { introduces: EntityRef[]; references: EntityRef[] } {
  const meta = EVENT_TYPE_META[type] as {
    introduces: (p: unknown) => readonly EntityRef[];
    references: (p: unknown) => readonly EntityRef[];
  };
  const payload = SAMPLE_PAYLOADS[type];
  return {
    introduces: [...meta.introduces(payload)],
    references: [...meta.references(payload)],
  };
}

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

describe('introduces and references, across the whole catalogue', () => {
  it('never reports the same thing as both introduced and referenced', () => {
    // A self-reference would make a containment check see the void's own
    // subtree as depending on itself, and refuse a void it should allow.
    for (const type of EVENT_TYPES) {
      const { introduces, references } = refsFor(type);
      const overlap = introduces.map(refKey).filter((ref) => references.map(refKey).includes(ref));
      expect(overlap, `${type} reports an overlapping ref`).toEqual([]);
    }
  });

  it('only ever reports well-formed refs', () => {
    for (const type of EVENT_TYPES) {
      const { introduces, references } = refsFor(type);
      for (const ref of [...introduces, ...references]) {
        expect(['entity', 'track', 'character'], `${type}`).toContain(ref.kind);
        expect(typeof ref.id, `${type}`).toBe('string');
      }
    }
  });

  it('names exactly the three types that bring something into being', () => {
    const introducing = EVENT_TYPES.filter((type) => refsFor(type).introduces.length > 0);
    expect(introducing.sort()).toEqual([
      'character.created',
      'connection.established',
      'entity.established',
      'incident.accepted',
      'location.added',
      'sector.configured',
      'starship.established',
      'track.created',
      'trouble.established',
    ]);
  });
});

describe('introduces', () => {
  it('reports the entity an entity.established brings into being (Beat 6)', () => {
    expect(refsFor('entity.established').introduces).toEqual<EntityRef[]>([
      { kind: 'entity', id: SURVIVOR },
    ]);
  });

  it('reports the track a track.created brings into being (Beat 8)', () => {
    expect(refsFor('track.created').introduces).toEqual<EntityRef[]>([
      { kind: 'track', id: CLOCK_TRACK },
    ]);
  });

  it('reports nothing for an event that only refers to what already exists', () => {
    expect(refsFor('track.advanced').introduces).toEqual([]);
    expect(refsFor('track.advanced').references).toEqual<EntityRef[]>([
      { kind: 'track', id: CLOCK_TRACK },
    ]);
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
    expect(refsFor('scene.started').references).toEqual<EntityRef[]>([
      { kind: 'entity', id: STATION },
    ]);

    expect(
      EVENT_TYPE_META['scene.started'].references({
        sceneId: SCENE_ID,
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

  it('reports the oracle rolls an entity was grounded in as data, not as refs', () => {
    // groundedIn points at events, not entities — a void that removed a
    // grounding roll does not orphan the NPC, so it is not a containment
    // concern and must not appear here.
    const refs = EVENT_TYPE_META['entity.established'].references(
      SAMPLE_PAYLOADS['entity.established'],
    );
    expect(refs.map(refKey)).not.toContain(`entity:${testEventId(11)}`);
  });
});

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
