import type { EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import {
  applyFrame,
  closeWithoutFrame,
  followUp,
  startPassage,
  type StreamOutcome,
} from './frames.js';

const BEAT = { kind: 'beat', afterCommandId: 'c1' } as const;

describe('applyFrame (task 7.8)', () => {
  it('accumulates text, discards it on reset, and ends on committed', () => {
    let outcome: StreamOutcome = startPassage(BEAT);
    outcome = applyFrame(outcome, { type: 'delta', text: 'The bulkhead gi' });
    expect(outcome).toMatchObject({
      kind: 'pending',
      passage: { text: 'The bulkhead gi', status: 'streaming' },
    });

    outcome = applyFrame(outcome, { type: 'reset', reason: 'cut off' });
    expect(outcome).toMatchObject({ kind: 'pending', passage: { text: '', status: 'retrying' } });

    outcome = applyFrame(outcome, { type: 'delta', text: 'The bulkhead gives.' });
    outcome = applyFrame(outcome, { type: 'committed', eventId: 'e9' as EventId });
    expect(outcome).toEqual({ kind: 'committed', eventId: 'e9' });

    // Nothing after the closing frame changes the outcome.
    expect(applyFrame(outcome, { type: 'delta', text: 'late' })).toEqual(outcome);
  });

  it('marks a passage provisional while checked, and keeps a withdrawn attempt on screen (D-128)', () => {
    let outcome: StreamOutcome = startPassage(BEAT);
    outcome = applyFrame(outcome, { type: 'delta', text: 'Rook walks on.' });
    outcome = applyFrame(outcome, { type: 'checking' });
    expect(outcome).toMatchObject({
      kind: 'pending',
      passage: { text: 'Rook walks on.', status: 'checking', withdrawn: [] },
    });

    outcome = applyFrame(outcome, {
      type: 'withdrawn',
      reason: 'Withdrawn: it had Rook do something the player didn’t declare.',
      rejectedText: 'Rook walks on.',
    });
    expect(outcome).toMatchObject({
      kind: 'pending',
      passage: {
        text: '',
        status: 'retrying',
        withdrawn: [
          {
            reason: 'Withdrawn: it had Rook do something the player didn’t declare.',
            text: 'Rook walks on.',
          },
        ],
      },
    });

    outcome = applyFrame(outcome, { type: 'delta', text: 'The corridor is quiet.' });
    expect(outcome).toMatchObject({ passage: { withdrawn: [{ text: 'Rook walks on.' }] } });
  });

  it('keeps what failed, so Retry can ask again for the same thing', () => {
    const outcome = applyFrame(startPassage(BEAT), {
      type: 'failed',
      errorKind: 'unavailable',
      message: 'overloaded',
    });
    expect(outcome).toEqual({
      kind: 'failed',
      failure: { target: BEAT, errorKind: 'unavailable', message: 'overloaded' },
    });
  });

  it('treats a stream that closed early as a lost connection', () => {
    const outcome = closeWithoutFrame(
      applyFrame(startPassage(BEAT), { type: 'delta', text: 'half' }),
    );
    expect(outcome).toMatchObject({
      kind: 'failed',
      failure: { errorKind: 'unavailable', target: BEAT },
    });
    expect(closeWithoutFrame({ kind: 'committed', eventId: 'e1' })).toEqual({
      kind: 'committed',
      eventId: 'e1',
    });
  });

  it('follows a committed beat passage with its world pass, and nothing else (D-138)', () => {
    const beat = { kind: 'beat', afterCommandId: 'cmd-1' } as const;
    expect(followUp(beat, { kind: 'committed', eventId: 'evt-9' })).toEqual({
      kind: 'world',
      passageEventId: 'evt-9',
    });
    // A refused request is recorded as committed with no event: nothing follows it.
    expect(followUp(beat, { kind: 'committed', eventId: '' })).toBeUndefined();
    expect(
      followUp(beat, {
        kind: 'failed',
        failure: { target: beat, errorKind: 'unavailable', message: 'down' },
      }),
    ).toBeUndefined();
    const world = { kind: 'world', passageEventId: 'evt-9' } as const;
    expect(followUp(world, { kind: 'committed', eventId: 'evt-10' })).toBeUndefined();
    expect(
      followUp(
        { kind: 'revision', targetEventId: 'evt-9', note: 'n' },
        { kind: 'committed', eventId: 'evt-11' },
      ),
    ).toBeUndefined();
  });
});
