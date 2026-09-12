import { describe, expect, it } from 'vitest';

import { createSeededRandomSource } from './rng.js';

describe('createSeededRandomSource', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createSeededRandomSource(42);
    const b = createSeededRandomSource(42);
    const sequenceA = Array.from({ length: 20 }, () => a.next());
    const sequenceB = Array.from({ length: 20 }, () => b.next());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = createSeededRandomSource(1);
    const b = createSeededRandomSource(2);
    const sequenceA = Array.from({ length: 20 }, () => a.next());
    const sequenceB = Array.from({ length: 20 }, () => b.next());
    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('always returns a float in [0, 1)', () => {
    const rng = createSeededRandomSource(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not repeat the same value on every call (sanity check against a broken generator)', () => {
    const rng = createSeededRandomSource(7);
    const values = new Set(Array.from({ length: 50 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(40);
  });
});
