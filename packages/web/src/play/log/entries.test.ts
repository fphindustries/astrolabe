import { describe, expect, it } from 'vitest';

import type { AstrolabeEvent, EnvelopeFields, NarrativeEntry, NarrativeLog } from '@astrolabe/shared';

import { orderedBeats, toEntryView } from './entries.js';

function envelope(overrides: Partial<EnvelopeFields> = {}): EnvelopeFields {
  return {
    campaignId: 'camp-1' as never,
    seq: 1,
    id: 'evt-1' as never,
    commandId: 'cmd-1' as never,
    causedBy: null,
    sessionId: null,
    sceneId: null,
    actor: { kind: 'system' },
    subjectCharacterId: null,
    version: 1,
    visibility: 'table',
    occurredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function entry(event: AstrolabeEvent, overrides: Partial<NarrativeEntry> = {}): NarrativeEntry {
  return { event, voided: false, voidedBy: [], ...overrides };
}

describe('toEntryView', () => {
  it('renders a scene.started event', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'scene.started',
        payload: { sceneId: 'scene-1' as never, title: 'The derelict relay station' },
      }),
    );
    expect(view.body).toEqual({ kind: 'scene', title: 'The derelict relay station' });
  });

  it('renders a move.invoked event, flagging an aid and carrying action text', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'move.invoked',
        payload: {
          moveId: 'move:adventure/secure_an_advantage',
          actorCharacterId: 'char-rook' as never,
          aidingAllyId: 'char-vesna' as never,
          adds: [{ amount: 3, label: 'iron' }],
          actionText: 'Rook covers the airlock.',
        },
      }),
    );
    expect(view.body).toEqual({
      kind: 'move',
      moveId: 'move:adventure/secure_an_advantage',
      aiding: true,
      actionText: 'Rook covers the airlock.',
    });
  });

  it('renders a dice.rolled event, including whether an offered burn was taken', () => {
    const view = toEntryView(
      entry(
        {
          ...envelope(),
          type: 'dice.rolled',
          payload: {
            kind: 'action',
            actionDie: 2,
            adds: [],
            actionScore: 5,
            challengeDice: [6, 3],
            tier: 'weak_hit',
            isMatch: false,
            burnOffer: { wouldBecome: 'strong_hit', momentum: 9, resetsTo: 2 },
            rng: { source: 'seeded', seed: 103 },
          },
        },
        { burnTaken: true },
      ),
    );
    expect(view.body).toEqual({
      kind: 'roll',
      tier: 'weak_hit',
      isMatch: false,
      burnOffered: true,
      burnTaken: true,
    });
  });

  it('marks a dice.rolled event voidable, and an already-inert one (ai.completed) not (task 6.10)', () => {
    const roll = toEntryView(
      entry({
        ...envelope(),
        type: 'dice.rolled',
        payload: {
          kind: 'action',
          actionDie: 2,
          adds: [],
          actionScore: 5,
          challengeDice: [6, 3],
          tier: 'weak_hit',
          isMatch: false,
          rng: { source: 'seeded', seed: 103 },
        },
      }),
    );
    expect(roll.voidable).toBe(true);

    const completed = toEntryView(
      entry({
        ...envelope(),
        type: 'ai.completed',
        payload: { provider: 'anthropic', model: 'm', purpose: 'x', inputTokens: 1, outputTokens: 1 },
      }),
    );
    expect(completed.voidable).toBe(false);
  });

  it('renders a momentum.burned event', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'momentum.burned',
        payload: {
          characterId: 'char-vesna' as never,
          rollEventId: 'evt-roll' as never,
          tierBefore: 'weak_hit',
          tierAfter: 'strong_hit',
        },
      }),
    );
    expect(view.body).toEqual({ kind: 'burn', tierBefore: 'weak_hit', tierAfter: 'strong_hit' });
  });

  it('renders track.created', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'track.created',
        payload: {
          kind: 'clock',
          trackId: 'trk-1' as never,
          title: 'Station power failing',
          segments: 4,
          cause: { kind: 'ai_judgement', reason: 'emergency load-shedding' },
        },
      }),
    );
    expect(view.body).toEqual({ kind: 'track_created', title: 'Station power failing' });
  });

  it('carries an AI-judgement reason on track.advanced, but not a move-outcome one', () => {
    const withReason = toEntryView(
      entry({
        ...envelope(),
        type: 'track.advanced',
        payload: {
          trackId: 'trk-1' as never,
          ticks: 1,
          cause: { kind: 'ai_judgement', reason: 'emergency load-shedding' },
        },
      }),
    );
    expect(withReason.body).toEqual({
      kind: 'track_advanced',
      ticks: 1,
      reason: 'emergency load-shedding',
    });

    const withoutReason = toEntryView(
      entry({
        ...envelope(),
        type: 'track.advanced',
        payload: {
          trackId: 'trk-1' as never,
          ticks: 8,
          cause: { kind: 'move_outcome', moveId: 'move:adventure/reach_a_milestone', tier: 'strong_hit' },
        },
      }),
    );
    expect(withoutReason.body).toEqual({ kind: 'track_advanced', ticks: 8 });
  });

  it('renders entity.established', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'entity.established',
        payload: {
          entityId: 'ent-1' as never,
          kind: 'npc',
          name: 'Sura Vance',
          fields: { role: 'life-support technician' },
          provenance: { establishedBy: 'ai', groundedIn: [] },
        },
      }),
    );
    expect(view.body).toEqual({ kind: 'entity_established', name: 'Sura Vance' });
  });

  it('renders narration.written as its resolved (possibly corrected) text', () => {
    const uncorrected = toEntryView(
      entry({
        ...envelope(),
        type: 'narration.written',
        payload: { role: 'beat', text: 'Original passage.', groundedIn: [] },
      }),
    );
    expect(uncorrected.body).toEqual({ kind: 'narration', text: 'Original passage.', corrected: false });

    const corrected = toEntryView(
      entry(
        {
          ...envelope(),
          type: 'narration.written',
          payload: { role: 'beat', text: 'Original passage.', groundedIn: [] },
        },
        {
          narration: {
            text: 'Revised passage.',
            corrected: true,
            original: 'Original passage.',
            note: 'Rook is a veteran.',
          },
        },
      ),
    );
    expect(corrected.body).toEqual({
      kind: 'narration',
      text: 'Revised passage.',
      corrected: true,
      original: 'Original passage.',
      note: 'Rook is a veteran.',
    });
  });

  it('renders state.overridden', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'state.overridden',
        payload: {
          target: { kind: 'momentum', characterId: 'char-juno' as never },
          from: 3,
          to: 5,
          reason: 'a ruling from last session left this one too low',
        },
      }),
    );
    expect(view.body).toEqual({
      kind: 'override',
      from: 3,
      to: 5,
      reason: 'a ruling from last session left this one too low',
    });
  });

  it('renders event.voided', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'event.voided',
        payload: {
          targetEventId: 'evt-target' as never,
          kind: 'reroll',
          reason: 'contradicts the evacuation logs',
          cascaded: ['evt-target' as never],
        },
      }),
    );
    expect(view.body).toEqual({
      kind: 'void',
      cascadedCount: 1,
      reason: 'contradicts the evacuation logs',
    });
  });

  it('renders session.ended', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'session.ended',
        payload: { summary: 'The crew secured the relay station.', openThreads: [] },
      }),
    );
    expect(view.body).toEqual({ kind: 'session_ended', summary: 'The crew secured the relay station.' });
  });

  it('renders move.choice_made', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'move.choice_made',
        payload: {
          moveId: 'move:suffer/endure_harm',
          tier: 'weak_hit',
          choiceId: 'eh-weak',
          optionIds: ['lose-momentum-for-health'],
          rollEventId: 'evt-roll' as never,
        },
      }),
    );
    expect(view.body).toEqual({
      kind: 'move_choice_made',
      choiceId: 'eh-weak',
      optionIds: ['lose-momentum-for-health'],
    });
  });

  it('renders move.method_chosen', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'move.method_chosen',
        payload: { moveId: 'move:fate/pay_the_price', optionId: 'table' },
      }),
    );
    expect(view.body).toEqual({ kind: 'move_method_chosen', optionId: 'table' });
  });

  it('renders move.chained', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'move.chained',
        payload: {
          fromMoveId: 'move:adventure/face_danger',
          toMoveId: 'move:fate/pay_the_price',
          mode: 'offer',
          reason: 'Face Danger, miss',
        },
      }),
    );
    expect(view.body).toEqual({
      kind: 'move_chained',
      toMoveId: 'move:fate/pay_the_price',
      mode: 'offer',
      reason: 'Face Danger, miss',
    });
  });

  it('renders oracle.rolled', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'oracle.rolled',
        payload: { oracleId: 'oracle:moves/pay_the_price', roll: 76, rowText: 'You are harmed' },
      }),
    );
    expect(view.body).toEqual({ kind: 'oracle_rolled', roll: 76, rowText: 'You are harmed' });
  });

  it('renders amount.committed', () => {
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'amount.committed',
        payload: {
          moveId: 'move:suffer/endure_harm',
          characterId: 'char-rook' as never,
          meter: 'health',
          amount: -1,
        },
      }),
    );
    expect(view.body).toEqual({ kind: 'amount_committed', amount: -1, meter: 'health' });
  });

  it('falls back to an unknown-type marker instead of vanishing or throwing', () => {
    // A real type from design-event-log.md's table that hasn't landed with
    // a feature yet (§4) — stands in for "some future type this switch
    // doesn't know," which is the case this fallback exists for.
    const view = toEntryView(
      entry({
        ...envelope(),
        type: 'complication.offered',
        payload: {},
      } as unknown as AstrolabeEvent),
    );
    expect(view.body).toEqual({ kind: 'unknown', type: 'complication.offered' });
  });

  it('maps void marks through, kind and reason only', () => {
    const view = toEntryView(
      entry(
        {
          ...envelope(),
          type: 'dice.rolled',
          payload: {
            kind: 'action',
            actionDie: 6,
            adds: [],
            actionScore: 8,
            challengeDice: [3, 4],
            tier: 'strong_hit',
            isMatch: false,
            rng: { source: 'seeded', seed: 104 },
          },
        },
        {
          voided: true,
          voidedBy: [
            {
              eventId: 'evt-void' as never,
              kind: 'player_void',
              reason: 'Rook is forcing the bulkhead, not slipping past it',
            },
          ],
        },
      ),
    );
    expect(view.voided).toBe(true);
    expect(view.voidMarks).toEqual([
      { kind: 'player_void', reason: 'Rook is forcing the bulkhead, not slipping past it' },
    ]);
  });
});

describe('orderedBeats', () => {
  it('reverses newest-fetched-first pages, then flattens each page in place', () => {
    const beat = (seq: number) => ({
      commandId: `cmd-${seq}` as never,
      seq,
      occurredAt: '2026-01-01T00:00:00.000Z' as never,
      actorKind: 'system' as const,
      entries: [],
      voided: false,
    });

    const newestPage: NarrativeLog = { beats: [beat(3), beat(4)] };
    const olderPage: NarrativeLog = { beats: [beat(1), beat(2)] };

    // react-query's pages array is fetch order: newest page first.
    expect(orderedBeats([newestPage, olderPage]).map((b) => b.seq)).toEqual([1, 2, 3, 4]);
  });
});
