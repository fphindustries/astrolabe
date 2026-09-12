import type { AssetId, MoveId, Provenance } from './ids.js';

/**
 * The imported layer for an asset. Asset automation is Guided (D-24): the
 * ability text is shown with a button, and only the playtest characters'
 * assets get a hand-authored effect in the automation layer.
 */
export interface Asset {
  readonly id: AssetId;
  /** e.g. "Path", "Companion", "Command Vehicle" */
  readonly category: string;
  readonly name: string;
  readonly countAsImpact: boolean;
  readonly abilities: readonly AssetAbility[];
  readonly source: Provenance;
}

export interface AssetAbility {
  readonly id: string;
  readonly enabledByDefault: boolean;
  readonly text: string;
  /**
   * Moves this ability applies to, so task 6.3 can surface it when one of
   * these is picked. Datasworn wildcards (e.g. `moves/*\/face_danger`) are
   * expanded to concrete move IDs at import time (section 3.6).
   */
  readonly enhances: readonly MoveId[];
}
