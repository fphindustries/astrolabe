import { describe, expect, it } from 'vitest';

import { EVENT_TYPES, type AstrolabeEvent } from '@astrolabe/shared';

import { applyEvent, canApplyIncrementally, project } from './project.js';
import { emptyState } from './state.js';
import {
  AI_ACTOR,
  CLOCK_TRACK,
  JUNO,
  PLAYER_ACTOR,
  ROOK,
  SESSION_ID,
  SURVIVOR,
  VESNA,
  VOW_TRACK,
  character,
  goldenSessionPrelude,
  log,
} from './fixtures.js';

/**
 * Given a sequence of events, the expected projected state. That is the
 * whole contract, and every test below is an instance of it.
 */

describe('projector laws', () => {
  it('projects an empty log to the default state rather than throwing', () => {
    expect(project([])).toEqual(emptyState());
  });

  it('is deterministic: the same log twice is deeply equal', () => {
    const events = goldenSessionPrelude().build();
    expect(project(events)).toEqual(project(events));
  });

  /**
   * The highest-value test in the suite. For every prefix of the log,
   * applying the next event to the previous projection must equal a cold
   * rebuild of that prefix — which is what makes the memoized in-memory
   * state safe to keep, and catches most projector bugs by itself.
   */
  it('applies incrementally exactly as it rebuilds, for every prefix', () => {
    const events = fullGoldenLog();
    let incremental = emptyState();

    for (let n = 1; n <= events.length; n += 1) {
      const event = events[n - 1] as AstrolabeEvent;
      const prefix = events.slice(0, n);

      if (canApplyIncrementally(event)) {
        incremental = applyEvent(incremental, event);
        expect(incremental, `prefix of ${n}`).toEqual(project(prefix));
      } else {
        // A void suppresses events already folded in, so there is no
        // incremental step for it: the caller must rebuild. The test says so
        // rather than pretending otherwise.
        incremental = project(prefix);
      }
    }
  });

  it('names a void as the one event that cannot be applied incrementally', () => {
    const incremental = EVENT_TYPES.filter((type) => canApplyIncrementally({ type } as never));
    expect(EVENT_TYPES.filter((t) => !incremental.includes(t))).toEqual(['event.voided']);
  });

  it('never mutates the state it is given', () => {
    const before = project(goldenSessionPrelude().build());
    const frozen = JSON.stringify(before);
    applyEvent(before, log().add('session.began', { sessionId: SESSION_ID, number: 3 }).at(1));
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe('campaign, session and scene', () => {
  it('records the campaign and its settings', () => {
    const state = project(goldenSessionPrelude().build());
    expect(state.campaign?.name).toBe('Lantern Wake');
    expect(state.campaign?.settings.narrationLatitude).toBe('color');
    expect(state.campaign?.settings.rerollCap).toBe(2);
  });

  it('opens session 2 with an empty token count', () => {
    const state = project(goldenSessionPrelude().build());
    expect(state.session?.number).toBe(2);
    expect(state.session?.tokenUsage).toEqual({ input: 0, output: 0 });
    expect(state.session?.endedAt).toBeUndefined();
  });

  it('binds the scene to its location (D-71: one scene per session)', () => {
    const state = project(goldenSessionPrelude().build());
    expect(state.scene?.title).toBe('The relay station');
    expect(state.scene?.locationId).toBeDefined();
  });

  it('carries a session summary and its open threads into canon (A17)', () => {
    const events = goldenSessionPrelude()
      .add(
        'session.ended',
        {
          summary: 'The crew boarded the station and found it was not empty.',
          openThreads: ["the survivor's intent", 'the failing power'],
        },
        { actor: AI_ACTOR },
      )
      .build();
    const state = project(events);

    expect(state.session?.endedAt).toBeDefined();
    expect(state.canon.sessionSummaries).toHaveLength(1);
    expect(state.canon.sessionSummaries[0]).toMatchObject({
      number: 2,
      openThreads: ["the survivor's intent", 'the failing power'],
    });
  });

  it('keeps every session summary, so a later recap can reach back (A1)', () => {
    const events = goldenSessionPrelude()
      .add('session.ended', { summary: 'Session 2.', openThreads: ['a'] }, { actor: AI_ACTOR })
      .add('session.began', { sessionId: SESSION_ID, number: 3 })
      .add('session.ended', { summary: 'Session 3.', openThreads: ['b'] }, { actor: AI_ACTOR })
      .build();
    const state = project(events);

    expect(state.canon.sessionSummaries.map((s) => s.number)).toEqual([2, 3]);
    // A new session starts its own token count.
    expect(state.session?.number).toBe(3);
  });
});

describe('momentum: store facts, derive bounds', () => {
  it('folds a delta onto the stored value', () => {
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: {
          kind: 'move_outcome',
          moveId: 'move:adventure/gather_information',
          tier: 'weak_hit',
        },
        changes: [
          { delta: { kind: 'momentum', characterId: JUNO, delta: 1 }, clause: '+1 momentum' },
        ],
      })
      .build();
    expect(project(events).characters[JUNO]?.momentum.value).toBe(4);
  });

  it('clamps at the maximum', () => {
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: { kind: 'momentum_burn' },
        changes: [{ delta: { kind: 'momentum', characterId: VESNA, delta: 20 } }],
      })
      .build();
    expect(project(events).characters[VESNA]?.momentum.value).toBe(10);
  });

  it('clamps at the fixed floor of -6, which impacts do not move (D-78)', () => {
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: { kind: 'momentum_burn' },
        changes: [{ delta: { kind: 'momentum', characterId: VESNA, delta: -50 } }],
      })
      .build();
    expect(project(events).characters[VESNA]?.momentum.value).toBe(-6);
  });

  it('derives max and reset from marked impacts (D-74, D-79)', () => {
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: { kind: 'move_outcome', moveId: 'move:suffer/endure_harm', tier: 'miss' },
        changes: [
          { delta: { kind: 'impact', characterId: ROOK, impact: 'impact:wounded', set: true } },
          { delta: { kind: 'impact', characterId: ROOK, impact: 'impact:shaken', set: true } },
        ],
      })
      .build();
    const rook = project(events).characters[ROOK];

    expect(rook?.markedImpacts).toBe(2);
    expect(rook?.momentum.max).toBe(8);
    expect(rook?.momentum.resetValue).toBe(0);
  });

  it('leaves a stored value above a newly lowered maximum alone', () => {
    // Bounds move; facts do not. The value was produced by applying a rule
    // at a moment in history, so marking an impact must not silently
    // rewrite it. The next delta clamps it.
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: { kind: 'momentum_burn' },
        changes: [{ delta: { kind: 'momentum', characterId: VESNA, delta: 3 } }],
      })
      .add('state.changed', {
        cause: { kind: 'move_outcome', moveId: 'move:suffer/endure_harm', tier: 'miss' },
        changes: [
          { delta: { kind: 'impact', characterId: VESNA, impact: 'impact:wounded', set: true } },
        ],
      })
      .build();
    const vesna = project(events).characters[VESNA];

    expect(vesna?.momentum.value).toBe(10);
    expect(vesna?.momentum.max).toBe(9);
  });

  it('resets to the derived value, not one stored on the event (Beat 5)', () => {
    const events = goldenSessionPrelude()
      .add('momentum.burned', {
        characterId: VESNA,
        rollEventId: goldenSessionPrelude().at(1).id,
        tierBefore: 'weak_hit',
        tierAfter: 'strong_hit',
      })
      .add('state.changed', {
        cause: { kind: 'momentum_burn' },
        changes: [{ delta: { kind: 'momentum_reset', characterId: VESNA } }],
      })
      .build();
    expect(project(events).characters[VESNA]?.momentum.value).toBe(2);
  });

  it('unmarks an impact and restores the bound', () => {
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'wounded' },
        changes: [
          { delta: { kind: 'impact', characterId: ROOK, impact: 'impact:wounded', set: true } },
        ],
      })
      .add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'healed' },
        changes: [
          { delta: { kind: 'impact', characterId: ROOK, impact: 'impact:wounded', set: false } },
        ],
      })
      .build();
    const rook = project(events).characters[ROOK];

    expect(rook?.markedImpacts).toBe(0);
    expect(rook?.momentum.max).toBe(10);
    expect(rook?.impacts).toEqual({});
  });
});

describe('meters', () => {
  it('applies Beat 7: Endure Harm for -1 health', () => {
    const events = goldenSessionPrelude()
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
    expect(project(events).characters[ROOK]?.meters.health.value).toBe(4);
  });

  it('clamps against the bounds snapshotted on the character, not the rules data', () => {
    const events = goldenSessionPrelude()
      .add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'catastrophe' },
        changes: [{ delta: { kind: 'meter', characterId: ROOK, meter: 'health', delta: -99 } }],
      })
      .build();
    expect(project(events).characters[ROOK]?.meters.health.value).toBe(0);
  });

  it('respects a per-character maximum above the rulebook default', () => {
    // The shape a later asset needs when it raises max supply.
    const events = log()
      .add('character.created', {
        ...character(VESNA, 'Vesna Kade', 2),
        meters: {
          health: { value: 5, min: 0, max: 5 },
          spirit: { value: 5, min: 0, max: 5 },
          supply: { value: 6, min: 0, max: 7 },
        },
      })
      .add('state.changed', {
        cause: { kind: 'ai_judgement', reason: 'resupply' },
        changes: [{ delta: { kind: 'meter', characterId: VESNA, meter: 'supply', delta: 5 } }],
      })
      .build();
    expect(project(events).characters[VESNA]?.meters.supply.value).toBe(7);
  });
});

describe('Beat 5: aiding an ally', () => {
  const aided = () =>
    goldenSessionPrelude().add('state.changed', {
      cause: {
        kind: 'move_outcome',
        moveId: 'move:adventure/secure_an_advantage',
        tier: 'strong_hit',
      },
      // D-62's redirect is applied at write time: both deltas already name
      // Vesna, though Rook made the move.
      changes: [
        { delta: { kind: 'momentum', characterId: VESNA, delta: 2 }, clause: '+2 momentum' },
        { delta: { kind: 'bonus_next_move', characterId: VESNA, amount: 1 }, clause: '+1' },
      ],
    });

  it('gives both benefits to the aided character and none to the actor', () => {
    const state = project(aided().build());
    expect(state.characters[VESNA]?.momentum.value).toBe(9);
    expect(state.characters[VESNA]?.bonusNextMove?.amount).toBe(1);
    expect(state.characters[ROOK]?.momentum.value).toBe(2);
    expect(state.characters[ROOK]?.bonusNextMove).toBeUndefined();
  });

  it('spends the bonus on the aided character next move', () => {
    const state = project(
      aided()
        .add('move.invoked', {
          moveId: 'move:adventure/gather_information',
          actorCharacterId: VESNA,
          using: { using: 'stat', stat: 'wits' },
          adds: [
            { amount: 2, label: 'wits' },
            { amount: 1, label: 'bonus from Secure an Advantage' },
          ],
        })
        .build(),
    );
    expect(state.characters[VESNA]?.bonusNextMove).toBeUndefined();
  });

  it('is not spent by a different character moving', () => {
    const state = project(
      aided()
        .add('move.invoked', {
          moveId: 'move:adventure/face_danger',
          actorCharacterId: ROOK,
          using: { using: 'stat', stat: 'iron' },
          adds: [],
        })
        .build(),
    );
    expect(state.characters[VESNA]?.bonusNextMove?.amount).toBe(1);
  });

  it('waits when the bonus excludes progress moves and the move is one', () => {
    const state = project(
      goldenSessionPrelude()
        .add('state.changed', {
          cause: { kind: 'ai_judgement', reason: 'advantage' },
          changes: [
            {
              delta: {
                kind: 'bonus_next_move',
                characterId: VESNA,
                amount: 1,
                excludes: 'progress_moves',
              },
            },
          ],
        })
        .add('move.invoked', {
          moveId: 'move:quest/fulfill_your_vow',
          actorCharacterId: VESNA,
          using: { using: 'progress_track', trackId: VOW_TRACK },
          adds: [],
        })
        .build(),
    );
    expect(state.characters[VESNA]?.bonusNextMove?.amount).toBe(1);
  });
});

describe('tracks', () => {
  it('creates Beat 8 clock with its stated reason and fills one segment (A14)', () => {
    const events = goldenSessionPrelude()
      .add(
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
        { actor: AI_ACTOR },
      )
      .add(
        'track.advanced',
        {
          trackId: CLOCK_TRACK,
          ticks: 1,
          cause: {
            kind: 'ai_judgement',
            reason: 'forcing the bulkhead tripped emergency load-shedding',
          },
        },
        { actor: AI_ACTOR },
      )
      .build();
    const clock = project(events).tracks[CLOCK_TRACK];

    expect(clock).toMatchObject({ ticks: 1, maxTicks: 4, title: 'Station power failing' });
    // Beat 8: hovering shows who ticked it and why.
    expect(clock?.lastChangedBy.actorKind).toBe('ai');
    expect(clock?.lastChangedBy.reason).toMatch(/load-shedding/);
  });

  it('adds stored ticks without doing rank arithmetic', () => {
    // Converting a formidable rank into ticks is rules content, resolved at
    // write time. The projector only ever adds.
    const events = goldenSessionPrelude()
      .add('track.advanced', {
        trackId: VOW_TRACK,
        ticks: 8,
        cause: { kind: 'move_outcome', moveId: 'move:quest/reach_a_milestone', tier: 'strong_hit' },
      })
      .build();
    expect(project(events).tracks[VOW_TRACK]?.ticks).toBe(8);
  });

  it('caps a clock at its segments and a vow at forty ticks', () => {
    const events = goldenSessionPrelude()
      .add('track.advanced', {
        trackId: VOW_TRACK,
        ticks: 500,
        cause: { kind: 'ai_judgement', reason: 'much progress' },
      })
      .build();
    expect(project(events).tracks[VOW_TRACK]?.ticks).toBe(40);
  });

  it('ignores an advance against a track that does not exist', () => {
    const events = goldenSessionPrelude()
      .add('track.advanced', {
        trackId: CLOCK_TRACK,
        ticks: 1,
        cause: { kind: 'ai_judgement', reason: 'orphan' },
      })
      .build();
    expect(project(events).tracks[CLOCK_TRACK]).toBeUndefined();
  });
});

describe('entities and provenance (A10, Beat 6)', () => {
  it('tracks an AI-established NPC with its badge and its grounding rolls', () => {
    const builder = goldenSessionPrelude();
    const groundedIn = [builder.at(1).id, builder.at(2).id];
    const events = builder
      .add(
        'entity.established',
        {
          entityId: SURVIVOR,
          kind: 'npc',
          name: 'Sura Vance',
          fields: { role: 'technician', disposition: 'wary' },
          provenance: { establishedBy: 'ai', recipeId: 'recipe:npc', groundedIn },
        },
        { actor: AI_ACTOR },
      )
      .build();
    const npc = project(events).entities[SURVIVOR];

    expect(npc?.name).toBe('Sura Vance');
    expect(npc?.provenance.establishedBy).toBe('ai');
    expect(npc?.provenance.recipeId).toBe('recipe:npc');
    expect(npc?.provenance.groundedIn).toEqual(groundedIn);
  });
});

describe('manual overrides (A16, Beat 9)', () => {
  const override = () =>
    goldenSessionPrelude().add(
      'state.overridden',
      {
        target: { kind: 'momentum', characterId: JUNO },
        from: 3,
        to: 4,
        reason: 'a ruling from last session left this one too low',
      },
      { actor: PLAYER_ACTOR },
    );

  it('sets an absolute value and marks it as the player changing it', () => {
    const juno = project(override().build()).characters[JUNO];
    expect(juno?.momentum.value).toBe(4);
    // A16: visually distinct from an automated change.
    expect(juno?.momentum.lastChangedBy.actorKind).toBe('player');
    expect(juno?.momentum.lastChangedBy.reason).toMatch(/ruling from last session/);
  });

  it('is a base for later deltas, not a replacement for them', () => {
    const state = project(
      override()
        .add('state.changed', {
          cause: { kind: 'ai_judgement', reason: 'later' },
          changes: [{ delta: { kind: 'momentum', characterId: JUNO, delta: 1 } }],
        })
        .build(),
    );
    expect(state.characters[JUNO]?.momentum.value).toBe(5);
  });

  it('overrides a meter and a clock as well as momentum (D-26)', () => {
    const state = project(
      goldenSessionPrelude()
        .add(
          'state.overridden',
          { target: { kind: 'meter', characterId: ROOK, meter: 'health' }, from: 5, to: 3 },
          { actor: PLAYER_ACTOR },
        )
        .add(
          'state.overridden',
          { target: { kind: 'track', trackId: VOW_TRACK }, from: 0, to: 12 },
          { actor: PLAYER_ACTOR },
        )
        .build(),
    );
    expect(state.characters[ROOK]?.meters.health.value).toBe(3);
    expect(state.tracks[VOW_TRACK]?.ticks).toBe(12);
  });

  it('does not gate on `from`, which goes stale after a void reprojects', () => {
    const state = project(
      goldenSessionPrelude()
        .add(
          'state.overridden',
          { target: { kind: 'momentum', characterId: JUNO }, from: 999, to: 4 },
          { actor: PLAYER_ACTOR },
        )
        .build(),
    );
    expect(state.characters[JUNO]?.momentum.value).toBe(4);
  });
});

describe('token accounting (D-75)', () => {
  it('sums every AI call in the session and survives a rebuild', () => {
    const events = goldenSessionPrelude()
      .add(
        'ai.completed',
        {
          provider: 'anthropic',
          model: 'claude-opus-5',
          purpose: 'recap',
          inputTokens: 1200,
          outputTokens: 180,
        },
        { actor: AI_ACTOR },
      )
      .add(
        'ai.completed',
        {
          provider: 'anthropic',
          model: 'claude-opus-5',
          purpose: 'beat',
          inputTokens: 800,
          outputTokens: 120,
        },
        { actor: AI_ACTOR },
      )
      .build();
    expect(project(events).session?.tokenUsage).toEqual({ input: 2000, output: 300 });
  });

  it('starts a new count when a new session begins', () => {
    const events = goldenSessionPrelude()
      .add(
        'ai.completed',
        { provider: 'anthropic', model: 'm', purpose: 'beat', inputTokens: 100, outputTokens: 10 },
        { actor: AI_ACTOR },
      )
      .add('session.ended', { summary: 'done', openThreads: [] }, { actor: AI_ACTOR })
      .add('session.began', { sessionId: SESSION_ID, number: 3 })
      .build();
    expect(project(events).session?.tokenUsage).toEqual({ input: 0, output: 0 });
  });
});

describe('narration changes nothing mechanical (A15)', () => {
  it('leaves characters and tracks identical across a correction', () => {
    const before = goldenSessionPrelude();
    const narrated = before
      .add(
        'narration.written',
        { role: 'beat', text: 'Rook looks shaken.', groundedIn: [] },
        { actor: AI_ACTOR },
      )
      .build();
    const corrected = before
      .add(
        'narration.correction_requested',
        { targetEventId: before.at(7).id, note: 'Rook is a veteran — annoyed, not rattled.' },
        { actor: PLAYER_ACTOR },
      )
      .add(
        'narration.revised',
        { targetEventId: before.at(7).id, text: 'Rook shakes the sparks off his sleeve, annoyed.' },
        { actor: AI_ACTOR },
      )
      .build();

    const a = project(narrated);
    const b = project(corrected);
    expect(b.characters).toEqual(a.characters);
    expect(b.tracks).toEqual(a.tracks);
    expect(b.entities).toEqual(a.entities);
  });
});

/** A log covering every beat the projector has to handle, for the prefix law. */
function fullGoldenLog(): readonly AstrolabeEvent[] {
  const builder = goldenSessionPrelude();
  const rollSeq = builder
    .add('move.invoked', {
      moveId: 'move:adventure/gather_information',
      actorCharacterId: JUNO,
      using: { using: 'stat', stat: 'wits' },
      adds: [{ amount: 2, label: 'wits' }],
      actionText: 'Juno jacks into the docking port.',
    })
    .add('dice.rolled', {
      kind: 'action',
      actionDie: 3,
      adds: [{ amount: 2, label: 'wits' }],
      actionScore: 5,
      challengeDice: [8, 4],
      tier: 'weak_hit',
      isMatch: false,
      rng: { source: 'seeded', seed: 7 },
    })
    .add('state.changed', {
      cause: {
        kind: 'move_outcome',
        moveId: 'move:adventure/gather_information',
        tier: 'weak_hit',
      },
      changes: [
        { delta: { kind: 'momentum', characterId: JUNO, delta: 1 }, clause: '+1 momentum' },
      ],
    })
    .add(
      'narration.written',
      { role: 'beat', text: 'The logs are fragmentary.', groundedIn: [] },
      { actor: AI_ACTOR },
    )
    .add(
      'ai.completed',
      { provider: 'anthropic', model: 'm', purpose: 'beat', inputTokens: 900, outputTokens: 140 },
      { actor: AI_ACTOR },
    )
    .add(
      'entity.established',
      {
        entityId: SURVIVOR,
        kind: 'npc',
        name: 'Sura Vance',
        fields: { disposition: 'wary' },
        provenance: { establishedBy: 'ai', groundedIn: [] },
      },
      { actor: AI_ACTOR },
    )
    .add(
      'track.created',
      {
        kind: 'clock',
        trackId: CLOCK_TRACK,
        title: 'Station power failing',
        segments: 4,
        cause: { kind: 'ai_judgement', reason: 'load-shedding' },
      },
      { actor: AI_ACTOR },
    )
    .add(
      'track.advanced',
      { trackId: CLOCK_TRACK, ticks: 1, cause: { kind: 'ai_judgement', reason: 'load-shedding' } },
      { actor: AI_ACTOR },
    )
    .add(
      'state.overridden',
      { target: { kind: 'momentum', characterId: JUNO }, from: 4, to: 5, reason: 'ruling' },
      { actor: PLAYER_ACTOR },
    )
    .at(8).id;

  // A void of the Gather Information roll, so the prefix law covers the
  // rebuild path too.
  builder.add(
    'event.voided',
    {
      targetEventId: rollSeq,
      kind: 'player_void',
      reason: 'wrong stat',
      cascaded: [builder.at(7).id, builder.at(8).id, builder.at(9).id],
    },
    { actor: PLAYER_ACTOR },
  );

  return builder.build();
}
