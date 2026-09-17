import type { LaunchClosedReason } from '@astrolabe/shared';

/**
 * Where a campaign's URL lands the reader (task 4.4, A43).
 *
 * The decision is the server's: `launchOpen` comes from the same predicate
 * `requireLaunchOpen` refuses on, so a campaign this sends to the play screen
 * is exactly one that would refuse a launch command. It does not read `phase` —
 * D-178's point is that a Milestone 1 campaign reports `draft` while being
 * plainly in play.
 *
 * Which URL was asked for matters as much as the answer. `/campaigns/:id` is
 * "open this campaign", so a closed one opens in play and says nothing about
 * launch. A launch URL is a request for a workspace that no longer exists, and
 * answering it with the play screen would leave a bookmark silently doing
 * something else; it gets told (D-160, beat 12: the workspace is no longer
 * offered).
 */

export type LaunchEntry = 'campaign_home' | 'launch_page';

export type CampaignDestination =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'play' }
  | { readonly kind: 'closed'; readonly message: string };

const CLOSED_MESSAGES: Readonly<Record<LaunchClosedReason, string>> = {
  campaign_active: 'This campaign has launched. Changes to launch facts are now amendments.',
  campaign_in_play: 'This campaign is already in play; Campaign Launch is closed for it.',
};

export function campaignDestination(
  workspace: { readonly launchOpen: boolean; readonly closedReason?: LaunchClosedReason },
  entry: LaunchEntry,
): CampaignDestination {
  if (workspace.launchOpen) {
    return { kind: 'workspace' };
  }
  if (entry === 'campaign_home') {
    return { kind: 'play' };
  }
  return {
    kind: 'closed',
    // Closed without a stated reason should not happen — the server sends both
    // together — but a reader who got here deserves a screen, not a crash.
    message: workspace.closedReason
      ? CLOSED_MESSAGES[workspace.closedReason]
      : 'Campaign Launch is closed for this campaign.',
  };
}
