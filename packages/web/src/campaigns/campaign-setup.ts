import type { OracleTable } from '@astrolabe/rules';
import type { CampaignState, EntityId, EntityState } from '@astrolabe/shared';

/**
 * Pure view-model helpers for the setup steps (tasks 4.2–4.4), kept out of
 * JSX and unit tested with no DOM — same split as `characters/creation-form.ts`.
 */

/** Every truth question the player hasn't answered yet, in `STARFORGED`'s own order. */
export function unansweredTruths(
  truths: readonly OracleTable[],
  answered: CampaignState['truths'],
): readonly OracleTable[] {
  return truths.filter((truth) => answered[truth.id] === undefined);
}

/** Every established location, in the order they were added. */
export function sectorLocations(state: CampaignState): readonly EntityState[] {
  return Object.values(state.entities)
    .filter((entity) => entity.kind === 'location')
    .sort((a, b) => a.provenance.eventId.localeCompare(b.provenance.eventId));
}

export interface SectorRouteView {
  readonly from: string;
  readonly to: string;
}

/** Routes with location names resolved, for display. */
export function sectorRouteViews(state: CampaignState): readonly SectorRouteView[] {
  const nameOf = (id: EntityId): string => state.entities[id]?.name ?? id;
  return state.sector.routes.map((route) => ({ from: nameOf(route.from), to: nameOf(route.to) }));
}
