import { describe, expect, it } from 'vitest';

import type { TrackId } from '@astrolabe/rules';
import type { FieldProvenance, TrackState } from '@astrolabe/shared';

import { groupTracksByKind, rowsForKind, toTrackRow } from './pressure.js';

const PROVENANCE: FieldProvenance = {
  eventId: 'evt-1' as never,
  actorKind: 'ai',
  at: '2026-01-01T00:00:00.000Z' as never,
};

function track(overrides: Partial<TrackState> = {}): TrackState {
  return {
    id: 'trk-1' as TrackId,
    kind: 'clock',
    title: 'Station power failing',
    ticks: 1,
    maxTicks: 4,
    lastChangedBy: PROVENANCE,
    ...overrides,
  };
}

describe('toTrackRow', () => {
  it('flattens lastChangedBy into actorKind and reason', () => {
    const row = toTrackRow(
      track({
        lastChangedBy: { ...PROVENANCE, reason: 'emergency load-shedding' },
      }),
    );
    expect(row).toEqual({
      id: 'trk-1',
      kind: 'clock',
      title: 'Station power failing',
      ticks: 1,
      maxTicks: 4,
      actorKind: 'ai',
      reason: 'emergency load-shedding',
    });
  });

  it('omits rank for a clock and reason when none was given', () => {
    const row = toTrackRow(track());
    expect(row.rank).toBeUndefined();
    expect(row.reason).toBeUndefined();
  });

  it('carries a vow or expedition rank through', () => {
    const row = toTrackRow(track({ kind: 'vow', rank: 'formidable', maxTicks: 40 }));
    expect(row.rank).toBe('formidable');
  });
});

describe('groupTracksByKind / rowsForKind', () => {
  it('sorts tracks into clocks, vows and expeditions', () => {
    const clockId = 'trk-clock' as TrackId;
    const vowId = 'trk-vow' as TrackId;
    const tracks: Readonly<Record<TrackId, TrackState>> = {
      [clockId]: track({ id: clockId, kind: 'clock' }),
      [vowId]: track({ id: vowId, kind: 'vow', rank: 'formidable', maxTicks: 40 }),
    };

    const grouped = groupTracksByKind(tracks);
    expect(grouped.clocks.map((row) => row.id)).toEqual([clockId]);
    expect(grouped.vows.map((row) => row.id)).toEqual([vowId]);
    expect(grouped.expeditions).toEqual([]);

    expect(rowsForKind(grouped, 'clock')).toBe(grouped.clocks);
    expect(rowsForKind(grouped, 'vow')).toBe(grouped.vows);
    expect(rowsForKind(grouped, 'expedition')).toBe(grouped.expeditions);
  });
});
