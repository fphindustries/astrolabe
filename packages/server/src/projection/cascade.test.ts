import { describe, expect, it } from 'vitest';

import type { AstrolabeEvent, CommandId, EventId } from '@astrolabe/shared';

import { planVoid } from './cascade.js';
import { project } from './project.js';
import {
  AI_ACTOR,
  CLOCK_TRACK,
  JUNO,
  PLAYER_ACTOR,
  ROOK,
  SURVIVOR,
  VOW_TRACK,
  goldenSessionPrelude,
  type LogBuilder,
} from './fixtures.js';

/**
 * D-83 and D-84: what a void removes, and when it is refused.
 *
 * The cascade is computed here and stored on the event; the projector only
 * reads it. These tests are therefore about the *decision*, not the fold —
 * void-state.test.ts covers what the fold does with the answer.
 */

const ROLL = {
  kind: 'action',
  actionDie: 6,
  adds: [{ amount: 2, label: 'edge' }],
  actionScore: 8,
  challengeDice: [3, 4],
  tier: 'strong_hit',
  isMatch: false,
  rng: { source: 'seeded', seed: 1 },
} as const;

function cmd(n: number): CommandId {
  return `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}` as CommandId;
}

/** A move resolution: invocation, roll and effects, all in one command. */
function addMove(builder: LogBuilder, commandId: CommandId): LogBuilder {
  return builder
    .add(
      'move.invoked',
      {
        moveId: 'move:adventure/face_danger',
        actorCharacterId: ROOK,
        using: { using: 'stat', stat: 'edge' },
        adds: [{ amount: 2, label: 'edge' }],
      },
      { commandId },
    )
    .add('dice.rolled', ROLL, { commandId })
    .add(
      'state.changed',
      {
        cause: { kind: 'move_outcome', moveId: 'move:adventure/face_danger', tier: 'strong_hit' },
        changes: [{ delta: { kind: 'momentum', characterId: ROOK, delta: 1 }, clause: '+1' }],
      },
      { commandId },
    );
}

function planFor(events: readonly AstrolabeEvent[], target: EventId) {
  return planVoid(events, target);
}

describe('the cascade is the whole command, not one event', () => {
  it('voids the invocation and the effects along with the roll', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const events = builder.build();
    const roll = events.find((e) => e.type === 'dice.rolled') as AstrolabeEvent;

    const plan = planFor(events, roll.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    // All three events of the command — they were one decision.
    expect(plan.cascaded).toHaveLength(3);
    expect(plan.commands).toEqual([cmd(1)]);
  });

  it('follows causedBy into a later command', () => {
    // The AI's narration is its own command, caused by the roll.
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const roll = builder.at(builder.length - 1);
    builder.add(
      'narration.written',
      { role: 'beat', text: 'The bulkhead gives.', groundedIn: [] },
      { commandId: cmd(2), actor: AI_ACTOR, causedBy: roll.id },
    );

    const events = builder.build();
    const invoked = events.find((e) => e.type === 'move.invoked') as AstrolabeEvent;
    const plan = planFor(events, invoked.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    expect([...plan.commands].sort()).toEqual([cmd(1), cmd(2)]);
    expect(plan.cascaded).toHaveLength(4);
  });

  it('follows causality transitively, through a chain of commands', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const effects = builder.last();
    builder.add(
      'narration.written',
      { role: 'beat', text: 'First.', groundedIn: [] },
      { commandId: cmd(2), actor: AI_ACTOR, causedBy: effects.id },
    );
    const narration = builder.last();
    builder.add(
      'track.created',
      {
        kind: 'clock',
        trackId: CLOCK_TRACK,
        title: 'Station power failing',
        segments: 4,
        cause: { kind: 'ai_judgement', reason: 'load-shedding' },
      },
      { commandId: cmd(3), actor: AI_ACTOR, causedBy: narration.id },
    );

    const events = builder.build();
    const invoked = events.find((e) => e.type === 'move.invoked') as AstrolabeEvent;
    const plan = planFor(events, invoked.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    expect([...plan.commands].sort()).toEqual([cmd(1), cmd(2), cmd(3)]);
  });

  it('leaves an unrelated command alone', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    builder.add(
      'track.advanced',
      { trackId: VOW_TRACK, ticks: 4, cause: { kind: 'ai_judgement', reason: 'unrelated' } },
      { commandId: cmd(9), actor: AI_ACTOR },
    );

    const events = builder.build();
    const roll = events.find((e) => e.type === 'dice.rolled') as AstrolabeEvent;
    const plan = planFor(events, roll.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    expect(plan.commands).toEqual([cmd(1)]);
  });

  it('excludes token accounting from the cascade (D-85)', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    builder.add(
      'ai.completed',
      { provider: 'anthropic', model: 'm', purpose: 'beat', inputTokens: 900, outputTokens: 140 },
      { commandId: cmd(1), actor: AI_ACTOR },
    );

    const events = builder.build();
    const roll = events.find((e) => e.type === 'dice.rolled') as AstrolabeEvent;
    const plan = planFor(events, roll.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    const aiCall = events.find((e) => e.type === 'ai.completed') as AstrolabeEvent;
    expect(plan.cascaded).not.toContain(aiCall.id);
  });

  it('describes what the player is about to un-happen', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const events = builder.build();
    const roll = events.find((e) => e.type === 'dice.rolled') as AstrolabeEvent;
    const plan = planFor(events, roll.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    expect(plan.summary).toContain('a strong hit');
    expect(plan.summary.some((s) => s.includes('move:adventure/face_danger'))).toBe(true);
  });
});

describe('referential containment (D-83)', () => {
  /** Beat 6 establishes the survivor; Beat 8's clock is ticked because of them. */
  function entityThenReference() {
    const builder = goldenSessionPrelude().add(
      'entity.established',
      {
        entityId: SURVIVOR,
        kind: 'npc',
        name: 'Sura Vance',
        fields: { disposition: 'wary' },
        provenance: { establishedBy: 'ai', groundedIn: [] },
      },
      { commandId: cmd(1), actor: AI_ACTOR },
    );
    const established = builder.last();
    builder.add(
      'scene.started',
      {
        sceneId: '33333333-3333-4333-8333-333333333333' as never,
        title: 'With the survivor',
        locationId: SURVIVOR,
      },
      { commandId: cmd(2) },
    );
    return { builder, establishedId: established.id };
  }

  it('refuses a void that would orphan something later in the log', () => {
    const { builder, establishedId } = entityThenReference();
    const plan = planFor(builder.build(), establishedId);

    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('referenced_outside_cascade');
    expect(plan.blockedBy?.[0]?.ref).toEqual({ kind: 'entity', id: SURVIVOR });
  });

  it('points at the event that blocks it, so the player can act on it', () => {
    const { builder, establishedId } = entityThenReference();
    const plan = planFor(builder.build(), establishedId);
    if (plan.ok) throw new Error('expected a refusal');

    const blocker = builder.build().find((e) => e.id === plan.blockedBy?.[0]?.eventId);
    expect(blocker?.type).toBe('scene.started');
  });

  it('allows the void once the blocking event is itself voided', () => {
    const { builder, establishedId } = entityThenReference();
    const blocking = builder
      .build()
      .find((e) => e.type === 'scene.started' && e.commandId === cmd(2));
    builder.add(
      'event.voided',
      {
        targetEventId: blocking?.id as EventId,
        kind: 'player_void',
        reason: 'wrong scene',
        cascaded: [blocking?.id as EventId],
      },
      { actor: PLAYER_ACTOR },
    );

    expect(planFor(builder.build(), establishedId).ok).toBe(true);
  });

  it('allows a void whose subtree introduces nothing', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const events = builder.build();
    const roll = events.find((e) => e.type === 'dice.rolled') as AstrolabeEvent;
    expect(planFor(events, roll.id).ok).toBe(true);
  });

  it('does not count a reference from inside the cascade as a blocker', () => {
    // The move references Rook, and nothing in its own subtree introduced
    // him — a self-contained cascade must not block itself.
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const events = builder.build();
    const invoked = events.find((e) => e.type === 'move.invoked') as AstrolabeEvent;
    expect(planFor(events, invoked.id).ok).toBe(true);
  });

  it('refuses when a track created in the subtree is ticked later', () => {
    const builder = goldenSessionPrelude().add(
      'track.created',
      {
        kind: 'clock',
        trackId: CLOCK_TRACK,
        title: 'Station power failing',
        segments: 4,
        cause: { kind: 'ai_judgement', reason: 'load-shedding' },
      },
      { commandId: cmd(1), actor: AI_ACTOR },
    );
    const created = builder.last();
    builder.add(
      'track.advanced',
      { trackId: CLOCK_TRACK, ticks: 1, cause: { kind: 'ai_judgement', reason: 'more pressure' } },
      { commandId: cmd(2), actor: AI_ACTOR },
    );

    const plan = planFor(builder.build(), created.id);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.blockedBy?.[0]?.ref).toEqual({ kind: 'track', id: CLOCK_TRACK });
  });
});

describe('the session bound (D-84)', () => {
  it('refuses an event from an earlier session', () => {
    const builder = goldenSessionPrelude().add('narration.written', {
      role: 'beat',
      text: 'Last session.',
      groundedIn: [],
    });
    const oldPassage = builder.last();
    builder.add('session.began', {
      sessionId: '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e' as never,
      number: 3,
    });

    const plan = planFor(builder.build(), oldPassage.id);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('outside_current_session');
    expect(plan.detail).toMatch(/correction/i);
  });

  it('allows an event in the current session', () => {
    const builder = goldenSessionPrelude().add('narration.written', {
      role: 'beat',
      text: 'This session.',
      groundedIn: [],
    });
    expect(planFor(builder.build(), builder.last().id).ok).toBe(true);
  });

  it('refuses a campaign-setup event, which belongs to no session', () => {
    const builder = goldenSessionPrelude();
    const created = builder.at(1);
    const plan = planFor(builder.build(), created.id);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('outside_current_session');
  });
});

describe('refusals that are not about the cascade', () => {
  it('refuses an event that does not exist', () => {
    const plan = planFor(
      goldenSessionPrelude().build(),
      'ffffffff-0000-4000-8000-000000000000' as EventId,
    );
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('not_found');
  });

  it('refuses to void token accounting (D-85)', () => {
    const builder = goldenSessionPrelude().add(
      'ai.completed',
      { provider: 'anthropic', model: 'm', purpose: 'beat', inputTokens: 10, outputTokens: 2 },
      { actor: AI_ACTOR },
    );
    const plan = planFor(builder.build(), builder.last().id);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('not_voidable');
  });

  it('refuses to void an event that is already voided', () => {
    const builder = goldenSessionPrelude().add('narration.written', {
      role: 'beat',
      text: 'A passage.',
      groundedIn: [],
    });
    const passage = builder.last();
    builder.add(
      'event.voided',
      {
        targetEventId: passage.id,
        kind: 'player_void',
        reason: 'first',
        cascaded: [passage.id],
      },
      { actor: PLAYER_ACTOR },
    );

    const plan = planFor(builder.build(), passage.id);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('already_voided');
  });

  it('refuses to void a void', () => {
    const builder = goldenSessionPrelude().add('narration.written', {
      role: 'beat',
      text: 'A passage.',
      groundedIn: [],
    });
    const passage = builder.last();
    builder.add(
      'event.voided',
      { targetEventId: passage.id, kind: 'player_void', reason: 'x', cascaded: [passage.id] },
      { actor: PLAYER_ACTOR },
    );

    const plan = planFor(builder.build(), builder.last().id);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.reason).toBe('not_voidable');
  });
});

describe('the plan reprojects to the state before the beat', () => {
  it('restores momentum when the cascade is applied (Beat 7)', () => {
    const builder = addMove(goldenSessionPrelude(), cmd(1));
    const before = project(goldenSessionPrelude().build());
    const events = builder.build();
    const roll = events.find((e) => e.type === 'dice.rolled') as AstrolabeEvent;

    const plan = planFor(events, roll.id);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    builder.add(
      'event.voided',
      {
        targetEventId: roll.id,
        kind: 'player_void',
        reason: 'Rook is forcing the bulkhead, not slipping past it',
        cascaded: [...plan.cascaded],
      },
      { actor: PLAYER_ACTOR },
    );
    const voided = builder.build();

    expect(project(voided).characters[ROOK]?.momentum.value).toBe(
      before.characters[ROOK]?.momentum.value,
    );
    expect(project(voided).characters[JUNO]).toEqual(before.characters[JUNO]);
  });
});
