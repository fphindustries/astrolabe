import type { ActionRollResult, RawActionRoll } from '../schema/dice.js';

import { isMatch, resolveTier } from './resolve.js';

/**
 * Turns what the dice produced (task 1.4) into the full result a move
 * resolution can act on. `burnOffer` is left unset here — task 1.6 wraps
 * this with the momentum-burn check, since that needs momentum as an
 * input this function doesn't have.
 */
export function resolveActionRoll(raw: RawActionRoll): ActionRollResult {
  return {
    ...raw,
    tier: resolveTier(raw.actionScore, raw.challengeDice),
    isMatch: isMatch(raw.challengeDice),
  };
}
