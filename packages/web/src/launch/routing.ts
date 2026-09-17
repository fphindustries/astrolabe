import type { LaunchClosedReason } from '@astrolabe/shared';

/**
 * Where `/campaigns/:id` sends the reader (task 4.4, A43).
 *
 * The decision is the server's: `launchOpen` comes from the same predicate
 * `requireLaunchOpen` refuses on, so a campaign this sends to the play screen
 * is exactly one that would refuse a launch command. The client does not read
 * `phase` for this — D-178's point is that a Milestone 1 campaign reports
 * `draft` while being plainly in play.
 */

export type CampaignDestination =
  { readonly kind: 'workspace' } | { readonly kind: 'play'; readonly message: string };

const CLOSED_MESSAGES: Readonly<Record<LaunchClosedReason, string>> = {
  campaign_active: 'This campaign has launched. Changes to launch facts are now amendments.',
  campaign_in_play: 'This campaign is already in play; Campaign Launch is closed for it.',
};

export function campaignDestination(workspace: {
  readonly launchOpen: boolean;
  readonly closedReason?: LaunchClosedReason;
}): CampaignDestination {
  if (workspace.launchOpen) {
    return { kind: 'workspace' };
  }
  return {
    kind: 'play',
    // Closed without a stated reason should not happen — the server sends both
    // together — but a reader who got here deserves a screen, not a crash.
    message: workspace.closedReason
      ? CLOSED_MESSAGES[workspace.closedReason]
      : 'Campaign Launch is closed for this campaign.',
  };
}
