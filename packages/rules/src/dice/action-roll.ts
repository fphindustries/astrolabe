import type { RandomSource, RawActionRoll, RollAdjustment } from '../schema/dice.js';

import { rollActionDie, rollChallengeDice } from './primitives.js';

const MIN_ACTION_SCORE = 0;
const MAX_ACTION_SCORE = 10;

/**
 * Rolls the action die and the challenge dice, and computes the action
 * score from the die plus every add (stat, asset bonus, Secure an
 * Advantage's +1, and so on) — capped at 10, per the book. Momentum burn
 * and outcome tier are not this function's job: burn is a substitution
 * evaluated after this result exists (schema/dice.ts), and the tier comes
 * from task 1.5's outcome resolution.
 */
export function rollAction(rng: RandomSource, adds: readonly RollAdjustment[] = []): RawActionRoll {
  const actionDie = rollActionDie(rng);
  const addsTotal = adds.reduce((sum, add) => sum + add.amount, 0);
  const actionScore = Math.max(MIN_ACTION_SCORE, Math.min(MAX_ACTION_SCORE, actionDie + addsTotal));
  const challengeDice = rollChallengeDice(rng);

  return { actionDie, adds, actionScore, challengeDice };
}
