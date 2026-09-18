import type { AssetId, MoveId, Provenance } from './ids.js';

/**
 * The six asset categories present in the Starforged data, keyed by
 * Datasworn's collection key rather than its display name ("Command
 * Vehicle"). The key is the stable identifier; the name is for the UI.
 */
export type AssetCategoryId =
  'path' | 'companion' | 'deed' | 'module' | 'support_vehicle' | 'command_vehicle';

/**
 * An asset collection, imported as an entity in its own right.
 *
 * Its `description` is where Starforged states several rules that live
 * nowhere else in the data — that the starship is a default asset, that a
 * character selects at least two paths, that deeds cannot be taken at
 * creation. Character-creation constraints (D-89) are traced back to this
 * text the same way move effects are traced to move text.
 */
export interface AssetCategory {
  readonly id: AssetCategoryId;
  /** The display name, e.g. "Command Vehicle Assets". */
  readonly name: string;
  /** Verbatim collection prose, with `[X](id:…)` links rewritten to Astrolabe IDs. */
  readonly description: string;
  readonly source: Provenance;
}

/**
 * What an asset can have attached to it. Only the Starship carries one:
 * modules attach to it, with no limit.
 */
export interface AssetAttachments {
  /** `undefined` means no limit. */
  readonly max?: number;
  /** The categories whose assets may attach. */
  readonly categories: readonly AssetCategoryId[];
}

/**
 * The imported layer for an asset. Asset automation is Guided (D-24): the
 * ability text is shown with a button, and only the playtest characters'
 * assets get a hand-authored effect in the automation layer.
 */
export interface Asset {
  readonly id: AssetId;
  readonly categoryId: AssetCategoryId;
  /** e.g. "Path", "Companion", "Command Vehicle" — Datasworn's display label. */
  readonly category: string;
  readonly name: string;
  readonly countAsImpact: boolean;
  /**
   * Verbatim prose gating the asset, and it means two different things by
   * category. On a **deed** it gates acquisition ("Once you fill 4 boxes on
   * your bonds legacy track…") — those are unreachable at creation, which
   * is one reason D-89 forbids the category outright. On a **path** it
   * gates *use*, not selection ("If you wield a bladed weapon…"), so it
   * must never block a creation choice.
   */
  readonly requirement?: string;
  /** Usable by the whole crew: the starship, every module, every support vehicle. */
  readonly shared: boolean;
  readonly attachments?: AssetAttachments;
  /**
   * The asset's condition meters, as Datasworn declares them: the Starship's
   * integrity, a companion's health, a vehicle's integrity. Imported so a
   * starting value is traced to its rule rather than written as a literal
   * (7.0b). Absent when the asset has none. Impacts are data only: nothing
   * marks them in Milestone 2.
   */
  readonly conditionMeters?: readonly AssetConditionMeter[];
  readonly abilities: readonly AssetAbility[];
  readonly source: Provenance;
}

export interface AssetConditionMeter {
  /** Datasworn's control key, e.g. `integrity`, `health`. */
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** The value the asset starts at. */
  readonly value: number;
  /** Impacts nested under the meter, e.g. the Starship's `battered` and `cursed`. */
  readonly impacts: readonly { readonly key: string; readonly label: string }[];
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
