import { describe, expect, it } from 'vitest';

import { rollProgress } from './progress-roll.js';
import { createSeededRandomSource } from './rng.js';

describe('rollProgress', () => {
  it('carries the given progress score through unchanged', () => {
    const rng = createSeededRandomSource(1);
    const result = rollProgress(rng, 7);
    expect(result.progressScore).toBe(7);
  });

  it('rolls two challenge dice in 1-10', () => {
    const rng = createSeededRandomSource(1);
    for (let i = 0; i < 200; i++) {
      const result = rollProgress(rng, 5);
      expect(result.challengeDice[0]).toBeGreaterThanOrEqual(1);
      expect(result.challengeDice[0]).toBeLessThanOrEqual(10);
      expect(result.challengeDice[1]).toBeGreaterThanOrEqual(1);
      expect(result.challengeDice[1]).toBeLessThanOrEqual(10);
    }
  });

  it('is deterministic under a seeded source', () => {
    const a = rollProgress(createSeededRandomSource(456), 8);
    const b = rollProgress(createSeededRandomSource(456), 8);
    expect(a).toEqual(b);
  });

  it('never rolls an action die — a progress move has no action score', () => {
    const rng = createSeededRandomSource(1);
    const result = rollProgress(rng, 5);
    expect(result).not.toHaveProperty('actionDie');
  });
});
