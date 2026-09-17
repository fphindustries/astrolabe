import { DEFAULT_CAMPAIGN_SETTINGS } from '@astrolabe/shared';
import type { CampaignId, CampaignState, LaunchState } from '@astrolabe/shared';

/**
 * An empty `CampaignState` for the launch view-model tests.
 *
 * The wizard's own fixture went with it when the Milestone 1 steps were
 * retired; this one is shared by the Foundation and review tests so a field
 * added to the read model breaks one factory, not several.
 */
export function emptyCampaignState(launch: Partial<LaunchState> = {}): CampaignState {
  return {
    campaign: null,
    session: null,
    scene: null,
    characters: {},
    tracks: {},
    entities: {},
    canon: { sessionSummaries: [] },
    sector: { routes: [] },
    launch: {
      phase: 'draft',
      drafts: {},
      truthDecisions: {},
      truthHistory: {},
      locations: {},
      routes: [],
      layout: {},
      troubles: {},
      amendments: [],
      proposals: {},
      ...launch,
    },
    tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export const NAMED_CAMPAIGN = {
  campaign: {
    id: 'c1' as CampaignId,
    name: 'Lantern Wake',
    settings: DEFAULT_CAMPAIGN_SETTINGS,
  },
} as const;
