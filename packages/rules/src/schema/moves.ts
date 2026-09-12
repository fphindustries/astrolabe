import type {
  AssetId,
  MeterId,
  MoveCategoryId,
  MoveId,
  OracleId,
  Provenance,
  StatId,
} from './ids.js';

export type OutcomeTier = 'strong_hit' | 'weak_hit' | 'miss';

/**
 * The four `roll_type` values present in the Starforged data
 * (`action_roll` ×42, `no_roll` ×18, `progress_roll` ×5, `special_track` ×3).
 */
export type RollType = 'action' | 'progress' | 'special_track' | 'none';

/**
 * The imported layer: a faithful, verbatim projection of one Datasworn
 * move. Outcome text is never parsed for effects here — see automation.ts
 * for why, and for where effects actually come from.
 */
export interface Move {
  readonly id: MoveId;
  readonly category: MoveCategoryId;
  readonly name: string;
  readonly rollType: RollType;
  readonly trigger: MoveTrigger;
  /** Verbatim outcome prose, keyed by tier. `null` for a no_roll move. */
  readonly outcomes: Partial<Record<OutcomeTier, MoveOutcomeText>> | null;
  /** Full markdown body, with `[X](id:starforged/…)` links rewritten to Astrolabe IDs. */
  readonly text: string;
  /** From `{{table:...}}` embeds and the move's own `oracles` field. */
  readonly embeddedOracles: readonly OracleId[];
  readonly source: Provenance;
}

export interface MoveOutcomeText {
  readonly text: string;
}

export interface MoveTrigger {
  readonly text: string;
  readonly conditions: readonly TriggerCondition[];
}

/**
 * The five `method` values present in the Starforged data
 * (`player_choice` ×85, `highest` ×3, `progress_roll` ×5, `lowest` ×1, `all` ×1).
 */
export type TriggerMethod = 'player_choice' | 'highest' | 'lowest' | 'all' | 'progress_roll';

export interface TriggerCondition {
  /** e.g. "With strength, endurance, or aggression" */
  readonly text?: string;
  readonly method: TriggerMethod | null;
  readonly rollOptions: readonly RollOption[];
}

/**
 * All 8 `using` values actually present across the Starforged move data
 * (verified directly, not assumed): `stat`, `condition_meter` and
 * `progress_track` cover the moves Milestone 1 automates; `asset_control`,
 * `custom` and the three `*_legacy` values only appear on moves that stay
 * at Reference in Milestone 1 (D-59), but are modelled here anyway so the
 * adapter never has to drop a trigger condition to make it fit.
 */
export type RollOption =
  | { readonly using: 'stat'; readonly stat: StatId }
  | { readonly using: 'condition_meter'; readonly meter: MeterId }
  | { readonly using: 'progress_track' }
  | {
      readonly using: 'asset_control';
      readonly assets: readonly AssetId[] | null;
      readonly control: string;
    }
  | { readonly using: 'custom'; readonly label: string; readonly value: number }
  | { readonly using: 'legacy_track'; readonly track: 'quests' | 'bonds' | 'discoveries' };
