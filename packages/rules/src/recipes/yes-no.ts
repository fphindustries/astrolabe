import type { OracleId } from '../schema/ids.js';

/**
 * D-28 (8.4): the odds the Guide sets on its own yes/no questions about the
 * world, each rolled on Ask the Oracle's own table, and the move's rule for
 * a match. Ask the Oracle's automation spec names the same five tables.
 */
export const ORACLE_ODDS = [
  'small_chance',
  'unlikely',
  'fifty_fifty',
  'likely',
  'almost_certain',
] as const;

export type OracleOdds = (typeof ORACLE_ODDS)[number];

export const ODDS_ORACLES: Readonly<Record<OracleOdds, OracleId>> = {
  small_chance: 'oracle:moves/ask-the-oracle/small-chance',
  unlikely: 'oracle:moves/ask-the-oracle/unlikely',
  fifty_fifty: 'oracle:moves/ask-the-oracle/fifty-fifty',
  likely: 'oracle:moves/ask-the-oracle/likely',
  almost_certain: 'oracle:moves/ask-the-oracle/almost-certain',
};

/** Verbatim from Ask the Oracle's text (traceability test in `yes-no.test.ts`). */
export const ORACLE_MATCH_CLAUSE = 'On a match, envision an extreme result or twist.';

/** A d100 match: both digits the same, with 100 read as 00. */
export function isOracleMatch(roll: number): boolean {
  return roll === 100 || (roll >= 11 && roll <= 99 && roll % 11 === 0);
}
