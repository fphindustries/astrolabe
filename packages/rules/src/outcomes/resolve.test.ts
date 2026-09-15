import { describe, expect, it } from 'vitest';

import { isMatch, resolveTier } from './resolve.js';

describe('resolveTier', () => {
  it('is a strong hit when the score beats both challenge dice', () => {
    expect(resolveTier(8, [3, 5])).toBe('strong_hit');
  });

  it('is a weak hit when the score beats exactly one challenge die', () => {
    expect(resolveTier(5, [3, 8])).toBe('weak_hit');
    expect(resolveTier(5, [8, 3])).toBe('weak_hit');
  });

  it('is a miss when the score beats neither challenge die', () => {
    expect(resolveTier(2, [3, 5])).toBe('miss');
  });

  it('treats a tie as not beating that die — equal to both is a miss, not a strong hit', () => {
    expect(resolveTier(5, [5, 5])).toBe('miss');
  });

  it('treats a tie against one die as not beating it, while still beating the other', () => {
    // Score of 5 ties the 5 (not a beat) but beats the 3 — exactly one
    // die beaten, so weak hit, not strong hit.
    expect(resolveTier(5, [5, 3])).toBe('weak_hit');
  });

  it('is a miss at the minimum score against the lowest possible dice', () => {
    expect(resolveTier(0, [1, 1])).toBe('miss');
  });

  it('is a strong hit at the maximum score against the highest possible dice below it', () => {
    expect(resolveTier(10, [9, 9])).toBe('strong_hit');
  });

  it('is a miss even at the maximum score if both dice also roll the maximum', () => {
    expect(resolveTier(10, [10, 10])).toBe('miss');
  });
});

describe('isMatch', () => {
  it('is true when both challenge dice show the same value', () => {
    expect(isMatch([7, 7])).toBe(true);
  });

  it('is false when the challenge dice differ', () => {
    expect(isMatch([7, 3])).toBe(false);
  });

  it('is independent of tier — a match can occur on any outcome', () => {
    // Miss with a match.
    expect(resolveTier(1, [5, 5])).toBe('miss');
    expect(isMatch([5, 5])).toBe(true);
    // Strong hit with a match.
    expect(resolveTier(10, [3, 3])).toBe('strong_hit');
    expect(isMatch([3, 3])).toBe(true);
  });
});

describe('resolveTier, exhaustively', () => {
  it('agrees with a direct count of beaten dice for every score 0-10 against every die pair 1-10', () => {
    const tiers = ['strong_hit', 'weak_hit', 'miss'] as const;
    for (let score = 0; score <= 10; score++) {
      for (let d1 = 1; d1 <= 10; d1++) {
        for (let d2 = 1; d2 <= 10; d2++) {
          const beaten = (score > d1 ? 1 : 0) + (score > d2 ? 1 : 0);
          const expected = beaten === 2 ? 'strong_hit' : beaten === 1 ? 'weak_hit' : 'miss';
          expect(resolveTier(score, [d1, d2])).toBe(expected);
          expect(tiers).toContain(expected);
        }
      }
    }
  });
});
