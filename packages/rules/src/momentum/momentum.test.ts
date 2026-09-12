import { describe, expect, it } from 'vitest';

import type { ActionRollResult } from '../schema/dice.js';

import {
  MOMENTUM_MIN,
  applyMomentumDelta,
  computeBurnOffer,
  momentumMax,
  momentumResetValue,
  withBurnOffer,
} from './momentum.js';

describe('momentumMax', () => {
  it('is 10 with no marked impacts', () => {
    expect(momentumMax(0)).toBe(10);
  });

  it('is reduced by 1 per marked impact (D-74)', () => {
    expect(momentumMax(1)).toBe(9);
    expect(momentumMax(3)).toBe(7);
  });

  it('floors at 0 rather than going negative', () => {
    expect(momentumMax(15)).toBe(0);
  });
});

describe('momentumResetValue', () => {
  it('is 2 with no marked impacts', () => {
    expect(momentumResetValue(0)).toBe(2);
  });

  it('is reduced by 1 per marked impact (D-74)', () => {
    expect(momentumResetValue(1)).toBe(1);
    expect(momentumResetValue(2)).toBe(0);
  });

  it('floors at 0 rather than going negative', () => {
    expect(momentumResetValue(5)).toBe(0);
  });
});

describe('applyMomentumDelta — gain and loss', () => {
  it('gains momentum with a positive delta', () => {
    expect(applyMomentumDelta(2, 2, 0)).toBe(4);
  });

  it('loses momentum with a negative delta (e.g. Endure Harm’s Lose Momentum (-1))', () => {
    expect(applyMomentumDelta(4, -1, 0)).toBe(3);
  });

  it('clamps a gain at momentumMax', () => {
    expect(applyMomentumDelta(9, 5, 0)).toBe(10);
  });

  it('clamps a gain at the impact-reduced max', () => {
    expect(applyMomentumDelta(6, 5, 3)).toBe(momentumMax(3));
    expect(applyMomentumDelta(6, 5, 3)).toBe(7);
  });

  it('clamps a loss at the fixed floor of -6, unaffected by impacts', () => {
    expect(applyMomentumDelta(-5, -10, 0)).toBe(MOMENTUM_MIN);
    expect(applyMomentumDelta(-5, -10, 4)).toBe(MOMENTUM_MIN);
  });

  it('leaves momentum unchanged for a zero delta', () => {
    expect(applyMomentumDelta(3, 0, 0)).toBe(3);
  });
});

function actionResult(overrides: Partial<ActionRollResult>): ActionRollResult {
  return {
    actionDie: 3,
    adds: [],
    actionScore: 5,
    challengeDice: [6, 3],
    tier: 'weak_hit',
    isMatch: false,
    ...overrides,
  };
}

describe('computeBurnOffer', () => {
  it('offers to upgrade Beat 5’s exact roll: weak hit, action score 5, dice [6, 3], momentum +7', () => {
    const result = actionResult({ actionScore: 5, challengeDice: [6, 3], tier: 'weak_hit' });
    const offer = computeBurnOffer(result, 7, 0);
    expect(offer).toEqual({ wouldBecome: 'strong_hit', momentum: 7, resetsTo: 2 });
  });

  it('offers nothing when momentum would not beat either challenge die', () => {
    const result = actionResult({ challengeDice: [8, 9], tier: 'miss' });
    expect(computeBurnOffer(result, 3, 0)).toBeUndefined();
  });

  it('offers nothing when momentum matches the roll’s own tier rather than improving it', () => {
    // Momentum of 4 beats neither 6 nor 9 — same miss the roll already got.
    const result = actionResult({ challengeDice: [6, 9], tier: 'miss', actionScore: 2 });
    expect(computeBurnOffer(result, 4, 0)).toBeUndefined();
  });

  it('offers nothing when the roll is already a strong hit — there is no better tier to reach', () => {
    const result = actionResult({ challengeDice: [3, 4], tier: 'strong_hit', actionScore: 8 });
    expect(computeBurnOffer(result, 9, 0)).toBeUndefined();
  });

  it('offers nothing when momentum is zero or negative', () => {
    const result = actionResult({ challengeDice: [1, 1], tier: 'miss', actionScore: 0 });
    expect(computeBurnOffer(result, 0, 0)).toBeUndefined();
    expect(computeBurnOffer(result, -3, 0)).toBeUndefined();
  });

  it('reports the impact-reduced reset value, not the base 2', () => {
    const result = actionResult({ challengeDice: [3, 4], tier: 'miss', actionScore: 1 });
    const offer = computeBurnOffer(result, 6, 2);
    expect(offer?.resetsTo).toBe(0);
  });

  it('can offer a miss-to-weak-hit upgrade, not only weak-to-strong', () => {
    const result = actionResult({ challengeDice: [5, 8], tier: 'miss', actionScore: 3 });
    const offer = computeBurnOffer(result, 6, 0);
    expect(offer).toEqual({ wouldBecome: 'weak_hit', momentum: 6, resetsTo: 2 });
  });
});

describe('withBurnOffer', () => {
  it('attaches the offer to the roll result when one applies', () => {
    const result = actionResult({ challengeDice: [6, 3], tier: 'weak_hit', actionScore: 5 });
    const withOffer = withBurnOffer(result, 7, 0);
    expect(withOffer.burnOffer).toEqual({ wouldBecome: 'strong_hit', momentum: 7, resetsTo: 2 });
    // Everything else about the roll is untouched.
    expect(withOffer.actionScore).toBe(5);
    expect(withOffer.challengeDice).toEqual([6, 3]);
  });

  it('leaves the result unchanged, with no burnOffer key, when burning would not help', () => {
    const result = actionResult({ challengeDice: [9, 9], tier: 'miss', actionScore: 1 });
    const withOffer = withBurnOffer(result, 2, 0);
    expect(withOffer).toEqual(result);
    expect(withOffer.burnOffer).toBeUndefined();
  });
});
