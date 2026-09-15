import { describe, expect, it } from 'vitest';

import { formatTokens, tokenCounter } from './tokens.js';

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

describe('tokenCounter (D-125)', () => {
  const session = { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0 };
  const campaign = { input: 5000, output: 900, cacheRead: 0, cacheWrite: 0 };

  it('leads with the session and puts the campaign total in the tooltip', () => {
    const counter = tokenCounter(session, campaign);
    expect(counter?.label).toBe('1.5k tokens this session');
    expect(counter?.title).toContain('This campaign: 5.9k tokens in all.');
  });

  it('shows the campaign total when no session is open, and nothing when nothing was spent', () => {
    expect(tokenCounter(undefined, campaign)?.label).toBe('5.9k tokens this campaign');
    expect(tokenCounter(undefined, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(
      undefined,
    );
  });
});
