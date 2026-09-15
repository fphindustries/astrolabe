import { describe, expect, it } from 'vitest';

import type { Move, MoveId, OracleId, OracleTable, Provenance } from '@astrolabe/rules';

import { moveDetail, movesByCategory } from './moves.js';

const SOURCE: Provenance = {
  sourceId: 'starforged/moves/adventure/face_danger',
  sourceVersion: '0.0.10',
  book: 'Ironsworn: Starforged Rulebook',
  authors: ['Shawn Tomkin'],
  license: 'https://creativecommons.org/licenses/by/4.0',
  url: 'https://tomkinpress.com/pages/starforged-quickstart',
};

function move(overrides: Partial<Move> = {}): Move {
  return {
    id: 'move:adventure/face_danger' as MoveId,
    category: 'adventure',
    name: 'Face Danger',
    rollType: 'action',
    trigger: { text: 'When you attempt something risky…', conditions: [] },
    outcomes: {
      strong_hit: { text: 'You do what you set out to do.' },
      weak_hit: { text: 'You do it, but with a cost.' },
      miss: { text: "You fail, or you're stopped short." },
    },
    text: 'Face Danger full text…',
    embeddedOracles: [],
    source: SOURCE,
    ...overrides,
  };
}

describe('movesByCategory', () => {
  it('groups moves under their category, in rulebook order, alphabetised within it', () => {
    const groups = movesByCategory([
      move({ id: 'move:adventure/gather_information' as MoveId, name: 'Gather Information' }),
      move({ id: 'move:adventure/face_danger' as MoveId, name: 'Face Danger' }),
      move({
        id: 'move:session/begin_session' as MoveId,
        name: 'Begin a Session',
        category: 'session',
      }),
    ]);

    expect(groups.map((group) => group.category)).toEqual(['session', 'adventure']);
    expect(groups[1]?.moves.map((m) => m.name)).toEqual(['Face Danger', 'Gather Information']);
  });

  it('omits categories with no moves', () => {
    const groups = movesByCategory([move({ category: 'combat' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.category).toBe('combat');
  });
});

describe('moveDetail', () => {
  it('flattens outcomes and resolves embedded oracle names', () => {
    const oracle: OracleTable = {
      id: 'oracle:starforged/oracles/moves/oracle' as OracleId,
      name: 'A Derelict Oracle',
      dice: '1d100',
      kind: 'text',
      rows: [],
      suggests: [],
      source: SOURCE,
    };

    const detail = moveDetail(move({ embeddedOracles: [oracle.id] }), [oracle]);

    expect(detail.triggerText).toBe('When you attempt something risky…');
    expect(detail.outcomes).toEqual([
      { tier: 'strong_hit', text: 'You do what you set out to do.' },
      { tier: 'weak_hit', text: 'You do it, but with a cost.' },
      { tier: 'miss', text: "You fail, or you're stopped short." },
    ]);
    expect(detail.embeddedOracleNames).toEqual(['A Derelict Oracle']);
  });

  it('shows rules links as their labels, not markup', () => {
    const detail = moveDetail(
      move({
        trigger: {
          text: 'When you [Face Danger](id:move:adventure/face-danger) in armor…',
          conditions: [],
        },
        outcomes: {
          miss: { text: 'You fail. [Pay the Price](id:move:fate/pay-the-price).' },
        },
      }),
      [],
    );

    expect(detail.triggerText).toBe('When you Face Danger in armor…');
    expect(detail.outcomes).toEqual([{ tier: 'miss', text: 'You fail. Pay the Price.' }]);
  });

  it('returns no outcomes for a no_roll move', () => {
    const detail = moveDetail(move({ outcomes: null, rollType: 'none' }), []);
    expect(detail.outcomes).toEqual([]);
  });

  it('falls back to the raw id when an embedded oracle is not found', () => {
    const detail = moveDetail(move({ embeddedOracles: ['oracle:missing' as OracleId] }), []);
    expect(detail.embeddedOracleNames).toEqual(['oracle:missing']);
  });
});
