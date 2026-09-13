import { describe, expect, it } from 'vitest';

import { cryptoRandomSource } from './random-source.js';

describe('cryptoRandomSource', () => {
  it('produces floats in [0, 1)', () => {
    const rng = cryptoRandomSource();
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not repeat the same value every call', () => {
    const rng = cryptoRandomSource();
    const values = new Set(Array.from({ length: 20 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(1);
  });
});
