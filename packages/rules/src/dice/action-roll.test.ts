import { describe, expect, it } from 'vitest';

import { rollAction } from './action-roll.js';
import { createSeededRandomSource } from './rng.js';

describe('rollAction', () => {
  it('produces an action die in 1-6 and two challenge dice in 1-10', () => {
    const rng = createSeededRandomSource(1);
    for (let i = 0; i < 200; i++) {
      const result = rollAction(rng, [{ amount: 2, label: 'wits' }]);
      expect(result.actionDie).toBeGreaterThanOrEqual(1);
      expect(result.actionDie).toBeLessThanOrEqual(6);
      expect(result.challengeDice[0]).toBeGreaterThanOrEqual(1);
      expect(result.challengeDice[0]).toBeLessThanOrEqual(10);
      expect(result.challengeDice[1]).toBeGreaterThanOrEqual(1);
      expect(result.challengeDice[1]).toBeLessThanOrEqual(10);
    }
  });

  it('sums the action die and every add into the action score', () => {
    const rng = createSeededRandomSource(2);
    const result = rollAction(rng, [
      { amount: 3, label: 'wits' },
      { amount: 1, label: 'bonus from Secure an Advantage' },
    ]);
    expect(result.actionScore).toBe(result.actionDie + 4);
  });

  it('caps the action score at 10', () => {
    const rng = createSeededRandomSource(2);
    const result = rollAction(rng, [{ amount: 20, label: 'implausibly large add' }]);
    expect(result.actionScore).toBe(10);
  });

  it('floors the action score at 0 rather than going negative', () => {
    const rng = createSeededRandomSource(2);
    const result = rollAction(rng, [{ amount: -20, label: 'implausibly large penalty' }]);
    expect(result.actionScore).toBe(0);
  });

  it('defaults to no adds when none are given', () => {
    const rng = createSeededRandomSource(2);
    const result = rollAction(rng);
    expect(result.adds).toEqual([]);
    expect(result.actionScore).toBe(result.actionDie);
  });

  it('carries the adds through unchanged, for the result card’s math popup (A4)', () => {
    const rng = createSeededRandomSource(2);
    const adds = [{ amount: 2, label: 'iron' }];
    const result = rollAction(rng, adds);
    expect(result.adds).toEqual(adds);
  });

  it('is deterministic under a seeded source', () => {
    const a = rollAction(createSeededRandomSource(123), [{ amount: 3, label: 'wits' }]);
    const b = rollAction(createSeededRandomSource(123), [{ amount: 3, label: 'wits' }]);
    expect(a).toEqual(b);
  });
});
