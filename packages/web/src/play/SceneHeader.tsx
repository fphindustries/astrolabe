import { useCampaignState } from '../api/campaigns.js';

import { toSceneHeaderView } from './scene.js';
import styles from './SceneHeader.module.css';

/**
 * §8's compact standing answer to "where am I and what's at stake" (task
 * 5.3). Bound to `state.scene`, resolving `locationId` against
 * `state.entities` — see `scene.ts` for why it goes no further than that.
 */
export function SceneHeader({ campaignId }: { readonly campaignId: string }) {
  const { data } = useCampaignState(campaignId, (state) =>
    toSceneHeaderView(state.scene, state.entities),
  );

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{data?.title ?? 'Loading…'}</h2>
      {data?.locationName !== undefined && (
        <span className={styles.location}>{data.locationName}</span>
      )}
    </div>
  );
}
