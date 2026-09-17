import type { ReactNode } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { Link } from '../app/routes.js';

import { launchOverviewPath, launchReviewPath } from './sections.js';
import styles from './LaunchWorkspaceScreen.module.css';

/**
 * The chrome every Campaign Launch page shares (task 4.1, D-160).
 *
 * Only the workspace itself: whether launch is still open at all is decided
 * before this renders, in `CampaignHomeScreen`, so there is one place that
 * answers it rather than one per page.
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
