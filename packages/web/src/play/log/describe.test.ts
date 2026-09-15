import { describe, expect, it } from 'vitest';

import { entryTag, entryText, moveName } from './describe.js';

describe('log entry words (10.1)', () => {
  it('names moves as the rules do, not by id', () => {
    expect(moveName('move:adventure/face-danger')).toBe('Face Danger');
    expect(moveName('move:unknown/thing')).toBe('move:unknown/thing');
    expect(
      entryText({ kind: 'move', moveId: 'move:adventure/secure-an-advantage', aiding: true }),
    ).toBe('Secure an Advantage, aiding an ally');
    expect(
      entryText({
        kind: 'move_chained',
        toMoveId: 'move:fate/pay-the-price',
        mode: 'offer',
        reason: 'A miss.',
      }),
    ).toBe('Offers Pay the Price — A miss.');
  });

  it('writes outcomes and choices in words', () => {
    expect(
      entryText({
        kind: 'roll',
        tier: 'weak_hit',
        isMatch: false,
        burnOffered: true,
        burnTaken: true,
      }),
    ).toBe('Weak hit — momentum burned');
    expect(entryText({ kind: 'move_method_chosen', optionId: 'table' })).toBe(
      'Rolled on the table',
    );
    expect(entryText({ kind: 'move_choice_made', choiceId: 'eh-weak', optionIds: [] })).toBe(
      'Declined the offered options',
    );
    expect(entryText({ kind: 'override', from: 4, to: 5 })).toBe('4 → 5');
  });

  it('tags mechanical entries and leaves prose untagged', () => {
    expect(
      entryTag({
        kind: 'roll',
        tier: 'miss',
        isMatch: false,
        burnOffered: false,
        burnTaken: false,
      }),
    ).toBe('Roll');
    expect(entryTag({ kind: 'narration', text: 'x', chips: [], corrected: false })).toBeUndefined();
  });
});
