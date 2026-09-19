import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { Link } from '../app/routes.js';

import { buildDashboard } from './dashboard.js';
import { SectionStatusChip } from './SectionStatusChip.js';
import styles from './LaunchDashboard.module.css';

/**
 * The seven sections, their status, and why each is incomplete (task 4.1, A22).
 *
 * Every status and every reason on this page is the server's. The client does
 * not decide what "complete" means here, which is the whole of D-176 and the
 * defect group 3R was created to remove.
 */
export function LaunchDashboard({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const { cards, nextAction, problemCount } = buildDashboard(campaignId, workspace.readiness);

  return (
    <div className={styles.dashboard}>
      <p className={styles.next}>
        <span className={styles.nextLabel}>Next</span>
        <Link className={styles.nextLink} href={nextAction.href}>
          {nextAction.label}
        </Link>
      </p>

      <ol className={styles.sections}>
        {cards.map((card) => (
          <li key={card.section} className={styles.section}>
            <div className={styles.sectionHead}>
              <Link className={styles.sectionName} href={card.href}>
                {card.label}
              </Link>
              <SectionStatusChip status={card.status} />
            </div>
            <p className={styles.summary}>{card.summary}</p>
            {card.blockers.length > 0 && (
              <ul className={styles.blockers}>
                {card.blockers.map((blocker) => (
                  <li key={`${blocker.code}:${blocker.path}`}>{blocker.message}</li>
                ))}
              </ul>
            )}
            {card.arrivesIn !== null && (
              <p className={styles.pending}>Its editor arrives with {card.arrivesIn}.</p>
            )}
          </li>
        ))}
      </ol>

      <p className={styles.count}>
        {problemCount === 0
          ? 'Nothing is blocking this launch.'
          : `${problemCount} ${problemCount === 1 ? 'thing is' : 'things are'} still needed.`}
      </p>
    </div>
  );
}
