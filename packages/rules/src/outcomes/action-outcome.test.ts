import { describe, expect, it } from 'vitest';

import { rollAction } from '../dice/action-roll.js';
import { createSeededRandomSource } from '../dice/rng.js';
import { resolveActionRoll } from './action-outcome.js';

describe('resolveActionRoll', () => {
  it('preserves every field from the raw roll', () => {
    const raw = {
      actionDie: 4,
      adds: [{ amount: 2, label: 'wits' }],
      actionScore: 6,
      challengeDice: [3, 9] as const,
    };
    const result = resolveActionRoll(raw);
    expect(result.actionDie).toBe(4);
    expect(result.adds).toEqual(raw.adds);
    expect(result.actionScore).toBe(6);
    expect(result.challengeDice).toEqual([3, 9]);
  });

  it('adds tier and isMatch on top of the raw roll', () => {
    const result = resolveActionRoll({
      actionDie: 6,
      adds: [],
      actionScore: 6,
      challengeDice: [3, 4],
    });
    expect(result.tier).toBe('strong_hit');
    expect(result.isMatch).toBe(false);
  });

  it('leaves burnOffer unset — task 1.6’s job, not this one’s', () => {
    const result = resolveActionRoll({
      actionDie: 1,
      adds: [],
      actionScore: 1,
      challengeDice: [5, 5],
    });
    expect(result.burnOffer).toBeUndefined();
  });

  it('composes correctly with rollAction under a seeded source, end to end', () => {
    const rng = createSeededRandomSource(1);
    const raw = rollAction(rng, [{ amount: 3, label: 'iron' }]);
    const result = resolveActionRoll(raw);
    expect(['strong_hit', 'weak_hit', 'miss']).toContain(result.tier);
    expect(result.isMatch).toBe(result.challengeDice[0] === result.challengeDice[1]);
  });
});
