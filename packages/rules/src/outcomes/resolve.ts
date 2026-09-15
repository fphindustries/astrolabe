import type { OutcomeTier } from '../schema/moves.js';

/**
 * The core comparison both action rolls and progress rolls share: the
 * score must be strictly greater than a challenge die to beat it — a tie
 * does not count as beating that die. Strong hit beats both, weak hit
 * beats exactly one, miss beats neither.
 *
 * Shared rather than duplicated per roll type because task 1.6's momentum
 * burn needs exactly this comparison run a second time, speculatively,
 * against momentum instead of the actual score — same rule, different
 * input, not a different rule.
 */
export function resolveTier(score: number, challengeDice: readonly [number, number]): OutcomeTier {
  const [first, second] = challengeDice;
  const beatsFirst = score > first;
  const beatsSecond = score > second;

  if (beatsFirst && beatsSecond) {
    return 'strong_hit';
  }
  if (beatsFirst || beatsSecond) {
    return 'weak_hit';
  }
  return 'miss';
}

/**
 * A match — the two challenge dice showing the same value — makes the
 * outcome more extreme, but it doesn't change *which* tier applies; that's
 * resolveTier's job. What a match actually does beyond the flag (an extra
 * table row, an intensified effect) is move-specific and lives in the
 * automation layer (task 1.7), not here.
 */
export function isMatch(challengeDice: readonly [number, number]): boolean {
  return challengeDice[0] === challengeDice[1];
}
