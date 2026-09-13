import type { TrackId } from '@astrolabe/rules';
import type { TrackKind, TrackState } from '@astrolabe/shared';

/**
 * Pure view-model for the pressure rail (task 5.5): clocks, vows and
 * progress tracks (expeditions), grouped by kind, with `lastChangedBy`
 * flattened out for Beat 8's "who ticked it and why" (the detail popover).
 */

export interface TrackRowView {
  readonly id: TrackId;
  readonly kind: TrackKind;
  readonly title: string;
  readonly rank?: string;
  readonly ticks: number;
  readonly maxTicks: number;
  readonly actorKind: string;
  readonly reason?: string;
  /** A16: last set by hand. */
  readonly overridden: boolean;
}

export interface GroupedTracks {
  readonly clocks: readonly TrackRowView[];
  readonly vows: readonly TrackRowView[];
  readonly expeditions: readonly TrackRowView[];
}

export function toTrackRow(track: TrackState): TrackRowView {
  return {
    id: track.id,
    kind: track.kind,
    title: track.title,
    ...(track.rank !== undefined ? { rank: track.rank } : {}),
    ticks: track.ticks,
    maxTicks: track.maxTicks,
    actorKind: track.lastChangedBy.actorKind,
    overridden: track.lastChangedBy.manual === true,
    ...(track.lastChangedBy.reason !== undefined ? { reason: track.lastChangedBy.reason } : {}),
  };
}

export function groupTracksByKind(tracks: Readonly<Record<TrackId, TrackState>>): GroupedTracks {
  const rows = Object.values(tracks).map(toTrackRow);
  return {
    clocks: rows.filter((row) => row.kind === 'clock'),
    vows: rows.filter((row) => row.kind === 'vow'),
    expeditions: rows.filter((row) => row.kind === 'expedition'),
  };
}

export function rowsForKind(grouped: GroupedTracks, kind: TrackKind): readonly TrackRowView[] {
  switch (kind) {
    case 'clock':
      return grouped.clocks;
    case 'vow':
      return grouped.vows;
    case 'expedition':
      return grouped.expeditions;
  }
}
