import { describe, expect, it } from 'vitest';

import { EVENT_TYPE_META, EVENT_TYPES, type EventType } from '@astrolabe/shared';
import { SAMPLE_PAYLOADS } from '@astrolabe/shared/test-fixtures';

import { project } from './project.js';
import {
  AI_ACTOR,
  CLOCK_TRACK,
  JUNO,
  PLAYER_ACTOR,
  SCENE_ID,
  SESSION_ID,
  SURVIVOR,
  VESNA,
  VOW_TRACK,
  character,
  goldenSessionPrelude,
  type LogBuilder,
} from './fixtures.js';

/**
 * `EVENT_TYPE_META.mutatesState` was a claim when it was written in task
 * 2.2, because the projector that defines the answer did not exist yet.
 * This is the test that owes it: for every type, the flag must be true
 * exactly when appending such an event changes the projection.
 *
 * A type is probed against a setup that makes it *capable* of mutating —
 * otherwise a `true` flag would look false for the wrong reason. That is
 * how `move.invoked` was caught: it only changes state when the actor is
 * holding a bonus to spend.
 */
interface Probe {
  /** Appended before the probe, to make the probe meaningful. */
  readonly setup?: (b: LogBuilder) => void;
  readonly probe: (b: LogBuilder) => void;
}

const OTHER_CHARACTER = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const LOCATION_A = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const LOCATION_B = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';

const PROBES: { readonly [T in EventType]: Probe } = {
  'campaign.created': {
    probe: (b) =>
      b.add('campaign.created', {
        name: 'A different campaign',
        settings: { narrationLatitude: 'minimal', narrationLength: 'shorter', rerollCap: 1 },
      }),
  },
  'character.created': {
    probe: (b) => b.add('character.created', character(OTHER_CHARACTER as never, 'Someone', 2)),
  },
  'character.proposed': {
    probe: (b) =>
      b.add('character.proposed', SAMPLE_PAYLOADS['character.proposed'] as never, {
        actor: AI_ACTOR,
      }),
  },
  'session.began': {
    probe: (b) => b.add('session.began', { sessionId: SESSION_ID, number: 3 }),
  },
  'session.ended': {
    probe: (b) =>
      b.add('session.ended', { summary: 'It ended.', openThreads: ['a'] }, { actor: AI_ACTOR }),
  },
  'scene.started': {
    probe: (b) => b.add('scene.started', { sceneId: SCENE_ID, title: 'Somewhere else' }),
  },
  'move.invoked': {
    // Only mutates when there is a bonus to spend, so the setup grants one.
    setup: (b) =>
      b.add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'advantage' },
        changes: [{ delta: { kind: 'bonus_next_move', characterId: VESNA, amount: 1 } }],
      }),
    probe: (b) =>
      b.add('move.invoked', {
        moveId: 'move:adventure/gather_information',
        actorCharacterId: VESNA,
        using: { using: 'stat', stat: 'wits' },
        adds: [],
      }),
  },
  'dice.rolled': {
    probe: (b) =>
      b.add('dice.rolled', {
        kind: 'action',
        actionDie: 3,
        adds: [],
        actionScore: 3,
        challengeDice: [8, 4],
        tier: 'miss',
        isMatch: false,
        rng: { source: 'seeded', seed: 1 },
      }),
  },
  'momentum.burned': {
    probe: (b) =>
      b.add('momentum.burned', {
        characterId: VESNA,
        rollEventId: b.at(1).id,
        tierBefore: 'weak_hit',
        tierAfter: 'strong_hit',
      }),
  },
  'move.choice_made': {
    probe: (b) =>
      b.add('move.choice_made', {
        moveId: 'move:suffer/endure-harm',
        tier: 'weak_hit',
        choiceId: 'eh-weak',
        optionIds: [],
        rollEventId: b.at(1).id,
      }),
  },
  'move.method_chosen': {
    probe: (b) =>
      b.add('move.method_chosen', {
        moveId: 'move:suffer/pay_the_price',
        optionId: 'table',
      }),
  },
  'move.chained': {
    probe: (b) =>
      b.add('move.chained', {
        fromMoveId: 'move:adventure/face_danger',
        toMoveId: 'move:suffer/pay_the_price',
        mode: 'offer',
        reason: 'miss',
      }),
  },
  'oracle.rolled': {
    probe: (b) =>
      b.add('oracle.rolled', {
        oracleId: 'oracle:moves/pay_the_price',
        roll: 78,
        rowText: 'You are harmed.',
      }),
  },
  'amount.proposed': {
    probe: (b) =>
      b.add(
        'amount.proposed',
        {
          moveId: 'move:suffer/endure-harm',
          characterId: VESNA,
          meter: 'health',
          amount: -2,
          reason: 'probe',
        },
        { actor: AI_ACTOR },
      ),
  },
  'amount.committed': {
    probe: (b) =>
      b.add('amount.committed', {
        moveId: 'move:suffer/endure-harm',
        characterId: VESNA,
        meter: 'health',
        amount: -1,
      }),
  },
  'state.changed': {
    probe: (b) =>
      b.add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'probe' },
        changes: [{ delta: { kind: 'momentum', characterId: JUNO, delta: 1 } }],
      }),
  },
  'state.overridden': {
    probe: (b) =>
      b.add(
        'state.overridden',
        { target: { kind: 'momentum', characterId: JUNO }, from: 3, to: 4 },
        { actor: PLAYER_ACTOR },
      ),
  },
  'track.created': {
    probe: (b) =>
      b.add(
        'track.created',
        {
          kind: 'clock',
          trackId: CLOCK_TRACK,
          title: 'Station power failing',
          segments: 4,
          cause: { kind: 'ai_judgement', reason: 'probe' },
        },
        { actor: AI_ACTOR },
      ),
  },
  'track.advanced': {
    probe: (b) =>
      b.add('track.advanced', {
        trackId: VOW_TRACK,
        ticks: 4,
        cause: { kind: 'ai_judgement', reason: 'probe' },
      }),
  },
  'entity.established': {
    probe: (b) =>
      b.add(
        'entity.established',
        {
          entityId: SURVIVOR,
          kind: 'npc',
          name: 'Sura Vance',
          fields: {},
          provenance: { establishedBy: 'ai', groundedIn: [] },
        },
        { actor: AI_ACTOR },
      ),
  },
  'narration.written': {
    probe: (b) =>
      b.add(
        'narration.written',
        { role: 'beat', text: 'Words.', groundedIn: [] },
        { actor: AI_ACTOR },
      ),
  },
  'narration.correction_requested': {
    probe: (b) =>
      b.add(
        'narration.correction_requested',
        { targetEventId: b.at(1).id, note: 'Not quite.' },
        { actor: PLAYER_ACTOR },
      ),
  },
  'narration.revised': {
    probe: (b) =>
      b.add(
        'narration.revised',
        { targetEventId: b.at(1).id, text: 'Better.' },
        { actor: AI_ACTOR },
      ),
  },
  'narration.withdrawn': {
    probe: (b) =>
      b.add('narration.withdrawn', SAMPLE_PAYLOADS['narration.withdrawn'], { actor: AI_ACTOR }),
  },
  'event.voided': {
    // Voids the vow the prelude created, so the tracks differ.
    probe: (b) =>
      b.add(
        'event.voided',
        {
          targetEventId: b.at(b.length).id,
          kind: 'player_void',
          reason: 'probe',
          cascaded: [b.at(b.length).id],
        },
        { actor: PLAYER_ACTOR },
      ),
  },
  'ai.completed': {
    probe: (b) =>
      b.add(
        'ai.completed',
        { provider: 'anthropic', model: 'm', purpose: 'probe', inputTokens: 10, outputTokens: 5 },
        { actor: AI_ACTOR },
      ),
  },
  'ai.failed': {
    // With tokens, so the probe can see it counted (D-113).
    probe: (b) =>
      b.add(
        'ai.failed',
        {
          provider: 'anthropic',
          model: 'm',
          purpose: 'probe',
          errorKind: 'unavailable',
          message: 'probe',
          attempts: 1,
          inputTokens: 10,
        },
        { actor: AI_ACTOR },
      ),
  },
  'truth.set': {
    probe: (b) =>
      b.add('truth.set', {
        oracleId: 'oracle:cataclysm',
        source: 'written',
        text: 'A slow climate collapse, not a single cataclysm.',
      }),
  },
  'sector.route_added': {
    probe: (b) =>
      b.add('sector.route_added', {
        fromLocationId: LOCATION_A as never,
        toLocationId: LOCATION_B as never,
      }),
  },
};

function projectionsAround(type: EventType): { before: unknown; after: unknown } {
  const probe = PROBES[type];

  const base = goldenSessionPrelude();
  probe.setup?.(base);
  const withProbe = goldenSessionPrelude();
  probe.setup?.(withProbe);
  probe.probe(withProbe);

  return { before: project(base.build()), after: project(withProbe.build()) };
}

describe('mutatesState is a checked fact, not a claim', () => {
  it('covers every event type with a probe', () => {
    expect(Object.keys(PROBES).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it.each([...EVENT_TYPES])('%s changes the projection iff mutatesState says so', (type) => {
    const { before, after } = projectionsAround(type);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    expect(changed, `${type}: mutatesState is ${EVENT_TYPE_META[type].mutatesState}`).toBe(
      EVENT_TYPE_META[type].mutatesState,
    );
  });
});
