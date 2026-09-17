import type { ReactNode } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { Link } from '../app/routes.js';

import { campaignDestination } from './routing.js';
import { launchOverviewPath, launchReviewPath, playPath } from './sections.js';
import styles from './LaunchWorkspaceScreen.module.css';

/**
 * The chrome every Campaign Launch page shares (task 4.1, D-160).
 *
 * It also holds the one guard each of those pages needs: a bookmarked launch
 * URL opened after activation must not offer a workspace that no longer
 * exists. The answer is the server's `launchOpen`, the same field the
 * dispatcher routes on, so a launch page and `/campaigns/:id` cannot disagree.
 */
export function LaunchWorkspaceScreen({
  campaignId,
  workspace,
  children,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
  readonly children: ReactNode;
}) {
  const destination = campaignDestination(workspace);

  if (destination.kind === 'play') {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Campaign Launch is closed</h1>
        <p className={styles.closed}>{destination.message}</p>
        <Link className={styles.back} href={playPath(campaignId)}>
          Go to the campaign
        </Link>
      </div>
    );
  }

  const name = workspace.state.campaign?.name ?? 'This campaign';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Campaign Launch</p>
        <h1 className={styles.title}>{name}</h1>
        <p className={styles.phase}>
          {workspace.state.launch.phase === 'ready'
            ? 'Everything Campaign Launch needs is in place. Review it and launch when you’re ready.'
            : 'This campaign is a draft. It can’t begin a session until every section below is settled.'}
        </p>
        <nav className={styles.nav} aria-label="Campaign Launch">
          <Link className={styles.navLink} href={launchOverviewPath(campaignId)}>
            All sections
          </Link>
          <Link className={styles.navLink} href={launchReviewPath(campaignId)}>
            Review and launch
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
