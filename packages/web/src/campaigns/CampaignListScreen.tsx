import { useRef } from 'react';

import { useCampaignList } from '../api/campaigns.js';
import { Link } from '../app/routes.js';
import { useFocusOnArrival } from '../ui/focus.js';

import styles from './CampaignListScreen.module.css';

/** `/` — the list of campaigns, names as links to the play screen, plus the new-campaign affordance (group 4). */
export function CampaignListScreen() {
  const { data, isLoading, isError } = useCampaignList();
  const pageRef = useRef<HTMLDivElement>(null);
  useFocusOnArrival(pageRef);

  return (
    <div className={styles.page} ref={pageRef}>
      <h1 className={styles.title}>Astrolabe</h1>
      {isLoading && <p className={styles.empty}>Loading campaigns…</p>}
      {isError && <p className={styles.empty}>Couldn&rsquo;t reach the server.</p>}
      {data !== undefined && data.length === 0 && <p className={styles.empty}>No campaigns yet.</p>}
      {data !== undefined && data.length > 0 && (
        <ul className={styles.list}>
          {data.map((campaign) => (
            <li key={campaign.id} className={styles.item}>
              <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
            </li>
          ))}
        </ul>
      )}
      <Link className={styles.newCampaign} href="/campaigns/new">
        New campaign
      </Link>
    </div>
  );
}
