import type { CampaignSettings } from '@astrolabe/shared';

import type { BeatFacts } from './describe-beat.js';

/**
 * Narration length scaled to the weight of the moment (task 7.7, D-11,
 * D-115).
 *
 * Length is asked for in the prompt, not enforced by truncation: a passage
 * cut off mid-sentence is a failed response (`respond.ts`), and adaptive
 * thinking shares the output token ceiling, so `max_tokens` is the wrong
 * lever.
 */

export type NarrationWeight = 'routine' | 'dramatic';

export interface WordRange {
  readonly min: number;
  readonly max: number;
}

const BASE: Readonly<Record<NarrationWeight, WordRange>> = {
  // §12's routine-beat target.
  routine: { min: 60, max: 120 },
  dramatic: { min: 120, max: 200 },
};

const ADJUSTMENT: Readonly<Record<CampaignSettings['narrationLength'], number>> = {
  shorter: 0.6,
  standard: 1,
  longer: 1.5,
};

/** A miss, a match, a burn, or a chain into a suffer move is dramatic; anything else is routine. */
export function beatWeight(
  facts: Pick<BeatFacts, 'miss' | 'match' | 'burned' | 'chainedToSuffer'>,
): NarrationWeight {
  return facts.miss || facts.match || facts.burned || facts.chainedToSuffer
    ? 'dramatic'
    : 'routine';
}

export function narrationBudget(
  weight: NarrationWeight,
  adjustment: CampaignSettings['narrationLength'],
): WordRange {
  const scale = ADJUSTMENT[adjustment];
  const base = BASE[weight];
  // Round to the nearest five: "about 72 words" reads as false precision.
  const round = (n: number) => Math.max(5, Math.round((n * scale) / 5) * 5);
  return { min: round(base.min), max: round(base.max) };
}
