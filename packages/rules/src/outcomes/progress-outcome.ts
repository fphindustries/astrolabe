import type { ProgressRollResult, RawProgressRoll } from '../schema/dice.js';

import { isMatch, resolveTier } from './resolve.js';

/** Turns what the dice produced (task 1.4) into the full progress-roll result. */
export function resolveProgressRoll(raw: RawProgressRoll): ProgressRollResult {
  return {
    ...raw,
    tier: resolveTier(raw.progressScore, raw.challengeDice),
    isMatch: isMatch(raw.challengeDice),
  };
}
