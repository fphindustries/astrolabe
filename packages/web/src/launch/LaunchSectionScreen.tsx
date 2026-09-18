import type { LaunchSection } from '@astrolabe/rules';
import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { Link } from '../app/routes.js';

import { buildSectionCard } from './dashboard.js';
import { CrewSection } from './CrewSection.js';
import { FoundationSection } from './FoundationSection.js';
import { SectionPlaceholder } from './SectionPlaceholder.js';
import { SectionStatusChip } from './SectionStatusChip.js';
import { SectorSection } from './SectorSection.js';
import { StarshipSection } from './StarshipSection.js';
import { TruthsSection } from './TruthsSection.js';
import { launchOverviewPath } from './sections.js';
import styles from './LaunchSectionScreen.module.css';

/**
 * One launch section (task 4.2).
 *
 * The heading, the status and the blockers are the same for every section,
 * built from the same card the dashboard renders, so the two cannot describe a
 * section differently. What changes is the body: Foundation has its editor,
 * and the other six say honestly that theirs is still ahead.
 */
export function LaunchSectionScreen({
  campaignId,
  section,
  workspace,
}: {
  readonly campaignId: string;
  readonly section: LaunchSection;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const card = buildSectionCard(campaignId, section, workspace.readiness);

  return (
    <section className={styles.section}>
      <Link className={styles.back} href={launchOverviewPath(campaignId)}>
        ← All sections
      </Link>
      <div className={styles.head}>
        <h2 className={styles.heading}>{card.label}</h2>
        <SectionStatusChip status={card.status} />
      </div>
      <p className={styles.summary}>{card.summary}</p>

      {/* Switched on the section itself, not on `implemented`: when group 5
          builds Truths, the compiler should send its author here rather than
          letting the Foundation editor render under a Truths heading. */}
      {section === 'foundation' ? (
        <FoundationSection campaignId={campaignId} workspace={workspace} />
      ) : section === 'truths' ? (
        <TruthsSection campaignId={campaignId} workspace={workspace} />
      ) : section === 'crew' ? (
        <CrewSection campaignId={campaignId} workspace={workspace} />
      ) : section === 'starship' ? (
        <StarshipSection campaignId={campaignId} workspace={workspace} />
      ) : section === 'sector' ? (
        <SectorSection campaignId={campaignId} workspace={workspace} />
      ) : (
        <SectionPlaceholder card={card} />
      )}
    </section>
  );
}
