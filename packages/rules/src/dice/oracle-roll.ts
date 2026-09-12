import type { OracleRollResult, RandomSource } from '../schema/dice.js';
import type { OracleTable } from '../schema/oracles.js';

import { rollDiceExpression } from './primitives.js';

/**
 * Rolls against one oracle table (design record section 4, section 9's
 * "the server rolls, the AI interprets"). Every row the adapter imports has
 * a real min/max — unrollable rendering-only rows were dropped at import
 * time (adapter/oracles.ts) — so a table with complete row coverage for its
 * die never throws here; index.test.ts in the dice module checks that
 * holds for every table Datasworn actually ships.
 */
export function rollOracle(rng: RandomSource, table: OracleTable): OracleRollResult {
  const roll = rollDiceExpression(rng, table.dice);
  const row = table.rows.find((r) => roll >= r.min && roll <= r.max);
  if (row === undefined) {
    throw new Error(`No row on oracle table "${table.id}" covers roll ${roll}`);
  }
  return {
    roll,
    row: { text: row.text, ...(row.text2 !== undefined && { text2: row.text2 }) },
  };
}
