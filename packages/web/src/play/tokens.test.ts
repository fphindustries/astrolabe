import { describe, expect, it } from 'vitest';

import { formatTokens } from './tokens.js';

describe('formatTokens (task 7.10)', () => {
  it('counts cached tokens too, so a cached call never looks free', () => {
    expect(formatTokens({ input: 100, output: 50, cacheRead: 300, cacheWrite: 0 })).toBe('450');
  });

  it('compacts large totals', () => {
    expect(formatTokens({ input: 1200, output: 340, cacheRead: 0, cacheWrite: 0 })).toBe('1.5k');
    expect(
      formatTokens({ input: 30_000, output: 4_000, cacheRead: 90_000, cacheWrite: 2_000 }),
    ).toBe('126k');
  });
});
