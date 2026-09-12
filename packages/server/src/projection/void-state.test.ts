import { describe, expect, it } from 'vitest';

import type { AstrolabeEvent, EventId } from '@astrolabe/shared';

import { project } from './project.js';
import { activeVoidsFor, computeVoidState, isSuppressed } from './void-state.js';
import {
  AI_ACTOR,
  CLOCK_TRACK,
  JUNO,
  PLAYER_ACTOR,
  ROOK,
  SURVIVOR,
  goldenSessionPrelude,
  log,
} from './fixtures.js';

/**
 * A11 and D-83. The cascade set is computed at write time and stored on the
 * void event; the projector only reads it. That keeps the fold pure and
 * makes a void auditable — "this removed these six events" — and means a
 * later change to the causality model cannot silently alter what an old
 * void did.
 */
describe('the void fold', () => {
  it('suppresses every event a void names, including the target', () => {
    const builder = goldenSessionPrelude().add('state.changed', {
      cause: { kind: 'ai_judgement', reason: 'test' },
      changes: [{ delta: { kind: 'momentum', characterId: JUNO, delta: 1 } }],
    });
    const target = builder.last();
    const events = builder
      .add(
        'event.voided',
        {
          targetEventId: target.id,
          kind: 'player_void',
          reason: 'wrong stat',
          cascaded: [target.id],
        },
        { actor: PLAYER_ACTOR },
      )
      .build();

    const voids = computeVoidState(events);
    expect(isSuppressed(target, voids)).toBe(true);
    // Juno is back to the momentum the prelude gave him.
    expect(project(events).characters[JUNO]?.momentum.value).toBe(3);
  });

  it('tracks void ids as a set, so overlapping voids do not clobber each other', () => {
    // Void A covers {5, 6}; void B covers {6, 7}. Event 6 must carry both.
    // A boolean, or last-writer-wins, gets this wrong — and reinstating A
    // would then wrongly un-void 6. Milestone 1 writes no reinstatement
    // (D-86), but the set is what keeps that reversible without a rewrite.
    const builder = goldenSessionPrelude();
    const five = builder.at(builder.length - 2).id;
    const six = builder.at(builder.length - 1).id;
    const seven = builder.at(builder.length).id;

    const events = builder
      .add(
        'event.voided',
        { targetEventId: five, kind: 'player_void', reason: 'A', cascaded: [five, six] },
        { actor: PLAYER_ACTOR },
      )
      .add(
        'event.voided',
        { targetEventId: seven, kind: 'player_void', reason: 'B', cascaded: [six, seven] },
        { actor: PLAYER_ACTOR },
      )
      .build();

    const voids = computeVoidState(events);
    const voidA = builder.at(builder.length - 1).id;
    const voidB = builder.at(builder.length).id;

    expect(activeVoidsFor(five, voids)).toEqual([voidA]);
    expect([...activeVoidsFor(six, voids)].sort()).toEqual([voidA, voidB].sort());
    expect(activeVoidsFor(seven, voids)).toEqual([voidB]);
  });

  it('leaves events outside the cascade untouched', () => {
    const builder = goldenSessionPrelude().add('state.changed', {
      cause: { kind: 'ai_judgement', reason: 'voided later' },
      changes: [{ delta: { kind: 'momentum', characterId: JUNO, delta: 1 } }],
    });
    const target = builder.last();
    builder.add(
      'track.created',
      {
        kind: 'clock',
        trackId: CLOCK_TRACK,
        title: 'Station power failing',
        segments: 4,
        cause: { kind: 'ai_judgement', reason: 'unrelated' },
      },
      { actor: AI_ACTOR },
    );
    const events = builder
      .add(
        'event.voided',
        { targetEventId: target.id, kind: 'player_void', reason: 'mistake', cascaded: [target.id] },
        { actor: PLAYER_ACTOR },
      )
      .build();

    const state = project(events);
    expect(state.characters[JUNO]?.momentum.value).toBe(3);
    // The clock that happened in between survives.
    expect(state.tracks[CLOCK_TRACK]?.title).toBe('Station power failing');
  });

  it('counts token usage inside a voided cascade anyway (D-85)', () => {
    // The tokens were spent whatever the fiction now says. A counter that
    // un-spends them would lie about cost.
    const builder = goldenSessionPrelude()
      .add(
        'narration.written',
        { role: 'beat', text: 'A passage.', groundedIn: [] },
        { actor: AI_ACTOR },
      )
      .add(
        'ai.completed',
        { provider: 'anthropic', model: 'm', purpose: 'beat', inputTokens: 900, outputTokens: 140 },
        { actor: AI_ACTOR },
      );
    const aiCall = builder.last();
    const narration = builder.at(builder.length - 1);
    const events = builder
      .add(
        'event.voided',
        {
          targetEventId: narration.id,
          kind: 'player_void',
          reason: 'that beat did not happen',
          cascaded: [narration.id, aiCall.id],
        },
        { actor: PLAYER_ACTOR },
      )
      .build();

    const voids = computeVoidState(events);
    expect(isSuppressed(narration, voids)).toBe(true);
    expect(isSuppressed(aiCall, voids)).toBe(false);
    expect(project(events).session?.tokenUsage).toEqual({ input: 900, output: 140 });
  });

  it('never suppresses a void itself', () => {
    const builder = goldenSessionPrelude();
    const target = builder.last().id;
    const events = builder
      .add(
        'event.voided',
        { targetEventId: target, kind: 'player_void', reason: 'x', cascaded: [target] },
        { actor: PLAYER_ACTOR },
      )
      .build();
    const theVoid = builder.last();
    const nested = [
      ...events,
      ...log()
        .add(
          'event.voided',
          { targetEventId: theVoid.id, kind: 'player_void', reason: 'y', cascaded: [theVoid.id] },
          { actor: PLAYER_ACTOR },
        )
        .build(),
    ];
    expect(isSuppressed(theVoid, computeVoidState(nested))).toBe(false);
  });
});

describe('Beat 6: a visible AI reroll', () => {
  it('strikes the discarded roll through without a cascade (A9, D-18)', () => {
    // The reroll reuses the void mechanism rather than getting a type of its
    // own. Its cascade is empty by construction — nothing has consumed the
    // result yet — and Milestone 1 ships this as display only (D-86).
    const builder = goldenSessionPrelude().add(
      'entity.established',
      {
        entityId: SURVIVOR,
        kind: 'npc',
        name: 'Sura Vance',
        fields: { disposition: 'wary' },
        provenance: { establishedBy: 'ai', groundedIn: [] },
      },
      { actor: AI_ACTOR },
    );
    const discarded = builder.last();
    const events = builder
      .add(
        'event.voided',
        {
          targetEventId: discarded.id,
          kind: 'reroll',
          reason: 'contradicts the evacuation logs',
          cascaded: [discarded.id],
        },
        { actor: AI_ACTOR },
      )
      .build();

    const voided = events.at(-1) as AstrolabeEvent;
    if (voided.type !== 'event.voided') throw new Error('expected a void');
    expect(voided.payload.kind).toBe('reroll');
    expect(voided.payload.reason).toMatch(/evacuation logs/);
    // The discarded result no longer stands.
    expect(project(events).entities[SURVIVOR]).toBeUndefined();
  });
});

describe('Beat 7: void and redo', () => {
  it('projects only the redone roll, and keeps both in the log', () => {
    const builder = goldenSessionPrelude();

    // The +edge roll: a strong hit, applied, then voided.
    builder
      .add('move.invoked', {
        moveId: 'move:adventure/face_danger',
        actorCharacterId: ROOK,
        using: { using: 'stat', stat: 'edge' },
        adds: [{ amount: 2, label: 'edge' }],
        actionText: 'Rook forces the sealed bulkhead.',
      })
      .add('dice.rolled', {
        kind: 'action',
        actionDie: 6,
        adds: [{ amount: 2, label: 'edge' }],
        actionScore: 8,
        challengeDice: [3, 4],
        tier: 'strong_hit',
        isMatch: false,
        rng: { source: 'seeded', seed: 1 },
      })
      .add('state.changed', {
        cause: { kind: 'move_outcome', moveId: 'move:adventure/face_danger', tier: 'strong_hit' },
        changes: [
          { delta: { kind: 'momentum', characterId: ROOK, delta: 1 }, clause: '+1 momentum' },
        ],
      });

    const applied = builder.last();
    const rolled = builder.at(builder.length - 1);
    const invoked = builder.at(builder.length - 2);

    builder.add(
      'event.voided',
      {
        targetEventId: rolled.id,
        kind: 'player_void',
        reason: 'Rook is forcing the bulkhead, not slipping past it',
        cascaded: [invoked.id, rolled.id, applied.id],
      },
      { actor: PLAYER_ACTOR },
    );

    // The redo, with +iron: a miss, and Endure Harm for -1 health.
    const events = builder
      .add('move.invoked', {
        moveId: 'move:adventure/face_danger',
        actorCharacterId: ROOK,
        using: { using: 'stat', stat: 'iron' },
        adds: [{ amount: 2, label: 'iron' }],
        actionText: 'Rook forces the sealed bulkhead.',
      })
      .add('dice.rolled', {
        kind: 'action',
        actionDie: 3,
        adds: [{ amount: 2, label: 'iron' }],
        actionScore: 5,
        challengeDice: [8, 4],
        tier: 'miss',
        isMatch: false,
        rng: { source: 'seeded', seed: 2 },
      })
      .add('state.changed', {
        cause: { kind: 'move_outcome', moveId: 'move:suffer/endure_harm', tier: 'weak_hit' },
        changes: [
          {
            delta: { kind: 'meter', characterId: ROOK, meter: 'health', delta: -1 },
            clause: 'Endure Harm',
          },
        ],
      })
      .build();

    const state = project(events);
    // The strong hit's +1 momentum is gone; the miss's -1 health stands.
    expect(state.characters[ROOK]?.momentum.value).toBe(2);
    expect(state.characters[ROOK]?.meters.health.value).toBe(4);

    // Both rolls are still in the log, in seq order (D-27).
    const rolls = events.filter((e) => e.type === 'dice.rolled');
    expect(rolls).toHaveLength(2);
    const voids = computeVoidState(events);
    expect(isSuppressed(rolls[0] as AstrolabeEvent, voids)).toBe(true);
    expect(isSuppressed(rolls[1] as AstrolabeEvent, voids)).toBe(false);
  });
});

describe('computeVoidState', () => {
  it('returns an empty map for a log with no voids', () => {
    expect(computeVoidState(goldenSessionPrelude().build()).size).toBe(0);
  });

  it('reports no active voids for an untouched event', () => {
    expect(activeVoidsFor('missing' as EventId, computeVoidState([]))).toEqual([]);
  });
});
