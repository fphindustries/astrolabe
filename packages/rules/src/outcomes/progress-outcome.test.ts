import { describe, expect, it } from 'vitest';

import { rollProgress } from '../dice/progress-roll.js';
import { createSeededRandomSource } from '../dice/rng.js';
import { resolveProgressRoll } from './progress-outcome.js';

describe('resolveProgressRoll', () => {
  it('preserves the progress score and challenge dice from the raw roll', () => {
    const result = resolveProgressRoll({ progressScore: 7, challengeDice: [4, 4] });
    expect(result.progressScore).toBe(7);
    expect(result.challengeDice).toEqual([4, 4]);
  });

  it('resolves tier the same way an action roll does — same comparison, different score source', () => {
    expect(resolveProgressRoll({ progressScore: 9, challengeDice: [3, 5] }).tier).toBe(
      'strong_hit',
    );
    expect(resolveProgressRoll({ progressScore: 4, challengeDice: [3, 5] }).tier).toBe('weak_hit');
    expect(resolveProgressRoll({ progressScore: 2, challengeDice: [3, 5] }).tier).toBe('miss');
  });

  it('flags a match independent of tier', () => {
    expect(resolveProgressRoll({ progressScore: 1, challengeDice: [6, 6] }).isMatch).toBe(true);
  });

  it('composes correctly with rollProgress under a seeded source, end to end', () => {
    const rng = createSeededRandomSource(2);
    const raw = rollProgress(rng, 6);
    const result = resolveProgressRoll(raw);
    expect(['strong_hit', 'weak_hit', 'miss']).toContain(result.tier);
    expect(result.isMatch).toBe(result.challengeDice[0] === result.challengeDice[1]);
  });
});
