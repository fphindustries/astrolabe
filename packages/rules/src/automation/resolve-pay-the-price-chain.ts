import { rollOracle } from '../dice/oracle-roll.js';
import type { OracleChainRow } from '../schema/automation.js';
import type { RandomSource } from '../schema/dice.js';
import type { MoveId } from '../schema/ids.js';
import type { OracleTable } from '../schema/oracles.js';

export interface OracleChainStep {
  readonly roll: number;
  readonly rowText: string;
  /** undefined when the row has no Automated chain target — narration only (D-67). */
  readonly to: MoveId | undefined;
}

const ROLL_TWICE_TEXT = 'Roll twice';

function toChainStep(
  roll: number,
  rowText: string,
  rows: readonly OracleChainRow[],
): OracleChainStep {
  const chainRow = rows.find((r) => roll >= r.min && roll <= r.max);
  return { roll, rowText, to: chainRow?.to };
}

function rollNested(
  rng: RandomSource,
  table: OracleTable,
  rows: readonly OracleChainRow[],
): OracleChainStep {
  const result = rollOracle(rng, table);
  if (result.row.text !== ROLL_TWICE_TEXT) {
    return toChainStep(result.roll, result.row.text, rows);
  }
  // D-68: a nested "Roll twice" is rerolled once rather than spawning
  // another pair — the reroll's result stands even if it lands on
  // "Roll twice" again, so this never recurses further.
  const reroll = rollOracle(rng, table);
  return toChainStep(reroll.roll, reroll.row.text, rows);
}

/**
 * Pay the Price's table roll (D-08's highlighted method option), including
 * D-68's "roll twice" handling. A plain roll produces one step; "Roll
 * twice" produces exactly two, however the dice land — never more, per
 * D-68's cap.
 */
export function resolvePayThePriceChain(
  rng: RandomSource,
  table: OracleTable,
  rows: readonly OracleChainRow[],
): readonly OracleChainStep[] {
  const first = rollOracle(rng, table);
  if (first.row.text !== ROLL_TWICE_TEXT) {
    return [toChainStep(first.roll, first.row.text, rows)];
  }
  return [rollNested(rng, table, rows), rollNested(rng, table, rows)];
}
