import { describe, expect, it } from 'vitest';

import type { EventId } from '@astrolabe/shared';

import { pickOption, submission } from './complication.js';

describe('the complication draft (8.7, D-143 as amended)', () => {
  it('sends written words alone', () => {
    expect(submission({ text: '  The port is still armed.  ' })).toEqual({
      text: 'The port is still armed.',
    });
  });

  it('fills the box from a picked option and keeps the pick through an edit', () => {
    const picked = pickOption(
      { text: 'draft' },
      'evt-offer' as EventId,
      2,
      'The logs were edited.',
    );
    expect(picked.text).toBe('The logs were edited.');
    const edited = { ...picked, text: 'The logs were edited, by someone with the codes.' };
    expect(submission(edited)).toEqual({
      text: 'The logs were edited, by someone with the codes.',
      offeredEventId: 'evt-offer',
      optionIndex: 2,
    });
  });
});
