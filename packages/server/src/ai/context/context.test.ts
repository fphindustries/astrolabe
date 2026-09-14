import type { MoveId, OracleId } from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignSettings, EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import {
  goldenSessionPrelude,
  PLAYER_ACTOR,
  ROOK,
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

  command(b, '3', chainToHarm!, (o) => {
    b.add(
      'amount.proposed',
      {
        moveId: ENDURE_HARM,
        characterId: ROOK,
        meter: 'health',
        amount: -2,
        reason: 'A serious burn.',
      },
      { ...o, actor: AI_ACTOR },
    );
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
      { moveId: ENDURE_HARM, characterId: ROOK, meter: 'health', amount: -1 },
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

  return { b, faceDanger, payThePrice, endureHarm };
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
    return describeBeat(scope.events, project(events));
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
      'Rook: health -1.',
      'Roll: action die 5 +4 health = 9, against challenge dice 3 and 6: a strong hit.',
    ]);
  });

  it('follows the committed amount, never the AI proposal', () => {
    expect(facts().lines.join('\n')).not.toContain('serious burn');
  });

  it('flags the chain as dramatic', () => {
    const f = facts();
    expect(f).toMatchObject({ miss: true, chainedToSuffer: true });
    expect(beatWeight(f)).toBe('dramatic');
  });
});

describe('narration length (task 7.7, D-115)', () => {
  it('scales routine and dramatic ranges by the campaign adjustment', () => {
    expect(narrationBudget('routine', 'standard')).toEqual({ min: 60, max: 120 });
    expect(narrationBudget('dramatic', 'standard')).toEqual({ min: 120, max: 200 });
    expect(narrationBudget('routine', 'shorter')).toEqual({ min: 35, max: 70 });
    expect(narrationBudget('dramatic', 'longer')).toEqual({ min: 180, max: 300 });
  });

  it('treats a plain weak hit as routine', () => {
    expect(beatWeight({ miss: false, match: false, burned: false, chainedToSuffer: false })).toBe(
      'routine',
    );
    expect(beatWeight({ miss: false, match: true, burned: false, chainedToSuffer: false })).toBe(
      'dramatic',
    );
  });
});

describe('prompt assembly (tasks 7.4, 7.6)', () => {
  function inputs(): { events: readonly AstrolabeEvent[]; facts: ReturnType<typeof describeBeat> } {
    const { b, endureHarm } = beatSeven();
    const events = b.build();
    const scope = resolveBeatScope(events, endureHarm as never);
    if (!scope.ok) throw new Error(scope.detail);
    return { events, facts: describeBeat(scope.events, project(events)) };
  }

  it('puts the stable rules and the latitude in cached system blocks, and the beat after them', () => {
    const { events, facts } = inputs();
    const request = buildBeatRequest(project(events), events, facts, COLOR);

    expect(request.system).toEqual([
      { text: GUIDE_RULES },
      { text: LATITUDE_INSTRUCTIONS.color, cache: true },
    ]);
    expect(request.user).toContain('<resolved_beat>');
    expect(request.user).toContain('Narrate this beat as a dramatic moment, in 120 to 200 words.');
    expect(request).toMatchObject({ purpose: 'beat', effort: 'low' });
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
      describeBeat(scope.events, project(events)),
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
