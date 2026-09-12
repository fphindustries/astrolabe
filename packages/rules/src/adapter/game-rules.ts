import type { Datasworn } from '@datasworn/core';

import type {
  ConditionMeterDef,
  GameRules,
  ImpactCategory,
  ImpactDef,
  SpecialTrackDef,
  SpecialTrackId,
} from '../schema/game-rules.js';
import type { ImpactId, MeterId } from '../schema/ids.js';

function kebab(key: string): string {
  return key.replace(/_/g, '-');
}

function mapConditionMeter(id: MeterId, raw: Datasworn.ConditionMeterRule): ConditionMeterDef {
  return {
    id,
    label: raw.label,
    min: raw.min,
    max: raw.max,
    startingValue: raw.value,
  };
}

function mapImpactCategory(
  categoryKey: string,
  raw: Datasworn.ImpactCategory,
): readonly ImpactDef[] {
  const category = categoryKey as ImpactCategory;
  return Object.entries(raw.contents).map(
    ([impactKey, impact]: [string, Datasworn.ImpactRule]) => ({
      id: `impact:${kebab(impactKey)}` as ImpactId,
      category,
      label: impact.label,
    }),
  );
}

/**
 * Confirmed against the Starforged data before writing this: condition
 * meter keys are exactly health, spirit, supply; impact categories are
 * exactly misfortunes, vehicle_troubles, burdens, lasting_effects, with 10
 * impacts total and no key collisions across categories. Stats (edge,
 * heart, iron, shadow, wits) don't appear here — StatId is a fixed union in
 * ids.ts, not something GameRules needs to carry.
 */
export function mapGameRules(raw: Datasworn.Rules): GameRules {
  const conditionMeters = Object.entries(raw.condition_meters).map(
    ([key, meter]: [string, Datasworn.ConditionMeterRule]) =>
      mapConditionMeter(key as MeterId, meter),
  );

  const impacts = Object.entries(raw.impacts).flatMap(
    ([categoryKey, category]: [string, Datasworn.ImpactCategory]) =>
      mapImpactCategory(categoryKey, category),
  );

  const specialTracks: SpecialTrackDef[] = Object.entries(raw.special_tracks).map(
    ([key, track]: [string, Datasworn.SpecialTrackRule]) => ({
      id: key as SpecialTrackId,
      label: track.label,
    }),
  );

  return { conditionMeters, impacts, specialTracks };
}
