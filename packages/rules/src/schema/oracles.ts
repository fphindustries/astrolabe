import type { OracleId, Provenance, RecipeId } from './ids.js';

/** The three `oracle_type` values present in the Starforged data. */
export type OracleKind = 'text' | 'text2' | 'column_text';

export interface OracleTable {
  readonly id: OracleId;
  readonly name: string;
  /** e.g. "1d100" */
  readonly dice: string;
  readonly kind: OracleKind;
  readonly rows: readonly OracleRow[];
  /** e.g. Action suggests Theme. */
  readonly suggests: readonly OracleId[];
  readonly source: Provenance;
}

export interface OracleRow {
  readonly min: number;
  readonly max: number;
  readonly text: string;
  readonly text2?: string;
  /** Rows can embed further tables, e.g. a truth option's `{{table:...}}`. */
  readonly embeddedOracles?: readonly OracleId[];
}

/**
 * D-65: a named set of oracle rolls that grounds one generated entity —
 * closes design record section 4's "how many rolls a single beat should
 * use". The AI requests a recipe by name; the server rolls every table in
 * it and returns the results with their slots; the AI interprets.
 */
export interface OracleRecipe {
  readonly id: RecipeId;
  readonly entityKind: 'npc' | 'location' | 'derelict' | 'faction';
  readonly rolls: readonly OracleRecipeSlot[];
}

export interface OracleRecipeSlot {
  /** Names the field this roll fills, e.g. "role", "disposition". */
  readonly slot: string;
  readonly oracle: OracleId;
}
