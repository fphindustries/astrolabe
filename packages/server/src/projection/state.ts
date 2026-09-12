import type { CampaignState } from '@astrolabe/shared';

/**
 * The empty projection, and the one game constant the projector itself
 * needs.
 *
 * The read-model shapes this module used to declare (`CampaignState` and
 * its parts) moved to `shared/src/read-models/campaign-state.ts` under
 * D-95, so `web` can bind to them without depending on this package. What
 * stays here is code: `emptyState()` is a value the fold returns, and
 * `PROGRESS_TRACK_MAX_TICKS` is a constant `project.ts` uses while folding.
 * Both belong with the fold, not with the shapes.
 */

/**
 * The state of a campaign whose log is empty. Projecting `[]` returns this
 * rather than throwing: an empty log is a real state, not an error.
 */
export function emptyState(): CampaignState {
  return {
    campaign: null,
    session: null,
    scene: null,
    characters: {},
    tracks: {},
    entities: {},
    canon: { sessionSummaries: [] },
  };
}

/**
 * A progress track is ten boxes of four ticks. A game constant rather than
 * imported content — Datasworn carries it in prose, not as a field — and a
 * constant is code, which the projector may use. Versioned rules *data* is
 * what it may not read.
 */
export const PROGRESS_TRACK_MAX_TICKS = 40;
