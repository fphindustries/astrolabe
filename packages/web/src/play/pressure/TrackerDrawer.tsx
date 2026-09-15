import type { TrackKind } from '@astrolabe/shared';

import { useCampaignState } from '../../api/campaigns.js';
import { Clock } from '../../ui/Clock.js';
import { Drawer } from '../../ui/Drawer.js';
import { ProgressTrack } from '../../ui/ProgressTrack.js';
import { OverrideControl } from '../overrides/OverrideControl.js';

import { actorWords, groupTracksByKind, rowsForKind } from './pressure.js';
import styles from './TrackerDrawer.module.css';

const LABELS: Readonly<Record<TrackKind, string>> = {
  clock: 'Clocks',
  vow: 'Vows',
  expedition: 'Progress',
};

/**
 * Task 5.7's tracker drawer: the full list for one `TrackKind`, opened by
 * the pressure rail's `+N more` (task 5.5, D-97's overflow-opens-a-drawer
 * rule). No nested popover here — provenance is shown inline per row.
 */
export function TrackerDrawer({
  campaignId,
  trackKind,
  onClose,
}: {
  readonly campaignId: string;
  readonly trackKind: TrackKind;
  readonly onClose: () => void;
}) {
  const { data } = useCampaignState(campaignId, (state) => groupTracksByKind(state.tracks));
  const rows = data === undefined ? [] : rowsForKind(data, trackKind);

  return (
    <Drawer open onClose={onClose} title={LABELS[trackKind]} side="right">
      {rows.length === 0 ? (
        <p className={styles.empty}>None.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.item}>
              <div className={styles.itemTop}>
                <span>
                  {row.title}
                  {row.rank === undefined ? '' : ` (${row.rank})`}
                </span>
                <OverrideControl
                  campaignId={campaignId}
                  target={{ kind: 'track', trackId: row.id }}
                  label="Ticks"
                  value={row.ticks}
                  min={0}
                  max={row.maxTicks}
                  overridden={row.overridden}
                  format={(ticks) => `${ticks}/${row.maxTicks}`}
                  visual={
                    row.kind === 'clock' ? (
                      <Clock title={row.title} filled={row.ticks} segments={row.maxTicks} />
                    ) : (
                      <ProgressTrack title={row.title} ticks={row.ticks} maxTicks={row.maxTicks} />
                    )
                  }
                />
              </div>
              <p className={styles.provenance}>
                Last changed by {actorWords(row.actorKind)}
                {row.reason === undefined ? '' : ` — ${row.reason}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
