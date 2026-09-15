import type { ImpactId, MeterId } from './ids.js';

export interface ConditionMeterDef {
  readonly id: MeterId;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly startingValue: number;
}

/** The four impact categories present in the Starforged data. */
export type ImpactCategory = 'misfortunes' | 'vehicle_troubles' | 'burdens' | 'lasting_effects';

export interface ImpactDef {
  readonly id: ImpactId;
  readonly category: ImpactCategory;
  readonly label: string;
}

export type SpecialTrackId = 'quests_legacy' | 'bonds_legacy' | 'discoveries_legacy';

export interface SpecialTrackDef {
  readonly id: SpecialTrackId;
  readonly label: string;
}

/**
 * The game constants Datasworn defines outside of moves, oracles and
 * assets — condition meters, impacts, and the legacy tracks (design record
 * section 5). Populated by the adapter (task 1.3).
 */
export interface GameRules {
  readonly conditionMeters: readonly ConditionMeterDef[];
  readonly impacts: readonly ImpactDef[];
  readonly specialTracks: readonly SpecialTrackDef[];
}
