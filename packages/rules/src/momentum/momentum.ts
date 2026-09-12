import type { ActionRollResult, BurnOffer } from '../schema/dice.js';
import type { OutcomeTier } from '../schema/moves.js';

import { resolveTier } from '../outcomes/resolve.js';

/** The book's fixed floor. Unlike max and reset, it is not reduced by impacts (D-74). */
export const MOMENTUM_MIN = -6;

const BASE_MOMENTUM_MAX = 10;
const BASE_MOMENTUM_RESET = 2;

/**
 * D-74: momentum's maximum is 10 minus marked impacts. Floored at 0 —
 * D-74 states the formula, not what happens past the point it would go
 * negative, and a negative maximum is not meaningful.
 */
export function momentumMax(markedImpacts: number): number {
  return Math.max(0, BASE_MOMENTUM_MAX - markedImpacts);
}

/**
 * D-74: the value momentum resets to after a burn is 2 minus marked
 * impacts, floored at 0 for the same reason as momentumMax.
 */
export function momentumResetValue(markedImpacts: number): number {
  return Math.max(0, BASE_MOMENTUM_RESET - markedImpacts);
}

/**
 * Applies a signed delta — positive for a gain, negative for a loss (e.g.
 * Endure Harm's "Lose Momentum (-1)") — clamped to [MOMENTUM_MIN,
 * momentumMax]. One function for both: the automation layer's `momentum`
 * effect (schema/automation.ts) already carries a signed delta, so gain
 * and loss are the same operation with a different sign, not different
 * rules.
 */
export function applyMomentumDelta(current: number, delta: number, markedImpacts: number): number {
  return Math.max(MOMENTUM_MIN, Math.min(momentumMax(markedImpacts), current + delta));
}

const TIER_RANK: Record<OutcomeTier, number> = { miss: 0, weak_hit: 1, strong_hit: 2 };

/**
 * Whether burning momentum would improve this roll (A8, Beat 5): stand
 * momentum in for the action score against the same challenge dice, and
 * see whether the tier that produces outranks the roll's own tier.
 * Momentum never exceeds momentumMax, so it never needs re-clamping to
 * act as a stand-in score. Undefined when momentum can't help — either
 * it's zero or negative, or it wouldn't change the outcome.
 */
export function computeBurnOffer(
  result: ActionRollResult,
  momentum: number,
  markedImpacts: number,
): BurnOffer | undefined {
  if (momentum <= 0) {
    return undefined;
  }
  const wouldBecome = resolveTier(momentum, result.challengeDice);
  if (TIER_RANK[wouldBecome] <= TIER_RANK[result.tier]) {
    return undefined;
  }
  return { wouldBecome, momentum, resetsTo: momentumResetValue(markedImpacts) };
}

/**
 * Completes what task 1.5's resolveActionRoll left unset: attaches a
 * burnOffer to an already-resolved roll when burning would help, leaving
 * the result unchanged otherwise.
 */
export function withBurnOffer(
  result: ActionRollResult,
  momentum: number,
  markedImpacts: number,
): ActionRollResult {
  const burnOffer = computeBurnOffer(result, momentum, markedImpacts);
  return burnOffer === undefined ? result : { ...result, burnOffer };
}
