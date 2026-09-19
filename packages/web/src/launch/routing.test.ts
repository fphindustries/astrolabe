import { describe, expect, it } from 'vitest';

import { campaignDestination } from './routing.js';

describe('where a campaign opens', () => {
  it('opens the workspace while launch is open, from either address', () => {
    for (const entry of ['campaign_home', 'launch_page'] as const)
      expect(campaignDestination({ launchOpen: true }, entry)).toEqual({ kind: 'workspace' });
  });

  it('opens a closed campaign in play when the campaign itself was asked for', () => {
    // A43's case: `/campaigns/:id` means "open this campaign". A Milestone 1
    // campaign reports `phase: 'draft'` and belongs in play, which is why this
    // turns on `launchOpen` rather than on the phase.
    expect(
      campaignDestination({ launchOpen: false, closedReason: 'campaign_in_play' }, 'campaign_home'),
    ).toEqual({ kind: 'play' });
  });

  it('tells a bookmarked launch URL that the workspace is gone, rather than silently showing play', () => {
    // D-160, beat 12: the workspace is no longer offered after activation. A
    // launch URL that quietly rendered the play screen would leave a bookmark
    // doing something other than what it says.
    expect(
      campaignDestination({ launchOpen: false, closedReason: 'campaign_active' }, 'launch_page'),
    ).toEqual({
      kind: 'closed',
      message: 'This campaign has launched. Changes to launch facts are now amendments.',
    });
    expect(
      campaignDestination({ launchOpen: false, closedReason: 'campaign_in_play' }, 'launch_page'),
    ).toMatchObject({ kind: 'closed', message: expect.stringContaining('already in play') });
  });

  it('still answers when the reason is missing, rather than throwing', () => {
    expect(campaignDestination({ launchOpen: false }, 'launch_page')).toMatchObject({
      kind: 'closed',
      message: expect.stringContaining('closed'),
    });
    expect(campaignDestination({ launchOpen: false }, 'campaign_home')).toEqual({ kind: 'play' });
  });
});
