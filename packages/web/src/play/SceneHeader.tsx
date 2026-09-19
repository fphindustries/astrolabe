import { useCampaignState } from '../api/campaigns.js';

import { useNarrationStream } from './narration/narration-stream.js';
import { toSceneHeaderView } from './scene.js';
import styles from './SceneHeader.module.css';

/**
 * §8's compact standing answer to "where am I and what's at stake" (task
 * 5.3). Bound to `state.scene`, resolving `locationId` against
 * `state.entities` and the launch locations (9.0i) — see `scene.ts` for why it goes no further than that.
 *
 * An open scene with no frame offers "Frame the scene" here (D-141). A new
 * session's scene is carried forward unframed (D-146), so it offers it too.
 */
export function SceneHeader({ campaignId }: { readonly campaignId: string }) {
  const { data } = useCampaignState(campaignId, (state) =>
    toSceneHeaderView(state.scene, state.entities, state.session, state.launch.locations),
  );
  const narration = useNarrationStream();
  const framing = narration.pending?.target.kind === 'scene_frame';

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{data?.title ?? 'Loading…'}</h2>
      {data?.locationName !== undefined && (
        <span className={styles.location}>{data.locationName}</span>
      )}
      {data?.canFrame === true && (
        <button
          type="button"
          className={styles.frame}
          disabled={framing || narration.paused}
          onClick={() => narration.frameScene()}
        >
          {framing ? 'Framing the scene…' : 'Frame the scene'}
        </button>
      )}
    </div>
  );
}
