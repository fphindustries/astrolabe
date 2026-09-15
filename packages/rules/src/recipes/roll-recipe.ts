import { rollOracle } from '../dice/oracle-roll.js';
import type { RandomSource } from '../schema/dice.js';
import type { OracleId } from '../schema/ids.js';
import type { OracleRecipe, OracleRecipeSlot, OracleTable } from '../schema/oracles.js';

/** One result a slot holds: the table actually rolled, and what it said. */
export interface RecipeResult {
  readonly oracleId: OracleId;
  readonly roll: number;
  readonly rowText: string;
}

export interface RolledSlot {
  readonly slot: OracleRecipeSlot;
  /**
   * Usually one. Two for a "Roll twice" row (D-68), and one per embedded
   * table for a row such as "[Action] + [Theme]". A row that only says what
   * to roll next is never a result itself: the Guide interprets dice, not
   * instructions.
   */
  readonly results: readonly RecipeResult[];
}

const ROLL_TWICE_TEXT = 'Roll twice';

type TableOf = (id: OracleId) => OracleTable | undefined;

/**
 * D-65: roll every table in a recipe, in its declared order, so a beat's
 * grounding is reproducible from a seeded source. The tables are passed in
 * rather than read from `STARFORGED`, the same way `rollOracle` takes one.
 */
export function rollRecipe(
  rng: RandomSource,
  recipe: OracleRecipe,
  tableOf: TableOf,
): readonly RolledSlot[] {
  return recipe.rolls.map((slot) => {
    const table = requireTable(tableOf, slot.oracle, recipe);
    const first = rollOracle(rng, table);
    if (first.row.text !== ROLL_TWICE_TEXT) {
      return { slot, results: expand(rng, table, first, tableOf, recipe) };
    }
    return {
      slot,
      results: [
        rollNested(rng, table, tableOf, recipe),
        rollNested(rng, table, tableOf, recipe),
      ].flat(),
    };
  });
}

/**
 * D-18, D-70 (8.3): roll one result's table again, for a result the Guide
 * found contradicts what is established. It resolves like a nested roll in
 * a recipe: a "Roll twice" is rerolled once (D-68), and a row that embeds
 * tables gives one result per embedded table. The caller discards the old
 * result; nothing here knows about caps.
 */
export function rerollResult(
  rng: RandomSource,
  oracleId: OracleId,
  tableOf: TableOf,
  recipe: OracleRecipe,
): readonly RecipeResult[] {
  return rollNested(rng, requireTable(tableOf, oracleId, recipe), tableOf, recipe);
}

/** D-68, as Pay the Price applies it: a nested "Roll twice" is rerolled once, and that result stands. */
function rollNested(
  rng: RandomSource,
  table: OracleTable,
  tableOf: TableOf,
  recipe: OracleRecipe,
): readonly RecipeResult[] {
  const result = rollOracle(rng, table);
  const settled = result.row.text === ROLL_TWICE_TEXT ? rollOracle(rng, table) : result;
  return expand(rng, table, settled, tableOf, recipe);
}

/** A row that embeds tables ("[Action] + [Theme]") is resolved by rolling each of them. */
function expand(
  rng: RandomSource,
  table: OracleTable,
  result: ReturnType<typeof rollOracle>,
  tableOf: TableOf,
  recipe: OracleRecipe,
): readonly RecipeResult[] {
  const row = table.rows.find((r) => result.roll >= r.min && result.roll <= r.max);
  const embedded = row?.embeddedOracles ?? [];
  if (embedded.length === 0) {
    return [{ oracleId: table.id, roll: result.roll, rowText: result.row.text }];
  }
  return embedded.map((id) => {
    const inner = rollOracle(rng, requireTable(tableOf, id, recipe));
    return { oracleId: id, roll: inner.roll, rowText: inner.row.text };
  });
}

function requireTable(tableOf: TableOf, id: OracleId, recipe: OracleRecipe): OracleTable {
  const table = tableOf(id);
  if (table === undefined) {
    throw new Error(`Recipe "${recipe.id}" names oracle "${id}", which is not loaded.`);
  }
  return table;
}
