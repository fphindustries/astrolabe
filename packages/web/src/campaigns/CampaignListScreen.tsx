import { useCampaignList } from '../api/campaigns.js';
import { Link } from '../app/routes.js';

import styles from './CampaignListScreen.module.css';

/**
 * `/` — the list of campaigns. Minimal for 5.1: names as links to the play
 * screen. Campaign creation (group 4, `/campaigns/new`) adds the "new
 * campaign" affordance here.
 */
export function CampaignListScreen() {
  const { data, isLoading, isError } = useCampaignList();

  return (
    <div className={styles.page}>
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
    </div>
  );
}
