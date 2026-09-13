import type { EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import { applyFrame, closeWithoutFrame, startPassage, type StreamOutcome } from './frames.js';

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
});
