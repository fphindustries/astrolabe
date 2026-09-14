import { describe, expect, it } from 'vitest';

import type {
  AstrolabeEvent,
  CommandId,
  EventId,
  NarrativeBeat,
  NarrativeLog,
} from '@astrolabe/shared';

import { buildNarrativeLog } from './narrative-log.js';
import {
  AI_ACTOR,
  JUNO,
  PLAYER_ACTOR,
  ROOK,
  VESNA,
  goldenSessionPrelude,
  log,
} from './fixtures.js';

/**
 * The narrative log is what the player reads, so its job is the opposite of
 * the projector's in one respect: the projector *skips* voided events, and
 * the log *keeps* them, struck through with the reason (D-27, A9, A11).
 */

const ROLL = {
  kind: 'action',
  actionDie: 3,
  adds: [{ amount: 2, label: 'wits' }],
  actionScore: 5,
  challengeDice: [6, 3],
  tier: 'weak_hit',
  isMatch: false,
  rng: { source: 'seeded', seed: 7 },
} as const;

describe('oracle chips (8.2, D-17)', () => {
  it('puts the rolls a passage was grounded in under it, struck when discarded', () => {
    const builder = goldenSessionPrelude();
    builder.add('oracle.rolled', {
      oracleId: 'oracle:characters/role',
      roll: 41,
      rowText: 'Navigator',
      recipeId: 'recipe:npc',
      slot: 'role',
    });
    const kept = builder.last();
    builder.add('oracle.rolled', {
      oracleId: 'oracle:characters/goal',
      roll: 7,
      rowText: 'Obtain an object',
    });
    const discarded = builder.last();
    builder.add('event.voided', {
      targetEventId: discarded.id,
      kind: 'reroll',
      reason: 'Contradicts the logs',
      cascaded: [discarded.id],
    });
    builder.add(
      'narration.written',
      { role: 'world', text: 'A voice on comms.', groundedIn: [kept.id, discarded.id] },
      { actor: AI_ACTOR },
    );
    const passage = builder.last();

    const entry = buildNarrativeLog(builder.build())
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.id === passage.id);

    expect(entry?.chips).toEqual([
      {
        eventId: kept.id,
        oracleId: 'oracle:characters/role',
        slot: 'role',
        roll: 41,
        rowText: 'Navigator',
        voided: false,
      },
      {
        eventId: discarded.id,
        oracleId: 'oracle:characters/goal',
        roll: 7,
        rowText: 'Obtain an object',
        voided: true,
        discardedBecause: 'Contradicts the logs',
      },
    ]);
  });
});

describe('rerolled chips (8.3, D-70)', () => {
  it('puts a reroll’s discarded predecessors before the survivor, struck, with the reason, once', () => {
    const builder = goldenSessionPrelude();
    builder.add('oracle.rolled', {
      oracleId: 'oracle:characters/goal',
      roll: 91,
      rowText: 'Obtain an object',
      slot: 'goal',
    });
    const first = builder.last();
    builder.add(
      'event.voided',
      {
        targetEventId: first.id,
        kind: 'reroll',
        reason: 'The logs say nothing was left',
        cascaded: [first.id],
      },
      { actor: AI_ACTOR },
    );
    builder.add('oracle.rolled', {
      oracleId: 'oracle:core/action',
      roll: 3,
      rowText: 'Advance',
      slot: 'goal',
      rerollOf: first.id,
    });
    const action = builder.last();
    builder.add('oracle.rolled', {
      oracleId: 'oracle:core/theme',
      roll: 4,
      rowText: 'Supply',
      slot: 'goal',
      rerollOf: first.id,
    });
    const theme = builder.last();
    builder.add(
      'narration.written',
      { role: 'world', text: 'x', groundedIn: [action.id, theme.id] },
      { actor: AI_ACTOR },
    );
    const passage = builder.last();

    const chips = buildNarrativeLog(builder.build())
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.id === passage.id)?.chips;

    expect(chips?.map((c) => [c.eventId, c.voided, c.discardedBecause])).toEqual([
      [first.id, true, 'The logs say nothing was left'],
      [action.id, false, undefined],
      [theme.id, false, undefined],
    ]);
  });
});

describe('grouping into beats', () => {
  it('renders one command as one beat, not one row per event', () => {
    const builder = goldenSessionPrelude();
    // One command writing three events: the move, the roll, the effects.
    const commandId = 'cccccccc-0000-4000-8000-000000000001' as CommandId;
    builder
      .add(
        'move.invoked',
        {
          moveId: 'move:adventure/gather_information',
          actorCharacterId: JUNO,
          using: { using: 'stat', stat: 'wits' },
          adds: [{ amount: 2, label: 'wits' }],
          actionText: 'Juno jacks into the docking port.',
        },
        { commandId },
      )
      .add('dice.rolled', ROLL, { commandId })
      .add(
        'narration.written',
        { role: 'beat', text: 'The logs are fragmentary.', groundedIn: [] },
        { commandId, actor: AI_ACTOR },
      );

    const { beats } = buildNarrativeLog(builder.build());
    const last = beats.at(-1);

    expect(last?.commandId).toBe(commandId);
    expect(last?.entries).toHaveLength(3);
    expect(last?.entries.map((e) => e.event.type)).toEqual([
      'move.invoked',
      'dice.rolled',
      'narration.written',
    ]);
  });

  it('orders beats oldest first, which is reading order', () => {
    const { beats } = buildNarrativeLog(goldenSessionPrelude().build());
    const seqs = beats.map((b) => b.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it('renders only the types the catalogue marks as narrative', () => {
    const events = goldenSessionPrelude()
      .add(
        'ai.completed',
        { provider: 'anthropic', model: 'm', purpose: 'beat', inputTokens: 10, outputTokens: 2 },
        { actor: AI_ACTOR },
      )
      .add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'x' },
        changes: [{ delta: { kind: 'momentum', characterId: JUNO, delta: 1 } }],
      })
      .build();
    const types = buildNarrativeLog(events).beats.flatMap((b) =>
      b.entries.map((e) => e.event.type),
    );

    // Bookkeeping stays out of the story.
    expect(types).not.toContain('ai.completed');
    expect(types).not.toContain('state.changed');
    expect(types).toContain('scene.started');
  });

  it('takes the actor and timestamp of the beat from its first event', () => {
    const builder = goldenSessionPrelude();
    const commandId = 'cccccccc-0000-4000-8000-000000000002' as CommandId;
    builder
      .add(
        'move.invoked',
        {
          moveId: 'move:adventure/face_danger',
          actorCharacterId: ROOK,
          using: { using: 'stat', stat: 'iron' },
          adds: [],
        },
        { commandId, actor: PLAYER_ACTOR },
      )
      .add('dice.rolled', ROLL, { commandId, actor: { kind: 'system' } });

    const beat = buildNarrativeLog(builder.build()).beats.at(-1);
    expect(beat?.actorKind).toBe('player');
  });
});

describe('voided events stay visible (D-27, A11)', () => {
  function voidedLog() {
    const builder = goldenSessionPrelude().add('dice.rolled', ROLL);
    const rolled = builder.last();
    builder.add(
      'event.voided',
      {
        targetEventId: rolled.id,
        kind: 'player_void',
        reason: 'Rook is forcing the bulkhead, not slipping past it',
        cascaded: [rolled.id],
      },
      { actor: PLAYER_ACTOR },
    );
    return { events: builder.build(), rolledId: rolled.id };
  }

  it('keeps the voided roll in the log and marks it', () => {
    const { events, rolledId } = voidedLog();
    const entries = buildNarrativeLog(events).beats.flatMap((b) => b.entries);
    const rollEntry = entries.find((e) => e.event.id === rolledId);

    expect(rollEntry).toBeDefined();
    expect(rollEntry?.voided).toBe(true);
    expect(rollEntry?.voidedBy[0]?.reason).toMatch(/forcing the bulkhead/);
    expect(rollEntry?.voidedBy[0]?.kind).toBe('player_void');
  });

  it('shows the void itself as part of the story', () => {
    const { events } = voidedLog();
    const types = buildNarrativeLog(events).beats.flatMap((b) =>
      b.entries.map((e) => e.event.type),
    );
    expect(types).toContain('event.voided');
  });

  it('marks a beat voided only when every entry in it is', () => {
    const builder = goldenSessionPrelude();
    const commandId = 'cccccccc-0000-4000-8000-000000000003' as CommandId;
    builder
      .add(
        'move.invoked',
        {
          moveId: 'move:adventure/face_danger',
          actorCharacterId: ROOK,
          using: { using: 'stat', stat: 'edge' },
          adds: [],
        },
        { commandId },
      )
      .add('dice.rolled', ROLL, { commandId });
    const invoked = builder.at(builder.length - 1);
    const rolled = builder.last();

    const partial = buildNarrativeLog(
      builder
        .add(
          'event.voided',
          { targetEventId: rolled.id, kind: 'player_void', reason: 'x', cascaded: [rolled.id] },
          { actor: PLAYER_ACTOR },
        )
        .build(),
    );
    expect(beatFor(partial, commandId)?.voided).toBe(false);

    const whole = buildNarrativeLog(
      builder
        .add(
          'event.voided',
          { targetEventId: invoked.id, kind: 'player_void', reason: 'y', cascaded: [invoked.id] },
          { actor: PLAYER_ACTOR },
        )
        .build(),
    );
    expect(beatFor(whole, commandId)?.voided).toBe(true);
  });

  it('does not strike through an event the cascade cannot void (D-85)', () => {
    // ai.completed is exempt from void, and the log agrees with the
    // projector rather than inventing its own answer.
    const builder = goldenSessionPrelude().add(
      'narration.written',
      { role: 'beat', text: 'A passage.', groundedIn: [] },
      { actor: AI_ACTOR },
    );
    const narration = builder.last();
    const events = builder
      .add(
        'event.voided',
        {
          targetEventId: narration.id,
          kind: 'player_void',
          reason: 'that beat did not happen',
          cascaded: [narration.id],
        },
        { actor: PLAYER_ACTOR },
      )
      .build();

    const entry = buildNarrativeLog(events)
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.id === narration.id);
    expect(entry?.voided).toBe(true);
  });

  it('carries both reasons when two voids cover one event', () => {
    const builder = goldenSessionPrelude().add('dice.rolled', ROLL);
    const rolled = builder.last();
    const events = builder
      .add(
        'event.voided',
        { targetEventId: rolled.id, kind: 'player_void', reason: 'first', cascaded: [rolled.id] },
        { actor: PLAYER_ACTOR },
      )
      .add(
        'event.voided',
        { targetEventId: rolled.id, kind: 'reroll', reason: 'second', cascaded: [rolled.id] },
        { actor: AI_ACTOR },
      )
      .build();

    const entry = buildNarrativeLog(events)
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.id === rolled.id);
    expect(entry?.voidedBy.map((v) => v.reason).sort()).toEqual(['first', 'second']);
  });
});

describe('narration corrections (A15, D-73, Beat 9)', () => {
  function correctedLog(revisions: readonly string[]) {
    const builder = goldenSessionPrelude().add(
      'narration.written',
      { role: 'beat', text: 'Rook looks shaken.', groundedIn: [] },
      { actor: AI_ACTOR },
    );
    const original = builder.last();
    builder.add(
      'narration.correction_requested',
      { targetEventId: original.id, note: 'Rook is a veteran — annoyed, not rattled.' },
      { actor: PLAYER_ACTOR },
    );
    for (const text of revisions) {
      builder.add('narration.revised', { targetEventId: original.id, text }, { actor: AI_ACTOR });
    }
    return { events: builder.build(), originalId: original.id };
  }

  function narrationFor(events: readonly AstrolabeEvent[], id: EventId) {
    return buildNarrativeLog(events)
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.id === id)?.narration;
  }

  it('reads as the revision, with the original and the note retained', () => {
    const { events, originalId } = correctedLog([
      'Rook shakes the sparks off his sleeve, annoyed.',
    ]);
    const narration = narrationFor(events, originalId);

    expect(narration?.text).toBe('Rook shakes the sparks off his sleeve, annoyed.');
    expect(narration?.corrected).toBe(true);
    // D-73: both are retained, behind an affordance.
    expect(narration?.original).toBe('Rook looks shaken.');
    expect(narration?.note).toMatch(/veteran/);
  });

  it('reads as the latest of several revisions', () => {
    const { events, originalId } = correctedLog(['First try.', 'Second try.']);
    const narration = narrationFor(events, originalId);
    expect(narration?.text).toBe('Second try.');
    expect(narration?.original).toBe('Rook looks shaken.');
  });

  it('leaves an uncorrected passage alone', () => {
    const events = goldenSessionPrelude()
      .add(
        'narration.written',
        { role: 'beat', text: 'As written.', groundedIn: [] },
        { actor: AI_ACTOR },
      )
      .build();
    const narration = narrationFor(events, events.at(-1)?.id as EventId);

    expect(narration?.text).toBe('As written.');
    expect(narration?.corrected).toBe(false);
    expect(narration?.original).toBeUndefined();
  });

  it('ignores a revision that has itself been voided', () => {
    const builder = goldenSessionPrelude().add(
      'narration.written',
      { role: 'beat', text: 'The original.', groundedIn: [] },
      { actor: AI_ACTOR },
    );
    const original = builder.last();
    builder.add(
      'narration.revised',
      { targetEventId: original.id, text: 'A revision nobody wanted.' },
      { actor: AI_ACTOR },
    );
    const revision = builder.last();
    const events = builder
      .add(
        'event.voided',
        {
          targetEventId: revision.id,
          kind: 'player_void',
          reason: 'wrong',
          cascaded: [revision.id],
        },
        { actor: PLAYER_ACTOR },
      )
      .build();

    expect(narrationFor(events, original.id)?.text).toBe('The original.');
  });
});

describe('the momentum burn offer (A8, Beat 5)', () => {
  const offered = {
    ...ROLL,
    burnOffer: { wouldBecome: 'strong_hit', momentum: 7, resetsTo: 2 },
  } as const;

  it('reports an offer the player has not taken', () => {
    const events = goldenSessionPrelude().add('dice.rolled', offered).build();
    const entry = buildNarrativeLog(events)
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.type === 'dice.rolled');
    expect(entry?.burnTaken).toBe(false);
  });

  it('reports an offer the player took', () => {
    const builder = goldenSessionPrelude().add('dice.rolled', offered);
    const rolled = builder.last();
    const events = builder
      .add(
        'momentum.burned',
        {
          characterId: VESNA,
          rollEventId: rolled.id,
          tierBefore: 'weak_hit',
          tierAfter: 'strong_hit',
        },
        { actor: PLAYER_ACTOR },
      )
      .build();

    const entry = buildNarrativeLog(events)
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.id === rolled.id);
    expect(entry?.burnTaken).toBe(true);
  });

  it('says nothing about a roll that made no offer', () => {
    const events = goldenSessionPrelude().add('dice.rolled', ROLL).build();
    const entry = buildNarrativeLog(events)
      .beats.flatMap((b) => b.entries)
      .find((e) => e.event.type === 'dice.rolled');
    expect(entry?.burnTaken).toBeUndefined();
  });
});

describe('paging', () => {
  function manyBeats(count: number) {
    const builder = log();
    for (let i = 0; i < count; i += 1) {
      builder.add(
        'narration.written',
        { role: 'beat', text: `Beat ${i + 1}.`, groundedIn: [] },
        {
          actor: AI_ACTOR,
          commandId: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}` as CommandId,
        },
      );
    }
    return builder.build();
  }

  it('returns the most recent page and a cursor to reach further back', () => {
    const page = buildNarrativeLog(manyBeats(10), { limit: 4 });
    expect(page.beats).toHaveLength(4);
    expect(page.beats.at(0)?.seq).toBe(7);
    expect(page.beats.at(-1)?.seq).toBe(10);
    expect(page.nextCursor).toBe(7);
  });

  it('walks backwards with the cursor', () => {
    const events = manyBeats(10);
    const first = buildNarrativeLog(events, { limit: 4 });
    const second = buildNarrativeLog(events, { limit: 4, before: first.nextCursor ?? 0 });

    expect(second.beats.map((b) => b.seq)).toEqual([3, 4, 5, 6]);
    expect(second.nextCursor).toBe(3);
  });

  it('omits the cursor once the log reaches its beginning', () => {
    const last = buildNarrativeLog(manyBeats(10), { limit: 4, before: 3 });
    expect(last.beats.map((b) => b.seq)).toEqual([1, 2]);
    expect(last.nextCursor).toBeUndefined();
  });

  it('never splits a beat across a page boundary', () => {
    // A reader must never see a roll with no invocation above it.
    const builder = log();
    for (let i = 0; i < 6; i += 1) {
      const commandId = `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}` as CommandId;
      builder
        .add(
          'move.invoked',
          {
            moveId: 'move:adventure/face_danger',
            actorCharacterId: ROOK,
            using: { using: 'stat', stat: 'iron' },
            adds: [],
          },
          { commandId },
        )
        .add('dice.rolled', ROLL, { commandId });
    }
    const page = buildNarrativeLog(builder.build(), { limit: 3 });

    expect(page.beats).toHaveLength(3);
    for (const beat of page.beats) {
      expect(beat.entries.map((e) => e.event.type)).toEqual(['move.invoked', 'dice.rolled']);
    }
  });

  it('returns everything when the log is shorter than the page', () => {
    const page = buildNarrativeLog(manyBeats(3), { limit: 10 });
    expect(page.beats).toHaveLength(3);
    expect(page.nextCursor).toBeUndefined();
  });

  it('handles an empty log', () => {
    expect(buildNarrativeLog([])).toEqual({ beats: [] });
  });
});

function beatFor(page: NarrativeLog, commandId: CommandId): NarrativeBeat | undefined {
  return page.beats.find((b) => b.commandId === commandId);
}
