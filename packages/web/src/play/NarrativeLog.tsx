import { useCampaignLog } from '../api/campaigns.js';

import styles from './NarrativeLog.module.css';

/**
 * The narrative log, wired to `useCampaignLog` but not yet rendered as
 * prose (that's task 5.4 — grouping into beats, rolls, oracle chips,
 * void strike-throughs). This confirms the paging seam works end to end:
 * the query, the cursor, and the scrolling region that will hold it.
 */
export function NarrativeLog({ campaignId }: { readonly campaignId: string }) {
  const { data, isLoading } = useCampaignLog(campaignId);

  if (isLoading) {
    return <div className={styles.empty}>Loading the log…</div>;
  }

  const beatCount = data?.pages.reduce((total, page) => total + page.beats.length, 0) ?? 0;
  return (
    <div className={styles.empty}>
      {beatCount === 0
        ? 'Nothing has happened yet.'
        : `${beatCount} beat${beatCount === 1 ? '' : 's'} logged — rendered in task 5.4.`}
    </div>
  );
}
