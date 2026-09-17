import { Link } from '../app/routes.js';

import { playPath } from './sections.js';
import styles from './LaunchWorkspaceScreen.module.css';

/**
 * A launch URL asked for after Campaign Launch closed (D-160, beat 12).
 *
 * Activation is one way, so the workspace is no longer offered — but a
 * bookmark that quietly rendered the play screen would be doing something
 * other than what it says. This says what happened and offers the campaign.
 */
export function LaunchClosedScreen({
  campaignId,
  message,
}: {
  readonly campaignId: string;
  readonly message: string;
}) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Campaign Launch is closed</h1>
      <p className={styles.closed}>{message}</p>
      <Link className={styles.back} href={playPath(campaignId)}>
        Go to the campaign
      </Link>
    </div>
  );
}
