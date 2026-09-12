import type { RandomSource, RawProgressRoll } from '../schema/dice.js';

import { rollChallengeDice } from './primitives.js';

/**
 * Rolls the challenge dice for a progress move. The progress score itself
 * comes from the track (a vow's rank, an expedition's ticks) — converting
 * ticks to a score depends on the track type, which is state, not dice, so
 * the caller supplies it already computed.
 */
export function rollProgress(rng: RandomSource, progressScore: number): RawProgressRoll {
  return { progressScore, challengeDice: rollChallengeDice(rng) };
}
