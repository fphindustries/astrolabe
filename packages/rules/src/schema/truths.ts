import type { OracleId, Provenance } from './ids.js';
import type { OracleRow, OracleTable } from './oracles.js';

/** A nested elaboration table attached to a setting-truth option. */
export type TruthSubchoiceTable = OracleTable;

/** A truth option remains rollable like an oracle row, with its launch context retained. */
export interface TruthOption extends OracleRow {
  readonly summary: string;
  readonly description: string;
  readonly questStarter?: string;
  readonly subchoice?: TruthSubchoiceTable;
}

/**
 * A setting truth is intentionally oracle-shaped so Milestone 1 consumers
 * keep working while Campaign Launch gains its richer metadata.
 */
export interface SettingTruth extends Omit<OracleTable, 'rows'> {
  readonly id: OracleId;
  readonly order: number;
  readonly rows: readonly TruthOption[];
  readonly characterPrompt?: string;
  readonly source: Provenance;
}
