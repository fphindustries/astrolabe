import { describe, expect, it } from 'vitest';

import { campaignDestination } from './routing.js';

describe('where a campaign opens', () => {
  it('opens the workspace while launch is open', () => {
    expect(campaignDestination({ launchOpen: true })).toEqual({ kind: 'workspace' });
  });

  it('opens play once the campaign has launched, and says why', () => {
    expect(campaignDestination({ launchOpen: false, closedReason: 'campaign_active' })).toEqual({
      kind: 'play',
      message: 'This campaign has launched. Changes to launch facts are now amendments.',
    });
  });

  it('opens play for a campaign already in play (A43, D-178)', () => {
    // The Milestone 1 case. Its phase still reads `draft`, which is why this
    // decision turns on `launchOpen` and not on the phase.
    expect(campaignDestination({ launchOpen: false, closedReason: 'campaign_in_play' })).toEqual({
      kind: 'play',
      message: 'This campaign is already in play; Campaign Launch is closed for it.',
    });
  });

  it('still opens play when the reason is missing, rather than throwing', () => {
    const destination = campaignDestination({ launchOpen: false });

    expect(destination.kind).toBe('play');
    expect(destination).toMatchObject({ message: expect.stringContaining('closed') });
  });
});
