import { describe, expect, it } from 'vitest';

import { MOVE_AUTOMATION_SPECS } from '../automation/index.js';
import { STARFORGED } from '../generated/index.js';
import { isVerbatimClause } from '../schema/traceability.js';

import { ODDS_ORACLES, ORACLE_MATCH_CLAUSE, ORACLE_ODDS, isOracleMatch } from './yes-no.js';

describe('yes/no questions with odds (8.4, D-28)', () => {
  it('rolls each odds on one of the tables Ask the Oracle names', () => {
    const named = MOVE_AUTOMATION_SPECS.get('move:fate/ask-the-oracle')!.method!.options.flatMap(
      (option) =>
        option.effects.flatMap((e) => (e.effect.kind === 'oracle_roll' ? [e.effect.oracle] : [])),
    );
    expect(ORACLE_ODDS.map((odds) => ODDS_ORACLES[odds]).sort()).toEqual([...named].sort());
    for (const odds of ORACLE_ODDS) {
      expect(STARFORGED.oracles.some((t) => t.id === ODDS_ORACLES[odds])).toBe(true);
    }
  });

  it('quotes the match rule verbatim from the move', () => {
    const move = STARFORGED.moves.find((m) => m.id === 'move:fate/ask-the-oracle')!;
    expect(isVerbatimClause(ORACLE_MATCH_CLAUSE, move.text)).toBe(true);
  });

  it('reads doubles, and 100 as 00, as a match', () => {
    expect([11, 22, 55, 99, 100].every(isOracleMatch)).toBe(true);
    expect([1, 10, 12, 50, 98].some(isOracleMatch)).toBe(false);
  });
});
