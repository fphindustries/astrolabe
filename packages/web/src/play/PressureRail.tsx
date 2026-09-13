import { useRef, useState } from 'react';

import type { TrackKind } from '@astrolabe/shared';

import { useCampaignState } from '../api/campaigns.js';
import { Popover } from '../ui/Popover.js';

import { groupTracksByKind, rowsForKind, type GroupedTracks, type TrackRowView } from './pressure/pressure.js';
import styles from './PressureRail.module.css';

const MAX_VISIBLE = 6;

const SECTIONS: readonly { readonly kind: TrackKind; readonly label: string }[] = [
  { kind: 'clock', label: 'Clocks' },
  { kind: 'vow', label: 'Vows' },
  { kind: 'expedition', label: 'Progress' },
];

/**
 * §8's right rail: clocks, vows and progress tracks (task 5.5), never
 * scrolling (D-97) — a section past `MAX_VISIBLE` truncates and its
 * `+N more` opens the tracker drawer (task 5.7) scoped to that kind. A row's
 * own click opens a lightweight popover with Beat 8's "who ticked it and
 * why" instead.
 */
export function PressureRail({
  campaignId,
  onOpenTrackerDrawer,
}: {
  readonly campaignId: string;
  readonly onOpenTrackerDrawer: (kind: TrackKind) => void;
}) {
  const { data } = useCampaignState(campaignId, (state) => groupTracksByKind(state.tracks));
  const grouped: GroupedTracks = data ?? { clocks: [], vows: [], expeditions: [] };
  const isEmpty = grouped.clocks.length === 0 && grouped.vows.length === 0 && grouped.expeditions.length === 0;

  if (isEmpty) {
    return <div className={styles.empty}>Nothing tracked yet.</div>;
  }

  return (
    <div className={styles.rail}>
      {SECTIONS.map(({ kind, label }) => (
        <Section
          key={kind}
          label={label}
          rows={rowsForKind(grouped, kind)}
          onOverflow={() => onOpenTrackerDrawer(kind)}
        />
      ))}
    </div>
  );
}

function Section({
  label,
  rows,
  onOverflow,
}: {
  readonly label: string;
  readonly rows: readonly TrackRowView[];
  readonly onOverflow: () => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  const visible = rows.slice(0, MAX_VISIBLE);
  const overflow = rows.length - visible.length;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{label}</h3>
      {visible.map((row) => (
        <TrackRow key={row.id} row={row} />
      ))}
      {overflow > 0 && (
        <button type="button" className={styles.overflow} onClick={onOverflow}>
          +{overflow} more
        </button>
      )}
    </section>
  );
}

function TrackRow({ row }: { readonly row: TrackRowView }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.row}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={styles.rowTitle}>{row.title}</span>
        <span className={styles.rowProgress}>
          {row.ticks}/{row.maxTicks}
        </span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={buttonRef}>
        {row.rank !== undefined && <p>{row.rank}</p>}
        <p>
          Last changed by {row.actorKind}
          {row.reason === undefined ? '' : ` — ${row.reason}`}
        </p>
      </Popover>
    </>
  );
}
