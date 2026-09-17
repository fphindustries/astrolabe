import type { LaunchSection } from '@astrolabe/rules';

import { useLaunchWorkspace } from '../api/launch.js';
import { ApiError } from '../api/http.js';
import { LaunchDashboard } from '../launch/LaunchDashboard.js';
import { LaunchReviewScreen } from '../launch/LaunchReviewScreen.js';
import { LaunchSectionScreen } from '../launch/LaunchSectionScreen.js';
import { LaunchWorkspaceScreen } from '../launch/LaunchWorkspaceScreen.js';
import { campaignDestination } from '../launch/routing.js';
import { NotFoundScreen } from '../play/NotFoundScreen.js';
import { PlayScreen } from '../play/PlayScreen.js';

/**
 * `/campaigns/:id` — where a campaign opens (task 4.4, A43).
 *
 * One query decides it, and the decision is the server's: `launchOpen` comes
 * from the same predicate a launch command refuses on, so a campaign this sends
 * to the play screen is exactly one that would refuse a launch write. It does
 * **not** read `phase` — D-178's point is that every Milestone 1 campaign
 * reports `draft` while being plainly in play.
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
  /** Which launch page to show, when launch is what opens. */
  readonly view:
    | { readonly kind: 'overview' | 'review' }
    | { readonly kind: 'section'; readonly section: LaunchSection };
}) {
  const workspace = useLaunchWorkspace(campaignId);

  if (workspace.error instanceof ApiError && workspace.error.status === 404) {
    return <NotFoundScreen message={`No campaign found with id ${campaignId}.`} />;
  }
  if (workspace.data === undefined) {
    // The play screen renders its own shell while loading rather than a spinner
    // page; there is nothing to show here until we know which screen this is.
    return <p className="loading">Opening the campaign…</p>;
  }
  if (campaignDestination(workspace.data).kind === 'play') {
    return <PlayScreen campaignId={campaignId} />;
  }

  return (
    <LaunchWorkspaceScreen campaignId={campaignId} workspace={workspace.data}>
      {view.kind === 'overview' && (
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
