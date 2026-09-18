import type { MoveId, OracleId } from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignSettings, EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import {
  character,
  goldenSessionPrelude,
  PLAYER_ACTOR,
  ROOK,
  VESNA,
  AI_ACTOR,
  type LogBuilder,
} from '../../projection/fixtures.js';
import { project } from '../../projection/project.js';

import { resolveBeatScope } from './beat-scope.js';
import { describeBeat } from './describe-beat.js';
import { LATITUDE_INSTRUCTIONS } from './latitude.js';
import { beatWeight, narrationBudget } from './length.js';
import {
  buildBeatRequest,
  buildHarmProposalRequest,
  buildRevisionRequest,
  GUIDE_RULES,
} from './prompt.js';
import { renderState } from './render-state.js';

const FACE_DANGER = 'move:adventure/face-danger' as MoveId;
const PAY_THE_PRICE = 'move:fate/pay-the-price' as MoveId;
const ENDURE_HARM = 'move:suffer/endure-harm' as MoveId;

const COLOR: CampaignSettings = {
  narrationLatitude: 'color',
  narrationLength: 'standard',
  rerollCap: 2,
};

/** Every event of one command shares this command id. */
function command(
  b: LogBuilder,
  id: string,
  causedBy: EventId | null,
  add: (overrides: object) => void,
) {
  const commandId = `cccccccc-0000-4000-8000-${id.padStart(12, '0')}`;
  add({ commandId, causedBy });
  return commandId;
}

/**
 * Beat 7, three commands deep: Rook forces the bulkhead (Face Danger miss),
 * Pay the Price by the table lands on "you are harmed", Endure Harm with the
 * player's committed −1.
 */
function beatSeven() {
  const b = goldenSessionPrelude();
  let chainToPrice: EventId;
  let chainToHarm: EventId;

  const faceDanger = command(b, '1', null, (o) => {
    b.add(
      'move.invoked',
      {
        moveId: FACE_DANGER,
        actorCharacterId: ROOK,
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        actionText: 'Rook forces the sealed bulkhead.',
      },
      { ...o, actor: PLAYER_ACTOR },
    );
    b.add(
      'dice.rolled',
      {
        kind: 'action',
        actionDie: 2,
        adds: [{ amount: 2, label: 'iron' }],
        actionScore: 4,
        challengeDice: [7, 9],
        tier: 'miss',
        isMatch: false,
        rng: { source: 'seeded', seed: 1 },
      },
      o,
    );
    b.add(
      'move.chained',
      { fromMoveId: FACE_DANGER, toMoveId: PAY_THE_PRICE, mode: 'offer', reason: 'miss' },
      o,
    );
    chainToPrice = b.last().id;
  });

  const payThePrice = command(b, '2', chainToPrice!, (o) => {
    b.add(
      'move.invoked',
      { moveId: PAY_THE_PRICE, actorCharacterId: ROOK, adds: [] },
      { ...o, actor: PLAYER_ACTOR },
    );
    b.add('move.method_chosen', { moveId: PAY_THE_PRICE, optionId: 'table' }, o);
    b.add(
      'oracle.rolled',
      { oracleId: 'oracle:pay-the-price' as OracleId, roll: 32, rowText: 'You are harmed.' },
      o,
    );
    b.add(
      'move.chained',
      { fromMoveId: PAY_THE_PRICE, toMoveId: ENDURE_HARM, mode: 'auto', reason: 'You are harmed.' },
      o,
    );
    chainToHarm = b.last().id;
  });

  let proposal: EventId;
  command(b, '3', chainToHarm!, (o) => {
    b.add(
      'amount.proposed',
      {
        moveId: ENDURE_HARM,
        characterId: ROOK,
        meter: 'health',
        amount: -2,
        injury: "A ruptured conduit sprays sparks across Rook's arm.",
        reason: 'A serious burn.',
      },
      { ...o, actor: AI_ACTOR },
    );
    proposal = b.last().id;
  });

  const endureHarm = command(b, '4', chainToHarm!, (o) => {
    b.add(
      'move.invoked',
      {
        moveId: ENDURE_HARM,
        actorCharacterId: ROOK,
        using: { using: 'condition_meter', meter: 'health' },
        adds: [],
      },
      { ...o, actor: PLAYER_ACTOR },
    );
    b.add(
      'amount.committed',
      {
        moveId: ENDURE_HARM,
        characterId: ROOK,
        meter: 'health',
        amount: -1,
        proposalEventId: proposal!,
      },
      o,
    );
    b.add(
      'state.changed',
      {
        cause: { kind: 'preroll_effect', moveId: ENDURE_HARM },
        changes: [{ delta: { kind: 'meter', characterId: ROOK, meter: 'health', delta: -1 } }],
      },
      o,
    );
    b.add(
      'dice.rolled',
      {
        kind: 'action',
        actionDie: 5,
        adds: [{ amount: 4, label: 'health' }],
        actionScore: 9,
        challengeDice: [3, 6],
        tier: 'strong_hit',
        isMatch: false,
        rng: { source: 'seeded', seed: 2 },
      },
      o,
    );
  });

  return { b, faceDanger, payThePrice, endureHarm, proposal: proposal! };
}

describe('resolveBeatScope (D-110)', () => {
  it('narrates a whole chain from its last link, rooted at the move that started it', () => {
    const { b, faceDanger, endureHarm } = beatSeven();
    const events = b.build();

    const scope = resolveBeatScope(events, endureHarm as never);

    expect(scope.ok).toBe(true);
    if (!scope.ok) return;
    expect(scope.rootCommandId).toBe(faceDanger);
    expect(scope.events.map((e) => e.type)).toContain('oracle.rolled');
    expect(scope.events.map((e) => e.type)).toContain('amount.committed');
    // The passage hangs off the last thing that happened, so voiding any link reaches it.
    expect(scope.causedBy).toBe(events.at(-1)?.id);
  });

  it('leaves a trigger-mismatch note out of what is narrated and of the passage’s cause (D-136)', () => {
    const { b, faceDanger, endureHarm } = beatSeven();
    const lastOfChain = b.last().id;
    const invoked = b.build().find((e) => e.commandId === faceDanger && e.type === 'move.invoked');
    command(b, '9', invoked!.id, (o) => {
      b.add(
        'move.trigger_noted',
        {
          moveId: FACE_DANGER,
          actionText: 'Rook forces the sealed bulkhead.',
          triggerText: 'attempt something risky',
          reason: 'Stub.',
          confidence: 'low',
        },
        { ...o, actor: AI_ACTOR },
      );
    });

    const scope = resolveBeatScope(b.build(), endureHarm as never);

    expect(scope.ok).toBe(true);
    if (!scope.ok) return;
    expect(scope.events.map((e) => e.type)).not.toContain('move.trigger_noted');
    expect(scope.causedBy).toBe(lastOfChain);
  });

  it('gives the same scope whichever link of the chain is named', () => {
    const { b, faceDanger, payThePrice } = beatSeven();
    const events = b.build();
    const fromMiddle = resolveBeatScope(events, payThePrice as never);
    const fromRoot = resolveBeatScope(events, faceDanger as never);
    expect(fromMiddle).toEqual(fromRoot);
  });

  it('refuses a chain that already has its passage', () => {
    const { b, endureHarm } = beatSeven();
    const before = b.build();
    b.add(
      'narration.written',
      { role: 'beat', text: 'Sparks.', groundedIn: [] },
      { causedBy: before.at(-1)!.id, actor: AI_ACTOR },
    );

    expect(resolveBeatScope(b.build(), endureHarm as never)).toMatchObject({
      ok: false,
      reason: 'already_narrated',
    });
  });

  it('refuses a voided move', () => {
    const { b, faceDanger } = beatSeven();
    const events = b.build();
    const root = events.filter((e) => e.commandId === faceDanger);
    b.add('event.voided', {
      targetEventId: root[1]!.id,
      kind: 'player_void',
      reason: 'wrong stat',
      cascaded: events.filter((e) => e.seq > 7).map((e) => e.id),
    });

    expect(resolveBeatScope(b.build(), faceDanger as never)).toMatchObject({
      ok: false,
      reason: 'voided',
    });
  });

  it('refuses a command that is not a move, and one that does not exist', () => {
    const { b } = beatSeven();
    const events = b.build();
    expect(resolveBeatScope(events, events[0]!.commandId)).toMatchObject({
      ok: false,
      reason: 'not_a_move',
    });
    expect(resolveBeatScope(events, 'dddddddd-0000-4000-8000-000000000000' as never)).toMatchObject(
      { ok: false, reason: 'not_found' },
    );
  });
});

describe('describeBeat (task 7.4)', () => {
  function facts() {
    const { b, endureHarm } = beatSeven();
    const events = b.build();
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);
    return describeBeat(scope.events, project(events), events);
  }

  it('states the resolved chain as facts, in order, with the declared action', () => {
    const { lines } = facts();
    expect(lines).toEqual([
      'Rook makes the move Face Danger with iron.',
      'The player declared: "Rook forces the sealed bulkhead."',
      'Roll: action die 2 +2 iron = 4, against challenge dice 7 and 9: a miss.',
      'This leads to Pay the Price.',
      'Rook makes the move Pay the Price.',
      'For Pay the Price, the player chose: Roll on the table.',
      'Oracle result (32): You are harmed.',
      'This leads to Endure Harm.',
      'Rook makes the move Endure Harm with health.',
      'The player set the health loss at 1 for Rook.',
      "The injury, as the Guide established it: A ruptured conduit sprays sparks across Rook's arm.",
      "The player judged it milder than the Guide's proposed 2: narrate that injury at the severity the player set.",
      'Rook: health -1.',
      'Roll: action die 5 +4 health = 9, against challenge dice 3 and 6: a strong hit.',
    ]);
  });

  it('carries the established injury but never the severity the player overrode (D-130)', () => {
    const text = facts().lines.join('\n');
    expect(text).toContain('ruptured conduit');
    expect(text).not.toContain('serious burn');
    expect(text).not.toMatch(/loss at 2/);
  });

  it('adds no adjustment line when the player committed the proposed amount', () => {
    const { b, endureHarm } = beatSeven();
    const events = b
      .build()
      .map((e) =>
        e.type === 'amount.committed' ? { ...e, payload: { ...e.payload, amount: -2 } } : e,
      ) as AstrolabeEvent[];
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);
    const lines = describeBeat(scope.events, project(events), events).lines;
    expect(lines).toContain(
      "The injury, as the Guide established it: A ruptured conduit sprays sparks across Rook's arm.",
    );
    expect(lines.join('\n')).not.toMatch(/judged it/);
  });

  it('finds the injury of a standalone suffer move, whose proposal is outside the beat', () => {
    const b = goldenSessionPrelude();
    command(b, '10', null, (o) => {
      b.add(
        'amount.proposed',
        {
          moveId: ENDURE_HARM,
          characterId: ROOK,
          meter: 'health',
          amount: -1,
          injury: 'A spur of sheared track catches Rook under the arm.',
          reason: 'A shallow cut.',
        },
        { ...o, actor: AI_ACTOR },
      );
    });
    const proposal = b.last().id;
    const harm = command(b, '11', null, (o) => {
      b.add(
        'move.invoked',
        { moveId: ENDURE_HARM, actorCharacterId: ROOK, adds: [] },
        { ...o, actor: PLAYER_ACTOR },
      );
      b.add(
        'amount.committed',
        {
          moveId: ENDURE_HARM,
          characterId: ROOK,
          meter: 'health',
          amount: -1,
          proposalEventId: proposal,
        },
        o,
      );
    });
    const events = b.build();
    const scope = resolveBeatScope(events, harm as never);
    if (!scope.ok) throw new Error(scope.detail);

    expect(scope.events.some((e) => e.id === proposal)).toBe(false);
    expect(describeBeat(scope.events, project(events), events).lines).toContain(
      'The injury, as the Guide established it: A spur of sheared track catches Rook under the arm.',
    );
  });

  it('establishes nothing from a voided proposal', () => {
    const { b, endureHarm, proposal } = beatSeven();
    b.add('event.voided', {
      targetEventId: proposal,
      kind: 'player_void',
      reason: 'wrong wound',
      cascaded: [proposal],
    });
    const events = b.build();
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);
    expect(describeBeat(scope.events, project(events), events).lines.join('\n')).not.toMatch(
      /injury|judged it/,
    );
  });

  it('flags the chain as dramatic', () => {
    const f = facts();
    expect(f).toMatchObject({ declaredAction: true, miss: true, chainedToSuffer: true });
    expect(beatWeight(f)).toBe('dramatic');
  });

  it('keys every fact with its kind, character and source event (D-127)', () => {
    const { b, endureHarm, proposal } = beatSeven();
    const events = b.build();
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);
    const beat = describeBeat(scope.events, project(events), events);

    expect(beat.facts.map((f) => [f.key, f.kind, f.characterId === ROOK])).toEqual([
      ['F1', 'move', true],
      ['F2', 'declared_action', true],
      ['F3', 'roll', true],
      ['F4', 'move', false],
      ['F5', 'move', true],
      ['F6', 'choice', true],
      ['F7', 'roll', false],
      ['F8', 'move', false],
      ['F9', 'move', true],
      ['F10', 'effect', true],
      ['F11', 'injury', true],
      ['F12', 'injury', true],
      ['F13', 'effect', true],
      ['F14', 'roll', true],
    ]);
    expect(beat.lines).toEqual(beat.facts.map((f) => f.text));
    const committed = events.find((e) => e.type === 'amount.committed');
    // The injury is cited through the committed amount, never the proposal itself.
    expect(beat.facts.find((f) => f.key === 'F11')?.eventId).toBe(committed?.id);
    expect(beat.facts.some((f) => f.eventId === proposal)).toBe(false);
  });
});

describe('narration length (task 7.7, D-115)', () => {
  it('scales routine and dramatic ranges by the campaign adjustment', () => {
    expect(narrationBudget('routine', 'standard')).toEqual({ min: 60, max: 120 });
    expect(narrationBudget('dramatic', 'standard')).toEqual({ min: 120, max: 200 });
    expect(narrationBudget('routine', 'shorter')).toEqual({ min: 35, max: 70 });
    expect(narrationBudget('dramatic', 'longer')).toEqual({ min: 180, max: 300 });
  });

  const signals = {
    declaredAction: true,
    miss: false,
    match: false,
    burned: false,
    chainedToSuffer: false,
  };

  it('treats a plain weak hit as routine', () => {
    expect(beatWeight(signals)).toBe('routine');
    expect(beatWeight({ ...signals, match: true })).toBe('dramatic');
  });

  it('keeps a beat with no declared action routine, however dramatic (D-115, amended)', () => {
    // Round 20: a standalone Endure Harm, strong hit with a match, nothing declared.
    expect(beatWeight({ ...signals, declaredAction: false, match: true })).toBe('routine');
    expect(
      beatWeight({
        declaredAction: false,
        miss: true,
        match: true,
        burned: true,
        chainedToSuffer: true,
      }),
    ).toBe('routine');
  });
});

describe('prompt assembly (tasks 7.4, 7.6)', () => {
  function inputs(): { events: readonly AstrolabeEvent[]; facts: ReturnType<typeof describeBeat> } {
    const { b, endureHarm } = beatSeven();
    const events = b.build();
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);
    return { events, facts: describeBeat(scope.events, project(events), events) };
  }

  it('puts the stable rules and the latitude in cached system blocks, and the beat after them', () => {
    const { events, facts } = inputs();
    const request = buildBeatRequest(project(events), events, facts, COLOR);

    expect(request.system).toEqual([
      { text: GUIDE_RULES },
      { text: LATITUDE_INSTRUCTIONS.color, cache: true },
    ]);
    expect(request.user).toContain('<resolved_beat>');
    expect(request.user).toContain(
      '[F2] (declared action, Rook) The player declared: "Rook forces the sealed bulkhead."',
    );
    expect(request.user).toContain('[F7] (roll) Oracle result (32): You are harmed.');
    expect(request.user).toContain('Write the passage as segments');
    expect(request.user).not.toContain('No action was declared');
    expect(request.user).toContain('Narrate this beat as a dramatic moment, in 120 to 200 words.');
    expect(request).toMatchObject({ purpose: 'beat', effort: 'low' });
  });

  it('says so when nothing was declared, and asks for the routine length (D-115, D-127)', () => {
    const { events, facts } = inputs();
    const request = buildBeatRequest(
      project(events),
      events,
      { ...facts, declaredAction: false },
      COLOR,
    );
    expect(request.user).toContain('No action was declared: there is no declared-action fact.');
    expect(request.user).toContain('Narrate this beat as a routine moment, in 60 to 120 words.');
  });

  it('keeps the system prompt byte-stable across beats, so it caches', () => {
    const { events, facts } = inputs();
    const state = project(events);
    const a = buildBeatRequest(state, events, facts, COLOR);
    const b = buildBeatRequest(state, events, { ...facts, lines: ['Something else.'] }, COLOR);
    expect(a.system).toEqual(b.system);
  });

  it('selects the campaign’s latitude block (D-114)', () => {
    const { events, facts } = inputs();
    const state = project(events);
    for (const latitude of ['minimal', 'color', 'full_voice'] as const) {
      const request = buildBeatRequest(state, events, facts, {
        ...COLOR,
        narrationLatitude: latitude,
      });
      expect(request.system[1]?.text).toBe(LATITUDE_INSTRUCTIONS[latitude]);
    }
    expect(LATITUDE_INSTRUCTIONS.full_voice).toMatch(/says aloud/);
    expect(LATITUDE_INSTRUCTIONS.full_voice).toMatch(
      /Never narrate what a player character thinks or feels/,
    );
    expect(LATITUDE_INSTRUCTIONS.color).toMatch(/no dialogue from them, no thoughts, no feelings/);
  });

  it('forbids nudging and invented entities in the standing rules', () => {
    expect(GUIDE_RULES).toMatch(/Do not suggest what anyone should do next/);
    expect(GUIDE_RULES).toMatch(/Do not introduce new named characters, places or factions/);
  });

  it('carries the recent passages as corrected, not as first written', () => {
    const { b, endureHarm } = beatSeven();
    b.add(
      'narration.written',
      { role: 'beat', text: 'Rook looks shaken.', groundedIn: [] },
      { actor: AI_ACTOR },
    );
    const passage = b.last().id;
    b.add(
      'narration.correction_requested',
      { targetEventId: passage, note: 'A veteran, annoyed.' },
      { actor: PLAYER_ACTOR },
    );
    b.add(
      'narration.revised',
      { targetEventId: passage, text: 'Rook looks annoyed.' },
      { actor: AI_ACTOR },
    );
    const events = b.build();
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);

    const request = buildBeatRequest(
      project(events),
      events,
      describeBeat(scope.events, project(events), events),
      COLOR,
    );

    expect(request.user).toContain('Rook looks annoyed.');
    expect(request.user).not.toContain('shaken');
  });

  it('asks a revision to change only what the note requires', () => {
    const { events, facts } = inputs();
    const request = buildRevisionRequest(
      project(events),
      { text: 'Rook looks shaken.', note: 'A veteran, annoyed.' },
      facts,
      COLOR,
    );
    expect(request.purpose).toBe('revision');
    expect(request.user).toContain(
      '<player_correction>\nA veteran, annoyed.\n</player_correction>',
    );
    expect(request.user).toMatch(/Change only what the correction requires/);
  });

  it('asks for a harm proposal inside the declared range', () => {
    const { events, facts } = inputs();
    const request = buildHarmProposalRequest(
      project(events),
      facts,
      { callsign: 'Rook', meter: 'health', range: [-3, -1] },
      COLOR,
    );
    expect(request.purpose).toBe('harm_proposal');
    expect(request.user).toMatch(/from -1 \(minor\) to -3 \(major\)/);
  });
});

describe('renderState (task 7.4)', () => {
  it('renders the crew, the scene and the vow from projected state', () => {
    const text = renderState(project(goldenSessionPrelude().build()));
    expect(text).toContain('Rook Ilari, called Rook (pronouns not recorded');
    expect(text).toContain('health 5, spirit 5, supply 5, momentum 2');
    expect(text).toContain('Current scene: The relay station');
    expect(text).toContain(
      'Vow (formidable) "Recover the flight recorder of Meridian\'s Hope": 0 of 10 progress boxes',
    );
  });

  it('carries a launched campaign’s truths into play narration (D-183)', () => {
    // The defect group 5 exists to fix: this read was `state.truths`, the
    // Milestone 1 fold, so a campaign that decided its truths through Campaign
    // Launch was narrated by a Guide that knew none of them.
    const text = renderState(
      project(
        goldenSessionPrelude()
          .add('truth.decided', {
            truthId: 'oracle:cataclysm' as never,
            resolution: 'selected',
            optionIndex: 0,
            text: 'The Sun Plague extinguished the stars.',
            summary: 'The Sun Plague.',
            provenance: 'official_choice',
            groundedIn: [],
          })
          .build(),
      ),
    );

    expect(text).toContain('Setting truths:');
    expect(text).toContain('- Cataclysm: The Sun Plague extinguished the stars.');
  });

  // 7.0h: the same defect as D-183, for the ship.
  it('carries the launched ship into play narration, with each module’s owner', () => {
    const text = renderState(
      project(
        goldenSessionPrelude()
          .add('character.revised', {
            characterId: VESNA,
            character: {
              ...character(VESNA, 'Vesna Kade', 7),
              assets: ['asset:module/sensor-array' as never],
              appearance: 'A flight jacket.',
              backstory: { kind: 'discover_in_play' },
              backgroundVow: { title: 'Chart the Drift', rank: 'formidable' },
            },
            provenance: 'player_written',
            groundedIn: [],
          })
          .add('starship.established', {
            starshipId: 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as never,
            name: 'Lantern Wake',
            appearance: 'A patched hull.',
            history: 'Won in a wager.',
            quirks: ['Its clocks run slow.'],
            integrity: { value: 5, min: 0, max: 5 },
            assetId: 'asset:command-vehicle/starship' as never,
            provenance: 'player_written',
            groundedIn: [],
          })
          .build(),
      ),
    );

    expect(text).toContain(
      "The crew's shared starship: Lantern Wake, integrity 5 of 5 - A patched hull.; " +
        'history: Won in a wager.; quirks: Its clocks run slow.; ' +
        "installed modules: Sensor Array (Vesna Kade's).",
    );
  });

  it('says nothing about a ship a campaign never established', () => {
    expect(renderState(project(goldenSessionPrelude().build()))).not.toContain('starship');
  });

  it('carries a Milestone 1 campaign’s truths too, through the same read (D-183)', () => {
    // The positive control for the fold: one representation has to serve both,
    // or ending the split would have traded one blind spot for another.
    const text = renderState(
      project(
        goldenSessionPrelude()
          .add('truth.set', {
            oracleId: 'oracle:cataclysm' as never,
            source: 'written',
            text: 'A slow collapse, not one cataclysm.',
          })
          .build(),
      ),
    );

    expect(text).toContain('- Cataclysm: A slow collapse, not one cataclysm.');
  });

  it('states a deliberately open truth as open, never as blank (D-162)', () => {
    const text = renderState(
      project(
        goldenSessionPrelude()
          .add('truth.decided', {
            truthId: 'oracle:horrors' as never,
            resolution: 'leave_open',
            provenance: 'player_written',
            groundedIn: [],
          })
          .build(),
      ),
    );

    // An open truth is a fact about the campaign, not a gap the Guide may fill.
    expect(text).toContain('- Horrors: deliberately left open — do not settle it');
  });

  it('names recorded pronouns, and says when none are recorded without implying a default (D-131)', () => {
    const lines = renderState(project(goldenSessionPrelude().build())).split('\n');
    const vesna = lines.find((line) => line.startsWith('- Vesna Kade'));
    const rook = lines.find((line) => line.startsWith('- Rook Ilari'));

    expect(vesna).toMatch(/^- Vesna Kade, called Vesna \(she\/her\): /);
    expect(rook).toMatch(/^- Rook Ilari, called Rook \(pronouns not recorded\): /);
    // No pronoun of any kind is offered for a character with none recorded.
    expect(rook).not.toMatch(/\b(she|her|he|him|his|they|them|their)\b/i);
    // What to do about it is a standing rule, stated once, not state.
    expect(GUIDE_RULES).toContain(
      'for a character whose pronouns are not recorded, use no pronoun',
    );
  });
});
