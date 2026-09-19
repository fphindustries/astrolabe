import type { LaunchSection } from '@astrolabe/rules';

import { useLaunchWorkspace } from '../api/launch.js';
import { ApiError } from '../api/http.js';
import { LaunchClosedScreen } from '../launch/LaunchClosedScreen.js';
import { LaunchDashboard } from '../launch/LaunchDashboard.js';
import { LaunchReviewScreen } from '../launch/LaunchReviewScreen.js';
import { LaunchSectionScreen } from '../launch/LaunchSectionScreen.js';
import { LaunchWorkspaceScreen } from '../launch/LaunchWorkspaceScreen.js';
import { campaignDestination } from '../launch/routing.js';
import { NotFoundScreen } from '../play/NotFoundScreen.js';
import { PlayScreen } from '../play/PlayScreen.js';

/**
 * Where a campaign's URL lands (task 4.4, A43).
 *
 * One query decides it for every launch address, and the decision is the
 * server's: `launchOpen` comes from the same predicate a launch command
 * refuses on, so a campaign this sends to the play screen is exactly one that
 * would refuse a launch write. It does **not** read `phase` — D-178's point is
 * that every Milestone 1 campaign reports `draft` while being plainly in play.
 *
 * `view` is also the entry point, and the two closed answers differ.
 * `/campaigns/:id` is "open this campaign", so a closed one opens in play; a
 * launch URL asked for a workspace that no longer exists and is told so.
 *
 * It renders in place rather than redirecting, so the campaign list's link
 * stays the canonical address and there is no flash or history entry between
 * the two.
 */
export function CampaignHomeScreen({
  campaignId,
  view,
}: {
  readonly campaignId: string;
  readonly view:
    | { readonly kind: 'home' | 'overview' | 'review' }
    | { readonly kind: 'section'; readonly section: LaunchSection };
}) {
  const workspace = useLaunchWorkspace(campaignId);

  if (workspace.error instanceof ApiError && workspace.error.status === 404) {
    return <NotFoundScreen message={`No campaign found with id ${campaignId}.`} />;
  }
  if (workspace.data === undefined) {
    // Nothing to show until we know which screen this is; the play screen
    // renders its own shell once it takes over.
    return <p className="loading">Opening the campaign…</p>;
  }

  const destination = campaignDestination(
    workspace.data,
    view.kind === 'home' ? 'campaign_home' : 'launch_page',
  );
  if (destination.kind === 'play') {
    return <PlayScreen campaignId={campaignId} />;
  }
  if (destination.kind === 'closed') {
    return <LaunchClosedScreen campaignId={campaignId} message={destination.message} />;
  }

  return (
    <LaunchWorkspaceScreen
      campaignId={campaignId}
      workspace={workspace.data}
      viewKey={view.kind === 'section' ? `section:${view.section}` : view.kind}
    >
      {(view.kind === 'home' || view.kind === 'overview') && (
        <LaunchDashboard campaignId={campaignId} workspace={workspace.data} />
      )}
      {view.kind === 'review' && (
        <LaunchReviewScreen campaignId={campaignId} workspace={workspace.data} />
      )}
      {view.kind === 'section' && (
        <LaunchSectionScreen
          campaignId={campaignId}
          section={view.section}
          workspace={workspace.data}
        />
      )}
    </LaunchWorkspaceScreen>
  );
}
