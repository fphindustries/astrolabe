import { describe, expect, it } from 'vitest';

import type { TrackId } from '@astrolabe/rules';
import type { TrackState } from '@astrolabe/shared';

import { canCommit, committedThreads, isEdited, milestoneReminders } from './end-session.js';

const proposed = {
  summary: 'The crew boarded the relay.',
  openThreads: ["the survivor's intent", 'the failing power'],
};

describe('End a Session drafts (D-149)', () => {
  it('commits trimmed threads without blanks, and needs a summary', () => {
    expect(committedThreads({ ...proposed, openThreads: [' a ', '', 'b'] })).toEqual(['a', 'b']);
    expect(canCommit({ ...proposed, summary: '  ' })).toBe(false);
    expect(canCommit(proposed)).toBe(true);
  });

  it('is edited only when the words differ from the proposal', () => {
    expect(isEdited({ ...proposed, openThreads: [...proposed.openThreads, ''] }, proposed)).toBe(
      false,
    );
    expect(isEdited({ ...proposed, summary: 'The crew left.' }, proposed)).toBe(true);
    expect(isEdited({ ...proposed, openThreads: ['the failing power'] }, proposed)).toBe(true);
  });

  it('reminds of Reach a Milestone for each vow still open', () => {
    const track = (id: string, kind: TrackState['kind'], ticks: number): TrackState =>
      ({ id: id as TrackId, kind, title: id, ticks, maxTicks: 40 }) as TrackState;
    expect(
      milestoneReminders({
        tracks: {
          ['vow' as TrackId]: track('vow', 'vow', 4),
          ['done' as TrackId]: track('done', 'vow', 40),
          ['clock' as TrackId]: track('clock', 'clock', 1),
        },
      }),
    ).toEqual([{ trackId: 'vow', title: 'vow' }]);
  });
});
